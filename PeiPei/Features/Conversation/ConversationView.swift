import SwiftUI

struct ConversationView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var composerText = ""
    @State private var selectedRun: RunDetail?
    @State private var showSettings = false

    private var daySections: [DaySection] {
        Dictionary(grouping: app.messages) { message in
            Calendar.current.startOfDay(for: message.createdAt)
        }
        .keys
        .sorted(by: >)
        .map { day in
            DaySection(
                id: day.formatted(date: .abbreviated, time: .omitted),
                dateLabel: dayLabel(for: day),
                messages: app.messages
                    .filter { Calendar.current.isDate($0.createdAt, inSameDayAs: day) }
                    .sorted { $0.createdAt > $1.createdAt }
            )
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            directiveBar

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
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 80)
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
    }

    private var directiveBar: some View {
        HStack(alignment: .center, spacing: 12) {
            Button {
                dismiss()
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(app.directive.instruction)
                        .font(.system(size: 16, weight: .light))
                        .foregroundStyle(DesignTokens.textPrimary)
                        .lineLimit(1)

                    if let countdown = app.directive.raceCountdown {
                        Text(countdown)
                            .font(.system(size: 11, weight: .regular, design: .monospaced))
                            .tracking(1.5)
                            .foregroundStyle(DesignTokens.textMuted)
                            .textCase(.uppercase)
                    }
                }
            }
            .buttonStyle(.plain)

            Spacer()

            Button {
                showSettings = true
            } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(DesignTokens.textSecondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(DesignTokens.separator)
                .frame(height: 0.5)
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Rectangle()
                .fill(DesignTokens.separator)
                .frame(height: 0.5)

            Text(title)
                .font(.system(size: 13, weight: .regular))
                .foregroundStyle(DesignTokens.textSecondary)
        }
        .padding(.top, 8)
    }

    private func dayLabel(for date: Date) -> String {
        if Calendar.current.isDateInToday(date) {
            return "Today"
        }
        if Calendar.current.isDateInYesterday(date) {
            return "Yesterday"
        }
        return date.formatted(.dateTime.weekday(.wide))
    }
}
