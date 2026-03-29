import Foundation

struct User: Codable, Sendable, Equatable {
    let id: String
    let email: String
    let name: String
}

struct LoginResponse: Codable, Sendable {
    let user: User
    let token: String       // API returns "token" field
    let redirect: Bool?

    enum CodingKeys: String, CodingKey {
        case user, token, redirect
    }
}

struct CoachChatResponse: Codable, Sendable {
    let messages: [CoachMessage]
    let hasMore: Bool
}

struct CoachMessage: Codable, Identifiable, Hashable, Sendable {
    enum Role: String, Codable, Sendable {
        case user
        case assistant
    }

    enum MessageType: String, Codable, Sendable {
        case text
        case socialPost = "social_post"
    }

    let id: String
    let role: Role
    var content: String
    let createdAt: Date
    let messageType: MessageType
    let socialPost: SocialPost?
    let attachments: [String]?  // present in API, ignored for now


    enum CodingKeys: String, CodingKey {
        case id, role, content, createdAt, messageType, socialPost, attachments
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        role = try c.decode(Role.self, forKey: .role)
        content = try c.decode(String.self, forKey: .content)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        messageType = try c.decodeIfPresent(MessageType.self, forKey: .messageType) ?? .text
        socialPost = try c.decodeIfPresent(SocialPost.self, forKey: .socialPost)
        attachments = try c.decodeIfPresent([String].self, forKey: .attachments)
    }

    init(
        id: String = UUID().uuidString,
        role: Role,
        content: String,
        createdAt: Date = .now,
        messageType: MessageType = .text,
        socialPost: SocialPost? = nil
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.createdAt = createdAt
        self.messageType = messageType
        self.socialPost = socialPost
        self.attachments = nil
    }
}

struct SocialPost: Codable, Hashable, Sendable {
    let caption: String
    let imageURL: URL?

    enum CodingKeys: String, CodingKey {
        case caption
        case imageURL = "imageUrl"
    }
}

struct SidebarData: Codable, Sendable {
    let thisWeek: ThisWeekStats
    let recentRuns: [RecentRun]
    let goalProgress: GoalProgress?

    // Computed helpers for the view
    var todayPlan: TodayPlan { TodayPlan(title: "Check with coach", distance: "--") }
}

struct ThisWeekStats: Codable, Sendable {
    let totalKm: Double?
    let runCount: Int?
    let avgPaceSeconds: Int?
    let weeklyVolumes: [WeeklyVolume]?

    var km: String {
        guard let v = totalKm else { return "--" }
        return v < 10 ? String(format: "%.1f", v) : String(format: "%.0f", v)
    }
    var runs: String { runCount.map(String.init) ?? "--" }
    var avgPace: String {
        guard let s = avgPaceSeconds, s > 0 else { return "--" }
        return "\(s / 60):\(String(format: "%02d", s % 60))/km"
    }
}

struct WeeklyVolume: Codable, Sendable, Identifiable {
    let weekStart: String
    let distanceKm: Double
    let sessions: Int
    var id: String { weekStart }
}

struct TodayPlan: Sendable {
    let title: String
    let distance: String
}

struct GoalProgress: Codable, Sendable {
    let raceName: String?
    let daysToRace: Int?
    let currentWeek: Int?
    let totalWeeks: Int?
    let fitnessLabel: String?

    var title: String { raceName ?? "No race set" }
    var countdown: String {
        guard let d = daysToRace else { return "" }
        return "\(d) days"
    }
    var detail: String {
        var parts: [String] = []
        if let w = currentWeek, let t = totalWeeks { parts.append("Week \(w) of \(t)") }
        if let f = fitnessLabel { parts.append(f) }
        return parts.joined(separator: " · ")
    }
}

struct RecentRun: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let activityDate: String?
    let workoutType: String?
    let distanceKm: Double?
    let pacePerKmSeconds: Int?
    let avgHr: Int?

    var title: String { workoutType?.replacingOccurrences(of: "_", with: " ").capitalized ?? "Run" }
    var subtitle: String {
        guard let d = distanceKm else { return "--" }
        return d < 10 ? String(format: "%.1f km", d) : String(format: "%.0f km", d)
    }
    var detail: String {
        guard let s = pacePerKmSeconds, s > 0 else { return "--" }
        return "\(s / 60):\(String(format: "%02d", s % 60))/km"
    }
    var date: String? { activityDate }
    var hrLabel: String? {
        guard let hr = avgHr else { return nil }
        return "\(hr) bpm"
    }
}

struct SettingsPanelResponse: Codable, Sendable {
    let displayName: String
    let units: Units
    let coachLanguage: CoachLanguage
    let customInstructions: String
    let accountEmail: String
    let garmin: GarminSettings
    let billing: BillingSettings
}

enum Units: String, Codable, CaseIterable, Identifiable, Sendable {
    case metric
    case imperial

    var id: String { rawValue }

    var title: String {
        switch self {
        case .metric: "Metric"
        case .imperial: "Imperial"
        }
    }
}

enum CoachLanguage: String, Codable, CaseIterable, Identifiable, Sendable {
    case english = "en"
    case simplifiedChinese = "zh-Hans"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .english: "English"
        case .simplifiedChinese: "简体中文"
        }
    }
}

struct GarminSettings: Codable, Sendable {
    let connected: Bool
    let email: String?
}

struct BillingSettings: Codable, Sendable {
    let isPro: Bool
}

struct SettingsUpdateRequest: Codable, Sendable {
    let displayName: String
    let units: Units
    let coachLanguage: CoachLanguage
    let customInstructions: String
}

struct MetricValue: Identifiable, Hashable, Sendable {
    let id = UUID()
    let label: String
    let number: String
    let unit: String
    var value: String { number + (unit.isEmpty ? "" : " " + unit) }
}

struct DaySection: Identifiable, Hashable {
    let id: String
    let date: Date
    let messages: [CoachMessage]
}

struct SentMessagePayload: Encodable, Sendable {
    let id: String
    let role: String
    let content: String
    let createdAt: String
    let messageType: String

    init(message: CoachMessage) {
        id = message.id
        role = message.role.rawValue
        content = message.content
        createdAt = DateCoding.string(from: message.createdAt)
        messageType = message.messageType.rawValue
    }
}

struct ChatStreamRequest: Encodable, Sendable {
    let messages: [SentMessagePayload]
    let contextType: String
}

enum DateCoding {
    static func string(from date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    static func parse(_ value: String) -> Date? {
        let formatterWithFractions = ISO8601DateFormatter()
        formatterWithFractions.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatterWithFractions.date(from: value) {
            return date
        }

        let formatter = ISO8601DateFormatter()
        return formatter.date(from: value)
    }
}

extension JSONDecoder {
    static let peipei: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { container in
            let value = try container.singleValueContainer().decode(String.self)
            if let date = DateCoding.parse(value) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: try container.singleValueContainer(),
                debugDescription: "Invalid ISO8601 date: \(value)"
            )
        }
        return decoder
    }()
}

extension UserDefaults {
    static let userKey = "PeiPei.CurrentUser"

    func saveUser(_ user: User) {
        guard let data = try? JSONEncoder().encode(user) else { return }
        set(data, forKey: Self.userKey)
    }

    func loadUser() -> User? {
        guard let data = data(forKey: Self.userKey) else { return nil }
        return try? JSONDecoder().decode(User.self, from: data)
    }
}
