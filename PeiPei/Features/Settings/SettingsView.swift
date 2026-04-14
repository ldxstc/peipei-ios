import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var displayName = ""
    @State private var units: UnitsPreference = .metric
    @State private var coachLanguage: CoachLanguagePreference = .en
    @State private var customInstructions = ""
    @State private var garminEmail = ""
    @State private var garminPassword = ""
    @State private var garminConnecting = false
    @State private var garminError: String?
    @State private var showPaywall = false

    var body: some View {
        Form {
            Section("Profile") {
                TextField("Display name", text: $displayName)
                Picker("Units", selection: $units) {
                    Text("Metric").tag(UnitsPreference.metric)
                    Text("Imperial").tag(UnitsPreference.imperial)
                }
                Picker("Coach language", selection: $coachLanguage) {
                    ForEach(CoachLanguagePreference.allCases) { language in
                        Text(language.label).tag(language)
                    }
                }
            }

            Section("Coach") {
                TextField("Instructions", text: $customInstructions, axis: .vertical)
                    .lineLimit(4...10)
            }

            Section("Garmin") {
                if app.settingsPanel?.garmin.connected == true {
                    LabeledContent("Status", value: "Connected")
                    if let email = app.settingsPanel?.garmin.email, !email.isEmpty {
                        LabeledContent("Email", value: email)
                    }

                    // Sync Now button
                    Button {
                        Task { await syncGarmin() }
                    } label: {
                        if garminConnecting {
                            HStack(spacing: 8) {
                                ProgressView().tint(.white)
                                Text("Syncing...")
                            }
                        } else {
                            Label("Sync Now", systemImage: "arrow.triangle.2.circlepath")
                        }
                    }
                    .disabled(garminConnecting)
                    .foregroundStyle(DesignTokens.garnet)

                    // Disconnect button
                    Button("Disconnect Garmin", role: .destructive) {
                        Task { await disconnectGarmin() }
                    }

                    if let error = garminError {
                        Text(error).font(.caption).foregroundStyle(.red)
                    }
                } else {
                    LabeledContent("Status", value: "Disconnected")
                        .foregroundStyle(.secondary)
                    GarminWebAuthButton()
                }
            }

            Section("Account") {
                LabeledContent("Email", value: app.settingsPanel?.accountEmail ?? app.currentUser?.email ?? "--")
                Button {
                    showPaywall = true
                } label: {
                    HStack {
                        Text("Tier")
                            .foregroundStyle(DesignTokens.textPrimary)
                        Spacer()
                        Text(app.settingsPanel?.billing.tierLabel ?? "Free")
                            .foregroundStyle(DesignTokens.textSecondary)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12))
                            .foregroundStyle(DesignTokens.textMuted)
                    }
                }
            }

            Section {
                Button("Save") {
                    Task {
                        await app.saveSettings(
                            SettingsSaveInput(
                                displayName: displayName,
                                units: units,
                                coachLanguage: coachLanguage,
                                customInstructions: customInstructions
                            )
                        )
                        dismiss()
                    }
                }
                .foregroundStyle(DesignTokens.garnet)

                Button("Sign Out", role: .destructive) {
                    app.signOut()
                    dismiss()
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(DesignTokens.background)
        .preferredColorScheme(.dark)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Close") {
                    dismiss()
                }
                .foregroundStyle(DesignTokens.textSecondary)
            }
        }
        .sheet(isPresented: $showPaywall) {
            NavigationStack {
                PaywallView()
            }
            .presentationBackground(DesignTokens.background)
        }
        .task {
            displayName = app.settingsPanel?.displayName ?? app.currentUser?.name ?? ""
            units = app.settingsPanel?.units ?? .metric
            coachLanguage = app.settingsPanel?.coachLanguage ?? .en
            customInstructions = app.settingsPanel?.customInstructions ?? ""
        }
    }

    private func connectGarmin() async {
        garminConnecting = true
        garminError = nil
        defer { garminConnecting = false }

        guard let token = app.sessionToken else {
            garminError = "Not signed in."
            return
        }

        do {
            try await app.api.connectGarmin(token: token, email: garminEmail, password: garminPassword)
            garminPassword = ""
            // Refresh settings to pick up connected state
            try? await app.refreshAllData()
        } catch let error as APIError {
            switch error {
            case .httpStatus(_, let msg): garminError = msg
            default: garminError = "Connection failed."
            }
        } catch {
            garminError = error.localizedDescription
        }
    }

    private func syncGarmin() async {
        garminConnecting = true
        garminError = nil
        defer { garminConnecting = false }

        guard let token = app.sessionToken else { return }
        do {
            try await app.api.syncGarmin(token: token)
            try? await app.refreshAllData()
        } catch {
            garminError = "Sync failed: \(error.localizedDescription)"
        }
    }

    private func disconnectGarmin() async {
        guard let token = app.sessionToken else { return }
        do {
            try await app.api.disconnectGarmin(token: token)
            try? await app.refreshAllData()
        } catch {
            garminError = "Disconnect failed."
        }
    }
}
