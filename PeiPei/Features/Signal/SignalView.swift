import SwiftUI

struct SignalView: View {
    @Environment(AppModel.self) private var app
    #if DEBUG
    @State private var showConversation = true
    #else
    @State private var showConversation = false
    #endif
    @State private var showPlan = false
    @State private var breathOpacity: Double = 0.3

    private var directive: DirectiveContent {
        app.directive
    }

    private var weekSummary: String? {
        guard let sidebar = app.sidebarData else { return nil }
        let km = sidebar.thisWeek.km
        let runs = sidebar.thisWeek.runs
        guard km != "0" && !km.isEmpty else { return nil }
        return "\(km) km this week · \(runs) run\(runs == "1" ? "" : "s")"
    }

    var body: some View {
        ZStack {
            DesignTokens.background.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Breathing dot
                Circle()
                    .fill(.white)
                    .frame(width: 4, height: 4)
                    .opacity(breathOpacity)
                    .onAppear {
                        withAnimation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true)) {
                            breathOpacity = 0.7
                        }
                    }
                    .padding(.bottom, 32)

                // Directive — main training info
                Text(directive.instruction)
                    .font(.system(size: 22, weight: .light))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.horizontal, 40)

                // Week summary
                if let summary = weekSummary ?? directive.reasoning {
                    Text(summary)
                        .font(.system(size: 13, weight: .regular, design: .monospaced))
                        .foregroundStyle(DesignTokens.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.top, 16)
                }

                Spacer()

                // Race countdown at bottom
                if let countdown = directive.raceCountdown {
                    Button {
                        showPlan = true
                    } label: {
                        Text(countdown)
                            .font(.system(size: 11, weight: .medium, design: .monospaced))
                            .foregroundStyle(DesignTokens.garnet)
                            .tracking(1.5)
                            .textCase(.uppercase)
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, 48)
                } else {
                    Text("NO RACE SET")
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundStyle(Color.white.opacity(0.15))
                        .tracking(2)
                        .padding(.bottom, 48)
                }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            showConversation = true
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
