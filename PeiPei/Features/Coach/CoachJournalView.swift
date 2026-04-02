import SwiftUI

struct CoachJournalView: View {
    @Environment(AppModel.self) private var appModel
    @State private var viewModel = CoachViewModel()
    @State private var path = NavigationPath()
    @State private var isKeyboardVisible = false

    var body: some View {
        @Bindable var viewModel = viewModel

        NavigationStack(path: $path) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        GreetingHeader(userName: appModel.currentUser?.name ?? "")
                            .padding(.top, 16)
                            .padding(.horizontal, 4)

                        if let errorMessage = viewModel.errorMessage, viewModel.messages.isEmpty {
                            ContentUnavailableView("Unable to Load Coach", systemImage: "exclamationmark.triangle", description: Text(errorMessage))
                                .tint(Color("Cream"))
                        }

                        ForEach(viewModel.daySections) { section in
                            dayHeader(for: section.date)

                            ForEach(section.messages) { message in
                                if message.role == .assistant {
                                    CoachEntry(
                                        message: message,
                                        isStreaming: viewModel.streamingMessageID == message.id,
                                        onCopy: { viewModel.copyText(MarkupCleaner.clean(message.content)) }
                                    )
                                } else {
                                    RunnerNote(message: message)
                                }
                            }
                        }

                        Color.clear
                            .frame(height: 1)
                            .id("bottom")
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 18)
                }
                .background(Color("Background"))
                .navigationTitle("PeiPei")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            path.append("settings")
                        } label: {
                            Image(systemName: "gearshape")
                                .foregroundStyle(Color("Cream"))
                        }
                    }
                }
                .navigationDestination(for: String.self) { value in
                    if value == "settings" {
                        SettingsView()
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    ComposerView(
                        text: $viewModel.composerText,
                        isKeyboardVisible: isKeyboardVisible,
                        isSending: viewModel.streamingMessageID != nil,
                        onSend: {
                            guard let token = appModel.sessionToken else { return }
                            Task {
                                await viewModel.sendMessage(token: token)
                            }
                        },
                        onMic: { /* voice input future */ }
                    )
                    .padding(.horizontal, 14)
                    .padding(.top, 10)
                    .background(Color("Background").opacity(0.95))
                    .sensoryFeedback(.impact, trigger: viewModel.messages.count)
                }
                .task {
                    await loadIfPossible()
                }
                .refreshable {
                    await loadIfPossible(force: true)
                }
                .onChange(of: viewModel.messages.count) { oldCount, newCount in
                    // Only auto-scroll when a NEW message arrives (user sent or coach streamed)
                    // Don't scroll on initial load (oldCount == 0)
                    guard oldCount > 0, newCount > oldCount else { return }
                    withAnimation(.easeOut(duration: 0.25)) {
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
                    isKeyboardVisible = true
                }
                .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
                    isKeyboardVisible = false
                }
            }
        }
    }

    @ViewBuilder
    private func dayHeader(for date: Date) -> some View {
        Text(date.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()))
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 8)
    }

    private func loadIfPossible(force: Bool = false) async {
        guard let token = appModel.sessionToken else { return }
        await viewModel.load(token: token, force: force)
    }
}
