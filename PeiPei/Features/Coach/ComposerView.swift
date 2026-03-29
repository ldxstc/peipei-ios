import SwiftUI

struct ComposerView: View {
    @Binding var text: String
    let isKeyboardVisible: Bool
    let isSending: Bool
    let onSend: () -> Void
    let onMic: () -> Void

    @FocusState private var isFocused: Bool
    private var trimmedText: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var hasText: Bool { !trimmedText.isEmpty }

    var body: some View {
        HStack(spacing: 12) {
            if isKeyboardVisible {
                Button(action: { /* camera picker */ }) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(Color("TextSecondary"))
                }
                .transition(.move(edge: .leading).combined(with: .opacity))
            }

            TextField("Write to your coach", text: $text, axis: .vertical)
                .lineLimit(1...4)
                .textFieldStyle(.plain)
                .foregroundStyle(Color("Cream"))
                .focused($isFocused)

            if hasText {
                Button {
                    onSend()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 26))
                        .foregroundStyle(Color("Garnet"))
                }
                .disabled(isSending)
                .sensoryFeedback(.impact(weight: .medium, intensity: 0.8), trigger: isSending)
            } else {
                Button(action: onMic) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(Color("TextSecondary"))
                }
            }
        }
        .animation(.snappy(duration: 0.22), value: isKeyboardVisible)
        .animation(.snappy(duration: 0.15), value: hasText)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
