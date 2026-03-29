import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var appModel
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = SettingsViewModel()

    var body: some View {
        @Bindable var viewModel = viewModel

        Form {
            if let errorMessage = viewModel.errorMessage {
                Section {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }

            Section("Profile") {
                TextField("Display Name", text: $viewModel.displayName)
                    .onChange(of: viewModel.displayName) { _, _ in autosave() }

                Picker("Units", selection: $viewModel.units) {
                    ForEach(Units.allCases) { unit in
                        Text(unit.title).tag(unit)
                    }
                }
                .onChange(of: viewModel.units) { _, _ in autosave() }

                Picker("Language", selection: $viewModel.coachLanguage) {
                    ForEach(CoachLanguage.allCases) { language in
                        Text(language.title).tag(language)
                    }
                }
                .onChange(of: viewModel.coachLanguage) { _, _ in autosave() }
            }

            Section("Garmin") {
                HStack {
                    Text("Status")
                    Spacer()
                    Text(viewModel.garminConnected ? "Connected" : "Not Connected")
                        .foregroundStyle(viewModel.garminConnected ? Color("Amber") : Color("TextSecondary"))
                }

                if !viewModel.garminEmail.isEmpty {
                    LabeledContent("Email", value: viewModel.garminEmail)
                }

                Button("Sync Now") {
                    guard let token = appModel.sessionToken else { return }
                    Task { await viewModel.syncGarmin(token: token) }
                }

                Button("Disconnect", role: .destructive) {
                    viewModel.disconnectGarmin()
                }
            }

            Section("Coach") {
                NavigationLink("Instructions") {
                    InstructionsEditorView(text: $viewModel.customInstructions) {
                        autosave()
                    }
                }
            }

            Section("Account") {
                LabeledContent("Email", value: viewModel.accountEmail)
                LabeledContent("Plan", value: viewModel.isPro ? "Pro" : "Free")

                Button("Sign Out", role: .destructive) {
                    appModel.signOut()
                    dismiss()
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color("Background"))
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard let token = appModel.sessionToken else { return }
            await viewModel.load(token: token)
        }
    }

    private func autosave() {
        guard let token = appModel.sessionToken else { return }
        viewModel.scheduleAutosave(token: token)
    }
}

private struct InstructionsEditorView: View {
    @Binding var text: String
    let onChange: () -> Void

    var body: some View {
        Form {
            TextEditor(text: $text)
                .frame(minHeight: 240)
                .onChange(of: text) { _, _ in onChange() }
        }
        .navigationTitle("Instructions")
        .navigationBarTitleDisplayMode(.inline)
    }
}
