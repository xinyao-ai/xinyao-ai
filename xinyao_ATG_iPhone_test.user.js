// ==UserScript==
// @name         芯瑤💕 ATG iPhone 即時資料 V3
// @namespace    xinyao-atg-ios
// @version      0.3.0
// @description  iPhone Safari + Userscripts：讀取 ATG 即時點數、押注、最終派彩與免費遊戲資料。
// @match        https://play.godeebxp.com/*
// @run-at       document-start
// @inject-into  page
// @weight       999
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.__XIANYAO_ATG_IOS_V3__) return;
  window.__XIANYAO_ATG_IOS_V3__ = true;

  const nativeJSONParse = JSON.parse.bind(JSON);

  const state = {
    sockets: 0,
    incoming: 0,
    outgoing: 0,
    binary: 0,

    spin: 0,
    closeSpin: 0,

    balance: null,
    stake: null,

    // 只拿 totalWinnings 當「最新派彩」
    payout: null,

    // roundWinnings 只留著內部比對，不顯示成最終派彩
    roundWinnings: null,

    freeGameCount: null,
    startFreeGame: null,

    decoded: 0,
    lastType: '等待 ATG 資料',
    lastAt: ''
  };

  let badge = null;
  let expanded = true;

  const nowText = () =>
    new Date().toLocaleTimeString('zh-TW', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

  function toNum(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;

    if (
      typeof v === 'string' &&
      v.trim() !== '' &&
      Number.isFinite(Number(v))
    ) {
      return Number(v);
    }

    return null;
  }

  function fmt(v) {
    if (v === null || v === undefined) return '—';

    if (typeof v === 'number') {
      return (Math.round(v * 100) / 100).toFixed(2);
    }

    return String(v);
  }

  function touch(type) {
    state.lastType = type;
    state.lastAt = nowText();
    updateBadge();
  }

  function createFound() {
    return {
      balances: [],
      stakes: [],
      totalWinnings: [],
      roundWinnings: [],
      freeGameCounts: [],
      startFreeGames: []
    };
  }

  function walk(value, found, path = '', depth = 0, seen = new WeakSet()) {
    if (depth > 16 || value == null) return;

    if (typeof value !== 'object') return;
    if (seen.has(value)) return;

    seen.add(value);

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        walk(
          value[i],
          found,
          `${path}[${i}]`,
          depth + 1,
          seen
        );
      }
      return;
    }

    for (const [key, val] of Object.entries(value)) {
      const k = String(key).toLowerCase();
      const nextPath = path ? `${path}.${key}` : key;

      if (k === 'totalstake') {
        const n = toNum(val);
        if (n !== null) found.stakes.push(n);
      }

      if (k === 'totalwinnings') {
        const n = toNum(val);
        if (n !== null) found.totalWinnings.push(n);
      }

      if (k === 'roundwinnings') {
        const n = toNum(val);
        if (n !== null) found.roundWinnings.push(n);
      }

      if (k === 'freegamecount') {
        const n = toNum(val);
        if (n !== null) found.freeGameCounts.push(n);
      }

      if (
        k === 'startfreegame' &&
        typeof val === 'boolean'
      ) {
        found.startFreeGames.push(val);
      }

      if (
        k === 'amount' &&
        nextPath.toLowerCase().includes('balance')
      ) {
        const n = toNum(val);
        if (n !== null) found.balances.push(n);
      }

      if (val && typeof val === 'object') {
        walk(
          val,
          found,
          nextPath,
          depth + 1,
          seen
        );
      }
    }
  }

  function applyFound(found, source) {
    let changed = false;

    if (found.balances.length) {
      const value =
        found.balances[found.balances.length - 1];

      if (state.balance !== value) {
        state.balance = value;
        changed = true;
      }
    }

    if (found.stakes.length) {
      const value =
        found.stakes[found.stakes.length - 1];

      if (state.stake !== value) {
        state.stake = value;
        changed = true;
      }
    }

    /*
      關鍵修正：
      同一個遊戲結果物件可能包含多個畫面/階段，
      totalWinnings 通常會逐步累加。

      所以同一批解碼資料裡，
      取最大的 totalWinnings 當整局目前總派彩。
    */
    if (found.totalWinnings.length) {
      const value = Math.max(
        ...found.totalWinnings
      );

      if (state.payout !== value) {
        state.payout = value;
        changed = true;
      }
    }

    if (found.roundWinnings.length) {
      const value =
        found.roundWinnings[
          found.roundWinnings.length - 1
        ];

      state.roundWinnings = value;
    }

    if (found.freeGameCounts.length) {
      const value =
        found.freeGameCounts[
          found.freeGameCounts.length - 1
        ];

      if (state.freeGameCount !== value) {
        state.freeGameCount = value;
        changed = true;
      }
    }

    if (found.startFreeGames.length) {
      const value =
        found.startFreeGames[
          found.startFreeGames.length - 1
        ];

      if (state.startFreeGame !== value) {
        state.startFreeGame = value;
        changed = true;
      }
    }

    if (changed) {
      state.decoded++;
      touch(source);
    }

    return changed;
  }

  function inspectObject(obj, source = '解析資料') {
    try {
      if (!obj || typeof obj !== 'object') return;

      const found = createFound();

      walk(obj, found);
      applyFound(found, source);
    } catch (_) {}
  }

  function parsePossibleJSON(text) {
    const s = String(text || '').trim();

    const positions = [
      s.indexOf('['),
      s.indexOf('{')
    ].filter(i => i >= 0);

    if (!positions.length) return null;

    const start = Math.min(...positions);

    try {
      return nativeJSONParse(s.slice(start));
    } catch (_) {
      return null;
    }
  }

  function detectOutgoingEvent(text) {
    const s = String(text || '').trim();

    /*
      只從真正 WebSocket.send 的 Socket.IO 指令計數，
      不再從 Decoder / JSON / Socket.IO hook 重複計數。
    */

    if (
      /^42\["spin"/.test(s) ||
      /^42\['spin'/.test(s)
    ) {
      state.spin++;
      touch('OUT spin');
      return;
    }

    if (
      /^42\["closeSpin"/.test(s) ||
      /^42\['closeSpin'/.test(s)
    ) {
      state.closeSpin++;
      touch('OUT closeSpin');
    }
  }

  function inspectText(text, direction = '') {
    const s = String(text || '');

    if (direction === 'OUT') {
      detectOutgoingEvent(s);
    }

    if (
      !s.includes('totalWinnings') &&
      !s.includes('roundWinnings') &&
      !s.includes('totalStake') &&
      !s.includes('freeGameCount') &&
      !s.includes('startFreeGame') &&
      !s.includes('balance')
    ) {
      return;
    }

    const parsed = parsePossibleJSON(s);

    if (parsed) {
      inspectObject(
        parsed,
        `${direction || 'TEXT'} 解碼`
      );
    }
  }

  function inspectData(data, direction) {
    try {
      if (direction === 'IN') {
        state.incoming++;
      } else {
        state.outgoing++;
      }

      if (typeof data === 'string') {
        inspectText(data, direction);
        updateBadge();
        return;
      }

      if (
        data instanceof ArrayBuffer ||
        ArrayBuffer.isView(data) ||
        data instanceof Blob
      ) {
        state.binary++;
        touch(`${direction} Binary`);
      }
    } catch (_) {}
  }

  function freeText() {
    if (state.freeGameCount !== null) {
      return state.freeGameCount > 0
        ? `剩 ${state.freeGameCount} 次`
        : '0 次';
    }

    if (state.startFreeGame === true) {
      return '已觸發';
    }

    if (state.startFreeGame === false) {
      return '未觸發';
    }

    return '—';
  }

  function updateBadge() {
    if (!badge) return;

    const head = `
      <div style="font-weight:800;font-size:13px;">
        芯瑤 iPhone V3 ✅
      </div>

      <div style="font-size:11px;margin-top:2px;">
        WS ${state.sockets}
        ｜IN ${state.incoming}
        ｜BIN ${state.binary}
      </div>
    `;

    if (!expanded) {
      badge.innerHTML = head;
      return;
    }

    badge.innerHTML = `
      ${head}

      <div style="
        font-size:11px;
        margin-top:6px;
        line-height:1.55;
      ">
        點數：${fmt(state.balance)}<br>
        押注：${fmt(state.stake)}<br>
        最新派彩：${fmt(state.payout)}<br>
        免費遊戲：${freeText()}<br>
        解析命中：${state.decoded}<br>
        已送出 spin：${state.spin}<br>
        已送出 closeSpin：${state.closeSpin}<br>
        最新：${state.lastType}<br>
        時間：${state.lastAt || '—'}
      </div>
    `;
  }

  function mountBadge() {
    if (
      badge ||
      !document.documentElement
    ) {
      return;
    }

    badge = document.createElement('div');

    Object.assign(badge.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      zIndex: '2147483647',
      background: 'rgba(20,20,24,.90)',
      color: '#fff',
      border:
        '1px solid rgba(255,255,255,.22)',
      borderRadius: '12px',
      padding: '8px 10px',
      minWidth: '155px',
      boxShadow:
        '0 4px 18px rgba(0,0,0,.28)',
      fontFamily:
        '-apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif',
      lineHeight: '1.25',
      userSelect: 'none',
      WebkitUserSelect: 'none'
    });

    badge.addEventListener(
      'click',
      () => {
        expanded = !expanded;
        updateBadge();
      }
    );

    document.documentElement.appendChild(
      badge
    );

    updateBadge();
  }

  function patchWebSocket() {
    const NativeWS = window.WebSocket;

    if (
      !NativeWS ||
      NativeWS.__xinyaoV3Wrapped
    ) {
      return;
    }

    const WrappedWS = new Proxy(
      NativeWS,
      {
        construct(Target, args, NewTarget) {
          const ws = Reflect.construct(
            Target,
            args,
            NewTarget
          );

          state.sockets++;
          touch('WebSocket 已建立');

          try {
            ws.addEventListener(
              'message',
              e => {
                inspectData(
                  e.data,
                  'IN'
                );
              },
              true
            );
          } catch (_) {}

          try {
            const nativeSend = ws.send;

            ws.send = function(data) {
              inspectData(
                data,
                'OUT'
              );

              return nativeSend.call(
                this,
                data
              );
            };
          } catch (_) {}

          return ws;
        }
      }
    );

    try {
      Object.defineProperties(
        WrappedWS,
        {
          CONNECTING: {
            value: NativeWS.CONNECTING
          },
          OPEN: {
            value: NativeWS.OPEN
          },
          CLOSING: {
            value: NativeWS.CLOSING
          },
          CLOSED: {
            value: NativeWS.CLOSED
          },
          __xinyaoV3Wrapped: {
            value: true
          }
        }
      );
    } catch (_) {
      WrappedWS.__xinyaoV3Wrapped = true;
    }

    window.WebSocket = WrappedWS;

    touch('WebSocket 捕捉器已啟動');
  }

  function patchJSON() {
    if (
      JSON.parse.__xinyaoV3Wrapped
    ) {
      return;
    }

    const wrapped = function(...args) {
      const out =
        nativeJSONParse(...args);

      try {
        inspectObject(
          out,
          'JSON 解碼'
        );
      } catch (_) {}

      return out;
    };

    try {
      Object.defineProperty(
        wrapped,
        '__xinyaoV3Wrapped',
        { value: true }
      );
    } catch (_) {}

    JSON.parse = wrapped;
  }

  function patchTextDecoder() {
    try {
      if (!window.TextDecoder) return;

      const current =
        TextDecoder.prototype.decode;

      if (
        current.__xinyaoV3Wrapped
      ) {
        return;
      }

      const nativeDecode = current;

      const wrapped = function(...args) {
        const text =
          nativeDecode.apply(
            this,
            args
          );

        try {
          inspectText(
            text,
            'DECODE'
          );
        } catch (_) {}

        return text;
      };

      try {
        Object.defineProperty(
          wrapped,
          '__xinyaoV3Wrapped',
          { value: true }
        );
      } catch (_) {}

      TextDecoder.prototype.decode =
        wrapped;

    } catch (_) {}
  }

  function patchSocketIO() {
    try {
      const io = window.io;
      const proto =
        io?.Socket?.prototype;

      if (
        !proto ||
        proto.__xinyaoV3Wrapped
      ) {
        return false;
      }

      if (
        typeof proto.onevent ===
        'function'
      ) {
        const nativeOnevent =
          proto.onevent;

        proto.onevent =
          function(packet) {

            try {
              if (packet?.data) {
                /*
                  這裡只解析內容，
                  不增加 spin / closeSpin，
                  避免重複計數。
                */
                inspectObject(
                  packet.data,
                  'Socket.IO 解碼'
                );
              }
            } catch (_) {}

            return nativeOnevent.call(
              this,
              packet
            );
          };
      }

      proto.__xinyaoV3Wrapped = true;

      touch(
        'Socket.IO 解碼鉤子已啟動'
      );

      return true;

    } catch (_) {
      return false;
    }
  }

  patchWebSocket();
  patchJSON();
  patchTextDecoder();
  mountBadge();

  const timer = setInterval(
    () => {
      patchWebSocket();
      patchJSON();
      patchTextDecoder();
      patchSocketIO();
      mountBadge();
    },
    100
  );

  setTimeout(
    () => {
      clearInterval(timer);
    },
    60000
  );
})();
