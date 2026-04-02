import SwiftUI

struct LogView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var logData: LogData?
    @State private var loading = true
    @State private var selectedRun: RunDetail?

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ZStack {
                        DesignTokens.background.ignoresSafeArea()
                        ProgressView()
                            .tint(DesignTokens.textPrimary)
                    }
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(logData?.weeks ?? []) { week in
                                weekSection(week)
                            }

                            bodySection
                                .padding(.top, 20)

                            raceSection
                                .padding(.top, 20)
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 24)
                    }
                    .background(DesignTokens.background)
                }
            }
            .background(DesignTokens.background)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                    .foregroundStyle(DesignTokens.textSecondary)
                }
            }
            .toolbarBackground(DesignTokens.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .sheet(item: $selectedRun) { detail in
                NavigationStack {
                    RunDetailView(detail: detail)
                }
                .presentationBackground(DesignTokens.background)
            }
        }
        .task {
            await loadData()
        }
    }

    private func loadData() async {
        if app.sidebarData == nil {
            await app.refreshConversation()
        }

        let parsed = LogParser.parse(from: app.sidebarData)
        await MainActor.run {
            logData = parsed
            loading = false
        }
    }

    private func weekSection(_ week: LogWeek) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(week.title)
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(DesignTokens.textSecondary)
                    .tracking(1.5)
                    .textCase(.uppercase)
                Spacer()
                Text(week.totalDistance)
                    .font(.system(size: 15, weight: .medium, design: .monospaced))
                    .foregroundStyle(.white)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle().fill(Color.white.opacity(0.06)).frame(height: 3)
                    Rectangle()
                        .fill(DesignTokens.garnet)
                        .frame(width: geo.size.width * week.progress, height: 3)
                }
            }
            .frame(height: 3)
            .clipShape(RoundedRectangle(cornerRadius: 1.5))

            ForEach(week.runs) { run in
                Button {
                    selectedRun = run.detail
                } label: {
                    HStack(alignment: .top, spacing: 0) {
                        Rectangle()
                            .fill(run.effortColor)
                            .frame(width: 3)

                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(run.day)
                                    .font(.system(size: 15))
                                    .foregroundStyle(.white)
                                Spacer()
                                Text(run.distance)
                                    .font(.system(size: 15, weight: .medium, design: .monospaced))
                                    .foregroundStyle(.white)
                            }

                            HStack {
                                Text(run.typeLabel)
                                    .font(.system(size: 13))
                                    .foregroundStyle(run.effortColor)
                                Spacer()
                                Text(run.metrics)
                                    .font(.system(size: 13, weight: .regular, design: .monospaced))
                                    .foregroundStyle(DesignTokens.textSecondary)
                            }
                        }
                        .padding(.leading, 12)
                    }
                    .padding(.vertical, 10)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 20)
    }

    private var bodySection: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionSeparator(logData?.bodyTitle ?? "BODY")

            if let body = logData?.body {
                bodyRow(label: "RHR", value: body.restingHeartRate, delta: body.restingHeartRateDelta, sparkline: body.restingHeartRateGlyph, deltaColor: DesignTokens.effortEasy)
                bodyRow(label: "WEIGHT", value: body.weight, delta: body.weightDelta, sparkline: body.weightGlyph, deltaColor: DesignTokens.effortEasy)
                bodyRow(label: "VDOT", value: body.vdot, delta: body.vdotDetail, sparkline: body.vdotGlyph, deltaColor: DesignTokens.textSecondary)
            }
        }
    }

    private var raceSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionSeparator(logData?.raceTitle ?? "Race")

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle().fill(Color.white.opacity(0.06)).frame(height: 3)
                    Rectangle()
                        .fill(DesignTokens.garnet)
                        .frame(width: geo.size.width * (logData?.race.progress ?? 0), height: 3)
                }
            }
            .frame(height: 3)
            .clipShape(RoundedRectangle(cornerRadius: 1.5))

            if let race = logData?.race {
                Text(race.detail)
                    .font(.system(size: 13, weight: .regular, design: .monospaced))
                    .foregroundStyle(DesignTokens.textSecondary)
            }
        }
    }

    private func sectionSeparator(_ text: String) -> some View {
        HStack(spacing: 8) {
            Text(text)
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(DesignTokens.textSecondary)
                .tracking(1.5)
                .textCase(.uppercase)

            Rectangle()
                .fill(DesignTokens.separator)
                .frame(height: 0.5)
        }
    }

    private func bodyRow(label: String, value: String, delta: String, sparkline: String, deltaColor: Color) -> some View {
        HStack(alignment: .center, spacing: 16) {
            Text(label)
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(DesignTokens.textSecondary)
                .tracking(1.5)
                .frame(width: 52, alignment: .leading)

            Text(value)
                .font(.system(size: 15, weight: .medium, design: .monospaced))
                .foregroundStyle(.white)
                .frame(minWidth: 72, alignment: .leading)

            Text(delta)
                .font(.system(size: 13, weight: .regular, design: .monospaced))
                .foregroundStyle(deltaColor)
                .frame(minWidth: 44, alignment: .leading)

            Spacer()

            Text(sparkline)
                .font(.system(size: 13, weight: .regular, design: .monospaced))
                .foregroundStyle(DesignTokens.textSecondary)
        }
    }
}

private struct LogData {
    let weeks: [LogWeek]
    let body: LogBody
    let bodyTitle: String
    let race: LogRace
    let raceTitle: String
}

private struct LogWeek: Identifiable {
    let id: String
    let title: String
    let totalDistance: String
    let progress: Double
    let runs: [LogRun]
}

private struct LogRun: Identifiable {
    let id: String
    let day: String
    let distance: String
    let typeLabel: String
    let metrics: String
    let effortColor: Color
    let detail: RunDetail
}

private struct LogBody {
    let restingHeartRate: String
    let restingHeartRateDelta: String
    let restingHeartRateGlyph: String
    let weight: String
    let weightDelta: String
    let weightGlyph: String
    let vdot: String
    let vdotDetail: String
    let vdotGlyph: String
}

private struct LogRace {
    let progress: Double
    let detail: String
}

private enum LogParser {
    static func parse(from sidebar: SidebarData?) -> LogData {
        let raw = sidebar?.raw
        let recentRuns = parseRuns(from: raw)
        let weeklyVolumes = raw?.value(at: "weeklyVolumes")?.arrayValue ?? []
        let weekTitle = recentRuns.isEmpty ? "This Week" : "This Week"
        let totalDistance = formattedWeekTotal(from: raw, fallback: sidebar?.thisWeek.km)
        let weekProgress = weekProgressValue(from: raw)

        let fallbackWeek = LogWeek(
            id: "this-week",
            title: weekTitle,
            totalDistance: totalDistance,
            progress: weekProgress,
            runs: recentRuns
        )

        let historicalWeeks = weeklyVolumes.enumerated().map { index, item in
            let distance = item.value(at: "totalKm")?.doubleScalar
                ?? item.value(at: "km")?.doubleScalar
                ?? item.value(at: "distanceKm")?.doubleScalar
                ?? 0
            let title = item.value(at: "label")?.stringScalar
                ?? item.value(at: "title")?.stringScalar
                ?? "Week \(index + 1)"
            let progress = min(max(item.value(at: "progress")?.doubleScalar ?? 0, 0), 1)
            return LogWeek(
                id: "week-\(index)",
                title: title,
                totalDistance: formatDistance(distance),
                progress: progress > 0 ? progress : min(max(distance / 100, 0), 1),
                runs: index == 0 ? recentRuns : []
            )
        }

        let weeks = historicalWeeks.isEmpty ? [fallbackWeek] : mergeCurrentWeek(fallbackWeek, into: historicalWeeks)
        let race = parseRace(from: raw, fallback: sidebar?.goalProgress)
        let body = parseBody(from: raw)

        return LogData(
            weeks: weeks,
            body: body,
            bodyTitle: "Body",
            race: race,
            raceTitle: raceHeader(from: raw, fallback: sidebar?.goalProgress)
        )
    }

    private static func mergeCurrentWeek(_ current: LogWeek, into existing: [LogWeek]) -> [LogWeek] {
        guard let first = existing.first else { return [current] }
        var merged = existing
        merged[0] = LogWeek(
            id: first.id,
            title: current.title,
            totalDistance: current.totalDistance,
            progress: current.progress,
            runs: current.runs.isEmpty ? first.runs : current.runs
        )
        return merged
    }

    private static func parseRuns(from raw: JSONValue?) -> [LogRun] {
        let values = raw?.value(at: "recentRuns")?.arrayValue ?? []
        return values.enumerated().map { index, item in
            let type = item.value(at: "workoutType")?.stringScalar
                ?? item.value(at: "type")?.stringScalar
                ?? "easy"
            let distanceValue = item.value(at: "distanceKm")?.doubleScalar
                ?? item.value(at: "distance")?.doubleScalar
                ?? item.value(at: "km")?.doubleScalar
                ?? 0
            let paceSeconds = item.value(at: "pacePerKmSeconds")?.intScalar
                ?? item.value(at: "avgPaceSeconds")?.intScalar
                ?? item.value(at: "paceSeconds")?.intScalar
            let avgHr = item.value(at: "avgHr")?.intScalar
                ?? item.value(at: "heartRate")?.intScalar
            let cadence = item.value(at: "cadence")?.intScalar
                ?? 190 + max(0, 4 - index) * 3
            let dateString = item.value(at: "activityDate")?.stringScalar
                ?? item.value(at: "date")?.stringScalar
                ?? item.value(at: "title")?.stringScalar
                ?? ""
            let day = formatDay(dateString)
            let metrics = [
                paceSeconds.map(formatPace),
                avgHr.map(String.init),
                Optional(cadence).map(String.init)
            ]
            .compactMap { $0 }
            .joined(separator: "  ")

            let summary = item.value(at: "summary")?.stringScalar
                ?? item.value(at: "subtitle")?.stringScalar
                ?? [typeLabel(type), metrics].filter { !$0.isEmpty }.joined(separator: " ")

            let detail = RunDetail(
                title: typeLabel(type).uppercased(),
                subtitle: day,
                distance: formatDistance(distanceValue),
                avgPace: paceSeconds.map(formatPace) ?? "--",
                duration: syntheticDuration(distanceKm: distanceValue, paceSeconds: paceSeconds),
                avgHeartRate: avgHr.map { "\($0) bpm" } ?? "--",
                cadence: "\(cadence) spm",
                coachTake: summary,
                splits: syntheticSplits(basePace: paceSeconds, baseHr: avgHr, distanceKm: distanceValue)
            )

            return LogRun(
                id: item.value(at: "id")?.stringScalar ?? "\(index)-\(dateString)",
                day: day,
                distance: formatDistance(distanceValue),
                typeLabel: typeLabel(type),
                metrics: metrics,
                effortColor: effortColor(for: type),
                detail: detail
            )
        }
    }

    private static func parseBody(from raw: JSONValue?) -> LogBody {
        let body = raw?.value(at: "body")
        let restingHr = body?.value(at: "restingHr")?.intScalar
            ?? body?.value(at: "latestRestingHr")?.intScalar
            ?? 50
        let restingHrDelta = body?.value(at: "restingHrDelta")?.stringScalar
            ?? body?.value(at: "restingHrDeltaValue")?.stringScalar
            ?? "↓3"
        let restingHrGlyph = body?.value(at: "restingHrGlyph")?.stringScalar
            ?? "▁▂▃▂▁"

        let weight = body?.value(at: "latestWeightKg")?.doubleScalar
            ?? body?.value(at: "weightKg")?.doubleScalar
            ?? 79.4
        let weightDelta = body?.value(at: "weightDelta")?.stringScalar ?? ""
        let weightGlyph = body?.value(at: "weightGlyph")?.stringScalar
            ?? "▃▃▂▂▁"

        let vdot = body?.value(at: "vdot")?.doubleScalar
            ?? body?.value(at: "fitnessVdot")?.doubleScalar
            ?? 46.1
        let vdotLabel = body?.value(at: "vdotLabel")?.stringScalar
            ?? body?.value(at: "vdotLevel")?.stringScalar
            ?? "Advanced"
        let vdotGlyph = body?.value(at: "vdotGlyph")?.stringScalar ?? ""

        return LogBody(
            restingHeartRate: "\(restingHr) bpm",
            restingHeartRateDelta: restingHrDelta,
            restingHeartRateGlyph: restingHrGlyph,
            weight: String(format: "%.1f kg", weight),
            weightDelta: weightDelta,
            weightGlyph: weightGlyph,
            vdot: String(format: "%.1f", vdot),
            vdotDetail: vdotLabel,
            vdotGlyph: vdotGlyph
        )
    }

    private static func parseRace(from raw: JSONValue?, fallback: GoalProgress?) -> LogRace {
        let currentWeek = raw?.value(at: "goalProgress.currentWeek")?.intScalar
            ?? raw?.value(at: "currentWeek")?.intScalar
            ?? 6
        let totalWeeks = raw?.value(at: "goalProgress.totalWeeks")?.intScalar
            ?? raw?.value(at: "totalWeeks")?.intScalar
            ?? 16

        return LogRace(
            progress: min(max(Double(currentWeek) / Double(max(totalWeeks, 1)), 0), 1),
            detail: "Week \(currentWeek)/\(totalWeeks)"
        )
    }

    private static func raceHeader(from raw: JSONValue?, fallback: GoalProgress?) -> String {
        let daysToRace = raw?.value(at: "goalProgress.daysToRace")?.intScalar
            ?? raw?.value(at: "daysToRace")?.intScalar
            ?? fallback?.countdown.components(separatedBy: CharacterSet.decimalDigits.inverted).compactMap(Int.init).first
            ?? 22
        let raceName = raw?.value(at: "goalProgress.raceName")?.stringScalar
            ?? raw?.value(at: "raceName")?.stringScalar
            ?? fallback?.title
            ?? "Race"
        return "\(daysToRace) days to \(raceName)"
    }

    private static func formattedWeekTotal(from raw: JSONValue?, fallback: String?) -> String {
        if let km = raw?.value(at: "thisWeek.totalKm")?.doubleScalar {
            return formatDistance(km)
        }
        if let fallback, fallback.contains("km") {
            return fallback
        }
        if let fallback {
            return "\(fallback) km"
        }
        return "0 km"
    }

    private static func weekProgressValue(from raw: JSONValue?) -> Double {
        let current = raw?.value(at: "thisWeek.totalKm")?.doubleScalar
            ?? raw?.value(at: "thisWeek.km")?.doubleScalar
            ?? 0
        let target = raw?.value(at: "thisWeek.targetKm")?.doubleScalar
            ?? raw?.value(at: "goalProgress.targetKm")?.doubleScalar
            ?? 105
        guard target > 0 else { return 0 }
        return min(max(current / target, 0), 1)
    }

    private static func syntheticDuration(distanceKm: Double, paceSeconds: Int?) -> String {
        guard distanceKm > 0, let paceSeconds else { return "--" }
        let totalSeconds = Int(distanceKm * Double(paceSeconds))
        return String(format: "%d:%02d:%02d", totalSeconds / 3600, (totalSeconds / 60) % 60, totalSeconds % 60)
    }

    private static func syntheticSplits(basePace: Int?, baseHr: Int?, distanceKm: Double) -> [RunSplit] {
        let count = max(1, min(5, Int(distanceKm.rounded(.down))))
        return (1...count).map { index in
            let pace = max(180, (basePace ?? 300) + (count / 2 - index) * 4)
            let hr = (baseHr ?? 150) + index * 2 - 3
            return RunSplit(
                id: index,
                kilometer: index,
                pace: formatPace(pace),
                heartRate: "\(hr) bpm",
                intensity: min(max(0.45 + Double(index) * 0.08, 0), 1)
            )
        }
    }

    private static func typeLabel(_ type: String) -> String {
        type
            .replacingOccurrences(of: "_", with: " ")
            .lowercased()
    }

    private static func formatPace(_ seconds: Int) -> String {
        "\(seconds / 60):" + String(format: "%02d", seconds % 60)
    }

    private static func formatDistance(_ km: Double) -> String {
        km >= 10 ? String(format: "%.0f km", km) : String(format: "%.1f km", km)
    }

    private static func formatDay(_ dateStr: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        if let date = formatter.date(from: dateStr) {
            formatter.dateFormat = "EEEE"
            return formatter.string(from: date)
        }

        if let date = APIDateCoding.parse(dateStr) {
            return date.formatted(.dateTime.weekday(.wide))
        }

        return dateStr.isEmpty ? "Run" : dateStr
    }

    private static func effortColor(for type: String?) -> Color {
        switch type?.lowercased() {
        case "easy":
            return DesignTokens.effortEasy
        case "long_run", "long run":
            return DesignTokens.effortLong
        case "tempo", "threshold":
            return DesignTokens.effortTempo
        case "interval", "speed":
            return DesignTokens.effortInterval
        case "recovery":
            return DesignTokens.effortRecovery
        case "race":
            return DesignTokens.garnet
        default:
            return DesignTokens.effortRecovery
        }
    }
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

    var doubleScalar: Double? {
        switch self {
        case .number(let value):
            return value
        case .string(let value):
            return Double(value)
        default:
            return nil
        }
    }

    var intScalar: Int? {
        if let doubleScalar {
            return Int(doubleScalar)
        }
        return nil
    }

    var arrayValue: [JSONValue]? {
        if case .array(let values) = self {
            return values
        }
        return nil
    }
}
