import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var displayName = ""
    @State private var units: UnitsPreference = .metric
    @State private var coachLanguage: CoachLanguagePreference = .en
    @State private var customInstructions = ""

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
                LabeledContent("Status", value: app.settingsPanel?.garmin.connected == true ? "Connected" : "Disconnected")
                if let email = app.settingsPanel?.garmin.email, !email.isEmpty {
                    LabeledContent("Email", value: email)
                }
            }

            Section("Account") {
                LabeledContent("Email", value: app.settingsPanel?.accountEmail ?? app.currentUser?.email ?? "--")
                LabeledContent("Tier", value: app.settingsPanel?.billing.tierLabel ?? "Free")
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
        .task {
            displayName = app.settingsPanel?.displayName ?? app.currentUser?.name ?? ""
            units = app.settingsPanel?.units ?? .metric
            coachLanguage = app.settingsPanel?.coachLanguage ?? .en
            customInstructions = app.settingsPanel?.customInstructions ?? ""
        }
    }
}
