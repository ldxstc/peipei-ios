import Foundation
import UIKit

struct APIClient: Sendable {
    static let shared = APIClient()

    private let baseURL = URL(string: "https://www.peipei-run.com")!
    private let origin = "https://www.peipei-run.com"
    private let session: URLSession
    private let decoder: JSONDecoder

    init(session: URLSession = .shared) {
        self.session = session
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            if let date = APIDateCoding.parse(string) {
                return date
            }
            return .now
        }
    }

    func signIn(email: String, password: String) async throws -> LoginResponse {
        try await request(
            path: "/api/auth/sign-in/email",
            method: "POST",
            body: ["email": email, "password": password],
            token: nil
        )
    }

    func signInWithApple(token: String, nonce: String?, fullName: String?) async throws -> LoginResponse {
        let payload = AppleSignInRequest(
            provider: "apple",
            idToken: AppleTokenPayload(token: token, nonce: nonce),
            name: fullName
        )

        return try await request(path: "/api/auth/sign-in/social", method: "POST", body: payload, token: nil)
    }

    func signInWithGoogle(idToken: String, accessToken: String) async throws -> LoginResponse {
        let payload = GoogleSignInRequest(
            provider: "google",
            idToken: GoogleTokenPayload(token: idToken, accessToken: accessToken)
        )
        return try await request(path: "/api/auth/sign-in/social", method: "POST", body: payload, token: nil)
    }

    func getCoachChat(token: String) async throws -> CoachChatResponse {
        let payload: CoachChatEnvelope = try await request(path: "/api/coach/chat", method: "GET", token: token)
        return CoachChatResponse(messages: payload.messages, hasMore: payload.hasMore)
    }

    func getSidebar(token: String) async throws -> SidebarData {
        let payload: JSONValue = try await request(path: "/api/coach/sidebar", method: "GET", token: token)
        return SidebarDataNormalizer.normalize(payload)
    }

    func getSettings(token: String) async throws -> SettingsPanelData {
        let payload: JSONValue = try await request(path: "/api/settings/panel", method: "GET", token: token)
        return SettingsNormalizer.normalize(payload)
    }

    func connectGarmin(token: String, email: String, password: String) async throws {
        let result: GarminAuthResponse = try await request(
            path: "/api/garmin/auth",
            method: "POST",
            body: ["email": email, "password": password],
            token: token
        )
        if !result.success {
            throw APIError.httpStatus(400, result.error ?? "Garmin connection failed.")
        }
    }

    func syncGarmin(token: String) async throws {
        let _: JSONValue = try await request(path: "/api/garmin/sync", method: "POST", body: [String: String](), token: token)
    }

    func disconnectGarmin(token: String) async throws {
        let _: JSONValue = try await request(path: "/api/garmin/auth", method: "DELETE", body: [String: String](), token: token)
    }

    func patchSettings(token: String, input: SettingsSaveInput) async throws {
        let _: JSONValue = try await request(path: "/api/settings", method: "PATCH", body: input, token: token)
    }

    func syncAppleSubscription(token: String, originalTransactionId: String, productId: String, environment: String) async throws {
        let body: [String: String] = [
            "originalTransactionId": originalTransactionId,
            "productId": productId,
            "environment": environment
        ]
        let _: JSONValue = try await request(path: "/api/subscription/apple", method: "POST", body: body, token: token)
    }

    func uploadImage(token: String, image: UIImage) async throws -> UploadResult {
        guard let data = image.jpegData(compressionQuality: 0.8) else {
            throw APIError.httpStatus(400, "Could not compress image.")
        }

        let boundary = UUID().uuidString
        var request = makeRequest(path: "/api/upload", method: "POST", token: token)
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (responseData, response) = try await session.data(for: request)
        try validate(response: response, data: responseData)
        return try JSONDecoder().decode(UploadResult.self, from: responseData)
    }

    func getSimilarTrainings(token: String, activityId: String) async throws -> SimilarTrainingsResult {
        try await request(
            path: "/api/training-log/similar?activityId=\(activityId)",
            method: "GET",
            token: token
        )
    }

    func getActivityInsight(token: String, activityId: String) async throws -> CoachInsightsResponse {
        try await request(
            path: "/api/coach/insights",
            method: "POST",
            body: InsightRequest(refType: "activity", refId: activityId, insightType: "activity_comparison"),
            token: token
        )
    }

    func streamChat(
        token: String,
        messages: [CoachMessage],
        onTextChunk: @escaping @Sendable (String) async -> Void
    ) async throws {
        let requestBody = ChatStreamRequest(
            contextType: "general",
            messages: messages.map {
                ChatRequestMessage(
                    id: $0.id,
                    role: $0.role.rawValue,
                    content: $0.content,
                    createdAt: APIDateCoding.string(from: $0.createdAt)
                )
            }
        )

        var request = makeRequest(path: "/api/coach/chat", method: "POST", token: token)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(requestBody)

        let (bytes, response) = try await session.bytes(for: request)
        try validate(response: response, data: Data())

        for try await line in bytes.lines {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            if trimmed == "[DONE]" || trimmed == "data: [DONE]" { break }

            // SSE format: data: {...}
            if trimmed.hasPrefix("data:") {
                let value = trimmed.dropFirst(5).trimmingCharacters(in: .whitespaces)
                if let chunk = parseStreamChunk(String(value)) {
                    await onTextChunk(chunk)
                }
                continue
            }

            // Numbered stream format: 0:{...}
            if let separator = trimmed.firstIndex(of: ":"),
               trimmed[..<separator] == "0" {
                let value = trimmed[trimmed.index(after: separator)...].trimmingCharacters(in: .whitespaces)
                if let chunk = parseStreamChunk(value) {
                    await onTextChunk(chunk)
                }
                continue
            }

            // Raw text chunk (no SSE envelope) — filter tool protocol
            if let cleaned = parseStreamChunk(trimmed) {
                await onTextChunk(cleaned)
            }
        }
    }

    private func parseStreamChunk(_ raw: String) -> String? {
        // Try to decode as a typed stream chunk (text delta)
        if let data = raw.data(using: .utf8),
           let json = try? JSONDecoder().decode(StreamChunkPayload.self, from: data),
           let text = json.textChunk {
            return text
        }

        // Try to decode as a plain quoted string
        if raw.hasPrefix("\""), raw.hasSuffix("\""),
           let data = raw.data(using: .utf8),
           let text = try? JSONDecoder().decode(String.self, from: data) {
            return text
        }

        // Filter out tool protocol JSON — these are NOT text content
        if raw.contains("\"type\":\"tool-") ||
           raw.contains("\"toolCallId\"") ||
           raw.contains("\"toolName\"") ||
           raw.contains("\"providerMetadata\"") ||
           raw.contains("\"type\":\"step-") ||
           raw.contains("\"type\":\"start\"") ||
           raw.contains("\"type\":\"finish\"") {
            return nil  // Skip tool protocol chunks
        }

        // Only return raw text if it doesn't look like JSON
        if raw.hasPrefix("{") { return nil }

        return raw
    }

    private func request<T: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body,
        token: String?
    ) async throws -> T {
        var request = makeRequest(path: path, method: method, token: token)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    private func request<T: Decodable>(
        path: String,
        method: String,
        token: String?
    ) async throws -> T {
        var request = makeRequest(path: path, method: method, token: token)
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    private func makeRequest(path: String, method: String, token: String?) -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue(origin, forHTTPHeaderField: "Origin")
        request.setValue(origin, forHTTPHeaderField: "Referer")

        if let token, !token.isEmpty {
            request.setValue(token, forHTTPHeaderField: "X-Session-Token")
            request.setValue(
                "peipei.session_token=\(token); __Secure-peipei.session_token=\(token)",
                forHTTPHeaderField: "Cookie"
            )
        }

        return request
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard 200..<300 ~= http.statusCode else {
            let payload = try? JSONDecoder().decode(APIErrorPayload.self, from: data)
            let message = payload?.message
                ?? payload?.error
                ?? String(data: data, encoding: .utf8)
                ?? "Request failed."
            throw APIError.httpStatus(http.statusCode, message)
        }
    }
}

private struct CoachChatEnvelope: Codable {
    let messages: [CoachMessage]
    let hasMore: Bool
}

private struct ChatRequestMessage: Codable {
    let id: String
    let role: String
    let content: String
    let createdAt: String
}

private struct AppleTokenPayload: Codable {
    let token: String
    let nonce: String?
}

private struct AppleSignInRequest: Codable {
    let provider: String
    let idToken: AppleTokenPayload
    let name: String?
}

private struct GoogleTokenPayload: Codable {
    let token: String
    let accessToken: String
}

private struct GarminAuthResponse: Codable {
    let success: Bool
    let error: String?
    let profile: GarminProfile?

    struct GarminProfile: Codable {
        let displayName: String?
    }
}

private struct GoogleSignInRequest: Codable {
    let provider: String
    let idToken: GoogleTokenPayload
}

private struct LegacySettingsPatchRequest: Codable {
    let customInstructions: String
    let profile: LegacySettingsProfile
}

private struct LegacySettingsProfile: Codable {
    let coachLanguage: String
    let displayName: String
    let units: String
}

private struct ChatStreamRequest: Codable {
    let contextType: String
    let messages: [ChatRequestMessage]
}

private struct InsightRequest: Codable {
    let refType: String
    let refId: String
    let insightType: String
}

private struct StreamChunkPayload: Codable {
    let text: String?
    let delta: String?
    let content: String?
    let message: String?

    var textChunk: String? {
        text ?? delta ?? content ?? message
    }
}

private struct APIErrorPayload: Codable {
    let message: String?
    let error: String?
}

enum APIError: LocalizedError {
    case invalidResponse
    case httpStatus(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server."
        case .httpStatus(_, let message):
            return message
        }
    }
}

private enum SidebarDataNormalizer {
    static func normalize(_ raw: JSONValue) -> SidebarData {
        let recentRunsValue = firstPresent(raw, paths: ["recentRuns", "runs.recent", "runs", "recent"])
        let recentRuns = recentRunsValue?.arrayValue?.prefix(5).map(normalizeRecentRun) ?? []

        return SidebarData(
            goalProgress: GoalProgress(
                countdown: firstPresent(raw, paths: ["goalProgress.countdown", "goal.countdown", "race.countdown", "race.daysToRace"])?.stringScalar ?? "No race set",
                detail: firstPresent(raw, paths: ["goalProgress.detail", "goal.detail", "race.detail", "race.date"])?.stringScalar ?? "Set a race goal in the web app",
                title: firstPresent(raw, paths: ["goalProgress.title", "goal.title", "race.name", "race.title"])?.stringScalar ?? "Goal Progress"
            ),
            recentRuns: Array(recentRuns),
            thisWeek: WeekSummary(
                km: firstPresent(raw, paths: ["thisWeek.totalKm", "thisWeek.km", "week.km", "stats.km", "thisWeek.distance"])?.stringScalar ?? "0",
                runs: firstPresent(raw, paths: ["thisWeek.runCount", "thisWeek.runs", "week.runs", "stats.runs"])?.stringScalar ?? "0",
                avgPace: firstPresent(raw, paths: ["thisWeek.avgPaceSeconds", "thisWeek.avgPace", "week.avgPace", "stats.avgPace"])?.stringScalar ?? "--"
            ),
            todayPlan: TodayPlan(
                title: firstPresent(raw, paths: ["todayPlan.title", "todayPlan.type", "todayWorkout.title", "todayWorkout.type", "workoutToday.title"])?.stringScalar ?? "Check today's plan",
                distance: firstPresent(raw, paths: ["todayPlan.distance", "todayWorkout.distance", "workoutToday.distance", "plan.today.distance"])?.stringScalar ?? "--"
            ),
            raw: raw
        )
    }

    private static func normalizeRecentRun(_ raw: JSONValue) -> RecentRun {
        let id = firstPresent(raw, paths: ["id", "runId"])?.stringScalar ?? UUID().uuidString
        let wtype = firstPresent(raw, paths: ["workoutType", "type"])?.stringScalar ?? "easy"
        let distKmStr = firstPresent(raw, paths: ["distanceKm", "distance_km", "distance"])?.stringScalar ?? "0"
        let distKm = Double(distKmStr) ?? 0
        let paceStr = firstPresent(raw, paths: ["pacePerKmSeconds", "avgPaceSeconds", "pace"])?.stringScalar ?? ""
        let date = firstPresent(raw, paths: ["activityDate", "date", "day"])?.stringScalar ?? ""
        let hrStr = firstPresent(raw, paths: ["avgHr", "heartRate", "hr"])?.stringScalar ?? ""

        // Format pace from seconds
        let paceFormatted: String = {
            guard let secs = Int(paceStr), secs > 0 else { return paceStr }
            return "\(secs / 60):\(String(format: "%02d", secs % 60))/km"
        }()

        // Format distance
        let distFormatted = distKm > 0 ? String(format: "%.1fkm", distKm) : ""

        let subtitle = [distFormatted, paceFormatted].filter { !$0.isEmpty }.joined(separator: " · ")

        return RecentRun(
            id: id,
            title: wtype.capitalized,
            subtitle: subtitle,
            detail: hrStr.isEmpty ? subtitle : "\(subtitle) · \(hrStr) bpm",
            distanceKm: distKm,
            workoutType: wtype
        )
    }
}

private enum SettingsNormalizer {
    static func normalize(_ raw: JSONValue) -> SettingsPanelData {
        let tier = firstPresent(raw, paths: ["billing.tierLabel", "billing.tier", "subscription.tierLabel", "subscription.tier", "tier", "plan.tier"])?.stringScalar ?? "Free"
        return SettingsPanelData(
            displayName: firstPresent(raw, paths: ["profile.displayName", "profile.name", "displayName", "name", "user.name"])?.stringScalar ?? "",
            units: normalizeUnits(firstPresent(raw, paths: ["profile.units", "preferences.units", "units", "user.units"])?.stringScalar),
            coachLanguage: normalizeLanguage(firstPresent(raw, paths: ["profile.coachLanguage", "profile.language", "coachLanguage", "coach.language", "language"])?.stringScalar),
            customInstructions: firstPresent(raw, paths: ["coachInstructions.text", "coachInstructions", "coach.instructions", "customInstructions", "instructions"])?.stringScalar ?? "",
            accountEmail: firstPresent(raw, paths: ["account.email", "user.email", "email"])?.stringScalar ?? "",
            billing: BillingData(
                isPro: tier.lowercased().contains("pro"),
                tierLabel: tier
            ),
            garmin: GarminData(
                connected: firstPresent(raw, paths: ["garminConnected", "garmin.connected", "garmin.isConnected", "integrations.garmin.connected"])?.boolScalar ?? false,
                email: firstPresent(raw, paths: ["garminEmail", "garmin.email", "garmin.accountEmail", "integrations.garmin.email"])?.stringScalar ?? ""
            ),
            raw: raw
        )
    }

    private static func normalizeUnits(_ value: String?) -> UnitsPreference {
        guard let value else { return .metric }
        let lowered = value.lowercased()
        return lowered.contains("imp") || lowered.contains("mile") ? .imperial : .metric
    }

    private static func normalizeLanguage(_ value: String?) -> CoachLanguagePreference {
        guard let value else { return .en }
        let lowered = value.lowercased()
        return lowered.contains("zh") || lowered.contains("chinese") || lowered.contains("简") ? .zhHans : .en
    }
}

private func firstPresent(_ value: JSONValue, paths: [String]) -> JSONValue? {
    for path in paths {
        if let resolved = value.value(at: path), !resolved.isEmptyValue {
            return resolved
        }
    }
    return nil
}

private extension JSONValue {
    func value(at path: String) -> JSONValue? {
        path.split(separator: ".").reduce(Optional(self)) { partial, key in
            guard case .object(let object) = partial else { return nil }
            return object[String(key)]
        }
    }

    var stringScalar: String? {
        switch self {
        case .string(let value):
            return value
        case .number(let value):
            if value.rounded() == value {
                return String(Int(value))
            }
            return String(value)
        case .bool(let value):
            return value ? "true" : "false"
        default:
            return nil
        }
    }

    var boolScalar: Bool? {
        switch self {
        case .bool(let value):
            return value
        case .number(let value):
            return value > 0
        case .string(let value):
            let lowered = value.lowercased()
            return ["true", "yes", "connected", "active"].contains(lowered)
        default:
            return nil
        }
    }

    var arrayValue: [JSONValue]? {
        if case .array(let values) = self {
            return values
        }
        return nil
    }

    var isEmptyValue: Bool {
        switch self {
        case .null:
            return true
        case .string(let value):
            return value.isEmpty
        case .array(let values):
            return values.isEmpty
        case .object(let values):
            return values.isEmpty
        default:
            return false
        }
    }
}
