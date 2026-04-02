import SwiftUI

struct RunnerNote: View {
    let message: CoachMessage

    var body: some View {
        HStack {
            Spacer(minLength: 80)
            Text(MarkupCleaner.clean(message.content))
                .font(.system(size: 15))
                .foregroundStyle(DesignTokens.textSecondary)
                .multilineTextAlignment(.trailing)
        }
    }
}
