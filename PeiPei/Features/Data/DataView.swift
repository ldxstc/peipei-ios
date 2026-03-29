import SwiftUI
import Charts

struct DataView: View {
    @Environment(AppModel.self) private var appModel
    @State private var viewModel = DataViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if let data = viewModel.sidebarData {
                    ScrollView {
                        LazyVStack(spacing: 20) {
                            thisWeekCard(data)
                            if let goal = data.goalProgress {
                                goalCard(goal)
                            }
                            recentRunsCard(data)
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 32)
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
                            description: Text("Connect your Garmin to see your weekly volume, pace trends, and race countdown.")
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

    private func thisWeekCard(_ data: SidebarData) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("THIS WEEK")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.tertiary)
                .tracking(1.0)

            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(data.thisWeek.km)
                    .font(.system(size: 48, weight: .ultraLight, design: .rounded))
                    .foregroundStyle(Color("Cream"))
                Text("km")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.secondary)
            }

            // Weekly volume chart
            if let volumes = data.thisWeek.weeklyVolumes, !volumes.isEmpty {
                Chart(volumes) { week in
                    BarMark(
                        x: .value("Week", String(week.weekStart.suffix(5))),
                        y: .value("KM", week.distanceKm)
                    )
                    .foregroundStyle(
                        week.weekStart == volumes.last?.weekStart
                            ? Color("Amber").gradient
                            : Color("Amber").opacity(0.55).gradient
                    )
                    .cornerRadius(4)
                    .annotation(position: .top, spacing: 4) {
                        Text(String(format: "%.0f", week.distanceKm))
                            .font(.system(size: 9, weight: .medium, design: .monospaced))
                            .foregroundStyle(Color("Amber").opacity(0.6))
                    }
                }
                .chartYAxis(.hidden)
                .chartXAxis {
                    AxisMarks { _ in
                        AxisValueLabel()
                            .font(.system(size: 10))
                            .foregroundStyle(Color("Amber").opacity(0.6))
                    }
                }
                .frame(height: 80)
            }

            HStack(spacing: 10) {
                statPill(label: "Runs", value: data.thisWeek.runs)
                statPill(label: "Avg Pace", value: data.thisWeek.avgPace)
            }
        }
        .padding(20)
        .background(Color("Surface"), in: .rect(cornerRadius: 18, style: .continuous))
    }

    // MARK: - Goal

    private func goalCard(_ goal: GoalProgress) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("GOAL")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.tertiary)
                .tracking(1.0)

            HStack(spacing: 16) {
                // Progress ring
                ZStack {
                    Circle()
                        .strokeBorder(Color("Amber").opacity(0.15), lineWidth: 4)
                    Circle()
                        .trim(from: 0, to: CGFloat(goal.currentWeek ?? 0) / CGFloat(max(goal.totalWeeks ?? 16, 1)))
                        .stroke(Color("Amber"), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text("\(goal.daysToRace ?? 0)")
                        .font(.system(size: 16, weight: .bold, design: .monospaced))
                        .foregroundStyle(Color("Amber"))
                }
                .frame(width: 56, height: 56)

                VStack(alignment: .leading, spacing: 4) {
                    Text(goal.title)
                        .font(.system(.headline, design: .serif))
                        .foregroundStyle(Color("Cream"))
                    if !goal.countdown.isEmpty {
                        Text(goal.countdown + " to go")
                            .font(.subheadline)
                            .foregroundStyle(Color("Amber"))
                    }
                    if !goal.detail.isEmpty {
                        Text(goal.detail)
                            .font(.caption)
                            .foregroundStyle(Color("Amber").opacity(0.6))
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(Color("Surface"), in: .rect(cornerRadius: 18, style: .continuous))
    }

    // MARK: - Recent Runs

    private func recentRunsCard(_ data: SidebarData) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("RECENT RUNS")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.tertiary)
                .tracking(1.0)

            if data.recentRuns.isEmpty {
                Text("No runs synced yet.")
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8)
            } else {
                ForEach(data.recentRuns) { run in
                    runRow(run)
                    if run.id != data.recentRuns.last?.id {
                        Divider().overlay(Color.white.opacity(0.04))
                    }
                }
            }
        }
        .padding(20)
        .background(Color("Surface"), in: .rect(cornerRadius: 18, style: .continuous))
    }

    private func runRow(_ run: RecentRun) -> some View {
        HStack(spacing: 12) {
            // Workout type icon
            Image(systemName: runIcon(for: run.workoutType))
                .font(.system(size: 14))
                .foregroundStyle(Color("Amber"))
                .frame(width: 28, height: 28)
                .background(Color("Amber").opacity(0.08), in: .circle)

            VStack(alignment: .leading, spacing: 2) {
                Text(run.title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color("Cream"))
                if let date = run.date {
                    Text(date)
                        .font(.caption)
                        .foregroundStyle(Color("Amber").opacity(0.6))
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(run.subtitle)
                    .font(.system(.subheadline, design: .monospaced).weight(.medium))
                    .foregroundStyle(Color("Cream"))
                Text(run.detail)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(Color("Amber"))
            }

            if let hr = run.hrLabel {
                Text(hr)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(Color("Amber").opacity(0.6))
            }
        }
        .padding(.vertical, 6)
    }

    private func statPill(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(.subheadline, design: .monospaced).weight(.semibold))
                .foregroundStyle(Color("Cream"))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color("Amber").opacity(0.10), in: .rect(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color("Amber").opacity(0.12), lineWidth: 0.5))
    }

    private func runIcon(for type: String?) -> String {
        switch type {
        case "long_run": return "figure.run"
        case "tempo": return "bolt.fill"
        case "interval", "speed": return "timer"
        case "easy": return "leaf.fill"
        case "recovery": return "heart.fill"
        default: return "figure.run"
        }
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
