import Foundation
import AuthenticationServices
import Observation

@MainActor
@Observable
final class AuthViewModel {
    var email = ""
    var password = ""
    var isLoading = false
    var errorMessage: String?

    private let client = APIClient()

    func signIn(appModel: AppModel) async {
        guard !email.isEmpty, !password.isEmpty else {
            errorMessage = "Enter your email and password."
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            let response = try await client.login(email: email, password: password)
            appModel.finishLogin(response: response)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func handleAppleSignIn(result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard authorization.credential is ASAuthorizationAppleIDCredential else {
                errorMessage = "Apple Sign In returned an unexpected credential."
                return
            }
            errorMessage = "Apple Sign In is available, but the backend endpoint is not defined in BUILD-TASK.md."
        case .failure(let error):
            let authError = error as? ASAuthorizationError
            if authError?.code != .canceled {
                errorMessage = error.localizedDescription
            }
        }
    }
}
