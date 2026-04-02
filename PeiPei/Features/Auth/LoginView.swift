import AuthenticationServices
import CryptoKit
import SwiftUI
import UIKit

struct LoginView: View {
    @Environment(AppModel.self) private var app
    @State private var email = ""
    @State private var password = ""
    @State private var nonce: String?

    var body: some View {
        ZStack {
            DesignTokens.background.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 28) {
                Spacer()

                VStack(alignment: .leading, spacing: 10) {
                    Text("PeiPei")
                        .font(.system(size: 38, weight: .light))
                        .foregroundStyle(DesignTokens.textPrimary)

                    Text("The coach already looked at everything.")
                        .font(.system(.body, design: .serif))
                        .foregroundStyle(DesignTokens.textSecondary)
                }

                VStack(spacing: 14) {
                    textField("Email", text: $email, contentType: .emailAddress)
                    secureField("Password", text: $password)

                    Button {
                        Task {
                            await app.signIn(email: email, password: password)
                        }
                    } label: {
                        HStack {
                            Text("Enter")
                            Spacer()
                            Image(systemName: "arrow.up.right")
                        }
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 16)
                        .background(DesignTokens.garnet)
                    }

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
                                await app.signInWithApple(credential: credential, nonce: nonce)
                            }
                        case .failure(let error):
                            app.errorMessage = error.localizedDescription
                        }
                    }
                    .signInWithAppleButtonStyle(.white)
                    .frame(height: 52)
                }

                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 32)
        }
    }

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
