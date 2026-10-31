import SwiftUI
import WebKit

struct ContentView: View {
    @State private var active: Tool? = nil
    @State private var showTools = true

    enum Tool: String, CaseIterable, Identifiable {
        case data = "📋 資料", speed = "🚀 極速", board = "🎯 盤面", rooms = "🏠 全房", result = "💎 結果", switchSide = "↔️ 換邊"
        var id: String { rawValue }
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            OracleWebView()
                .ignoresSafeArea(edges: .bottom)
            VStack(alignment: .trailing, spacing: 10) {
                Button(showTools ? "收合工具" : "顯示工具") { showTools.toggle() }
                    .font(.footnote.bold())
                    .padding(10)
                    .background(.black.opacity(0.82), in: RoundedRectangle(cornerRadius: 12))
                if showTools {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                        ForEach(Tool.allCases) { tool in
                            Button(tool.rawValue) { active = tool }
                                .font(.system(size: 12, weight: .bold))
                                .padding(.vertical, 12)
                                .frame(maxWidth: .infinity)
                                .background(Color.black.opacity(0.80), in: RoundedRectangle(cornerRadius: 9))
                                .overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.pink.opacity(0.5)))
                        }
                    }
                    .frame(width: 264)
                }
            }
            .foregroundStyle(.white)
            .padding(14)
        }
        .alert(active?.rawValue ?? "", isPresented: Binding(get: { active != nil }, set: { if !$0 { active = nil } })) {
            Button("確定", role: .cancel) { active = nil }
        } message: {
            Text("目前為 iOS 原生容器與六格介面測試；尚未接上 ATG 遊戲資料與操作，不能當作正式輔助工具。")
        }
    }
}

struct OracleWebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView(frame: .zero)
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = context.coordinator
        if let url = URL(string: "https://xinyao-ai.github.io/xinyao-ai/") {
            webView.load(URLRequest(url: url))
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            // Keep main-frame navigation within this WKWebView for a first-party app test.
            // Third-party game loading, logins and tool integration must be verified separately.
            decisionHandler(.allow)
        }
    }
}
