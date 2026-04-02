import SwiftUI
import Observation

@MainActor
@Observable
final class AppModel {
    var sessionToken: String?
    var currentUser: User?

    init() {
        restoreSession()
    }

    var isAuthenticated: Bool {
        sessionToken?.isEmpty == false
    }

    func restoreSession() {
        sessionToken = KeychainHelper.loadString(forKey: KeychainKey.sessionToken)
        injectDebugSessionIfNeeded()
        currentUser = UserDefaults.standard.loadUser()
    }

    func finishLogin(response: LoginResponse) {
        KeychainHelper.save(response.token, forKey: KeychainKey.sessionToken)
        if !response.user.email.isEmpty {
            KeychainHelper.save(response.user.email, forKey: KeychainKey.userEmail)
        }
        if !response.user.name.isEmpty {
            KeychainHelper.save(response.user.name, forKey: KeychainKey.userName)
        }
        UserDefaults.standard.saveUser(response.user)
        sessionToken = response.token
        currentUser = response.user
    }

    func signOut() {
        KeychainHelper.deleteValue(forKey: KeychainKey.sessionToken)
        KeychainHelper.deleteValue(forKey: KeychainKey.userEmail)
        KeychainHelper.deleteValue(forKey: KeychainKey.userName)
        UserDefaults.standard.removeObject(forKey: UserDefaults.userKey)
        sessionToken = nil
        currentUser = nil
    }

    // DEBUG: pre-inject session token for simulator testing
    private func injectDebugSessionIfNeeded() {
        #if DEBUG
        if let debugToken = UserDefaults.standard.string(forKey: "DEBUGSessionToken"),
           !debugToken.isEmpty {
            KeychainHelper.save(debugToken, forKey: KeychainKey.sessionToken)
            sessionToken = debugToken
            KeychainHelper.save("Runner", forKey: KeychainKey.userName)
            KeychainHelper.save("runner@peipei.app", forKey: KeychainKey.userEmail)
        }
        #endif
    }

}

@main
struct PeiPeiApp: App {
    @State private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            Group {
                if appModel.isAuthenticated {
                    RootTabView()
                } else {
                    LoginView()
                }
            }
            .environment(appModel)
        }
    }
}

private struct RootTabView: View {
    @State var selectedTab = "coach"
    
    var body: some View {
        TabView(selection: $selectedTab) {
            CoachJournalView()
                .tag("coach")
                .tabItem {
                    Text("Coach")
                }

            DataView()
                .tag("data")
                .tabItem {
                    Text("Data")
                }
        }
        .tint(Color("Cream"))
    }
}
