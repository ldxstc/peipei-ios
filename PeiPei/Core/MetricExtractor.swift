import Foundation

enum MetricExtractor {
    /// Check if a message contains actual run/workout data (pace, distance, HR)
    static func hasRunData(in text: String) -> Bool {
        let lowered = text.lowercased()
        // Must have at least one metric: pace pattern (X:XX/km), distance (Xkm), or HR (XXX bpm)
        let hasPace = lowered.range(of: #"\d{1,2}:\d{2}\s*/km"#, options: .regularExpression) != nil
        let hasDistance = lowered.range(of: #"\d+(?:\.\d+)?\s*km"#, options: .regularExpression) != nil
        let hasHR = lowered.range(of: #"\d{2,3}\s*bpm"#, options: .regularExpression) != nil
        // Or explicit workout keywords with numbers
        let hasWorkoutKeyword = lowered.contains("interval") || lowered.contains("tempo") ||
            lowered.contains("long run") || lowered.contains("recovery") ||
            lowered.contains("race pace") || lowered.contains("轻松跑") ||
            lowered.contains("间歇") || lowered.contains("配速") ||
            lowered.contains("节奏跑") || lowered.contains("恢复跑")
        return hasPace || hasDistance || hasHR || hasWorkoutKeyword
    }

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

        // Split on paragraph breaks first
        let paragraphs = cleaned.components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        guard let firstParagraph = paragraphs.first else {
            return (String(cleaned.prefix(120)), "")
        }

        // For short messages (1 paragraph), try sentence split
        if paragraphs.count == 1 {
            // Split on sentence-ending punctuation (。.!！?？)
            let sentencePattern = #"[。\.\!！\?？]"#
            if let range = firstParagraph.range(of: sentencePattern, options: .regularExpression) {
                let endIdx = firstParagraph.index(after: range.lowerBound)
                let headline = String(firstParagraph[..<endIdx])
                let remainder = String(firstParagraph[endIdx...]).trimmingCharacters(in: .whitespacesAndNewlines)
                return (headline, remainder)
            }
            // No sentence break — truncate at ~120 chars
            if firstParagraph.count > 120 {
                let idx = firstParagraph.index(firstParagraph.startIndex, offsetBy: 120)
                return (String(firstParagraph[..<idx]) + "…", String(firstParagraph[idx...]))
            }
            return (firstParagraph, "")
        }

        // Multiple paragraphs: first paragraph is headline, rest is body
        let headline = firstParagraph
        let body = paragraphs.dropFirst().joined(separator: "\n\n")
        return (headline, body)
    }

    static func deriveDirective(from messages: [CoachMessage], sidebar: SidebarData?) -> DirectiveContent {
        // Priority 1: Derive from sidebar todayPlan + goalProgress
        if let sidebar {
            let planTitle = sidebar.todayPlan.title
            let planDistance = sidebar.todayPlan.distance
            let hasPlan = !planTitle.isEmpty && planTitle != "Check today's plan"

            if hasPlan {
                let instruction = planDistance != "--" && !planDistance.isEmpty
                    ? "\(planTitle) — \(planDistance)"
                    : planTitle

                let raceCountdown = buildRaceCountdown(from: sidebar.goalProgress)

                return DirectiveContent(
                    instruction: instruction,
                    reasoning: sidebar.goalProgress.detail,
                    raceCountdown: raceCountdown
                )
            }
        }

        // Fallback: Find the most recent training-related assistant message
        let trainingMessage = messages.last(where: { $0.role == .assistant && hasRunData(in: $0.content) })
        let lastAssistant = messages.last(where: { $0.role == .assistant })
        let bestMessage = trainingMessage ?? lastAssistant

        let raceCountdown = sidebar.flatMap { buildRaceCountdown(from: $0.goalProgress) }

        guard let msg = bestMessage else {
            return DirectiveContent(
                instruction: "Preparing your plan...",
                reasoning: nil,
                raceCountdown: raceCountdown ?? sidebar?.goalProgress.countdown
            )
        }

        let cleaned = MarkupCleaner.clean(msg.content)

        // If it's a training message, extract the workout type + metrics as directive
        if hasRunData(in: msg.content) {
            let wtype = workoutType(for: msg.content)
            let metrics = metricsLine(from: msg.content)
            let instruction = metrics.isEmpty ? wtype.label : "\(wtype.label) — \(metrics)"
            return DirectiveContent(
                instruction: instruction,
                reasoning: nil,
                raceCountdown: raceCountdown ?? sidebar?.goalProgress.countdown
            )
        }

        // General message — show a short summary
        let split = headlineAndBody(from: cleaned)
        var instruction = split.headline

        // If headline is too short/uninformative (like "Hey."), use more of the message
        if instruction.count < 20 && !split.body.isEmpty {
            let combined = [split.headline, split.body].joined(separator: " ")
            instruction = combined.count > 100 ? String(combined.prefix(100)) + "…" : combined
        } else if instruction.count > 100 {
            instruction = String(instruction.prefix(100)) + "…"
        }

        return DirectiveContent(
            instruction: instruction.isEmpty ? "Preparing your plan..." : instruction,
            reasoning: nil,
            raceCountdown: raceCountdown ?? sidebar?.goalProgress.countdown
        )
    }

    private static func buildRaceCountdown(from goal: GoalProgress) -> String? {
        let countdown = goal.countdown
        let title = goal.title
        guard !countdown.isEmpty, countdown != "No race set" else { return nil }

        if title.isEmpty || title == "Goal Progress" {
            return countdown
        }
        return "\(title) · \(countdown)"
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
            splits: splits,
            activityId: message.id
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
