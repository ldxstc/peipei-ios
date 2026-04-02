import Foundation

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

    func patchSettings(token: String, input: SettingsSaveInput) async throws {
        do {
            let _: JSONValue = try await request(path: "/api/settings", method: "PATCH", body: input, token: token)
        } catch {
            let fallback = LegacySettingsPatchRequest(
                customInstructions: input.customInstructions,
                profile: LegacySettingsProfile(
                    coachLanguage: input.coachLanguage.rawValue,
                    displayName: input.displayName,
                    units: input.units.rawValue
                )
            )
            let _: JSONValue = try await request(path: "/api/user/settings", method: "PATCH", body: fallback, token: token)
        }
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

            if trimmed.hasPrefix("data:") {
                let value = trimmed.dropFirst(5).trimmingCharacters(in: .whitespaces)
                if let chunk = parseStreamChunk(String(value)) {
                    await onTextChunk(chunk)
                }
                continue
            }

            if let separator = trimmed.firstIndex(of: ":"),
               trimmed[..<separator] == "0" {
                let value = trimmed[trimmed.index(after: separator)...].trimmingCharacters(in: .whitespaces)
                if let chunk = parseStreamChunk(value) {
                    await onTextChunk(chunk)
                }
            }
        }
    }

    private func parseStreamChunk(_ raw: String) -> String? {
        if let data = raw.data(using: .utf8),
           let json = try? JSONDecoder().decode(StreamChunkPayload.self, from: data),
           let text = json.textChunk {
            return text
        }

        if raw.hasPrefix("\""), raw.hasSuffix("\""),
           let data = raw.data(using: .utf8),
           let text = try? JSONDecoder().decode(String.self, from: data) {
            return text
        }

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
                km: firstPresent(raw, paths: ["thisWeek.km", "week.km", "stats.km", "thisWeek.distance", "totalKm"])?.stringScalar ?? "0",
                runs: firstPresent(raw, paths: ["thisWeek.runs", "week.runs", "stats.runs", "runCount"])?.stringScalar ?? "0",
                avgPace: firstPresent(raw, paths: ["thisWeek.avgPace", "week.avgPace", "stats.avgPace", "avgPaceSeconds"])?.stringScalar ?? "--"
            ),
            todayPlan: TodayPlan(
                title: firstPresent(raw, paths: ["todayPlan.title", "todayPlan.type", "todayWorkout.title", "todayWorkout.type", "workoutToday.title"])?.stringScalar ?? "Check today's plan",
                distance: firstPresent(raw, paths: ["todayPlan.distance", "todayWorkout.distance", "workoutToday.distance", "plan.today.distance"])?.stringScalar ?? "--"
            ),
            raw: raw
        )
    }

    private static func normalizeRecentRun(_ raw: JSONValue) -> RecentRun {
        let detail = firstPresent(raw, paths: ["detail", "time", "type", "duration"])?.stringScalar ?? ""
        let distance = firstPresent(raw, paths: ["distance", "distanceLabel", "km", "miles"])?.stringScalar ?? ""
        let pace = firstPresent(raw, paths: ["pace", "paceLabel", "avgPace", "averagePace"])?.stringScalar ?? ""
        return RecentRun(
            id: firstPresent(raw, paths: ["id", "runId"])?.stringScalar ?? UUID().uuidString,
            title: firstPresent(raw, paths: ["title", "date", "name", "day"])?.stringScalar ?? "Recent run",
            subtitle: firstPresent(raw, paths: ["subtitle", "summary"])?.stringScalar ?? [distance, pace].filter { !$0.isEmpty }.joined(separator: " · "),
            detail: detail.isEmpty ? [distance, pace].filter { !$0.isEmpty }.joined(separator: " · ") : detail
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
                connected: firstPresent(raw, paths: ["garmin.connected", "garmin.isConnected", "garmin.status", "integrations.garmin.connected"])?.boolScalar ?? false,
                email: firstPresent(raw, paths: ["garmin.email", "garmin.accountEmail", "integrations.garmin.email", "garmin.userEmail"])?.stringScalar ?? ""
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
