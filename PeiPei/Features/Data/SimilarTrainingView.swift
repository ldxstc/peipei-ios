import SwiftUI

struct SimilarTrainingView: View {
    let activityId: String
    let token: String

    @State private var result: SimilarTrainingsResult?
    @State private var insight: String?
    @State private var isLoading = true

    private let api = APIClient.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            if isLoading {
                ProgressView()
                    .tint(DesignTokens.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 24)
            } else if let result, !result.activities.isEmpty {
                // AI Insight
                if let insight, !insight.isEmpty {
                    Text(insight)
                        .font(.system(.subheadline, design: .serif))
                        .foregroundStyle(DesignTokens.textPrimary)
                        .lineSpacing(4)
                        .padding(.bottom, 4)
                }

                // Timeline
                timeline(result.activities)

                // Trend bars
                if let trend = result.trend, !trend.isEmpty {
                    trendSection(result)
                }
            }
        }
        .task {
            await loadData()
        }
    }

    private func timeline(_ activities: [SimilarActivity]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(activities.enumerated()), id: \.element.id) { index, activity in
                HStack(alignment: .top, spacing: 14) {
                    // Dot + connecting line
                    VStack(spacing: 0) {
                        ZStack {
                            Circle()
                                .stroke(Color.white, lineWidth: 1.5)
                                .frame(width: 12, height: 12)

                            if activity.isCurrent == true {
                                Circle()
                                    .fill(Color.white)
                                    .frame(width: 12, height: 12)
                            }
                        }

                        if index < activities.count - 1 {
                            Rectangle()
                                .fill(Color.white.opacity(0.15))
                                .frame(width: 1)
                                .frame(minHeight: 48)
                        }
                    }

                    // Entry content
                    VStack(alignment: .leading, spacing: 4) {
                        // Date + pace delta
                        HStack(spacing: 8) {
                            Text(activity.activityDate)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(activity.isCurrent == true ? .white : DesignTokens.textSecondary)

                            if let delta = activity.paceDelta {
                                Text(paceDeltaLabel(delta))
                                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                    .foregroundStyle(delta <= 0 ? Color.green : Color.red)
                            }
                        }

                        // Metrics line in monospace
                        Text(metricsString(for: activity))
                            .font(.system(size: 12, weight: .regular, design: .monospaced))
                            .foregroundStyle(DesignTokens.textSecondary)

                        // Phase badge
                        if let phase = activity.phase, !phase.isEmpty {
                            Text(phase.uppercased())
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(phaseColor(phase))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(
                                    RoundedRectangle(cornerRadius: 3)
                                        .fill(phaseColor(phase).opacity(0.15))
                                )
                                .padding(.top, 2)
                        }
                    }
                    .padding(.bottom, index < activities.count - 1 ? 12 : 0)
                }
            }
        }
    }

    private func trendSection(_ result: SimilarTrainingsResult) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Rectangle().fill(DesignTokens.separator).frame(height: 0.5)

            HStack(spacing: 24) {
                trendBar(label: "PACE", delta: result.paceDeltaSeconds)
                trendBar(label: "HR", delta: nil)
                trendBar(label: "CAD", delta: nil)
            }
        }
    }

    private func trendBar(label: String, delta: Double?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(DesignTokens.textMuted)
                .tracking(1)

            RoundedRectangle(cornerRadius: 2)
                .fill(delta.map { $0 <= 0 ? Color.green.opacity(0.5) : Color.red.opacity(0.5) } ?? Color.white.opacity(0.1))
                .frame(width: 40, height: 6)
        }
    }

    private func metricsString(for activity: SimilarActivity) -> String {
        var parts: [String] = []
        if let dist = activity.distanceKm {
            parts.append(String(format: "%.1fkm", dist))
        }
        parts.append(activity.formattedPace + "/km")
        if let hr = activity.avgHr {
            parts.append("\(hr)bpm")
        }
        if let cad = activity.cadence {
            parts.append("\(cad)spm")
        }
        return parts.joined(separator: " · ")
    }

    private func paceDeltaLabel(_ delta: Double) -> String {
        let absDelta = abs(delta)
        let mins = Int(absDelta) / 60
        let secs = Int(absDelta) % 60
        let sign = delta <= 0 ? "▲" : "▼"
        if mins > 0 {
            return "\(sign)\(mins):\(String(format: "%02d", secs))"
        }
        return "\(sign)\(secs)s"
    }

    private func phaseColor(_ phase: String) -> Color {
        switch phase.lowercased() {
        case "base": return DesignTokens.effortEasy
        case "build": return DesignTokens.effortTempo
        case "peak": return DesignTokens.effortInterval
        case "taper": return DesignTokens.effortLong
        case "race": return DesignTokens.effortRace
        default: return DesignTokens.textSecondary
        }
    }

    private func loadData() async {
        defer { isLoading = false }

        async let similar = api.getSimilarTrainings(token: token, activityId: activityId)
        async let insightResponse = api.getActivityInsight(token: token, activityId: activityId)

        do {
            result = try await similar
        } catch {
            result = nil
        }

        do {
            let response = try await insightResponse
            insight = response.insights.first?.content
        } catch {
            insight = nil
        }
    }
}
