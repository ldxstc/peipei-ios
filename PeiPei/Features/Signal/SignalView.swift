import SwiftUI

struct SignalView: View {
    @Environment(AppModel.self) private var app
    #if DEBUG
    @State private var showConversation = true
    #else
    @State private var showConversation = false
    #endif
    @State private var showReasoning = false
    @State private var showPlan = false

    private var directive: DirectiveContent {
        app.directive
    }

    var body: some View {
        ZStack {
            DesignTokens.background.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Main directive
                VStack(spacing: 12) {
                    Text(directive.instruction)
                        .font(.system(size: 26, weight: .light))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .lineLimit(3)

                    if let reasoning = directive.reasoning, !reasoning.isEmpty {
                        Text(reasoning)
                            .font(.system(size: 14, weight: .regular, design: .monospaced))
                            .foregroundStyle(DesignTokens.textSecondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 32)

                Spacer()

                // Race countdown
                if let countdown = directive.raceCountdown {
                    Button {
                        showPlan = true
                    } label: {
                        Text(countdown)
                            .font(.system(size: 11, weight: .regular, design: .monospaced))
                            .foregroundStyle(DesignTokens.garnet)
                            .tracking(2)
                            .textCase(.uppercase)
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, 24)
                }

                // Talk to coach button
                Button {
                    showConversation = true
                } label: {
                    Text("Talk to your coach")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 32)
                        .padding(.vertical, 14)
                        .background(DesignTokens.garnet)
                        .clipShape(Capsule())
                }
                .padding(.bottom, 48)
            }
        }
        .sheet(isPresented: $showPlan) {
            NavigationStack {
                PlanView()
            }
            .presentationBackground(DesignTokens.background)
        }
        .fullScreenCover(isPresented: $showConversation) {
            ConversationView()
        }
    }
}
