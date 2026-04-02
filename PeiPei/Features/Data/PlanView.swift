import SwiftUI

struct PlanView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                weekProgress
                todayPlan
                fitness
                recentRuns
            }
            .padding(16)
        }
        .background(DesignTokens.background)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                dismiss()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "chevron.left")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(app.sidebarData?.goalProgress.title ?? "Plan")
                            .font(.system(size: 22, weight: .light))
                            .foregroundStyle(DesignTokens.textPrimary)
                        Text(app.sidebarData?.goalProgress.countdown ?? "No race set")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(DesignTokens.textSecondary)
                    }
                }
            }
            .buttonStyle(.plain)
        }
    }

    private var weekProgress: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("This Week")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(DesignTokens.textSecondary)

            metricPair(primary: app.sidebarData?.thisWeek.km ?? "0", label: "KM")
            metricPair(primary: app.sidebarData?.thisWeek.runs ?? "0", label: "RUNS")
            metricPair(primary: app.sidebarData?.thisWeek.avgPace ?? "--", label: "AVG PACE")
        }
        .padding(.top, 8)
        .overlay(alignment: .top) {
            Rectangle().fill(DesignTokens.separator).frame(height: 0.5)
        }
    }

    private var todayPlan: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Today")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(DesignTokens.textSecondary)

            Text(app.sidebarData?.todayPlan.title ?? "Check today's plan")
                .font(.system(.title3, design: .serif))
                .foregroundStyle(DesignTokens.textPrimary)

            Text(app.sidebarData?.todayPlan.distance ?? "--")
                .font(.system(size: 15, weight: .medium, design: .monospaced))
                .foregroundStyle(.white)
        }
        .overlay(alignment: .top) {
            Rectangle().fill(DesignTokens.separator).frame(height: 0.5)
        }
        .padding(.top, 8)
    }

    private var fitness: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Body")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(DesignTokens.textSecondary)

            detailRow("Account", value: app.settingsPanel?.accountEmail ?? app.currentUser?.email ?? "--")
            detailRow("Garmin", value: app.settingsPanel?.garmin.connected == true ? "Connected" : "Disconnected")
            detailRow("Tier", value: app.settingsPanel?.billing.tierLabel ?? "Free")
        }
        .overlay(alignment: .top) {
            Rectangle().fill(DesignTokens.separator).frame(height: 0.5)
        }
        .padding(.top, 8)
    }

    private var recentRuns: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recent Runs")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(DesignTokens.textSecondary)

            ForEach(app.sidebarData?.recentRuns ?? []) { run in
                VStack(alignment: .leading, spacing: 4) {
                    Text(run.title)
                        .font(.system(size: 16, weight: .regular, design: .serif))
                        .foregroundStyle(DesignTokens.textPrimary)
                    Text(run.subtitle)
                        .font(.system(size: 15, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white)
                    Text(run.detail)
                        .font(.system(size: 13))
                        .foregroundStyle(DesignTokens.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 8)
            }
        }
        .overlay(alignment: .top) {
            Rectangle().fill(DesignTokens.separator).frame(height: 0.5)
        }
        .padding(.top, 8)
    }

    private func metricPair(primary: String, label: String) -> some View {
        HStack {
            Text(primary)
                .font(.system(size: 20, weight: .medium, design: .monospaced))
                .foregroundStyle(.white)
            Spacer()
            Text(label)
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(DesignTokens.textSecondary)
        }
    }

    private func detailRow(_ title: String, value: String) -> some View {
        HStack {
            Text(title)
                .font(.system(size: 15))
                .foregroundStyle(DesignTokens.textSecondary)
            Spacer()
            Text(value)
                .font(.system(size: 15))
                .foregroundStyle(DesignTokens.textPrimary)
        }
    }
}
