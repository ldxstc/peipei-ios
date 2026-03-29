import SwiftUI
import AuthenticationServices

struct LoginView: View {
    @Environment(AppModel.self) private var appModel
    @State private var viewModel = AuthViewModel()
    @FocusState private var focusedField: Field?

    private enum Field {
        case email
        case password
    }

    var body: some View {
        @Bindable var viewModel = viewModel

        ZStack {
            Color("Background").ignoresSafeArea()

            VStack(spacing: 28) {
                VStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(Color("Garnet").opacity(0.22))
                            .frame(width: 92, height: 92)

                        Image(systemName: "figure.run.circle.fill")
                            .font(.system(size: 44, weight: .medium))
                            .foregroundStyle(Color("Cream"))
                    }

                    Text("pei·pei")
                        .font(.system(size: 34, weight: .semibold, design: .serif))
                        .foregroundStyle(Color("Cream"))
                        .tracking(1.2)

                    Text("Your running coach, tuned to the work.")
                        .font(.subheadline)
                        .foregroundStyle(Color("TextSecondary"))
                }

                VStack(spacing: 14) {
                    TextField("Email", text: $viewModel.email)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                        .focused($focusedField, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .password }
                        .peipeiFieldStyle()

                    SecureField("Password", text: $viewModel.password)
                        .textContentType(.password)
                        .focused($focusedField, equals: .password)
                        .submitLabel(.go)
                        .onSubmit {
                            Task { await viewModel.signIn(appModel: appModel) }
                        }
                        .peipeiFieldStyle()

                    if let errorMessage = viewModel.errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red.opacity(0.9))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                Button {
                    Task { await viewModel.signIn(appModel: appModel) }
                } label: {
                    if viewModel.isLoading {
                        ProgressView()
                            .tint(.white)
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Sign In")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(Color("Garnet"))
                .controlSize(.large)
                .disabled(viewModel.isLoading)

                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.fullName, .email]
                } onCompletion: { result in
                    viewModel.handleAppleSignIn(result: result)
                }
                .signInWithAppleButtonStyle(.white)
                .frame(height: 52)
                .clipShape(RoundedRectangle(cornerRadius: 14))

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 32)
            .frame(maxWidth: 460)
        }
    }
}

private struct PeiPeiFieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color("Surface"))
            .foregroundStyle(Color("Cream"))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private extension View {
    func peipeiFieldStyle() -> some View {
        modifier(PeiPeiFieldStyle())
    }
}
