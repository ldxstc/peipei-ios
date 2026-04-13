import AuthenticationServices
import SwiftUI

/// Opens Garmin SSO in a system browser sheet.
/// After login, Garmin redirects to our callback URL.
/// We intercept the redirect and send the page cookies/ticket to our server.
struct GarminWebAuthButton: View {
    @Environment(AppModel.self) private var app
    @State private var isAuthenticating = false
    @State private var error: String?
    @State private var showWebAuth = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                showWebAuth = true
            } label: {
                HStack(spacing: 10) {
                    if isAuthenticating {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: "applewatch.and.arrow.forward")
                            .font(.system(size: 16))
                    }
                    Text("Connect via Garmin")
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color(red: 0.0, green: 0.45, blue: 0.75)) // Garmin blue
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .disabled(isAuthenticating)

            if let error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .sheet(isPresented: $showWebAuth) {
            GarminLoginWebView(
                baseURL: "https://www.peipei-run.com",
                sessionToken: app.sessionToken ?? "",
                onSuccess: {
                    showWebAuth = false
                    Task {
                        try? await app.refreshAllData()
                    }
                },
                onError: { msg in
                    error = msg
                    showWebAuth = false
                }
            )
        }
    }
}

/// A web view that loads the PeiPei Garmin connect page.
/// The user logs in on Garmin's real SSO page (no CAPTCHA).
/// After success, the callback page triggers onSuccess.
struct GarminLoginWebView: UIViewControllerRepresentable {
    let baseURL: String
    let sessionToken: String
    let onSuccess: () -> Void
    let onError: (String) -> Void

    func makeUIViewController(context: Context) -> GarminLoginVC {
        GarminLoginVC(
            baseURL: baseURL,
            sessionToken: sessionToken,
            onSuccess: onSuccess,
            onError: onError
        )
    }

    func updateUIViewController(_ vc: GarminLoginVC, context: Context) {}
}

import WebKit

class GarminLoginVC: UIViewController, WKNavigationDelegate {
    let baseURL: String
    let sessionToken: String
    let onSuccess: () -> Void
    let onError: (String) -> Void
    var webView: WKWebView!

    init(baseURL: String, sessionToken: String, onSuccess: @escaping () -> Void, onError: @escaping (String) -> Void) {
        self.baseURL = baseURL
        self.sessionToken = sessionToken
        self.onSuccess = onSuccess
        self.onError = onError
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()

        let config = WKWebViewConfiguration()
        // Set session cookie so the server knows who we are
        let cookie = HTTPCookie(properties: [
            .name: "__Secure-peipei.session_token",
            .value: sessionToken,
            .domain: "www.peipei-run.com",
            .path: "/",
            .secure: "TRUE",
        ])!
        config.websiteDataStore.httpCookieStore.setCookie(cookie)
        
        let cookie2 = HTTPCookie(properties: [
            .name: "peipei.session_token",
            .value: sessionToken,
            .domain: "www.peipei-run.com",
            .path: "/",
            .secure: "TRUE",
        ])!
        config.websiteDataStore.httpCookieStore.setCookie(cookie2)

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        view.addSubview(webView)

        // Load the Garmin connect page
        let url = URL(string: "\(baseURL)/garmin/connect")!
        var request = URLRequest(url: url)
        request.addValue(sessionToken, forHTTPHeaderField: "X-Session-Token")
        webView.load(request)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url {
            // Check for peipei:// deep link
            if url.scheme == "peipei" {
                onSuccess()
                decisionHandler(.cancel)
                return
            }
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Poll for success indicator on the page
        webView.evaluateJavaScript("document.getElementById('garmin-success')?.textContent") { [weak self] result, _ in
            if let text = result as? String, text == "SUCCESS" {
                self?.onSuccess()
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        onError(error.localizedDescription)
    }
}
