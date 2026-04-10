import AuthenticationServices
import CryptoKit
import GoogleSignIn
import SwiftUI
import UIKit

struct LoginView: View {
    @Environment(AppModel.self) private var app
    @State private var nonce: String?
    @State private var isLoading = false

    var body: some View {
        ZStack {
            DesignTokens.background.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Brand
                VStack(spacing: 14) {
                    Text("PeiPei")
                        .font(.system(size: 42, weight: .light))
                        .foregroundStyle(DesignTokens.textPrimary)

                    Text("The coach already looked at everything.")
                        .font(.system(.body, design: .serif))
                        .foregroundStyle(DesignTokens.textSecondary)
                }

                Spacer()

                // Social login buttons
                VStack(spacing: 12) {
                    // Sign in with Apple
                    SignInWithAppleButton(.signIn) { request in
                        let nonce = randomNonce()
                        self.nonce = nonce
                        request.requestedScopes = [.fullName, .email]
                        request.nonce = sha256(nonce)
                    } onCompletion: { result in
                        switch result {
                        case .success(let authResults):
                            guard let credential = authResults.credential as? ASAuthorizationAppleIDCredential else { return }
                            Task {
                                isLoading = true
                                await app.signInWithApple(credential: credential, nonce: nonce)
                                isLoading = false
                            }
                        case .failure(let error):
                            app.errorMessage = error.localizedDescription
                        }
                    }
                    .signInWithAppleButtonStyle(.white)
                    .frame(height: 52)

                    // Sign in with Google
                    Button {
                        Task { await signInWithGoogle() }
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "g.circle.fill")
                                .font(.title3)
                            Text("Sign in with Google")
                                .font(.system(size: 17, weight: .medium))
                        }
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(.white)
                    }
                    .disabled(isLoading)
                }

                // Error message
                if let error = app.errorMessage, !error.isEmpty {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.top, 12)
                }

                // Loading
                if isLoading {
                    ProgressView()
                        .tint(.white)
                        .padding(.top, 16)
                }

                Spacer()
                    .frame(height: 60)
            }
            .padding(.horizontal, 24)
        }
    }

    // MARK: - Google Sign In

    private func signInWithGoogle() async {
        isLoading = true
        defer { isLoading = false }

        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let rootVC = windowScene.windows.first?.rootViewController else {
            app.errorMessage = "Cannot find root view controller."
            return
        }

        do {
            let serverClientID = Bundle.main.object(forInfoDictionaryKey: "GIDServerClientID") as? String
            if let serverID = serverClientID {
                GIDSignIn.sharedInstance.configuration = GIDConfiguration(
                    clientID: Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String ?? "",
                    serverClientID: serverID
                )
            }

            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: rootVC)
            guard let idToken = result.user.idToken?.tokenString else {
                app.errorMessage = "Missing Google ID token."
                return
            }
            let accessToken = result.user.accessToken.tokenString
            await app.signInWithGoogle(idToken: idToken, accessToken: accessToken)
        } catch {
            if (error as NSError).code == GIDSignInError.canceled.rawValue {
                return
            }
            app.errorMessage = error.localizedDescription
        }
    }

    // MARK: - Helpers

    private func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        return String((0..<length).compactMap { _ in charset.randomElement() })
    }

    private func sha256(_ value: String) -> String {
        let data = Data(value.utf8)
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}
