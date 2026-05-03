import SwiftUI

struct CoachEntry: View {
    let message: CoachMessage
    let isLatest: Bool
    let onOpenDetail: () -> Void
    @State private var isExpanded = false

    private var parts: (headline: String, body: String) {
        MetricExtractor.headlineAndBody(from: message.content)
    }

    private var shouldExpand: Bool {
        isExpanded || isLatest || parts.body.isEmpty
    }

    var body: some View {
        if parts.headline.isEmpty && parts.body.isEmpty {
            // Typing indicator
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { _ in
                    Circle()
                        .fill(DesignTokens.textMuted)
                        .frame(width: 6, height: 6)
                        .opacity(0.5)
                }
            }
            .padding(.vertical, 8)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text(shouldExpand ? joinedNarrative : parts.headline)
                    .font(.system(.body, design: .serif))
                    .foregroundStyle(DesignTokens.textPrimary)
                    .lineSpacing(5)
                    .textSelection(.enabled)
                    .onTapGesture(count: 2) {
                        if isExpanded || isLatest {
                            withAnimation(.easeOut(duration: 0.2)) {
                                isExpanded = false
                            }
                        }
                    }

                if !parts.body.isEmpty && !shouldExpand {
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
    }

    private var joinedNarrative: String {
        [parts.headline, parts.body]
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
    }
}
