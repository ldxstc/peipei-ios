import SwiftUI

struct HomeView: View {
    @Environment(AppModel.self) private var app
    @State private var showConversation = false
    @State private var showSettings = false
    @State private var selectedRun: RecentRun?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // Header
                HStack {
                    Text("PeiPei")
                        .font(.system(size: 20, weight: .light))
                        .foregroundStyle(.white)
                    Spacer()
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                            .font(.system(size: 16))
                            .foregroundStyle(Color.white.opacity(0.4))
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)
                .padding(.bottom, 32)

                // Coach's Daily Read
                dailyReadSection
                    .padding(.horizontal, 24)
                    .padding(.bottom, 40)

                // This Week
                weekSection
                    .padding(.horizontal, 24)
                    .padding(.bottom, 32)

                // Recent Runs
                recentRunsSection
                    .padding(.horizontal, 24)
                    .padding(.bottom, 32)

                // Body
                bodySection
                    .padding(.horizontal, 24)
                    .padding(.bottom, 32)

                // Talk to coach
                Button {
                    showConversation = true
                } label: {
                    Text("Talk to your coach")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color.white.opacity(0.06))
                        .overlay {
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.white.opacity(0.1), lineWidth: 0.5)
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 48)
            }
        }
        .background(Color.black.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .fullScreenCover(isPresented: $showConversation) {
            ConversationView()
        }
        .sheet(isPresented: $showSettings) {
            NavigationStack {
                SettingsView()
            }
            .presentationBackground(DesignTokens.background)
        }
        .sheet(item: $selectedRun) { run in
            NavigationStack {
                RunDetailView(detail: RunDetail(
                    title: run.workoutType.uppercased(),
                    subtitle: run.title,
                    distance: String(format: "%.1f km", run.distanceKm),
                    avgPace: run.subtitle.components(separatedBy: " · ").dropFirst().first ?? "--",
                    duration: "--",
                    avgHeartRate: run.detail.components(separatedBy: " · ").last ?? "--",
                    cadence: "--",
                    coachTake: "",
                    splits: [],
                    activityId: run.id
                ))
            }
            .presentationBackground(DesignTokens.background)
        }
    }

    // MARK: - Daily Read

    private var dailyReadSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let read = app.dailyRead, !read.isEmpty {
                Text(read)
                    .font(.system(size: 18, weight: .light))
                    .foregroundStyle(.white)
                    .lineSpacing(6)
            } else {
                // Loading or no read yet
                Text(app.directive.instruction)
                    .font(.system(size: 18, weight: .light))
                    .foregroundStyle(.white)
                    .lineSpacing(6)
            }
        }
    }

    // MARK: - Week

    private var weekSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("THIS WEEK")
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(Color.white.opacity(0.35))
                .tracking(1.5)

            let sidebar = app.sidebarData
            let km = sidebar?.thisWeek.km ?? "0"
            let runs = sidebar?.thisWeek.runs ?? "0"
            let pace = sidebar?.thisWeek.avgPace ?? "--"

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(km)
                    .font(.system(size: 36, weight: .light, design: .monospaced))
                    .foregroundStyle(.white)
                Text("km")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(Color.white.opacity(0.4))
            }

            HStack(spacing: 16) {
                statPill("\(runs) run\(runs == "1" ? "" : "s")")
                if pace != "--" && pace != "0" {
                    statPill("avg \(formatPace(pace))")
                }
            }
        }
    }

    // MARK: - Recent Runs

    private var recentRunsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("RECENT")
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(Color.white.opacity(0.35))
                .tracking(1.5)

            let runs = app.sidebarData?.recentRuns ?? []

            if runs.isEmpty {
                Text("No runs yet. Connect Garmin to see your training.")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.white.opacity(0.3))
            } else {
                ForEach(runs) { run in
                    Button {
                        selectedRun = run
                    } label: {
                        runRow(run)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func runRow(_ run: RecentRun) -> some View {
        HStack(spacing: 0) {
            // Effort color bar
            Rectangle()
                .fill(effortColor(for: run.workoutType))
                .frame(width: 3, height: 36)
                .clipShape(RoundedRectangle(cornerRadius: 1.5))

            VStack(alignment: .leading, spacing: 2) {
                Text(run.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white)
                Text(run.subtitle)
                    .font(.system(size: 13, weight: .regular, design: .monospaced))
                    .foregroundStyle(Color.white.opacity(0.5))
            }
            .padding(.leading, 12)

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 11))
                .foregroundStyle(Color.white.opacity(0.2))
        }
        .padding(.vertical, 4)
    }

    // MARK: - Body

    private var bodySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("BODY")
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(Color.white.opacity(0.35))
                .tracking(1.5)

            HStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Resting HR")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.white.opacity(0.4))
                    Text("49")
                        .font(.system(size: 20, weight: .light, design: .monospaced))
                        .foregroundStyle(.white)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Weight")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.white.opacity(0.4))
                    Text("—")
                        .font(.system(size: 20, weight: .light, design: .monospaced))
                        .foregroundStyle(Color.white.opacity(0.3))
                }
            }
        }
    }

    // MARK: - Helpers

    private func statPill(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .regular))
            .foregroundStyle(Color.white.opacity(0.5))
    }

    private func effortColor(for type: String) -> Color {
        switch type.lowercased() {
        case "easy", "recovery": return .green
        case "tempo", "threshold": return .orange
        case "interval", "speed", "repetition": return .purple
        case "long", "long_run": return .blue
        case "race", "marathon_pace": return Color(red: 0.55, green: 0.23, blue: 0.23) // garnet
        default: return .green
        }
    }

    private func formatPace(_ paceStr: String) -> String {
        guard let secs = Int(paceStr), secs > 0 else { return paceStr }
        return "\(secs / 60):\(String(format: "%02d", secs % 60))/km"
    }
}
