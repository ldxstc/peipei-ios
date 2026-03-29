import Foundation
import Observation
#if canImport(UIKit)
import UIKit
#endif

@MainActor
@Observable
final class CoachViewModel {
    var messages: [CoachMessage] = []
    var isLoading = false
    var errorMessage: String?
    var composerText = ""
    var streamingMessageID: String?

    private let client = APIClient()

    var daySections: [DaySection] {
        let grouped = Dictionary(grouping: messages) { message in
            Calendar.current.startOfDay(for: message.createdAt)
        }

        return grouped.keys.sorted(by: >).map { date in
            let sectionMessages = grouped[date, default: []].sorted { $0.createdAt < $1.createdAt }
            return DaySection(
                id: date.formatted(date: .abbreviated, time: .omitted),
                date: date,
                messages: sectionMessages
            )
        }
    }

    func load(token: String, force: Bool = false) async {
        if isLoading && !force { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await client.fetchChatMessages(token: token)
            messages = response.messages
            errorMessage = nil
        } catch {
            if messages.isEmpty {
                errorMessage = error.localizedDescription
            }
        }
    }

    func sendMessage(token: String) async {
        let trimmed = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        composerText = ""
        errorMessage = nil

        let userMessage = CoachMessage(role: .user, content: trimmed)
        let assistantID = UUID().uuidString
        let placeholder = CoachMessage(id: assistantID, role: .assistant, content: "", createdAt: .now)

        messages.append(userMessage)
        messages.append(placeholder)
        streamingMessageID = assistantID

        do {
            try await client.streamCoachReply(token: token, messages: messages) { [weak self] chunk in
                guard let self else { return }
                await self.appendStreamingChunk(chunk, to: assistantID)
            }

            finalizeStreamingMessage(id: assistantID)
        } catch {
            errorMessage = error.localizedDescription
            removeStreamingPlaceholder(id: assistantID)
        }
    }

    func copyText(_ text: String) {
        #if canImport(UIKit)
        UIPasteboard.general.string = text
        #endif
    }

    private func appendStreamingChunk(_ chunk: String, to id: String) {
        guard let index = messages.firstIndex(where: { $0.id == id }) else { return }
        messages[index].content += (messages[index].content.isEmpty ? "" : "\n") + chunk
    }

    private func finalizeStreamingMessage(id: String) {
        guard let index = messages.firstIndex(where: { $0.id == id }) else { return }
        messages[index].content = MarkupCleaner.clean(messages[index].content)
        streamingMessageID = nil
    }

    private func removeStreamingPlaceholder(id: String) {
        messages.removeAll { $0.id == id }
        streamingMessageID = nil
    }
}
