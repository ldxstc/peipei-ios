import AuthenticationServices
import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
    enum StartupState {
        case launching
        case loggedOut
        case loggedIn
    }

    var startupState: StartupState = .launching
    var sessionToken: String?
    var currentUser: User?
    var messages: [CoachMessage] = []
    var sidebarData: SidebarData?
    var settingsPanel: SettingsPanelData?
    var directive = DirectiveContent(instruction: "Preparing your plan...", reasoning: nil, raceCountdown: nil)
    var errorMessage: String?
    var isSending = false

    private let api = APIClient.shared
    private var hasBootstrapped = false

    func bootstrap() async {
        guard !hasBootstrapped else { return }
        hasBootstrapped = true

        do {
            if let debugToken = UserDefaults.standard.string(forKey: "DEBUGSessionToken"), !debugToken.isEmpty {
                try KeychainHelper.saveSessionToken(debugToken)
                sessionToken = debugToken
            } else {
                sessionToken = KeychainHelper.readSessionToken()
            }

            guard let token = sessionToken, !token.isEmpty else {
                startupState = .loggedOut
                return
            }

            try await refreshAllData()
            startupState = .loggedIn
        } catch {
            KeychainHelper.deleteSessionToken()
            sessionToken = nil
            startupState = .loggedOut
            errorMessage = error.localizedDescription
        }
    }

    func signIn(email: String, password: String) async {
        do {
            let response = try await api.signIn(email: email, password: password)
            try KeychainHelper.saveSessionToken(response.token)
            sessionToken = response.token
            currentUser = response.user
            try await refreshAllData()
            startupState = .loggedIn
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signInWithApple(credential: ASAuthorizationAppleIDCredential, nonce: String?) async {
        do {
            guard let identityTokenData = credential.identityToken,
                  let identityToken = String(data: identityTokenData, encoding: .utf8) else {
                throw APIError.httpStatus(0, "Missing Apple identity token.")
            }

            try KeychainHelper.saveAppleUserID(credential.user)

            let fullName = credential.fullName.map { PersonNameComponentsFormatter().string(from: $0) }
            let response = try await api.signInWithApple(token: identityToken, nonce: nonce, fullName: fullName)
            try KeychainHelper.saveSessionToken(response.token)
            sessionToken = response.token
            currentUser = response.user
            try await refreshAllData()
            startupState = .loggedIn
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshAllData() async throws {
        guard let token = sessionToken, !token.isEmpty else {
            throw APIError.httpStatus(401, "You are signed out.")
        }

        async let chat = api.getCoachChat(token: token)
        async let sidebar = api.getSidebar(token: token)
        async let settings = api.getSettings(token: token)

        let chatResponse = try await chat
        let sidebarResponse = try await sidebar
        let settingsResponse = try await settings

        messages = chatResponse.messages
        sidebarData = sidebarResponse
        settingsPanel = settingsResponse
        directive = MetricExtractor.deriveDirective(from: messages, sidebar: sidebarData)
    }

    func refreshConversation() async {
        do {
            try await refreshAllData()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func sendMessage(_ text: String) async {
        guard let token = sessionToken, !token.isEmpty else { return }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSending else { return }

        isSending = true

        let userMessage = CoachMessage(
            id: "user-\(UUID().uuidString)",
            role: .user,
            content: trimmed,
            createdAt: .now
        )
        messages.append(userMessage)

        let assistantID = "assistant-\(UUID().uuidString)"
        messages.append(
            CoachMessage(
                id: assistantID,
                role: .assistant,
                content: "",
                createdAt: .now
            )
        )

        do {
            try await api.streamChat(token: token, messages: messages) { [weak self] chunk in
                await MainActor.run {
                    guard let self else { return }
                    if let index = self.messages.firstIndex(where: { $0.id == assistantID }) {
                        self.messages[index].content += chunk
                        self.messages[index].content = MarkupCleaner.clean(self.messages[index].content)
                        self.directive = MetricExtractor.deriveDirective(from: self.messages, sidebar: self.sidebarData)
                    }
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isSending = false
    }

    func saveSettings(_ input: SettingsSaveInput) async {
        guard let token = sessionToken else { return }

        do {
            try await api.patchSettings(token: token, input: input)
            settingsPanel = SettingsPanelData(
                displayName: input.displayName,
                units: input.units,
                coachLanguage: input.coachLanguage,
                customInstructions: input.customInstructions,
                accountEmail: settingsPanel?.accountEmail ?? currentUser?.email ?? "",
                billing: settingsPanel?.billing ?? BillingData(isPro: false, tierLabel: "Free"),
                garmin: settingsPanel?.garmin ?? GarminData(connected: false, email: ""),
                raw: settingsPanel?.raw
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() {
        KeychainHelper.deleteSessionToken()
        sessionToken = nil
        currentUser = nil
        messages = []
        sidebarData = nil
        settingsPanel = nil
        directive = DirectiveContent(instruction: "Preparing your plan...", reasoning: nil, raceCountdown: nil)
        startupState = .loggedOut
    }
}
