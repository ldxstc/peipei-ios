import SwiftUI

struct RunnerNote: View {
    let message: CoachMessage

    var body: some View {
        HStack {
            Spacer(minLength: 60)
            Text(message.content)
                .font(.subheadline)
                .foregroundStyle(.primary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color(.systemIndigo).opacity(0.2), in: .rect(cornerRadius: 18, style: .continuous))
        }
    }
}
