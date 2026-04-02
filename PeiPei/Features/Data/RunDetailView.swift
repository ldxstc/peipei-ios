import SwiftUI

struct RunDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let detail: RunDetail

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header

                VStack(alignment: .leading, spacing: 6) {
                    Text(detail.distance)
                        .font(.system(size: 52, weight: .light))
                        .foregroundStyle(.white)
                    Text("distance")
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(DesignTokens.textSecondary)
                }

                metricGrid
                splits
                coachTake
            }
            .padding(16)
        }
        .background(DesignTokens.background)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var header: some View {
        Button {
            dismiss()
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 10) {
                    Image(systemName: "chevron.left")
                    Text(detail.title)
                        .font(.system(size: 22, weight: .light))
                }
                .foregroundStyle(DesignTokens.textPrimary)

                Text(detail.subtitle.capitalized)
                    .font(.system(size: 13))
                    .foregroundStyle(DesignTokens.textSecondary)
            }
        }
        .buttonStyle(.plain)
    }

    private var metricGrid: some View {
        VStack(spacing: 18) {
            Rectangle().fill(DesignTokens.separator).frame(height: 0.5)
            HStack {
                statBlock(detail.avgPace, "AVG PACE")
                Spacer()
                statBlock(detail.duration, "DURATION")
            }
            HStack {
                statBlock(detail.avgHeartRate, "AVG HR")
                Spacer()
                statBlock(detail.cadence, "CADENCE")
            }
            Rectangle().fill(DesignTokens.separator).frame(height: 0.5)
        }
    }

    private var splits: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Splits")
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(DesignTokens.textPrimary)

            ForEach(detail.splits) { split in
                HStack(spacing: 12) {
                    Text("\(split.kilometer)")
                        .font(.system(size: 14, weight: .medium, design: .monospaced))
                        .frame(width: 20, alignment: .leading)
                    Text(split.pace)
                        .font(.system(size: 14, weight: .medium, design: .monospaced))
                        .frame(width: 52, alignment: .leading)
                    Text(split.heartRate)
                        .font(.system(size: 14, weight: .medium, design: .monospaced))
                        .frame(width: 70, alignment: .leading)

                    GeometryReader { proxy in
                        RoundedRectangle(cornerRadius: 0)
                            .fill(Color.white.opacity(0.18))
                            .frame(width: proxy.size.width * split.intensity, height: 10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(height: 10)
                }
            }
        }
    }

    private var coachTake: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Coach's Take")
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(DesignTokens.textPrimary)

            Text(detail.coachTake)
                .font(.system(.body, design: .serif))
                .foregroundStyle(DesignTokens.textPrimary)
                .lineSpacing(5)
        }
    }

    private func statBlock(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.system(size: 20, weight: .medium, design: .monospaced))
                .foregroundStyle(.white)
            Text(label)
                .font(.system(size: 11, weight: .regular))
                .foregroundStyle(DesignTokens.textSecondary)
        }
    }
}
