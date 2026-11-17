import SwiftUI
import WebKit

// iOS app owns the ATG assistant: users do not need Userscripts or a browser extension.
private let oracleHome = "https://xinyao-ai.github.io/xinyao-ai/"
private let oracleScript = "https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/main/xinyao_ATG_live.user.js"

struct ContentView: View {
    @State private var script: String?
    @State private var error: String?
    @State private var loading = true

    var body: some View {
        ZStack {
            if let script = script {
                OracleWebView(script: script)
                    .ignoresSafeArea(edges: .bottom)
            } else if loading {
                VStack(spacing: 14) {
                    ProgressView()
                    Text("正在載入賽特神諭工具…")
                        .font(.footnote)
                }
            } else {
                VStack(spacing: 14) {
                    Text("工具載入失敗").font(.headline)
                    Text(error ?? "無法取得 ATG 輔助工具").font(.footnote)
                    Button("重新下載") { Task { await loadScript() } }
                }
                .padding()
            }
        }
        .task { await loadScript() }
    }

    private var scriptCacheURL: URL? {
        guard let directory = FileManager.default.urls(
            for: .applicationSupportDirectory, in: .userDomainMask
        ).first else { return nil }
        return directory.appendingPathComponent("seth-oracle-atg-assistant.js")
    }

    private func validScript(_ content: String) -> Bool {
        content.count > 1_000 &&
        content.count < 5_000_000 &&
        content.contains("// ==UserScript==") &&
        content.contains("// ==/UserScript==")
    }

    @MainActor private func loadScript() async {
        loading = true
        error = nil
        do {
            guard let url = URL(string: oracleScript),
                  url.scheme == "https",
                  url.host == "raw.githubusercontent.com" else {
                throw URLError(.badURL)
            }
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 20
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse,
                  http.statusCode == 200,
                  data.count < 5_000_000,
                  let text = String(data: data, encoding: .utf8),
                  validScript(text) else {
                throw URLError(.badServerResponse)
            }
            // Store the last working script so a temporary GitHub outage does not
            // prevent the app from opening. The website itself still needs internet.
            if let cacheURL = scriptCacheURL {
                try? FileManager.default.createDirectory(
                    at: cacheURL.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )
                try? data.write(to: cacheURL, options: .atomic)
            }
            script = text
        } catch {
            if let cacheURL = scriptCacheURL,
               let cached = try? String(contentsOf: cacheURL, encoding: .utf8),
               validScript(cached) {
                script = cached
            } else {
                self.error = "目前無法下載輔助工具，請確認網路後重試。"
            }
        }
        loading = false
    }
}

struct OracleWebView: UIViewRepresentable {
    let script: String

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let controller = WKUserContentController()

        // Script is injected into ATG pages and their frames by this native app;
        // all non-ATG pages (including sign-in and LINE) are excluded.
        let guarded = """
        if (location.protocol === 'https:' && location.hostname === 'play.godeebxp.com') {
        \(script)
        }
        """
        controller.addUserScript(WKUserScript(
            source: guarded,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false,
            in: .page
        ))
        config.userContentController = controller
        config.websiteDataStore = .default()
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        if let url = URL(string: oracleHome) {
            webView.load(URLRequest(url: url))
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private struct Popup {
            let webView: WKWebView
            let container: UIView
        }
        private var popups: [Popup] = []

        // Keep window.open as an actual WKWebView with the supplied configuration:
        // replacing it with a normal navigation can break window.opener and game entry.
        func webView(_ webView: WKWebView,
                     createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction,
                     windowFeatures: WKWindowFeatures) -> WKWebView? {
            guard navigationAction.targetFrame == nil else { return nil }

            let container = UIView(frame: webView.bounds)
            container.backgroundColor = UIColor(red: 0.05, green: 0.10, blue: 0.11, alpha: 1)
            container.autoresizingMask = [.flexibleWidth, .flexibleHeight]

            let popup = WKWebView(frame: container.bounds, configuration: configuration)
            popup.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            popup.allowsBackForwardNavigationGestures = true
            popup.navigationDelegate = self
            popup.uiDelegate = self
            container.addSubview(popup)

            // Native close control for game/sign-in windows (no browser extension).
            let backButton = UIButton(type: .system)
            backButton.setTitle("‹ 返回賽特神諭", for: .normal)
            backButton.setTitleColor(.black, for: .normal)
            backButton.backgroundColor = UIColor(red: 0.94, green: 0.77, blue: 0.40, alpha: 0.97)
            backButton.titleLabel?.font = .boldSystemFont(ofSize: 12)
            backButton.layer.cornerRadius = 12
            backButton.frame = CGRect(x: 12, y: 44, width: 122, height: 32)
            backButton.autoresizingMask = [.flexibleRightMargin, .flexibleBottomMargin]
            backButton.addAction(UIAction { [weak self, weak popup] _ in
                guard let self, let popup else { return }
                self.closePopup(popup)
            }, for: .touchUpInside)
            container.addSubview(backButton)

            webView.addSubview(container)
            popups.append(Popup(webView: popup, container: container))
            return popup
        }

        private func closePopup(_ webView: WKWebView) {
            if let index = popups.firstIndex(where: { $0.webView === webView }) {
                popups[index].container.removeFromSuperview()
                popups.remove(at: index)
            }
        }

        func webViewDidClose(_ webView: WKWebView) {
            closePopup(webView)
        }

        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            decisionHandler(.allow)
        }
    }
}
