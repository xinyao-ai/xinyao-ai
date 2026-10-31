import SwiftUI
import WebKit

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
                    Text("正在載入賽特神諭工具…").font(.footnote)
                }
            } else {
                VStack(spacing: 14) {
                    Text("工具載入失敗").font(.headline)
                    Text(error ?? "無法取得 ATG 腳本").font(.footnote)
                    Button("重新下載") { Task { await loadScript() } }
                }.padding()
            }
        }
        .task { await loadScript() }
    }

    @MainActor private func loadScript() async {
        loading = true
        error = nil
        guard let url = URL(string: oracleScript) else {
            loading = false
            error = "腳本網址無效"
            return
        }
        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 20
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200,
                  data.count < 5_000_000,
                  let text = String(data: data, encoding: .utf8),
                  text.contains("// ==UserScript==") else {
                throw URLError(.badServerResponse)
            }
            // Remove userscript metadata; execute actual implementation at document start.
            script = text
            loading = false
        } catch {
            self.error = error.localizedDescription
            loading = false
        }
    }
}

struct OracleWebView: UIViewRepresentable {
    let script: String

    func makeCoordinator() -> Coordinator { Coordinator(script: script) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let controller = WKUserContentController()
        // WKUserScripts apply to all origins; guard the execution to ATG host.
        let guarded = """
        if (location.protocol === 'https:' && location.hostname === 'play.godeebxp.com') {
        \(script)
        }
        """
        controller.addUserScript(WKUserScript(source: guarded,
            injectionTime: .atDocumentStart, forMainFrameOnly: false,
            in: .page))
        config.userContentController = controller
        config.preferences.javaScriptCanOpenWindowsAutomatically = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        context.coordinator.webView = webView
        if let url = URL(string: oracleHome) {
            webView.load(URLRequest(url: url))
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let script: String
        weak var webView: WKWebView?
        private var popups: [WKWebView] = []

        init(script: String) { self.script = script }

        // Keep the newly opened game window as an actual WKWebView;
        // redirecting its request to the original view drops window.name and opener.
        func webView(_ webView: WKWebView,
                     createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction,
                     windowFeatures: WKWindowFeatures) -> WKWebView? {
            guard navigationAction.targetFrame == nil else { return nil }
            let popup = WKWebView(frame: webView.bounds, configuration: configuration)
            popup.navigationDelegate = self
            popup.uiDelegate = self
            popup.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            webView.addSubview(popup)
            popups.append(popup)
            return popup
        }

        func webViewDidClose(_ webView: WKWebView) {
            webView.removeFromSuperview()
            popups.removeAll { $0 === webView }
        }

        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            decisionHandler(.allow)
        }
    }
}
