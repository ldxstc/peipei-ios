import Foundation
import SwiftUI

struct User: Codable, Hashable, Sendable {
    let id: String
    let name: String?
    let email: String
}

struct LoginResponse: Codable, Sendable {
    let token: String
    let user: User
    let redirect: Bool?
}

struct CoachChatResponse: Codable, Sendable {
    let messages: [CoachMessage]
    let hasMore: Bool
}

struct CoachMessage: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let role: Role
    var content: String
    let createdAt: Date
    let messageType: String?
    let attachments: [String]?

    enum Role: String, Codable, Sendable {
        case user
        case assistant
    }

    enum CodingKeys: String, CodingKey {
        case id
        case role
        case content
        case createdAt
        case messageType
        case attachments
        case type
    }

    init(
        id: String,
        role: Role,
        content: String,
        createdAt: Date,
        messageType: String? = nil,
        attachments: [String]? = nil
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.createdAt = createdAt
        self.messageType = messageType
        self.attachments = attachments
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        let role = try container.decodeIfPresent(Role.self, forKey: .role) ?? .assistant
        let messageType = try container.decodeIfPresent(String.self, forKey: .messageType)
            ?? container.decodeIfPresent(String.self, forKey: .type)

        let content: String
        if let stringContent = try? container.decode(String.self, forKey: .content) {
            content = stringContent
        } else if let contentArray = try? container.decode([TextChunk].self, forKey: .content) {
            content = contentArray.map(\.text).joined()
        } else if let nested = try? container.decode(MessageContent.self, forKey: .content) {
            content = nested.caption ?? nested.text ?? nested.content ?? nested.message ?? ""
        } else {
            content = ""
        }

        let decodedDate: Date
        if let iso8601String = try container.decodeIfPresent(String.self, forKey: .createdAt),
           let date = APIDateCoding.parse(iso8601String) {
            decodedDate = date
        } else {
            decodedDate = .now
        }

        self.id = id
        self.role = role
        self.content = MarkupCleaner.clean(content)
        self.createdAt = decodedDate
        self.messageType = messageType
        self.attachments = try container.decodeIfPresent([String].self, forKey: .attachments)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(role, forKey: .role)
        try container.encode(content, forKey: .content)
        try container.encode(APIDateCoding.string(from: createdAt), forKey: .createdAt)
        try container.encodeIfPresent(messageType, forKey: .messageType)
        try container.encodeIfPresent(attachments, forKey: .attachments)
    }
}

private struct TextChunk: Codable {
    let text: String
}

private struct MessageContent: Codable {
    let caption: String?
    let text: String?
    let content: String?
    let message: String?
}

struct SidebarData: Codable, Sendable {
    let goalProgress: GoalProgress
    let recentRuns: [RecentRun]
    let thisWeek: WeekSummary
    let todayPlan: TodayPlan
    let raw: JSONValue?
}

struct GoalProgress: Codable, Hashable, Sendable {
    let countdown: String
    let detail: String
    let title: String
}

struct RecentRun: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let subtitle: String
    let detail: String
}

struct WeekSummary: Codable, Hashable, Sendable {
    let km: String
    let runs: String
    let avgPace: String
}

struct TodayPlan: Codable, Hashable, Sendable {
    let title: String
    let distance: String
}

struct SettingsPanelData: Codable, Sendable {
    let displayName: String
    let units: UnitsPreference
    let coachLanguage: CoachLanguagePreference
    let customInstructions: String
    let accountEmail: String
    let billing: BillingData
    let garmin: GarminData
    let raw: JSONValue?
}

struct BillingData: Codable, Hashable, Sendable {
    let isPro: Bool
    let tierLabel: String
}

struct GarminData: Codable, Hashable, Sendable {
    let connected: Bool
    let email: String
}

enum UnitsPreference: String, Codable, CaseIterable, Identifiable, Sendable {
    case metric
    case imperial

    var id: String { rawValue }
}

enum CoachLanguagePreference: String, Codable, CaseIterable, Identifiable, Sendable {
    case en
    case zhHans = "zh-Hans"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .en: "English"
        case .zhHans: "Simplified Chinese"
        }
    }
}

struct SettingsSaveInput: Codable, Sendable {
    let displayName: String
    let units: UnitsPreference
    let coachLanguage: CoachLanguagePreference
    let customInstructions: String
}

struct DirectiveContent: Hashable, Sendable {
    let instruction: String
    let reasoning: String?
    let raceCountdown: String?
}

struct DaySection: Identifiable, Hashable, Sendable {
    let id: String
    let dateLabel: String
    let messages: [CoachMessage]
}

struct RunDetail: Identifiable, Hashable, Sendable {
    let id = UUID()
    let title: String
    let subtitle: String
    let distance: String
    let avgPace: String
    let duration: String
    let avgHeartRate: String
    let cadence: String
    let coachTake: String
    let splits: [RunSplit]
}

struct RunSplit: Identifiable, Hashable, Sendable {
    let id: Int
    let kilometer: Int
    let pace: String
    let heartRate: String
    let intensity: Double
}

enum WorkoutType: String, Hashable, Sendable {
    case easy
    case tempo
    case long
    case interval
    case recovery
    case race
    case rest

    var label: String {
        switch self {
        case .easy: "EASY"
        case .tempo: "TEMPO"
        case .long: "LONG RUN"
        case .interval: "INTERVAL"
        case .recovery: "RECOVERY"
        case .race: "RACE PACE"
        case .rest: "REST"
        }
    }

    var color: Color {
        switch self {
        case .easy: DesignTokens.effortEasy
        case .tempo: DesignTokens.effortTempo
        case .long: DesignTokens.effortLong
        case .interval: DesignTokens.effortInterval
        case .recovery, .rest: DesignTokens.effortRecovery
        case .race: DesignTokens.effortRace
        }
    }
}

enum JSONValue: Codable, Hashable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch self {
        case .string(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }
}

enum APIDateCoding {
    nonisolated(unsafe) private static let formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static func parse(_ string: String) -> Date? {
        formatter.date(from: string) ?? ISO8601DateFormatter().date(from: string)
    }

    static func string(from date: Date) -> String {
        formatter.string(from: date)
    }
}
