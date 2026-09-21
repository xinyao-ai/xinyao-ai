// ==UserScript==
// @name         芯瑤💕 ATG 全房資料偵測器
// @namespace    xinyao-atg-room-scanner
// @version      0.1.0
// @description  偵測 ATG 大廳回傳的房號/房間資料，只保留在本機，不傳送雲端。
// @match        https://play.godeebxp.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.__XIANYAO_ATG_ROOM_SCANNER_V010__) return;
  window.__XIANYAO_ATG_ROOM_SCANNER_V010__ = true;

  const ROOM_KEY =
    /(room|roomid|room_id|rooms|table|tableid|table_id|tables|machine|machineid|machine_id|lobby|game|gameid|game_id)/i;

  const SENSITIVE_KEY =
    /(token|cookie|authorization|password|passwd|secret|username|userid|user_id|email|phone|login)/i;

  const state = {
    enabled: true,
    events: [],
    hits: [],
    seen: new Set(),
    lastSource: '等待資料',
    panel: null
  };

  function now() {
    return new Date().toLocaleTimeString('zh-TW', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function safeValue(value, depth = 0) {
    if (depth > 3) return '[...]';

    if (
      value === null ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (typeof value === 'string') {
      return value.length > 300
        ? value.slice(0, 300) + '…'
        : value;
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, 30)
        .map(v => safeValue(v, depth + 1));
    }

    if (typeof value === 'object') {
      const out = {};

      for (const [key, val] of Object.entries(value).slice(0, 50)) {
        if (SENSITIVE_KEY.test(key)) {
          out[key] = '[已隱藏]';
        } else {
          out[key] = safeValue(val, depth + 1);
        }
      }

      return out;
    }

    return String(value);
  }

  function looksInteresting(obj) {
    if (!obj || typeof obj !== 'object') return false;

    return Object.keys(obj).some(key =>
      ROOM_KEY.test(key)
    );
  }

  function addHit(source, path, obj) {
    if (!state.enabled) return;

    const cleaned = safeValue(obj);

    let json = '';
    try {
      json = JSON.stringify(cleaned);
    } catch {
      return;
    }

    const signature =
      source + '|' + path + '|' + json.slice(0, 1500);

    if (state.seen.has(signature)) return;

    state.seen.add(signature);

    state.hits.push({
      time: now(),
      source,
      path,
      data: cleaned
    });

    if (state.hits.length > 300) {
      state.hits.shift();
    }

    state.lastSource = source;
    render();
  }

  function scan(value, source, path = 'root', depth = 0) {
    if (!state.enabled) return;
    if (depth > 8 || value == null) return;

    if (Array.isArray(value)) {
      for (let i = 0; i < Math.min(value.length, 500); i++) {
        scan(
          value[i],
          source,
          `${path}[${i}]`,
          depth + 1
        );
      }
      return;
    }

    if (typeof value === 'object') {
      if (looksInteresting(value)) {
        addHit(source, path, value);
      }

      for (const [key, val] of Object.entries(value)) {
        if (SENSITIVE_KEY.test(key)) continue;

        scan(
          val,
          source,
          `${path}.${key}`,
          depth + 1
        );
      }
    }
  }

  function processText(text, source) {
    if (!state.enabled) return;
    if (typeof text !== 'string' || !text.trim()) return;

    const trimmed = text.trim();

    try {
      const parsed = JSON.parse(trimmed);
      scan(parsed, source);
      return;
    } catch {}

    if (
      ROOM_KEY.test(trimmed) &&
      trimmed.length < 1000000
    ) {
      state.events.push({
        time: now(),
        source,
        type: 'text-match',
        preview: trimmed.slice(0, 1500)
      });

      if (state.events.length > 150) {
        state.events.shift();
      }

      state.lastSource = source;
      render();
    }
  }

  // -----------------------------
  // JSON.parse
  // -----------------------------
  const nativeJSONParse = JSON.parse.bind(JSON);

  JSON.parse = function (...args) {
    const result = nativeJSONParse(...args);

    try {
      scan(result, 'JSON.parse');
    } catch {}

    return result;
  };

  // -----------------------------
  // fetch
  // -----------------------------
  const nativeFetch = window.fetch;

  if (nativeFetch) {
    window.fetch = async function (...args) {
      const response = await nativeFetch.apply(this, args);

      try {
        const clone = response.clone();
        const url =
          typeof args[0] === 'string'
            ? args[0]
            : args[0]?.url || response.url || '';

        const type =
          clone.headers.get('content-type') || '';

        state.events.push({
          time: now(),
          source: 'fetch',
          url,
          contentType: type
        });

        if (state.events.length > 150) {
          state.events.shift();
        }

        if (
          type.includes('json') ||
          type.includes('text') ||
          type.includes('javascript')
        ) {
          clone.text().then(text => {
            processText(text, 'fetch: ' + url);
          }).catch(() => {});
        }

        render();
      } catch {}

      return response;
    };
  }

  // -----------------------------
  // XMLHttpRequest
  // -----------------------------
  const NativeXHR = window.XMLHttpRequest;

  if (NativeXHR) {
    const nativeOpen = NativeXHR.prototype.open;
    const nativeSend = NativeXHR.prototype.send;

    NativeXHR.prototype.open = function (
      method,
      url,
      ...rest
    ) {
      this.__xinyaoUrl = url;
      this.__xinyaoMethod = method;

      return nativeOpen.call(
        this,
        method,
        url,
        ...rest
      );
    };

    NativeXHR.prototype.send = function (...args) {
      this.addEventListener(
        'load',
        () => {
          try {
            const source =
              'XHR: ' + (this.__xinyaoUrl || '');

            state.events.push({
              time: now(),
              source: 'XHR',
              url: this.__xinyaoUrl || '',
              method: this.__xinyaoMethod || ''
            });

            if (state.events.length > 150) {
              state.events.shift();
            }

            if (this.responseType === 'json') {
              scan(this.response, source);
            } else if (
              this.responseType === '' ||
              this.responseType === 'text'
            ) {
              processText(
                this.responseText,
                source
              );
            }

            render();
          } catch {}
        },
        { once: true }
      );

      return nativeSend.apply(this, args);
    };
  }

  // -----------------------------
  // WebSocket
  // -----------------------------
  const NativeWebSocket = window.WebSocket;

  if (NativeWebSocket) {
    function XinyaoWebSocket(url, protocols) {
      const ws =
        protocols === undefined
          ? new NativeWebSocket(url)
          : new NativeWebSocket(url, protocols);

      ws.addEventListener('message', event => {
        try {
          if (typeof event.data === 'string') {
            processText(
              event.data,
              'WebSocket: ' + url
            );
          }
        } catch {}
      });

      return ws;
    }

    XinyaoWebSocket.prototype =
      NativeWebSocket.prototype;

    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']
      .forEach(key => {
        try {
          Object.defineProperty(
            XinyaoWebSocket,
            key,
            {
              value: NativeWebSocket[key]
            }
          );
        } catch {}
      });

    window.WebSocket = XinyaoWebSocket;
  }

  // -----------------------------
  // TextDecoder
  // -----------------------------
  if (window.TextDecoder) {
    const nativeDecode =
      TextDecoder.prototype.decode;

    TextDecoder.prototype.decode =
      function (...args) {
        const text =
          nativeDecode.apply(this, args);

        try {
          if (
            typeof text === 'string' &&
            ROOM_KEY.test(text)
          ) {
            processText(
              text,
              'TextDecoder'
            );
          }
        } catch {}

        return text;
      };
  }

  function copyResults() {
    const result = {
      capturedAt:
        new Date().toISOString(),
      page: location.href,
      note:
        '芯瑤 ATG 房號偵測器，本資料只由目前瀏覽器頁面取得。',
      events:
        state.events.slice(-80),
      roomCandidates:
        state.hits.slice(-300)
    };

    const text =
      JSON.stringify(result, null, 2);

    if (
      navigator.clipboard &&
      navigator.clipboard.writeText
    ) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          flash('✅ 已複製');
        })
        .catch(() => {
          fallbackCopy(text);
        });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta =
      document.createElement('textarea');

    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';

    document.body.appendChild(ta);
    ta.select();

    document.execCommand('copy');
    ta.remove();

    flash('✅ 已複製');
  }

  function clearResults() {
    state.events = [];
    state.hits = [];
    state.seen.clear();
    state.lastSource = '等待資料';
    render();
  }

  function flash(text) {
    const el =
      document.getElementById(
        'xinyao-room-copy'
      );

    if (!el) return;

    const old = el.textContent;
    el.textContent = text;

    setTimeout(() => {
      el.textContent = old;
    }, 1500);
  }

  function render() {
    if (!state.panel) return;

    const status =
      state.enabled
        ? '🟢 偵測中'
        : '⚪ 已暫停';

    state.panel.innerHTML = `
      <div style="
        font-weight:800;
        font-size:15px;
        margin-bottom:8px;
      ">
        🔎 芯瑤 ATG 房號偵測器
      </div>

      <div style="
        font-size:12px;
        line-height:1.7;
        margin-bottom:8px;
      ">
        ${status}<br>
        已檢查封包：${state.events.length}<br>
        房間候選資料：${state.hits.length}<br>
        最近來源：${escapeHtml(state.lastSource)}
      </div>

      <div style="
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:6px;
      ">
        <button id="xinyao-room-toggle"
          style="${buttonStyle()}">
          ${state.enabled ? '暫停偵測' : '開始偵測'}
        </button>

        <button id="xinyao-room-copy"
          style="${buttonStyle()}">
          複製結果
        </button>

        <button id="xinyao-room-clear"
          style="${buttonStyle()}">
          清空
        </button>

        <button id="xinyao-room-hide"
          style="${buttonStyle()}">
          縮小
        </button>
      </div>

      <div style="
        margin-top:8px;
        font-size:10px;
        opacity:.7;
        line-height:1.5;
      ">
        不讀取密碼、Cookie 或登入 Token，
        偵測結果不會自動上傳。
      </div>
    `;

    document
      .getElementById('xinyao-room-toggle')
      ?.addEventListener('click', () => {
        state.enabled = !state.enabled;
        render();
      });

    document
      .getElementById('xinyao-room-copy')
      ?.addEventListener(
        'click',
        copyResults
      );

    document
      .getElementById('xinyao-room-clear')
      ?.addEventListener(
        'click',
        clearResults
      );

    document
      .getElementById('xinyao-room-hide')
      ?.addEventListener('click', () => {
        state.panel.style.display = 'none';
        mini.style.display = 'block';
      });
  }

  function buttonStyle() {
    return `
      border:0;
      border-radius:9px;
      padding:8px 6px;
      cursor:pointer;
      background:#ff5a9d;
      color:white;
      font-weight:700;
      font-size:12px;
    `;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  const mini =
    document.createElement('button');

  function createPanel() {
    if (state.panel) return;

    const panel =
      document.createElement('div');

    panel.id =
      'xinyao-atg-room-scanner';

    panel.style.cssText = `
      position:fixed;
      top:12px;
      right:12px;
      width:290px;
      z-index:2147483647;
      background:rgba(22,18,28,.95);
      color:#fff;
      padding:12px;
      border-radius:14px;
      box-shadow:0 10px 30px rgba(0,0,0,.35);
      font-family:
        Arial,
        "Microsoft JhengHei",
        sans-serif;
    `;

    document.body.appendChild(panel);
    state.panel = panel;

    mini.textContent = '🔎 房號偵測';
    mini.style.cssText = `
      position:fixed;
      top:12px;
      right:12px;
      z-index:2147483647;
      border:0;
      border-radius:999px;
      padding:9px 12px;
      background:#ff5a9d;
      color:white;
      font-weight:800;
      display:none;
      cursor:pointer;
    `;

    mini.addEventListener('click', () => {
      mini.style.display = 'none';
      panel.style.display = 'block';
    });

    document.body.appendChild(mini);

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      createPanel,
      { once: true }
    );
  } else {
    createPanel();
  }
})();

