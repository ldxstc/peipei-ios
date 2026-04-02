import SwiftUI

struct SignalView: View {
    @Environment(AppModel.self) private var app
    @AppStorage("signal.hasSeenPullHint") private var hasSeenPullHint = false
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

                VStack(spacing: 8) {
                    Text(directive.instruction)
                        .font(.system(size: 28, weight: .light))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)

                    if showReasoning, let reasoning = directive.reasoning, !reasoning.isEmpty {
                        Text(reasoning)
                            .font(.system(.subheadline, design: .serif))
                            .foregroundStyle(DesignTokens.textSecondary)
                            .multilineTextAlignment(.center)
                            .padding(.top, 8)
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                }
                .padding(.horizontal, 32)
                .contentShape(Rectangle())
                .onTapGesture {
                    withAnimation(.easeOut(duration: 0.25)) {
                        showReasoning.toggle()
                    }
                }

                Spacer()

                if let countdown = directive.raceCountdown {
                    Button {
                        showPlan = true
                    } label: {
                        Text(countdown)
                            .font(.system(size: 11, weight: .regular, design: .monospaced))
                            .foregroundStyle(DesignTokens.textMuted)
                            .tracking(2)
                            .textCase(.uppercase)
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, 18)
                }

                if !hasSeenPullHint {
                    Text("↑ pull for more")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(DesignTokens.textMuted)
                        .padding(.bottom, 28)
                        .transition(.opacity)
                } else {
                    Color.clear.frame(height: 28)
                }
            }
        }
        .gesture(
            DragGesture(minimumDistance: 50)
                .onEnded { value in
                    if value.translation.height < -50 {
                        hasSeenPullHint = true
                        showConversation = true
                    }
                }
        )
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
