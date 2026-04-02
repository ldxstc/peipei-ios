import Foundation

enum MetricExtractor {
    static func workoutType(for text: String) -> WorkoutType {
        let lowered = text.lowercased()

        if lowered.contains("race pace") || lowered.contains("marathon pace") || lowered.contains("race") {
            return .race
        }
        if lowered.contains("interval") || lowered.contains("speed") || lowered.contains("repeat") {
            return .interval
        }
        if lowered.contains("tempo") || lowered.contains("threshold") {
            return .tempo
        }
        if lowered.contains("long run") || lowered.contains("long") {
            return .long
        }
        if lowered.contains("recovery") {
            return .recovery
        }
        if lowered.contains("rest") {
            return .rest
        }
        return .easy
    }

    static func metricsLine(from text: String) -> String {
        let lowered = text.lowercased()
        let patterns = [
            "(\\d+(?:\\.\\d+)?)\\s?(?:km|mi|miles)",
            "(\\d{1,2}:\\d{2})\\s?(?:/km|/mi)?",
            "(\\d{2,3})\\s?bpm"
        ]

        let values = patterns.compactMap { firstMatch(in: lowered, pattern: $0) }
        return values.joined(separator: " · ")
    }

    static func headlineAndBody(from text: String) -> (headline: String, body: String) {
        let cleaned = MarkupCleaner.clean(text)
        guard !cleaned.isEmpty else {
            return ("No update yet.", "")
        }

        let sentences = cleaned.split(whereSeparator: \.isNewline).flatMap { line -> [String] in
            line.split(separator: ".", omittingEmptySubsequences: true).map { segment in
                segment.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }

        guard let first = sentences.first, !first.isEmpty else {
            return (String(cleaned.prefix(100)), "")
        }

        let headline = first.hasSuffix(".") ? first : "\(first)."
        let remainder = cleaned.replacingOccurrences(of: headline, with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return (headline, remainder)
    }

    static func deriveDirective(from messages: [CoachMessage], sidebar: SidebarData?) -> DirectiveContent {
        let latestAssistant = messages.last(where: { $0.role == .assistant })
        let cleaned = MarkupCleaner.clean(latestAssistant?.content ?? "")
        let split = headlineAndBody(from: cleaned)
        let instruction = split.headline.count > 80 ? String(split.headline.prefix(80)) : split.headline

        return DirectiveContent(
            instruction: instruction.isEmpty ? "Preparing your plan..." : instruction,
            reasoning: split.body.isEmpty ? sidebar?.todayPlan.title : split.body,
            raceCountdown: sidebar?.goalProgress.countdown
        )
    }

    static func runDetail(from message: CoachMessage) -> RunDetail {
        let metrics = metricsLine(from: message.content).split(separator: "·").map {
            $0.trimmingCharacters(in: .whitespaces)
        }
        let title = workoutType(for: message.content).label
        let distance = metrics.indices.contains(0) ? metrics[0] : "--"
        let avgPace = metrics.indices.contains(1) ? metrics[1] : "--"
        let avgHeartRate = metrics.indices.contains(2) ? metrics[2] : "--"
        let narrative = headlineAndBody(from: message.content)
        let splits = (1...5).map { index in
            RunSplit(
                id: index,
                kilometer: index,
                pace: syntheticPace(base: avgPace, offset: index - 3),
                heartRate: syntheticHeartRate(base: avgHeartRate, offset: index * 2 - 5),
                intensity: min(1, max(0.3, 0.55 + Double(index) * 0.08))
            )
        }

        return RunDetail(
            title: title,
            subtitle: RelativeDateTimeFormatter().localizedString(for: message.createdAt, relativeTo: .now),
            distance: distance,
            avgPace: avgPace,
            duration: syntheticDuration(distance: distance, pace: avgPace),
            avgHeartRate: avgHeartRate,
            cadence: "203 spm",
            coachTake: [narrative.headline, narrative.body].filter { !$0.isEmpty }.joined(separator: "\n\n"),
            splits: splits
        )
    }

    private static func firstMatch(in text: String, pattern: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
            return nil
        }

        let range = NSRange(text.startIndex..., in: text)
        guard let match = regex.firstMatch(in: text, options: [], range: range),
              let resultRange = Range(match.range(at: 0), in: text) else {
            return nil
        }

        return String(text[resultRange])
    }

    private static func syntheticPace(base: String, offset: Int) -> String {
        guard let match = firstMatch(in: base, pattern: "(\\d{1,2}):(\\d{2})") else {
            return "4:5\(max(0, min(9, 5 + offset)))"
        }

        let parts = match.split(separator: ":")
        guard parts.count == 2,
              let minutes = Int(parts[0]),
              let seconds = Int(parts[1]) else {
            return match
        }

        let total = max(0, minutes * 60 + seconds + offset * 4)
        return "\(total / 60):" + String(format: "%02d", total % 60)
    }

    private static func syntheticHeartRate(base: String, offset: Int) -> String {
        guard let match = firstMatch(in: base, pattern: "(\\d{2,3})"), let bpm = Int(match) else {
            return "\(155 + offset) bpm"
        }
        return "\(bpm + offset) bpm"
    }

    private static func syntheticDuration(distance: String, pace: String) -> String {
        guard let distanceValue = Double(firstMatch(in: distance, pattern: "\\d+(?:\\.\\d+)?") ?? ""),
              let paceMatch = firstMatch(in: pace, pattern: "(\\d{1,2}):(\\d{2})") else {
            return "--"
        }

        let parts = paceMatch.split(separator: ":")
        guard parts.count == 2,
              let minutes = Int(parts[0]),
              let seconds = Int(parts[1]) else {
            return "--"
        }

        let totalSeconds = Int(distanceValue * Double(minutes * 60 + seconds))
        return String(format: "%d:%02d:%02d", totalSeconds / 3600, (totalSeconds / 60) % 60, totalSeconds % 60)
    }
}
