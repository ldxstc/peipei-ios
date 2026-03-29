import SwiftUI

struct DataView: View {
    @Environment(AppModel.self) private var appModel
    @State private var viewModel = DataViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if let data = viewModel.sidebarData {
                    List {
                        thisWeekSection(data)
                        goalSection(data)
                        recentRunsSection(data)
                    }
                    .listStyle(.insetGrouped)
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

    private func thisWeekSection(_ data: SidebarData) -> some View {
        Section("This Week") {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(data.thisWeek.km)
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                        .foregroundStyle(Color("Cream"))
                    Text("km")
                        .font(.headline)
                        .foregroundStyle(Color("TextSecondary"))
                }

                HStack(spacing: 10) {
                    statPill(title: "Runs", value: data.thisWeek.runs)
                    statPill(title: "Avg Pace", value: data.thisWeek.avgPace)
                }
            }
            .padding(.vertical, 8)
        }
    }

    private func goalSection(_ data: SidebarData) -> some View {
        Section("Goal") {
            VStack(alignment: .leading, spacing: 10) {
                Text(data.goalProgress.title)
                    .font(.system(.title3, design: .serif).weight(.semibold))
                    .foregroundStyle(Color("Cream"))

                Text(data.goalProgress.countdown)
                    .font(.system(.headline, design: .monospaced).weight(.semibold))
                    .foregroundStyle(Color("Amber"))

                Text(data.goalProgress.detail)
                    .font(.subheadline)
                    .foregroundStyle(Color("TextSecondary"))

                Divider().overlay(Color.white.opacity(0.08))

                HStack {
                    Text("Today")
                        .foregroundStyle(Color("TextSecondary"))
                    Spacer()
                    VStack(alignment: .trailing) {
                        Text(data.todayPlan.title)
                            .foregroundStyle(Color("Cream"))
                        Text(data.todayPlan.distance)
                            .foregroundStyle(Color("Amber"))
                            .font(.caption.weight(.semibold))
                    }
                }
            }
            .padding(.vertical, 4)
        }
    }

    private func recentRunsSection(_ data: SidebarData) -> some View {
        Section("Recent Runs") {
            if data.recentRuns.isEmpty {
                Text("No runs synced yet.")
                    .foregroundStyle(Color("TextSecondary"))
            } else {
                ForEach(data.recentRuns) { run in
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(run.title)
                                .foregroundStyle(Color("Cream"))
                            Text(run.date ?? "Recent")
                                .font(.caption)
                                .foregroundStyle(Color("TextSecondary"))
                        }

                        Spacer()

                        VStack(alignment: .trailing, spacing: 4) {
                            Text(run.subtitle)
                                .foregroundStyle(Color("Cream"))
                            Text(run.detail)
                                .font(.caption)
                                .foregroundStyle(Color("Amber"))
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    private func statPill(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(Color("TextSecondary"))
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color("Cream"))
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color("Surface"), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
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
