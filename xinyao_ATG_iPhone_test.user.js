// ==UserScript==
// @name         芯瑤💕 ATG iPhone 捕捉測試 V1
// @namespace    xinyao-atg-ios
// @version      0.1.0
// @description  iPhone Safari 測試 ATG 即時資料
// @match        https://play.godeebxp.com/*
// @run-at       document-start
// @inject-into  page
// @weight       999
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.__XIANYAO_ATG_IOS_PROBE_V1__) return;
  window.__XIANYAO_ATG_IOS_PROBE_V1__ = true;

  const state = {
    sockets: 0,
    incoming: 0,
    outgoing: 0,
    binary: 0,
    spin: 0,
    closeSpin: 0,
    lastType: '等待 ATG 資料',
    lastAt: ''
  };

  let badge = null;
  let expanded = false;

  const nowText = () => new Date().toLocaleTimeString('zh-TW', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  function touch(type) {
    state.lastType = type;
    state.lastAt = nowText();
    updateBadge();
  }

  function inspectText(text, direction) {
    const s = String(text || '');

    if (s.includes('closeSpin')) {
      state.closeSpin++;
      touch(`${direction} closeSpin`);
      return;
    }

    if (s.includes('"spin"') || s.includes("['spin'")) {
      state.spin++;
      touch(`${direction} spin`);
      return;
    }

    touch(`${direction} 文字資料`);
  }

  function inspectData(data, direction) {
    try {
      direction === 'IN' ? state.incoming++ : state.outgoing++;

      if (typeof data === 'string') {
        inspectText(data, direction);
        return;
      }

      if (
        data instanceof ArrayBuffer ||
        ArrayBuffer.isView(data) ||
        data instanceof Blob
      ) {
        state.binary++;
        touch(`${direction} Binary`);
        return;
      }

      touch(`${direction} 其他資料`);
    } catch (_) {}
  }

  function updateBadge() {
    if (!badge) return;

    badge.innerHTML = expanded
      ? `
        <b>芯瑤 iPhone ✅</b><br>
        WS：${state.sockets}<br>
        IN：${state.incoming}<br>
        OUT：${state.outgoing}<br>
        Binary：${state.binary}<br>
        spin：${state.spin}<br>
        closeSpin：${state.closeSpin}<br>
        最新：${state.lastType}<br>
        時間：${state.lastAt || '—'}
      `
      : `
        <b>芯瑤 iPhone ✅</b><br>
        WS ${state.sockets}｜IN ${state.incoming}｜BIN ${state.binary}
      `;
  }

  function mountBadge() {
    if (badge || !document.documentElement) return;

    badge = document.createElement('div');

    Object.assign(badge.style, {
      position: 'fixed',
      top: '10px',
      left: '10px',
      zIndex: '2147483647',
      background: 'rgba(20,20,25,.9)',
      color: '#fff',
      padding: '8px 10px',
      borderRadius: '12px',
      fontSize: '12px',
      lineHeight: '1.5',
      fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif'
    });

    badge.onclick = () => {
      expanded = !expanded;
      updateBadge();
    };

    document.documentElement.appendChild(badge);
    updateBadge();
  }

  function patchWebSocket() {
    const NativeWS = window.WebSocket;
    if (!NativeWS || NativeWS.__xinyaoWrapped) return;

    const WrappedWS = new Proxy(NativeWS, {
      construct(Target, args, NewTarget) {
        const ws = Reflect.construct(Target, args, NewTarget);

        state.sockets++;
        touch('WebSocket 已建立');

        try {
          ws.addEventListener('message', e => {
            inspectData(e.data, 'IN');
          }, true);
        } catch (_) {}

        try {
          const nativeSend = ws.send;
          ws.send = function(data) {
            inspectData(data, 'OUT');
            return nativeSend.call(this, data);
          };
        } catch (_) {}

        return ws;
      }
    });

    WrappedWS.__xinyaoWrapped = true;
    window.WebSocket = WrappedWS;

    touch('捕捉器已啟動');
  }

  patchWebSocket();
  mountBadge();

  const timer = setInterval(() => {
    patchWebSocket();
    mountBadge();
  }, 300);

  setTimeout(() => clearInterval(timer), 30000);
})();
