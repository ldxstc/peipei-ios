import SwiftUI

struct DataView: View {
    @Environment(AppModel.self) private var appModel
    @State private var viewModel = DataViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if let data = viewModel.sidebarData {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 24) {
                            if data.thisWeek.totalKm != nil {
                                thisWeekSection(data.thisWeek)
                            }
                            if !data.recentRuns.isEmpty {
                                recentRunsSection(data.recentRuns)
                            }
                            if let goal = data.goalProgress {
                                goalSection(goal)
                            }
                            if let body = data.body {
                                bodySection(body)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 8)
                        .padding(.bottom, 80)
                    }
                } else if viewModel.isLoading {
                    ProgressView()
                        .tint(Color("Cream"))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    VStack(spacing: 16) {
                        ContentUnavailableView(
                            "No training data yet",
                            systemImage: "figure.run",
                            description: Text("Connect your Garmin to see your data here.")
                        )
                        NavigationLink("Open Settings") {
                            SettingsView()
                        }
                        .buttonStyle(.bordered)
                        .tint(Color("Amber"))
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color("Background"))
            .navigationTitle("Training")
            .task { await load() }
            .refreshable { await refresh() }
        }
    }

    // MARK: - This Week

    private func thisWeekSection(_ week: ThisWeekStats) -> some View {
        SectionBlock(title: "This Week") {
            // Volume row
            dataRow(label: "Volume") {
                Text("\(week.km) km")
                    .font(.system(.body, design: .serif))
                    .foregroundStyle(Color("Cream"))
            }

            // Runs + Avg Pace grid
            HStack(spacing: 0) {
                miniStat(label: "Runs", value: week.runs)
                miniStat(label: "Avg Pace", value: week.avgPace)
            }

            // Trend glyph
            if let glyph = week.trendGlyph, !glyph.isEmpty {
                dataRow(label: "Trend") {
                    Text(glyph)
                        .font(.system(size: 14, design: .monospaced))
                        .tracking(3)
                        .foregroundStyle(Color("Cream"))
                }
            }
        }
    }

    // MARK: - Recent Runs

    private func recentRunsSection(_ runs: [RecentRun]) -> some View {
        SectionBlock(title: "Recent Runs") {
            ForEach(runs) { run in
                HStack(spacing: 0) {
                    Text(run.shortDate)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(.tertiary)
                        .frame(width: 48, alignment: .leading)

                    Text(run.title.lowercased())
                        .font(.system(size: 12))
                        .foregroundStyle(Color("Cream"))
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Text(run.subtitle)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(Color("Cream"))
                        .frame(width: 44, alignment: .trailing)

                    Text(run.detail)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(.tertiary)
                        .frame(width: 52, alignment: .trailing)
                }
                .padding(.vertical, 6)
                .padding(.horizontal, 8)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.white.opacity(0.02))
                )
            }
        }
    }

    // MARK: - Goal Progress

    private func goalSection(_ goal: GoalProgress) -> some View {
        SectionBlock(title: "Goal Progress") {
            // Race name
            Text(goal.title)
                .font(.system(.body, design: .serif))
                .foregroundStyle(Color("Cream"))
                .padding(.horizontal, 8)

            // Stats grid
            VStack(spacing: 6) {
                dataRow(label: "Days") {
                    Text(goal.daysToRace != nil ? "\(goal.daysToRace!)" : "--")
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundStyle(Color("Cream"))
                }
                dataRow(label: "Block") {
                    Text(goal.blockLabel)
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundStyle(Color("Cream"))
                }
                if let fitness = goal.fitnessValue {
                    dataRow(label: "Fitness") {
                        Text("VDOT \(String(format: "%.1f", fitness))")
                            .font(.system(size: 13, design: .monospaced))
                            .foregroundStyle(Color("Cream"))
                    }
                }
            }

            // Progress bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Color("Amber").opacity(0.15))
                        .frame(height: 2)
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Color("Garnet"))
                        .frame(width: geo.size.width * CGFloat(goal.progressPercent ?? 0) / 100, height: 2)
                }
            }
            .frame(height: 2)
            .padding(.horizontal, 8)

            if let label = goal.fitnessLabel {
                Text(label.uppercased())
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(.tertiary)
                    .tracking(1)
                    .padding(.horizontal, 8)
            }
        }
    }

    // MARK: - Body

    private func bodySection(_ body: BodyStats) -> some View {
        SectionBlock(title: "Body") {
            if let weight = body.latestWeightKg {
                dataRow(label: "Weight") {
                    Text("\(String(format: "%.1f", weight)) kg")
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundStyle(Color("Cream"))
                }
            }

            if let hr = body.restingHr {
                VStack(spacing: 4) {
                    dataRow(label: "Resting HR") {
                        Text("\(Int(hr)) bpm")
                            .font(.system(size: 13, design: .monospaced))
                            .foregroundStyle(Color("Cream"))
                    }

                    HStack {
                        if let glyph = body.restingHrGlyph {
                            Text(glyph)
                                .font(.system(size: 11, design: .monospaced))
                                .tracking(3)
                                .foregroundStyle(.tertiary)
                        }
                        Spacer()
                        if let delta = body.restingHrDelta {
                            Text(delta > 0 ? "+\(delta) bpm" : "\(delta) bpm")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(.tertiary)
                        } else {
                            Text("steady")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .padding(.horizontal, 8)
                }
            }
        }
    }

    // MARK: - Helpers

    private func dataRow<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(label.uppercased())
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.tertiary)
                .tracking(0.8)
            Spacer()
            content()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
    }

    private func miniStat(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.tertiary)
                .tracking(0.8)
            Text(value)
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(Color("Cream"))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.white.opacity(0.02))
        )
    }

    private func load() async {
        guard let token = appModel.sessionToken else { return }
        await viewModel.load(token: token)
    }

    private func refresh() async {
        guard let token = appModel.sessionToken else { return }
        await viewModel.syncAndReload(token: token)
    }
}

// MARK: - Section Block

struct SectionBlock<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(.tertiary)
                .tracking(1.5)

            VStack(alignment: .leading, spacing: 6) {
                content
            }
        }
    }
}
