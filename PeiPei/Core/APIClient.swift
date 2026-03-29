import Foundation

enum APIError: LocalizedError {
    case invalidResponse
    case http(statusCode: Int, message: String)
    case missingSession
    case invalidURL

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The server response was invalid."
        case .http(let statusCode, let message):
            return message.isEmpty ? "Request failed with status \(statusCode)." : message
        case .missingSession:
            return "You are signed out."
        case .invalidURL:
            return "The API URL is invalid."
        }
    }
}

struct APIClient: Sendable {
    private let baseURL = URL(string: "https://www.peipei-run.com")!
    private let session: URLSession
    private let decoder: JSONDecoder

    init(session: URLSession = .shared, decoder: JSONDecoder = .peipei) {
        self.session = session
        self.decoder = decoder
    }

    func login(email: String, password: String) async throws -> LoginResponse {
        struct Body: Encodable {
            let email: String
            let password: String
        }
        // Correct endpoint returns { token, user } + Set-Cookie
        let request = try makeRequest(
            path: "/api/auth/sign-in/email",
            method: "POST",
            body: Body(email: email, password: password),
            token: nil
        )
        return try await send(request, decode: LoginResponse.self)
    }

    func fetchChatMessages(token: String) async throws -> CoachChatResponse {
        let request = try makeRequest(path: "/api/coach/chat", token: token)
        return try await send(request, decode: CoachChatResponse.self)
    }

    func streamCoachReply(
        token: String,
        messages: [CoachMessage],
        onChunk: @escaping @Sendable (String) async -> Void
    ) async throws {
        let payload = ChatStreamRequest(
            messages: messages.map(SentMessagePayload.init(message:)),
            contextType: "general"
        )
        let request = try makeRequest(
            path: "/api/coach/chat",
            method: "POST",
            body: payload,
            token: token
        )

        let (bytes, response) = try await session.bytes(for: request)
        try validate(response: response, data: nil)

        for try await line in bytes.lines {
            let chunk = line.trimmingCharacters(in: .newlines)
            guard !chunk.isEmpty else { continue }
            await onChunk(chunk)
        }
    }

    func fetchSidebarData(token: String) async throws -> SidebarData {
        let request = try makeRequest(path: "/api/coach/sidebar", token: token)
        return try await send(request, decode: SidebarData.self)
    }

    func syncGarmin(token: String) async throws {
        let request = try makeRequest(path: "/api/garmin/sync", method: "POST", token: token)
        let (_, response) = try await session.data(for: request)
        try validate(response: response, data: nil)
    }

    func fetchSettings(token: String) async throws -> SettingsPanelResponse {
        let request = try makeRequest(path: "/api/settings/panel", token: token)
        return try await send(request, decode: SettingsPanelResponse.self)
    }

    func updateSettings(token: String, payload: SettingsUpdateRequest) async throws -> SettingsPanelResponse {
        let request = try makeRequest(
            path: "/api/settings",
            method: "PATCH",
            body: payload,
            token: token
        )
        return try await send(request, decode: SettingsPanelResponse.self)
    }

    private func send<T: Decodable>(_ request: URLRequest, decode type: T.Type) async throws -> T {
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return try decoder.decode(type, from: data)
    }

    private func validate(response: URLResponse, data: Data?) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let message: String
            if let data, let text = String(data: data, encoding: .utf8) {
                message = text
            } else {
                message = ""
            }
            throw APIError.http(statusCode: http.statusCode, message: message)
        }
    }

    private func makeRequest(
        path: String,
        method: String = "GET",
        token: String? = nil
    ) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError.invalidURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 60
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if method != "GET" {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let token {
            // Send both header formats the API supports
            request.setValue(token, forHTTPHeaderField: "X-Session-Token")
            let cookieValue = "peipei.session_token=\(token); __Secure-peipei.session_token=\(token)"
            request.setValue(cookieValue, forHTTPHeaderField: "Cookie")
        }
        return request
    }

    private func makeRequest<T: Encodable>(
        path: String,
        method: String,
        body: T,
        token: String?
    ) throws -> URLRequest {
        var request = try makeRequest(path: path, method: method, token: token)
        request.httpBody = try JSONEncoder().encode(body)
        return request
    }
}
