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
        VStack(alignment: .leading, spacing: 0) {
            // Headline FIRST — primary content
            if !headline.isEmpty {
                let displayHeadline = bodyText.isEmpty && isLong && !isExpanded
                    ? String(headline.prefix(80)) + "…"
                    : headline
                Text(displayHeadline)
                    .font(entryFont(size: 16.5, weight: .semibold))
                    .foregroundStyle(Color("Cream"))
                    .lineSpacing(3)
                // Tap to expand for single-block long messages
                if bodyText.isEmpty && isLong && !isExpanded {
                    LinearGradient(
                        colors: [Color("Surface").opacity(0), Color("Surface")],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: 40)
                }
            }

            // Metric chips — supporting data, BELOW headline
            if !metrics.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
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
                .padding(.top, 10)
                .padding(.bottom, 4)
            }

            // Body — remaining lines, regular, secondary
            if !bodyText.isEmpty {
                ZStack(alignment: .bottomTrailing) {
                    let displayText = isLong && !isExpanded ? String(bodyText.prefix(80)) : bodyText
                    Text(displayText)
                        .font(entryFont(size: 14, weight: .regular))
                        .foregroundStyle(Color("TextSecondary"))
                        .lineSpacing(7)

                    if isLong && !isExpanded {
                        // Gradient fade at bottom
                        LinearGradient(
                            colors: [Color("Surface").opacity(0), Color("Surface")],
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

            // Timestamp — only visible when expanded or short messages
            if !isLong || isExpanded {
                Text(message.createdAt.formatted(date: .omitted, time: .shortened))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .padding(.top, 14)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 16)
        .padding(.bottom, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color("Surface"), in: .rect(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.white.opacity(0.04), lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(0.06), radius: 8, y: 3)
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

    private func entryFont(size: CGFloat, weight: Font.Weight) -> Font {
        usesSystemFont
            ? .system(size: size, weight: weight, design: .default)
            : .system(size: size, weight: weight, design: .serif)
    }
}
