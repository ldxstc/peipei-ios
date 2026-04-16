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
            return ("", "")
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
        let raceCountdown = sidebar.flatMap { buildRaceCountdown(from: $0.goalProgress) }

        // Priority 1: Today's plan from sidebar
        if let sidebar {
            let planTitle = sidebar.todayPlan.title
            let planDistance = sidebar.todayPlan.distance
            let hasPlan = !planTitle.isEmpty && planTitle != "Check today's plan" && planTitle != "{}"

            if hasPlan {
                let instruction = planDistance != "--" && !planDistance.isEmpty
                    ? "\(planTitle) — \(planDistance)"
                    : planTitle

                return DirectiveContent(
                    instruction: instruction,
                    reasoning: sidebar.goalProgress.detail,
                    raceCountdown: raceCountdown
                )
            }
        }

        // Priority 2: Build from training data (this week + last run)
        if let sidebar {
            let weekKm = sidebar.thisWeek.km
            let weekRuns = sidebar.thisWeek.runs
            let hasWeekData = weekKm != "0" && !weekKm.isEmpty

            if hasWeekData {
                // Build a data-driven directive
                let weekSummary = "\(weekKm) km · \(weekRuns) run\(weekRuns == "1" ? "" : "s") this week"

                // Find last run info
                if let lastRun = sidebar.recentRuns.first {
                    let instruction = "\(lastRun.title) — \(lastRun.subtitle)"
                    return DirectiveContent(
                        instruction: instruction,
                        reasoning: weekSummary,
                        raceCountdown: raceCountdown
                    )
                }

                return DirectiveContent(
                    instruction: weekSummary,
                    reasoning: nil,
                    raceCountdown: raceCountdown
                )
            }
        }

        // Priority 3: Find training-related message
        if let trainingMsg = messages.last(where: { $0.role == .assistant && hasRunData(in: $0.content) }) {
            let wtype = workoutType(for: trainingMsg.content)
            let metrics = metricsLine(from: trainingMsg.content)
            let instruction = metrics.isEmpty ? wtype.label : "\(wtype.label) — \(metrics)"
            return DirectiveContent(
                instruction: instruction,
                reasoning: nil,
                raceCountdown: raceCountdown
            )
        }

        // Priority 4: New user or no data
        if messages.isEmpty {
            return DirectiveContent(
                instruction: "Connect your Garmin to get started.",
                reasoning: nil,
                raceCountdown: nil
            )
        }

        // Priority 5: Generic fallback (never show random chat text)
        return DirectiveContent(
            instruction: "Your coach is ready.",
            reasoning: nil,
            raceCountdown: raceCountdown
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

    static func runDetail(from message: CoachMessage, sidebarData: SidebarData? = nil) -> RunDetail {
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
            activityId: matchActivityId(message: message, sidebar: sidebarData)
        )
    }

    /// Try to match a coach message to a sidebar activity by workout type and distance
    private static func matchActivityId(message: CoachMessage, sidebar: SidebarData?) -> String? {
        guard let sidebar else { return nil }
        let recentRuns = sidebar.recentRuns
        let msgMetrics = metricsLine(from: message.content)

        // Extract distance from metrics (e.g. "23 km" → 23.0)
        let distPattern = #"(\d+(?:\.\d+)?)\s*km"#
        let msgDist: Double? = {
            guard let match = msgMetrics.range(of: distPattern, options: .regularExpression) else { return nil }
            let numStr = msgMetrics[match].replacingOccurrences(of: #"\s*km"#, with: "", options: .regularExpression)
            return Double(numStr)
        }()

        // Match by approximate distance
        if let msgDist {
            for run in recentRuns {
                if abs(run.distanceKm - msgDist) < 1.5 {
                    return run.id
                }
            }
        }

        // Return the first recent run as fallback
        return recentRuns.first?.id
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
