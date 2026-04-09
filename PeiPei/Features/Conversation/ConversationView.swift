import SwiftUI

struct ConversationView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var composerText = ""
    @State private var selectedRun: RunDetail?
    @State private var showLog = false
    @State private var showSettings = false

    private var daySections: [DaySection] {
        Dictionary(grouping: app.messages) { message in
            Calendar.current.startOfDay(for: message.createdAt)
        }
        .keys
        .sorted(by: <)
        .map { day in
            DaySection(
                id: day.formatted(date: .abbreviated, time: .omitted),
                dateLabel: dayLabel(for: day),
                messages: app.messages
                    .filter { Calendar.current.isDate($0.createdAt, inSameDayAs: day) }
                    .sorted { $0.createdAt < $1.createdAt }
            )
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            directiveBar

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 32) {
                        ForEach(daySections) { section in
                            sectionHeader(section.dateLabel)
                            ForEach(section.messages) { message in
                                if message.role == .assistant {
                                    CoachEntry(message: message) {
                                        selectedRun = MetricExtractor.runDetail(from: message)
                                    }
                                } else {
                                    RunnerNote(message: message)
                                }
                            }
                        }
                        Color.clear.frame(height: 1).id("bottom")
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 80)
                }
                .onAppear {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
                .onChange(of: app.messages.count) {
                    withAnimation(.easeOut(duration: 0.3)) {
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                }
            }
            .refreshable {
                await app.refreshConversation()
            }

            ComposerView(text: $composerText) {
                let value = composerText
                composerText = ""
                Task {
                    await app.sendMessage(value)
                }
            }
        }
        .background(DesignTokens.background)
        .sheet(item: $selectedRun) { detail in
            NavigationStack {
                RunDetailView(detail: detail)
            }
            .presentationBackground(DesignTokens.background)
        }
        .sheet(isPresented: $showSettings) {
            NavigationStack {
                SettingsView()
            }
            .presentationBackground(DesignTokens.background)
        }
        .sheet(isPresented: $showLog) {
            LogView()
                .presentationBackground(DesignTokens.background)
        }
    }

    private var directiveBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Top row: back arrow + Log + Settings
            HStack {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(DesignTokens.textSecondary)
                }
                .buttonStyle(.plain)

                Spacer()

                if let countdown = app.directive.raceCountdown {
                    Text(countdown)
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .tracking(1)
                        .foregroundStyle(DesignTokens.garnet)
                        .textCase(.uppercase)
                }

                Spacer()

                HStack(spacing: 16) {
                    Button("Log") {
                        showLog = true
                    }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(DesignTokens.textSecondary)

                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(DesignTokens.textSecondary)
                    }
                    .buttonStyle(.plain)
                }
            }

            // Directive text: full width, up to 2 lines
            Text(app.directive.instruction)
                .font(.system(size: 15, weight: .regular, design: .serif))
                .foregroundStyle(DesignTokens.textPrimary)
                .lineLimit(2)
                .lineSpacing(2)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(DesignTokens.separator)
                .frame(height: 0.5)
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Rectangle()
                .fill(DesignTokens.separator)
                .frame(height: 0.5)

            Text(title)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundStyle(DesignTokens.textSecondary)
                .tracking(0.5)
        }
        .padding(.top, 16)
    }

    private func dayLabel(for date: Date) -> String {
        if Calendar.current.isDateInToday(date) {
            return "Today"
        }
        if Calendar.current.isDateInYesterday(date) {
            return "Yesterday"
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMM d"
        return formatter.string(from: date)
    }
}
