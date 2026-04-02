import SwiftUI

struct CoachEntry: View {
    let message: CoachMessage
    let isStreaming: Bool
    let onCopy: () -> Void

    @State private var isExpanded = false

    private var cleanedContent: String {
        MarkupCleaner.clean(message.content)
    }

    private var metrics: [MetricValue] {
        MetricExtractor.extract(from: cleanedContent)
    }

    private var usesSystemFont: Bool {
        cleanedContent.range(of: "[\\u3400-\\u9FFF]", options: .regularExpression) != nil
    }

    private var headline: String {
        let text = cleanedContent
        // Try newline split first
        let lines = text.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        if lines.count > 1 {
            return lines.first?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        }
        // No newlines — use first sentence (up to first period/。)
        if let range = text.range(of: "[。.!！?？]", options: .regularExpression) {
            return String(text[text.startIndex...range.lowerBound])
        }
        // Fallback: first 80 chars
        return String(text.prefix(80))
    }

    private var bodyText: String {
        let text = cleanedContent
        let lines = text.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        if lines.count > 1 {
            return lines.dropFirst().joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        }
        // No newlines — everything after first sentence
        if let range = text.range(of: "[。.!！?？]", options: .regularExpression) {
            let rest = String(text[text.index(after: range.lowerBound)...]).trimmingCharacters(in: .whitespacesAndNewlines)
            return rest
        }
        return ""
    }

    private var isLong: Bool {
        cleanedContent.count > 200
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !metrics.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(metrics) { metric in
                            MetricChip(metric: metric)
                        }
                    }
                    .padding(.trailing, 24)
                }
                .mask(
                    HStack(spacing: 0) {
                        Color.black
                        LinearGradient(colors: [.black, .black.opacity(0)], startPoint: .leading, endPoint: .trailing)
                            .frame(width: 28)
                    }
                )
            }

            if !headline.isEmpty {
                let displayHeadline = bodyText.isEmpty && isLong && !isExpanded
                    ? String(headline.prefix(80)) + "…"
                    : headline
                Text(displayHeadline)
                    .font(headlineFont)
                    .foregroundStyle(.primary)
                    .lineSpacing(2)

                if bodyText.isEmpty && isLong && !isExpanded {
                    LinearGradient(
                        colors: [.clear, Color(.secondarySystemGroupedBackground)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: 40)
                }
            }

            if !bodyText.isEmpty {
                ZStack(alignment: .bottomTrailing) {
                    let displayText = isLong && !isExpanded ? String(bodyText.prefix(80)) : bodyText
                    Text(displayText)
                        .font(bodyFont)
                        .foregroundStyle(.secondary)
                        .lineSpacing(5)

                    if isLong && !isExpanded {
                        LinearGradient(
                            colors: [.clear, Color(.secondarySystemGroupedBackground)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        .frame(height: 48)
                    }
                }
                .padding(.top, 14)
                .onTapGesture {
                    guard isLong else { return }
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        isExpanded.toggle()
                    }
                }
            }

            if !isLong || isExpanded {
                Text(message.createdAt.formatted(date: .omitted, time: .shortened))
                    .font(.caption2)
                    .foregroundStyle(Color(.tertiaryLabel))
                    .padding(.top, 4)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardGlass()
        .opacity(isStreaming ? 0.8 : 1)
        .onTapGesture {
            guard isLong else { return }
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                isExpanded.toggle()
            }
        }
        .contextMenu {
            Button("Copy", systemImage: "doc.on.doc") { onCopy() }
            ShareLink(item: cleanedContent) {
                Label("Share", systemImage: "square.and.arrow.up")
            }
        }
    }

    private var headlineFont: Font {
        .headline
    }

    private var bodyFont: Font {
        usesSystemFont ? .subheadline : .system(.subheadline, design: .serif)
    }
}
