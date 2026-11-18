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
        // iOS-only adaptive sizing/positioning for the existing six-button ATG HUD.
        // Keep the shared ATG userscript untouched (Windows/Android/web unaffected).
        let adaptiveHUD = #"""
        (() => {
          'use strict';
          if (location.protocol !== 'https:' || location.hostname !== 'play.godeebxp.com') return;
          if (window.__SETH_IOS_ADAPTIVE_HUD__) return;
          window.__SETH_IOS_ADAPTIVE_HUD__ = true;

          const ID = 'xinyao-atg-mobile-quick-hud';
          const STYLE_ID = 'seth-ios-hud-adaptive-style';
          const KEY = 'seth_ios_hud_layout_v1_';
          const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
          const landscape = () => window.innerWidth > window.innerHeight;
          const orientation = () => landscape() ? 'landscape' : 'portrait';
          const defaultScale = () => landscape() ? 0.75 : 0.85;
          const usableWidth = () => window.visualViewport?.width || window.innerWidth;
          const usableHeight = () => window.visualViewport?.height || window.innerHeight;
          let hud = null;
          let scale = defaultScale();
          let x = 6, y = 48;
          let custom = false;
          let currentOrientation = '';
          let gesture = null;
          let framePending = false;

          const read = () => {
            try {
              const stored = JSON.parse(localStorage.getItem(KEY + orientation()) || 'null');
              if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
                x = stored.x;
                y = stored.y;
                scale = clamp(Number(stored.scale) || defaultScale(), 0.60, 1.20);
                custom = stored.custom === true;
                return;
              }
            } catch (_) {}
            x = 6;
            y = 48;
            scale = defaultScale();
            custom = false;
          };
          const save = () => {
            try {
              localStorage.setItem(KEY + orientation(), JSON.stringify({
                x: Math.round(x), y: Math.round(y),
                scale: Math.round(scale * 100) / 100, custom
              }));
            } catch (_) {}
          };
          const limits = () => ({
            maxX: Math.max(0, usableWidth() - (hud?.offsetWidth || 92) * scale - 4),
            maxY: Math.max(0, usableHeight() - (hud?.offsetHeight || 270) * scale - 4)
          });
          const apply = () => {
            if (!hud || !hud.isConnected) return;
            const bounds = limits();
            x = clamp(x, 0, bounds.maxX);
            y = clamp(y, 0, bounds.maxY);
            // Inline important overrides the HUD's existing side-switch and portrait styles.
            hud.style.setProperty('left', x + 'px', 'important');
            hud.style.setProperty('right', 'auto', 'important');
            hud.style.setProperty('top', y + 'px', 'important');
            hud.style.setProperty('bottom', 'auto', 'important');
            hud.style.setProperty('transform-origin', 'top left', 'important');
            hud.style.setProperty('transform', 'scale(' + scale + ')', 'important');
          };
          const ensureStyle = () => {
            if (document.getElementById(STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = [
              '#' + ID + ' .qh-top{touch-action:none;cursor:move;min-height:17px}',
              '#' + ID + ' .seth-ios-hud-resizer{position:absolute;right:-13px;bottom:-13px;',
              'width:29px;height:29px;border-radius:50%;border:1px solid #e9bf50;',
              'background:rgba(16,16,20,.90);color:#ffe08d;display:flex;',
              'align-items:center;justify-content:center;font-size:15px;',
              'touch-action:none;user-select:none;-webkit-user-select:none;',
              'box-shadow:0 1px 6px rgba(0,0,0,.6);z-index:3}',
              '#' + ID + ' .seth-ios-hud-resizer:active{background:#4d3b15}'
            ].join('');
            (document.head || document.documentElement).appendChild(style);
          };
          const finish = () => {
            if (!gesture) return;
            gesture = null;
            custom = true;
            save();
          };
          const move = (event) => {
            if (!gesture || event.pointerId !== gesture.pointerId) return;
            if (gesture.type === 'move') {
              x = gesture.x + event.clientX - gesture.startX;
              y = gesture.y + event.clientY - gesture.startY;
            } else {
              const delta = (event.clientX - gesture.startX +
                             event.clientY - gesture.startY) / 260;
              scale = clamp(gesture.scale + delta, 0.60, 1.20);
            }
            apply();
            event.preventDefault();
          };
          window.addEventListener('pointermove', move, {passive:false});
          window.addEventListener('pointerup', finish);
          window.addEventListener('pointercancel', finish);
          const begin = (type, event) => {
            if (event.button !== undefined && event.button !== 0) return;
            gesture = {
              type, pointerId:event.pointerId, startX:event.clientX,
              startY:event.clientY, x, y, scale
            };
            event.preventDefault();
            event.stopPropagation();
          };
          const attach = (candidate) => {
            if (!candidate || hud === candidate) return;
            hud = candidate;
            ensureStyle();
            if (currentOrientation !== orientation()) {
              currentOrientation = orientation();
              read();
            }
            const header = hud.querySelector('.qh-top');
            header?.addEventListener('pointerdown', event => begin('move', event));
            let handle = hud.querySelector('.seth-ios-hud-resizer');
            if (!handle) {
              handle = document.createElement('div');
              handle.className = 'seth-ios-hud-resizer';
              handle.textContent = '↘';
              handle.title = '拖曳調整助手大小';
              handle.setAttribute('aria-label', '拖曳調整助手大小');
              hud.appendChild(handle);
            }
            handle.addEventListener('pointerdown', event => begin('resize', event));
            apply();
          };
          const refresh = () => {
            framePending = false;
            const next = document.getElementById(ID);
            if (next) attach(next);
          };
          const queueRefresh = () => {
            if (framePending) return;
            framePending = true;
            requestAnimationFrame(refresh);
          };
          const reflow = () => {
            const next = orientation();
            if (next !== currentOrientation) {
              currentOrientation = next;
              read(); // separate portrait/landscape settings
            }
            if (!custom) scale = defaultScale();
            apply();
          };

          ensureStyle();
          queueRefresh();
          const observer = new MutationObserver(() => {
            if (!hud || !hud.isConnected) queueRefresh();
          });
          observer.observe(document.documentElement, {childList:true, subtree:true});
          window.addEventListener('resize', reflow, {passive:true});
          window.addEventListener('orientationchange', () => {
            setTimeout(reflow, 100);
            setTimeout(reflow, 350);
          }, {passive:true});
          window.visualViewport?.addEventListener('resize', reflow, {passive:true});
        })();
        """#
        controller.addUserScript(WKUserScript(
            source: adaptiveHUD,
            injectionTime: .atDocumentEnd,
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

            // ATG provides its own 「首頁」 action; do not overlay an extra native back button.
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
