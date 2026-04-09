import AuthenticationServices
import CryptoKit
import GoogleSignIn
import SwiftUI
import UIKit

struct LoginView: View {
    @Environment(AppModel.self) private var app
    @State private var email = ""
    @State private var password = ""
    @State private var nonce: String?
    @State private var isLoading = false

    var body: some View {
        ZStack {
            DesignTokens.background.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 28) {
                Spacer()

                // Brand
                VStack(alignment: .leading, spacing: 10) {
                    Text("PeiPei")
                        .font(.system(size: 38, weight: .light))
                        .foregroundStyle(DesignTokens.textPrimary)

                    Text("The coach already looked at everything.")
                        .font(.system(.body, design: .serif))
                        .foregroundStyle(DesignTokens.textSecondary)
                }

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
                }

                // Divider
                HStack {
                    Rectangle().fill(DesignTokens.separator).frame(height: 0.5)
                    Text("or")
                        .font(.system(size: 13))
                        .foregroundStyle(DesignTokens.textMuted)
                        .padding(.horizontal, 12)
                    Rectangle().fill(DesignTokens.separator).frame(height: 0.5)
                }

                // Email/password
                VStack(spacing: 14) {
                    textField("Email", text: $email, contentType: .emailAddress)
                    secureField("Password", text: $password)

                    Button {
                        Task {
                            isLoading = true
                            await app.signIn(email: email, password: password)
                            isLoading = false
                        }
                    } label: {
                        HStack {
                            if isLoading {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Text("Enter")
                                Spacer()
                                Image(systemName: "arrow.up.right")
                            }
                        }
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 16)
                        .background(DesignTokens.garnet)
                    }
                    .disabled(isLoading)
                }

                // Error message
                if let error = app.errorMessage, !error.isEmpty {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.top, 4)
                }

                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 32)
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
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: rootVC)
            guard let idToken = result.user.idToken?.tokenString else {
                app.errorMessage = "Missing Google ID token."
                return
            }
            let accessToken = result.user.accessToken.tokenString
            await app.signInWithGoogle(idToken: idToken, accessToken: accessToken)
        } catch {
            if (error as NSError).code == GIDSignInError.canceled.rawValue {
                return // User cancelled
            }
            app.errorMessage = error.localizedDescription
        }
    }

    // MARK: - Helpers

    private func textField(_ title: String, text: Binding<String>, contentType: UITextContentType) -> some View {
        TextField(title, text: text)
            .textContentType(contentType)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
            .background(Color.white.opacity(0.04))
            .foregroundStyle(DesignTokens.textPrimary)
            .overlay {
                RoundedRectangle(cornerRadius: 0)
                    .stroke(DesignTokens.separator, lineWidth: 1)
            }
    }

    private func secureField(_ title: String, text: Binding<String>) -> some View {
        SecureField(title, text: text)
            .textContentType(.password)
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
            .background(Color.white.opacity(0.04))
            .foregroundStyle(DesignTokens.textPrimary)
            .overlay {
                RoundedRectangle(cornerRadius: 0)
                    .stroke(DesignTokens.separator, lineWidth: 1)
            }
    }

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
