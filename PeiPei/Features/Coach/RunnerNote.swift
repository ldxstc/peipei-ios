import SwiftUI

struct RunnerNote: View {
    let message: CoachMessage

    var body: some View {
        HStack {
            Spacer(minLength: 80)

            Text(message.content)
                .font(.subheadline)
                .foregroundStyle(Color("Cream"))
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(Color.white.opacity(0.08), lineWidth: 0.5)
                )
        }
    }
}
