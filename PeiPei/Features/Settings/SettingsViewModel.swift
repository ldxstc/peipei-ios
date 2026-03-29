import Foundation
import Observation

@MainActor
@Observable
final class SettingsViewModel {
    var displayName = ""
    var units: Units = .metric
    var coachLanguage: CoachLanguage = .english
    var customInstructions = ""
    var accountEmail = ""
    var garminConnected = false
    var garminEmail = ""
    var isPro = false
    var isLoading = false
    var errorMessage: String?

    private let client = APIClient()
    private var autosaveTask: Task<Void, Never>?
    private var hasLoaded = false

    func load(token: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let panel = try await client.fetchSettings(token: token)
            apply(panel)
            hasLoaded = true
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func scheduleAutosave(token: String) {
        guard hasLoaded else { return }
        autosaveTask?.cancel()
        autosaveTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled, let self else { return }
            await save(token: token)
        }
    }

    func save(token: String) async {
        do {
            let panel = try await client.updateSettings(token: token, payload: currentPayload)
            apply(panel)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func syncGarmin(token: String) async {
        do {
            try await client.syncGarmin(token: token)
            let panel = try await client.fetchSettings(token: token)
            apply(panel)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func disconnectGarmin() {
        garminConnected = false
        garminEmail = ""
    }

    private var currentPayload: SettingsUpdateRequest {
        SettingsUpdateRequest(
            displayName: displayName,
            units: units,
            coachLanguage: coachLanguage,
            customInstructions: customInstructions
        )
    }

    private func apply(_ panel: SettingsPanelResponse) {
        displayName = panel.displayName
        units = panel.units
        coachLanguage = panel.coachLanguage
        customInstructions = panel.customInstructions
        accountEmail = panel.accountEmail
        garminConnected = panel.garmin.connected
        garminEmail = panel.garmin.email ?? ""
        isPro = panel.billing.isPro
    }
}
