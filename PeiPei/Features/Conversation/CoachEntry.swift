import SwiftUI

struct CoachEntry: View {
    let message: CoachMessage
    let isLatest: Bool
    let onOpenDetail: () -> Void
    @State private var isExpanded = false

    private var workoutType: WorkoutType {
        MetricExtractor.workoutType(for: message.content)
    }

    private var isRunRelated: Bool {
        MetricExtractor.hasRunData(in: message.content)
    }

    private var metricsLine: String {
        MetricExtractor.metricsLine(from: message.content)
    }

    private var parts: (headline: String, body: String) {
        MetricExtractor.headlineAndBody(from: message.content)
    }

    var body: some View {
        if parts.headline.isEmpty && parts.body.isEmpty {
            // Loading / streaming state — show typing indicator
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(DesignTokens.textMuted)
                        .frame(width: 6, height: 6)
                        .opacity(0.5)
                }
            }
            .padding(.leading, 15)
            .padding(.vertical, 8)
        } else if isRunRelated {
            runEntry
        } else {
            conversationEntry
        }
    }

    // Run-related message: colored border, type label, metrics
    private var runEntry: some View {
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

                messageText
            }
            .padding(.leading, 12)
        }
    }

    // General conversation: no border, no type label, just text
    private var conversationEntry: some View {
        VStack(alignment: .leading, spacing: 8) {
            messageText
        }
        .padding(.leading, 15) // Align with run entries (3px border + 12px padding)
    }

    private var messageText: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(isExpanded || isLatest || parts.body.isEmpty ? joinedNarrative : parts.headline)
                .font(.system(.body, design: .serif))
                .foregroundStyle(DesignTokens.textPrimary)
                .lineSpacing(5)
                .onTapGesture(count: 2) {
                    if isExpanded {
                        withAnimation(.easeOut(duration: 0.2)) {
                            isExpanded = false
                        }
                    }
                }

            if !parts.body.isEmpty && !isExpanded && !isLatest {
                Button("more") {
                    withAnimation(.easeOut(duration: 0.2)) {
                        isExpanded = true
                    }
                }
                .font(.system(size: 13))
                .foregroundStyle(DesignTokens.textSecondary)
            }
        }
    }

    private var joinedNarrative: String {
        [parts.headline, parts.body]
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
    }
}
