// ==UserScript==
// @name         芯瑤💕 ATG 全房資料偵測器
// @namespace    xinyao-atg-room-scanner
// @version      0.2.0
// @description  偵測 ATG 房號清單、房間狀態與分頁線索；資料只保留在本機，不自動上傳。
// @match        https://play.godeebxp.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.__XIANYAO_ATG_ROOM_SCANNER_V020__) return;
  window.__XIANYAO_ATG_ROOM_SCANNER_V020__ = true;

  const SENSITIVE_KEY = /(token|cookie|authorization|password|passwd|secret|username|userid|user_id|email|phone|login|session|ticket|credential|access[_-]?key|^t$)/i;
  const INTERESTING_TEXT = /(room|table|page|lobby|slotTableUpdated|tableMeta|totalTableCount)/i;

  const state = {
    enabled: true,
    roomMap: new Map(),
    pagesSeen: new Set(),
    totalTableCount: 0,
    tablePerPage: 0,
    totalPages: 0,
    currentPage: null,
    events: [],
    lastSource: '等待資料',
    panel: null
  };

  const nativeJSONParse = JSON.parse.bind(JSON);

  const now = () => new Date().toLocaleTimeString('zh-TW', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  function clampNumber(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function sanitizeUrl(raw) {
    try {
      const u = new URL(String(raw), location.href);
      for (const [key] of [...u.searchParams.entries()]) {
        if (SENSITIVE_KEY.test(key)) u.searchParams.set(key, '[已隱藏]');
      }
      return u.toString().slice(0, 1800);
    } catch {
      return String(raw || '').slice(0, 1800);
    }
  }

  function sanitizeText(text) {
    let s = String(text ?? '');
    if (s.length > 5000) s = s.slice(0, 5000) + '…';
    s = s.replace(/((?:token|authorization|password|passwd|secret|session|ticket|credential|access[_-]?key)\s*[=:]\s*["']?)[^&\s,"'}]+/gi, '$1[已隱藏]');
    return s;
  }

  function recordEvent(type, payload = {}) {
    if (!state.enabled) return;
    state.events.push({ time: now(), type, ...payload });
    if (state.events.length > 400) state.events.shift();
    render();
  }

  function normalizeRoom(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const roomId = clampNumber(obj.roomId);
    const number = clampNumber(obj.number);
    if (roomId === null || number === null) return null;

    return {
      roomId,
      number,
      status: typeof obj.status === 'string' ? obj.status : null,
      bet: clampNumber(obj.bet),
      win: clampNumber(obj.win),
      today: {
        bet: clampNumber(obj.today?.bet),
        win: clampNumber(obj.today?.win)
      },
      updatedAt: new Date().toISOString()
    };
  }

  function upsertRoom(obj, source = 'unknown') {
    const room = normalizeRoom(obj);
    if (!room) return false;

    const prev = state.roomMap.get(room.roomId) || {};
    state.roomMap.set(room.roomId, {
      ...prev,
      ...room,
      today: { ...(prev.today || {}), ...(room.today || {}) }
    });

    state.lastSource = source;
    return true;
  }

  function applyStatusUpdates(statusObj, source = 'slotTableUpdated') {
    if (!statusObj || typeof statusObj !== 'object' || Array.isArray(statusObj)) return 0;

    let changed = 0;

    for (const [roomIdRaw, status] of Object.entries(statusObj)) {
      const roomId = Number(roomIdRaw);

      if (!Number.isFinite(roomId) || typeof status !== 'string') continue;

      const prev = state.roomMap.get(roomId) || {
        roomId,
        number: null,
        today: {
          bet: null,
          win: null
        }
      };

      state.roomMap.set(roomId, {
        ...prev,
        status,
        updatedAt: new Date().toISOString()
      });

      changed++;
    }

    if (changed) state.lastSource = source;

    return changed;
  }

  function ingestMeta(meta, source = 'tableMeta') {
    if (!meta || typeof meta !== 'object') return false;

    const totalTableCount = clampNumber(meta.totalTableCount);
    const currentPage = clampNumber(meta.currentPage);
    const tablePerPage = clampNumber(meta.tablePerPage);
    const totalPages = clampNumber(meta.totalPages);

    if (
      [totalTableCount, currentPage, tablePerPage, totalPages]
        .every(v => v === null)
    ) {
      return false;
    }

    if (totalTableCount !== null) {
      state.totalTableCount = totalTableCount;
    }

    if (tablePerPage !== null) {
      state.tablePerPage = tablePerPage;
    }

    if (totalPages !== null) {
      state.totalPages = totalPages;
    }

    if (currentPage !== null) {
      state.currentPage = currentPage;
      state.pagesSeen.add(currentPage);
    }

    state.lastSource = source;

    recordEvent('tableMeta', {
      currentPage: state.currentPage,
      totalPages: state.totalPages,
      tablePerPage: state.tablePerPage,
      totalTableCount: state.totalTableCount
    });

    return true;
  }

  function ingestObject(value, source = 'object', depth = 0) {
    if (!state.enabled || value == null || depth > 8) return;

    if (Array.isArray(value)) {
      for (const item of value) {
        ingestObject(item, source, depth + 1);
      }
      return;
    }

    if (typeof value !== 'object') return;

    if (value.tableMeta) {
      ingestMeta(
        value.tableMeta,
        `${source}:tableMeta`
      );
    }

    if (value.data?.tableMeta) {
      ingestMeta(
        value.data.tableMeta,
        `${source}:data.tableMeta`
      );
    }

    const tables =
      Array.isArray(value.tables)
        ? value.tables
        : (
            Array.isArray(value.data?.tables)
              ? value.data.tables
              : null
          );

    if (tables) {
      let count = 0;

      for (const room of tables) {
        if (
          upsertRoom(
            room,
            `${source}:tables`
          )
        ) {
          count++;
        }
      }

      if (count) {
        recordEvent('tableList', {
          count,
          roomsKnown: state.roomMap.size
        });
      }
    }

    upsertRoom(value, source);

    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) continue;
      if (key === 'tables' || key === 'tableMeta') continue;

      ingestObject(
        child,
        source,
        depth + 1
      );
    }
  }

  function processSocketIoText(text, source) {
    const s = String(text || '').trim();

    if (!s.startsWith('42[')) {
      return false;
    }

    try {
      const packet =
        nativeJSONParse(
          s.slice(2)
        );

      if (
        !Array.isArray(packet) ||
        packet.length < 2
      ) {
        return false;
      }

      const [eventName, payload] = packet;

      if (
        eventName === 'slotTableUpdated'
      ) {
        const changed =
          applyStatusUpdates(
            payload,
            source
          );

        recordEvent(
          'slotTableUpdated',
          { changed }
        );
      } else if (
        INTERESTING_TEXT.test(
          String(eventName)
        )
      ) {
        recordEvent(
          'socketEvent',
          {
            eventName:
              String(eventName),
            preview:
              sanitizeText(
                JSON.stringify(payload)
              ).slice(0, 1800)
          }
        );
      }

      ingestObject(
        payload,
        `${source}:${eventName}`
      );

      return true;
    } catch {
      return false;
    }
  }

  function processText(text, source) {
    if (
      !state.enabled ||
      typeof text !== 'string' ||
      !text.trim()
    ) {
      return;
    }

    if (
      processSocketIoText(
        text,
        source
      )
    ) {
      render();
      return;
    }

    const trimmed =
      text.trim();

    try {
      const parsed =
        nativeJSONParse(trimmed);

      ingestObject(
        parsed,
        source
      );

      render();
      return;
    } catch {}

    if (
      INTERESTING_TEXT.test(
        trimmed
      )
    ) {
      recordEvent(
        'textMatch',
        {
          source,
          preview:
            sanitizeText(trimmed)
              .slice(0, 1800)
        }
      );
    }
  }

  JSON.parse = function (...args) {
    const result =
      nativeJSONParse(...args);

    try {
      ingestObject(
        result,
        'JSON.parse'
      );
      render();
    } catch {}

    return result;
  };

  const nativeFetch =
    window.fetch;

  if (nativeFetch) {
    window.fetch =
      async function (...args) {
        const input = args[0];
        const init = args[1] || {};

        const url =
          typeof input === 'string'
            ? input
            : input?.url || '';

        const method =
          init.method ||
          input?.method ||
          'GET';

        const body =
          typeof init.body === 'string'
            ? sanitizeText(
                init.body
              )
            : null;

        recordEvent(
          'fetch→',
          {
            method,
            url:
              sanitizeUrl(url),
            body
          }
        );

        const response =
          await nativeFetch.apply(
            this,
            args
          );

        try {
          const clone =
            response.clone();

          const type =
            clone.headers.get(
              'content-type'
            ) || '';

          recordEvent(
            'fetch←',
            {
              status:
                response.status,
              url:
                sanitizeUrl(
                  response.url ||
                  url
                ),
              contentType:
                type
            }
          );

          if (
            type.includes('json') ||
            type.includes('text') ||
            type.includes('javascript')
          ) {
            clone.text()
              .then(t => {
                processText(
                  t,
                  `fetch:${sanitizeUrl(
                    response.url ||
                    url
                  )}`
                );
              })
              .catch(() => {});
          }
        } catch {}

        return response;
      };
  }

  const NativeXHR =
    window.XMLHttpRequest;

  if (NativeXHR) {
    const nativeOpen =
      NativeXHR.prototype.open;

    const nativeSend =
      NativeXHR.prototype.send;

    NativeXHR.prototype.open =
      function (
        method,
        url,
        ...rest
      ) {
        this.__xinyaoMethod =
          method;

        this.__xinyaoUrl =
          url;

        return nativeOpen.call(
          this,
          method,
          url,
          ...rest
        );
      };

    NativeXHR.prototype.send =
      function (body) {
        recordEvent(
          'XHR→',
          {
            method:
              this.__xinyaoMethod ||
              '',
            url:
              sanitizeUrl(
                this.__xinyaoUrl ||
                ''
              ),
            body:
              typeof body ===
              'string'
                ? sanitizeText(body)
                : null
          }
        );

        this.addEventListener(
          'load',
          () => {
            try {
              const source =
                `XHR:${sanitizeUrl(
                  this.__xinyaoUrl ||
                  ''
                )}`;

              recordEvent(
                'XHR←',
                {
                  status:
                    this.status,
                  url:
                    sanitizeUrl(
                      this.__xinyaoUrl ||
                      ''
                    )
                }
              );

              if (
                this.responseType ===
                'json'
              ) {
                ingestObject(
                  this.response,
                  source
                );
              } else if (
                this.responseType ===
                  '' ||
                this.responseType ===
                  'text'
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

        return nativeSend.call(
          this,
          body
        );
      };
  }

  const NativeWebSocket =
    window.WebSocket;

  if (NativeWebSocket) {
    function XinyaoWebSocket(
      url,
      protocols
    ) {
      const ws =
        protocols === undefined
          ? new NativeWebSocket(
              url
            )
          : new NativeWebSocket(
              url,
              protocols
            );

      const safeUrl =
        sanitizeUrl(url);

      const nativeSend =
        ws.send.bind(ws);

      ws.send =
        function (data) {
          if (
            typeof data ===
              'string' &&
            INTERESTING_TEXT.test(
              data
            )
          ) {
            recordEvent(
              'WS→',
              {
                url:
                  safeUrl,
                preview:
                  sanitizeText(
                    data
                  ).slice(
                    0,
                    1800
                  )
              }
            );
          }

          return nativeSend(
            data
          );
        };

      ws.addEventListener(
        'message',
        event => {
          try {
            if (
              typeof event.data ===
              'string'
            ) {
              processText(
                event.data,
                `WebSocket:${safeUrl}`
              );
            }
          } catch {}
        }
      );

      return ws;
    }

    XinyaoWebSocket.prototype =
      NativeWebSocket.prototype;

    [
      'CONNECTING',
      'OPEN',
      'CLOSING',
      'CLOSED'
    ].forEach(key => {
      try {
        Object.defineProperty(
          XinyaoWebSocket,
          key,
          {
            value:
              NativeWebSocket[key]
          }
        );
      } catch {}
    });

    window.WebSocket =
      XinyaoWebSocket;
  }

  if (window.TextDecoder) {
    const nativeDecode =
      TextDecoder.prototype.decode;

    TextDecoder.prototype.decode =
      function (...args) {
        const text =
          nativeDecode.apply(
            this,
            args
          );

        try {
          if (
            typeof text ===
              'string' &&
            INTERESTING_TEXT.test(
              text
            )
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

  function exportData() {
    const rooms =
      [...state.roomMap.values()]
        .sort((a, b) => {
          const na =
            Number.isFinite(
              a.number
            )
              ? a.number
              : 999999;

          const nb =
            Number.isFinite(
              b.number
            )
              ? b.number
              : 999999;

          return na - nb;
        });

    return {
      capturedAt:
        new Date()
          .toISOString(),

      page:
        sanitizeUrl(
          location.href
        ),

      summary: {
        roomsKnown:
          rooms.length,

        totalTableCount:
          state.totalTableCount,

        pagesSeen:
          [...state.pagesSeen]
            .sort(
              (a, b) =>
                a - b
            ),

        currentPage:
          state.currentPage,

        tablePerPage:
          state.tablePerPage,

        totalPages:
          state.totalPages
      },

      rooms,

      recentEvents:
        state.events.slice(
          -250
        )
    };
  }

  function fallbackCopy(text) {
    const ta =
      document.createElement(
        'textarea'
      );

    ta.value = text;

    ta.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;opacity:0;';

    document.body
      .appendChild(ta);

    ta.select();

    document.execCommand(
      'copy'
    );

    ta.remove();

    flash(
      '✅ 已複製'
    );
  }

  function copyResults() {
    const text =
      JSON.stringify(
        exportData(),
        null,
        2
      );

    if (
      navigator.clipboard
        ?.writeText
    ) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          flash(
            '✅ 已複製'
          );
        })
        .catch(() => {
          fallbackCopy(
            text
          );
        });
    } else {
      fallbackCopy(
        text
      );
    }
  }

  function clearResults() {
    state.roomMap.clear();
    state.pagesSeen.clear();
    state.totalTableCount = 0;
    state.tablePerPage = 0;
    state.totalPages = 0;
    state.currentPage = null;
    state.events = [];
    state.lastSource = '等待資料';

    render();
  }

  function buttonStyle() {
    return 'border:0;border-radius:9px;padding:8px 6px;cursor:pointer;background:#ff5a9d;color:#fff;font-weight:700;font-size:12px;';
  }

  function escapeHtml(text) {
    return String(
      text ?? ''
    )
      .replaceAll(
        '&',
        '&amp;'
      )
      .replaceAll(
        '<',
        '&lt;'
      )
      .replaceAll(
        '>',
        '&gt;'
      );
  }

  const mini =
    document.createElement(
      'button'
    );

  function flash(text) {
    const el =
      document.getElementById(
        'xinyao-room-copy'
      );

    if (!el) return;

    const old =
      el.textContent;

    el.textContent =
      text;

    setTimeout(
      () => {
        if (el) {
          el.textContent =
            old;
        }
      },
      1500
    );
  }

  function render() {
    if (!state.panel) return;

    const known =
      state.roomMap.size;

    const total =
      state.totalTableCount ||
      '?';

    const pageKnown =
      state.pagesSeen.size;

    const pages =
      state.totalPages ||
      '?';

    const pageList =
      [...state.pagesSeen]
        .sort(
          (a, b) =>
            a - b
        )
        .join(', ') ||
      '尚未辨識';

    state.panel.innerHTML = `
      <div style="
        font-weight:800;
        font-size:15px;
        margin-bottom:8px;
      ">
        🔎 芯瑤 ATG 全房資料偵測器
        <span style="
          font-size:10px;
          opacity:.7
        ">
          v0.2
        </span>
      </div>

      <div style="
        font-size:12px;
        line-height:1.75;
        margin-bottom:8px;
      ">
        ${
          state.enabled
            ? '🟢 偵測中'
            : '⚪ 已暫停'
        }
        <br>

        已抓房號：
        <b>${known}</b>
        / ${total}
        <br>

        已看到頁數：
        <b>${pageKnown}</b>
        / ${pages}
        <br>

        目前頁：
        ${
          state.currentPage ??
          '—'
        }
        <br>

        已看頁：
        ${escapeHtml(
          pageList
        )}
        <br>

        最近來源：
        ${escapeHtml(
          state.lastSource
        )}
      </div>

      <div style="
        display:grid;
        grid-template-columns:
          1fr 1fr;
        gap:6px;
      ">
        <button
          id="xinyao-room-toggle"
          style="${buttonStyle()}"
        >
          ${
            state.enabled
              ? '暫停偵測'
              : '開始偵測'
          }
        </button>

        <button
          id="xinyao-room-copy"
          style="${buttonStyle()}"
        >
          複製結果
        </button>

        <button
          id="xinyao-room-clear"
          style="${buttonStyle()}"
        >
          清空
        </button>

        <button
          id="xinyao-room-hide"
          style="${buttonStyle()}"
        >
          縮小
        </button>
      </div>

      <div style="
        margin-top:8px;
        font-size:10px;
        opacity:.7;
        line-height:1.5;
      ">
        僅整理房號／狀態／投注與派彩統計；
        不輸出帳號、密碼、Cookie 或 Token，
        也不會自動上傳。
      </div>
    `;

    document
      .getElementById(
        'xinyao-room-toggle'
      )
      ?.addEventListener(
        'click',
        () => {
          state.enabled =
            !state.enabled;

          render();
        }
      );

    document
      .getElementById(
        'xinyao-room-copy'
      )
      ?.addEventListener(
        'click',
        copyResults
      );

    document
      .getElementById(
        'xinyao-room-clear'
      )
      ?.addEventListener(
        'click',
        clearResults
      );

    document
      .getElementById(
        'xinyao-room-hide'
      )
      ?.addEventListener(
        'click',
        () => {
          state.panel.style.display =
            'none';

          mini.style.display =
            'block';
        }
      );
  }

  function createPanel() {
    if (
      state.panel ||
      !document.body
    ) {
      return;
    }

    const panel =
      document.createElement(
        'div'
      );

    panel.id =
      'xinyao-atg-room-scanner';

    panel.style.cssText =
      'position:fixed;top:12px;right:12px;width:300px;z-index:2147483647;background:rgba(22,18,28,.96);color:#fff;padding:12px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35);font-family:Arial,"Microsoft JhengHei",sans-serif;';

    document.body
      .appendChild(
        panel
      );

    state.panel =
      panel;

    mini.textContent =
      '🔎 房號偵測';

    mini.style.cssText =
      'position:fixed;top:12px;right:12px;z-index:2147483647;border:0;border-radius:999px;padding:9px 12px;background:#ff5a9d;color:#fff;font-weight:800;display:none;cursor:pointer;';

    mini.addEventListener(
      'click',
      () => {
        mini.style.display =
          'none';

        panel.style.display =
          'block';
      }
    );

    document.body
      .appendChild(
        mini
      );

    render();
  }

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      createPanel,
      { once: true }
    );
  } else {
    createPanel();
  }
})();
