import SwiftUI

struct ComposerView: View {
    @Binding var text: String
    let onSend: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            TextField("Talk to your coach...", text: $text, axis: .vertical)
                .lineLimit(1...4)
                .foregroundStyle(.white)
                .font(.body)

            if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button(action: onSend) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(DesignTokens.garnet)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            Rectangle()
                .fill(Color.clear)
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(DesignTokens.separator)
                        .frame(height: 0.5)
                }
        )
    }
}
