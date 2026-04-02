import SwiftUI

struct CoachEntry: View {
    let message: CoachMessage
    let onOpenDetail: () -> Void
    @State private var isExpanded = false

    private var workoutType: WorkoutType {
        MetricExtractor.workoutType(for: message.content)
    }

    private var metricsLine: String {
        MetricExtractor.metricsLine(from: message.content)
    }

    private var parts: (headline: String, body: String) {
        MetricExtractor.headlineAndBody(from: message.content)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Rectangle()
                .fill(workoutType.color)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 8) {
                Text(workoutType.label)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(workoutType.color)
                    .tracking(0.5)
                    .textCase(.uppercase)

                if !metricsLine.isEmpty {
                    Button(action: onOpenDetail) {
                        Text(metricsLine)
                            .font(.system(size: 15, weight: .medium, design: .monospaced))
                            .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                }

                Text(isExpanded || parts.body.isEmpty ? joinedNarrative : parts.headline)
                    .font(.system(.body, design: .serif))
                    .foregroundStyle(DesignTokens.textPrimary)
                    .lineSpacing(5)

                if !parts.body.isEmpty && !isExpanded {
                    Button("more") {
                        withAnimation(.easeOut(duration: 0.2)) {
                            isExpanded = true
                        }
                    }
                    .font(.system(size: 13))
                    .foregroundStyle(DesignTokens.textSecondary)
                }
            }
            .padding(.leading, 12)
        }
    }

    private var joinedNarrative: String {
        [parts.headline, parts.body]
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
    }
}
