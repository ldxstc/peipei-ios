import GoogleSignIn
import SwiftUI

@main
struct PeiPeiApp: App {
    @State private var appModel: AppModel = {
        let model = AppModel()
        AppModel.shared = model
        return model
    }()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appModel)
                .preferredColorScheme(.dark)
                .onOpenURL { url in
                    GIDSignIn.sharedInstance.handle(url)
                }
        }
    }
}

private struct RootView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        Group {
            switch app.startupState {
            case .launching:
                ZStack {
                    DesignTokens.background.ignoresSafeArea()
                    ProgressView()
                        .tint(DesignTokens.textPrimary)
                }
            case .loggedOut:
                LoginView()
            case .loggedIn:
                HomeView()
            }
        }
        .task {
            await app.bootstrap()
        }
        .alert(
            "Error",
            isPresented: Binding(
                get: { app.errorMessage != nil },
                set: { if !$0 { app.errorMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) {
                app.errorMessage = nil
            }
        } message: {
            Text(app.errorMessage ?? "")
        }
    }
}
