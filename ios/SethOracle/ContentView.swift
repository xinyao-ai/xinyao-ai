import SwiftUI
import WebKit

final class OraclePageState: ObservableObject {
    @Published var isATGGame = false
    @Published var host = ""
    @Published var loadError: String?
}

struct ContentView: View {
    @StateObject private var page = OraclePageState()
    @State private var toolsVisible = false
    @State private var leftSide = false
    @State private var selected: Tool?

    enum Tool: String, CaseIterable, Identifiable {
        case data = "📋 資料", speed = "🚀 極速", board = "🎯 盤面"
        case rooms = "🏠 全房", result = "💎 結果", switchSide = "↔️ 換邊"
        var id: String { rawValue }
    }

    var body: some View {
        ZStack(alignment: leftSide ? .bottomLeading : .bottomTrailing) {
            OracleWebView(page: page)
                .ignoresSafeArea(edges: .bottom)

            if page.isATGGame {
                VStack(alignment: leftSide ? .leading : .trailing, spacing: 7) {
                    Button(toolsVisible ? "收合工具" : "顯示工具") {
                        toolsVisible.toggle()
                    }
                    .font(.system(size: 11, weight: .semibold))
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .background(.black.opacity(0.78), in: Capsule())

                    if toolsVisible {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 3), spacing: 5) {
                            ForEach(Tool.allCases) { tool in
                                Button(tool.rawValue) {
                                    if tool == .switchSide { leftSide.toggle() }
                                    else { selected = tool }
                                }
                                .font(.system(size: 11, weight: .medium))
                                .lineLimit(1)
                                .minimumScaleFactor(0.75)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(.black.opacity(0.77), in: RoundedRectangle(cornerRadius: 9))
                                .overlay(RoundedRectangle(cornerRadius: 9).stroke(Color(red: 0.94, green: 0.68, blue: 0.76).opacity(0.65), lineWidth: 0.7))
                            }
                        }
                        .frame(width: 244)
                    }
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 9)
                .padding(.bottom, 22)
                .onAppear { toolsVisible = true }
            }
        }
        .onChange(of: page.isATGGame) { isGame in
            toolsVisible = isGame
            if !isGame { selected = nil }
        }
        .alert(selected?.rawValue ?? "", isPresented: Binding(
            get: { selected != nil },
            set: { if !$0 { selected = nil } }
        )) {
            Button("關閉", role: .cancel) { selected = nil }
        } message: {
            Text("這項 ATG 功能目前尚未連接遊戲資料與操作，不能顯示預測結果或控制遊戲。這是 iOS 實機相容性測試版。")
        }
    }
}

struct OracleWebView: UIViewRepresentable {
    @ObservedObject var page: OraclePageState

    func makeCoordinator() -> Coordinator { Coordinator(page: page) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        if let url = URL(string: "https://xinyao-ai.github.io/xinyao-ai/") {
            webView.load(URLRequest(url: url))
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let page: OraclePageState
        init(page: OraclePageState) { self.page = page }

        private func refresh(_ url: URL?) {
            let host = url?.host?.lowercased() ?? ""
            DispatchQueue.main.async {
                self.page.host = host
                // Only show HUD inside the actual ATG game; not the casino lobby.
                self.page.isATGGame = (host == "play.godeebxp.com" ||
                    (host.hasSuffix(".godeebxp.com") && host != "socket.godeebxp.com"))
            }
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            refresh(webView.url)
        }
        func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
            refresh(webView.url)
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            refresh(webView.url)
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            DispatchQueue.main.async { self.page.loadError = error.localizedDescription }
        }

        // The existing game-launch.html opens a window. Keep it inside the same app.
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
                webView.load(URLRequest(url: url))
            }
            return nil
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            decisionHandler(.allow)
        }
    }
}
