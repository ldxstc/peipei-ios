import SwiftUI

struct DataView: View {
    @Environment(AppModel.self) private var appModel
    @State private var viewModel = DataViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if let data = viewModel.sidebarData {
                    List {
                        if data.thisWeek.totalKm != nil {
                            Section("This Week") {
                                LabeledContent("Volume") {
                                    metricValue("\(data.thisWeek.km) km")
                                }

                                HStack(spacing: 12) {
                                    miniStat(title: "Runs", value: data.thisWeek.runs)
                                    miniStat(title: "Avg Pace", value: data.thisWeek.avgPace)
                                }
                                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                                .listRowBackground(Color.clear)

                                if let glyph = data.thisWeek.trendGlyph, !glyph.isEmpty {
                                    LabeledContent("Trend") {
                                        Text(glyph)
                                            .font(.system(.subheadline, design: .monospaced))
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }

                        if !data.recentRuns.isEmpty {
                            Section("Recent Runs") {
                                ForEach(data.recentRuns) { run in
                                    VStack(alignment: .leading, spacing: 8) {
                                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                                            Text(run.shortDate)
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                                .frame(width: 52, alignment: .leading)

                                            Text(run.title)
                                                .font(.body)
                                                .foregroundStyle(.primary)
                                                .frame(maxWidth: .infinity, alignment: .leading)

                                            Text(run.subtitle)
                                                .font(.system(.subheadline, design: .monospaced))
                                                .foregroundStyle(Color("Amber"))
                                                .frame(alignment: .trailing)
                                        }

                                        HStack {
                                            Text(run.detail)
                                                .font(.footnote)
                                                .foregroundStyle(.secondary)
                                            Spacer()
                                            if let hrLabel = run.hrLabel {
                                                Text(hrLabel)
                                                    .font(.footnote)
                                                    .foregroundStyle(.secondary)
                                            }
                                        }
                                    }
                                    .padding(.vertical, 4)
                                }
                            }
                        }

                        if let goal = data.goalProgress {
                            Section("Goal Progress") {
                                Text(goal.title)
                                    .font(.headline)
                                    .foregroundStyle(.primary)

                                LabeledContent("Days") {
                                    metricValue(goal.daysToRace.map(String.init) ?? "--")
                                }

                                LabeledContent("Block") {
                                    Text(goal.blockLabel)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }

                                if let fitness = goal.fitnessValue {
                                    LabeledContent("Fitness") {
                                        metricValue("VDOT \(String(format: "%.1f", fitness))")
                                    }
                                }

                                VStack(alignment: .leading, spacing: 8) {
                                    ProgressView(value: goal.progressPercent ?? 0, total: 100)
                                        .tint(Color("Garnet"))

                                    if let label = goal.fitnessLabel {
                                        Text(label)
                                            .font(.footnote)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                        }

                        if let body = data.body {
                            Section("Body") {
                                if let weight = body.latestWeightKg {
                                    LabeledContent("Weight") {
                                        metricValue("\(String(format: "%.1f", weight)) kg")
                                    }
                                }

                                if let hr = body.restingHr {
                                    LabeledContent("Resting HR") {
                                        metricValue("\(Int(hr)) bpm")
                                    }

                                    HStack {
                                        if let glyph = body.restingHrGlyph {
                                            Text(glyph)
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        if let delta = body.restingHrDelta {
                                            Text(delta > 0 ? "+\(delta) bpm" : "\(delta) bpm")
                                                .font(.footnote)
                                                .foregroundStyle(.secondary)
                                        } else {
                                            Text("steady")
                                                .font(.footnote)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.automatic)
                } else if viewModel.isLoading {
                    ProgressView()
                        .tint(Color("Garnet"))
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
                        .buttonStyle(.borderedProminent)
                        .tint(Color("Garnet"))
                    }
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Data")
            .task { await load() }
            .refreshable { await refresh() }
        }
    }

    private func metricValue(_ value: String) -> some View {
        Text(value)
            .font(.system(.subheadline, design: .monospaced))
            .foregroundStyle(Color("Amber"))
    }

    private func miniStat(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)

            Text(value)
                .font(.system(.headline, design: .monospaced))
                .foregroundStyle(.primary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
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
