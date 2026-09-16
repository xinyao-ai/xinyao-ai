// ==UserScript==
// @name         芯瑤💕 ATG iPhone 即時資料 V2
// @namespace    xinyao-atg-ios
// @version      0.2.0
// @description  iPhone Safari + Userscripts：讀取 ATG 即時點數、押注、派彩與免費遊戲資料。
// @match        https://play.godeebxp.com/*
// @run-at       document-start
// @inject-into  page
// @weight       999
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.__XIANYAO_ATG_IOS_V2__) return;
  window.__XIANYAO_ATG_IOS_V2__ = true;

  const state = {
    sockets: 0,
    incoming: 0,
    outgoing: 0,
    binary: 0,
    spin: 0,
    closeSpin: 0,
    decoded: 0,
    balance: null,
    stake: null,
    payout: null,
    totalWinnings: null,
    freeGameCount: null,
    startFreeGame: null,
    lastType: '等待 ATG 資料',
    lastAt: ''
  };

  let badge = null;
  let expanded = true;

  const nowText = () => new Date().toLocaleTimeString('zh-TW', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  function num(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
      return Number(v);
    }
    return null;
  }

  function fmt(v) {
    if (v === null || v === undefined) return '—';
    return typeof v === 'number'
      ? String(Math.round(v * 100) / 100)
      : String(v);
  }

  function touch(type) {
    state.lastType = type;
    state.lastAt = nowText();
    updateBadge();
  }

  function scan(value, path = '', depth = 0, seen = new WeakSet()) {
    if (depth > 14 || value == null) return false;

    let changed = false;

    if (typeof value !== 'object') return false;
    if (seen.has(value)) return false;
    seen.add(value);

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (scan(value[i], `${path}[${i}]`, depth + 1, seen)) changed = true;
      }
      return changed;
    }

    for (const [key, val] of Object.entries(value)) {
      const k = key.toLowerCase();
      const nextPath = path ? `${path}.${key}` : key;

      if (k === 'totalstake') {
        const n = num(val);
        if (n !== null && state.stake !== n) {
          state.stake = n;
          changed = true;
        }
      }

      if (k === 'roundwinnings') {
        const n = num(val);
        if (n !== null && state.payout !== n) {
          state.payout = n;
          changed = true;
        }
      }

      if (k === 'totalwinnings') {
        const n = num(val);
        if (n !== null && state.totalWinnings !== n) {
          state.totalWinnings = n;
          changed = true;
        }
      }

      if (k === 'freegamecount') {
        const n = num(val);
        if (n !== null && state.freeGameCount !== n) {
          state.freeGameCount = n;
          changed = true;
        }
      }

      if (k === 'startfreegame' && typeof val === 'boolean') {
        if (state.startFreeGame !== val) {
          state.startFreeGame = val;
          changed = true;
        }
      }

      if (
        k === 'amount' &&
        nextPath.toLowerCase().includes('balance')
      ) {
        const n = num(val);
        if (n !== null && state.balance !== n) {
          state.balance = n;
          changed = true;
        }
      }

      if (val && typeof val === 'object') {
        if (scan(val, nextPath, depth + 1, seen)) changed = true;
      }
    }

    return changed;
  }

  function inspectObject(obj, source = '解析資料') {
    try {
      const changed = scan(obj);

      if (changed) {
        state.decoded++;
        touch(source);
      }
    } catch (_) {}
  }

  function inspectText(text, direction = '') {
    const s = String(text || '');

    if (s.includes('closeSpin')) {
      state.closeSpin++;
      touch(`${direction} closeSpin`.trim());
    } else if (
      s.includes('"spin"') ||
      s.includes("['spin'") ||
      s.includes('["spin"')
    ) {
      state.spin++;
      touch(`${direction} spin`.trim());
    }

    if (
      s.includes('roundWinnings') ||
      s.includes('totalStake') ||
      s.includes('freeGameCount') ||
      s.includes('startFreeGame') ||
      s.includes('balance')
    ) {
      try {
        const clean = s
          .replace(/^\d+-/, '')
          .replace(/^\d+/, '');

        const parsed = JSON.parse(clean);
        inspectObject(parsed, '文字解碼');
      } catch (_) {}
    }
  }

  function inspectData(data, direction) {
    try {
      if (direction === 'IN') state.incoming++;
      else state.outgoing++;

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
      }
    } catch (_) {}
  }

  function freeText() {
    if (state.freeGameCount !== null) {
      return state.freeGameCount > 0
        ? `剩 ${state.freeGameCount} 次`
        : '0 次';
    }

    if (state.startFreeGame === true) return '已觸發';
    if (state.startFreeGame === false) return '未觸發';

    return '—';
  }

  function updateBadge() {
    if (!badge) return;

    const small = `
      <div style="font-weight:800;font-size:13px;">
        芯瑤 iPhone V2 ✅
      </div>

      <div style="font-size:11px;margin-top:2px;">
        WS ${state.sockets}｜IN ${state.incoming}｜BIN ${state.binary}
      </div>
    `;

    badge.innerHTML = expanded
      ? `
        ${small}

        <div style="font-size:11px;margin-top:6px;line-height:1.55;">
          點數：${fmt(state.balance)}<br>
          押注：${fmt(state.stake)}<br>
          最新派彩：${fmt(state.payout)}<br>
          免費遊戲：${freeText()}<br>
          解析命中：${state.decoded}<br>
          spin：${state.spin}｜closeSpin：${state.closeSpin}<br>
          最新：${state.lastType}<br>
          時間：${state.lastAt || '—'}
        </div>
      `
      : small;
  }

  function mountBadge() {
    if (badge || !document.documentElement) return;

    badge = document.createElement('div');

    Object.assign(badge.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      zIndex: '2147483647',
      background: 'rgba(20,20,24,.90)',
      color: '#fff',
      border: '1px solid rgba(255,255,255,.22)',
      borderRadius: '12px',
      padding: '8px 10px',
      minWidth: '150px',
      boxShadow: '0 4px 18px rgba(0,0,0,.28)',
      fontFamily:
        '-apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif',
      lineHeight: '1.25',
      userSelect: 'none',
      WebkitUserSelect: 'none'
    });

    badge.addEventListener('click', () => {
      expanded = !expanded;
      updateBadge();
    });

    document.documentElement.appendChild(badge);
    updateBadge();
  }

  function patchWebSocket() {
    const NativeWS = window.WebSocket;

    if (!NativeWS || NativeWS.__xinyaoV2Wrapped) return;

    const WrappedWS = new Proxy(NativeWS, {
      construct(Target, args, NewTarget) {
        const ws = Reflect.construct(Target, args, NewTarget);

        state.sockets++;
        touch('WebSocket 已建立');

        try {
          ws.addEventListener(
            'message',
            e => inspectData(e.data, 'IN'),
            true
          );
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

    try {
      Object.defineProperties(WrappedWS, {
        CONNECTING: { value: NativeWS.CONNECTING },
        OPEN: { value: NativeWS.OPEN },
        CLOSING: { value: NativeWS.CLOSING },
        CLOSED: { value: NativeWS.CLOSED },
        __xinyaoV2Wrapped: { value: true }
      });
    } catch (_) {
      WrappedWS.__xinyaoV2Wrapped = true;
    }

    window.WebSocket = WrappedWS;
    touch('WebSocket 捕捉器已啟動');
  }

  function patchJSON() {
    if (JSON.parse.__xinyaoV2Wrapped) return;

    const nativeParse = JSON.parse;

    const wrapped = function(...args) {
      const out = nativeParse.apply(this, args);

      try {
        inspectObject(out, 'JSON 解碼');
      } catch (_) {}

      return out;
    };

    try {
      Object.defineProperty(
        wrapped,
        '__xinyaoV2Wrapped',
        { value: true }
      );
    } catch (_) {}

    JSON.parse = wrapped;
  }

  function patchTextDecoder() {
    try {
      if (
        !window.TextDecoder ||
        TextDecoder.prototype.decode.__xinyaoV2Wrapped
      ) {
        return;
      }

      const nativeDecode = TextDecoder.prototype.decode;

      const wrapped = function(...args) {
        const text = nativeDecode.apply(this, args);

        try {
          inspectText(text, 'DECODE');
        } catch (_) {}

        return text;
      };

      try {
        Object.defineProperty(
          wrapped,
          '__xinyaoV2Wrapped',
          { value: true }
        );
      } catch (_) {}

      TextDecoder.prototype.decode = wrapped;
    } catch (_) {}
  }

  function patchSocketIO() {
    try {
      const io = window.io;
      const proto = io?.Socket?.prototype;

      if (!proto || proto.__xinyaoV2Wrapped) return false;

      if (typeof proto.onevent === 'function') {
        const nativeOnevent = proto.onevent;

        proto.onevent = function(packet) {
          try {
            if (packet?.data) {
              const data = packet.data;

              const eventName =
                Array.isArray(data) &&
                typeof data[0] === 'string'
                  ? data[0]
                  : 'Socket.IO';

              if (eventName === 'spin') state.spin++;
              if (eventName === 'closeSpin') state.closeSpin++;

              inspectObject(
                data,
                `Socket.IO ${eventName}`
              );
            }
          } catch (_) {}

          return nativeOnevent.call(this, packet);
        };
      }

      proto.__xinyaoV2Wrapped = true;

      touch('Socket.IO 解碼鉤子已啟動');
      return true;
    } catch (_) {
      return false;
    }
  }

  patchWebSocket();
  patchJSON();
  patchTextDecoder();
  mountBadge();

  const timer = setInterval(() => {
    patchWebSocket();
    patchJSON();
    patchTextDecoder();
    patchSocketIO();
    mountBadge();
  }, 100);

  setTimeout(() => {
    clearInterval(timer);
  }, 60000);
})();
