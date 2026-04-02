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
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .frame(width: 44, height: 44)
                }
                .transition(.move(edge: .leading).combined(with: .opacity))
            }

            TextField("Message", text: $text, axis: .vertical)
                .lineLimit(1...4)
                .textFieldStyle(.plain)
                .font(.body)
                .foregroundStyle(.primary)
                .focused($isFocused)

            if hasText {
                Button {
                    onSend()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(Color("Garnet"))
                        .frame(width: 44, height: 44)
                }
                .disabled(isSending)
                .sensoryFeedback(.impact(weight: .medium, intensity: 0.8), trigger: isSending)
            } else {
                Button(action: onMic) {
                    Image(systemName: "mic.fill")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .frame(width: 44, height: 44)
                }
            }
        }
        .animation(.snappy(duration: 0.22), value: isKeyboardVisible)
        .animation(.snappy(duration: 0.15), value: hasText)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
