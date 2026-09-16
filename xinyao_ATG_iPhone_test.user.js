// ==UserScript==
// @name         芯瑤💕 ATG 即時助手 V4
// @namespace    xinyao-atg-ios
// @version      0.4.0
// @description  ATG iPhone Safari 即時資料助手
// @match        https://play.godeebxp.com/*
// @run-at       document-start
// @inject-into  page
// @weight       999
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.__XIANYAO_ATG_V4__) return;
  window.__XIANYAO_ATG_V4__ = true;

  const nativeJSONParse = JSON.parse.bind(JSON);

  const state = {
    balance: null,
    stake: null,
    payout: null,
    maxPayout: 0,

    freeGameCount: null,
    startFreeGame: null,

    rounds: 0,

    lastSpinId: '',
    seenSpinIds: new Set(),

    lastCloseText: '',
    lastCloseAt: 0,

    connected: false,
    lastSync: ''
  };

  let panel = null;
  let minimized = false;

  function num(v) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      return v;
    }

    if (
      typeof v === 'string' &&
      v.trim() !== '' &&
      Number.isFinite(Number(v))
    ) {
      return Number(v);
    }

    return null;
  }

  function money(v) {
    if (v === null || v === undefined) return '—';

    const n = Number(v);

    if (!Number.isFinite(n)) return '—';

    return n.toFixed(2);
  }

  function now() {
    return new Date().toLocaleTimeString(
      'zh-TW',
      {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }
    );
  }

  function sync() {
    state.lastSync = now();
    render();
  }

  function createFound() {
    return {
      spinIds: [],
      balances: [],
      stakes: [],
      totalWinnings: [],
      freeCounts: [],
      startFreeGames: []
    };
  }

  function walk(
    value,
    found,
    path = '',
    depth = 0,
    seen = new WeakSet()
  ) {
    if (
      value == null ||
      depth > 16 ||
      typeof value !== 'object'
    ) {
      return;
    }

    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        walk(
          item,
          found,
          `${path}[${i}]`,
          depth + 1,
          seen
        );
      });

      return;
    }

    for (const [key, val] of Object.entries(value)) {
      const k = String(key).toLowerCase();
      const p = path ? `${path}.${key}` : key;

      if (k === 'spinid' && val) {
        found.spinIds.push(String(val));
      }

      if (k === 'totalstake') {
        const n = num(val);
        if (n !== null) found.stakes.push(n);
      }

      if (k === 'totalwinnings') {
        const n = num(val);

        if (n !== null) {
          found.totalWinnings.push(n);
        }
      }

      if (k === 'freegamecount') {
        const n = num(val);

        if (n !== null) {
          found.freeCounts.push(n);
        }
      }

      if (
        k === 'startfreegame' &&
        typeof val === 'boolean'
      ) {
        found.startFreeGames.push(val);
      }

      if (
        k === 'amount' &&
        p.toLowerCase().includes('balance')
      ) {
        const n = num(val);

        if (n !== null) {
          found.balances.push(n);
        }
      }

      if (
        val &&
        typeof val === 'object'
      ) {
        walk(
          val,
          found,
          p,
          depth + 1,
          seen
        );
      }
    }
  }

  function applyFound(found) {
    let changed = false;

    if (found.balances.length) {
      const v =
        found.balances[
          found.balances.length - 1
        ];

      if (state.balance !== v) {
        state.balance = v;
        changed = true;
      }
    }

    if (found.stakes.length) {
      const v =
        found.stakes[
          found.stakes.length - 1
        ];

      if (state.stake !== v) {
        state.stake = v;
        changed = true;
      }
    }

    let spinId = '';

    if (found.spinIds.length) {
      spinId =
        found.spinIds[
          found.spinIds.length - 1
        ];

      state.lastSpinId = spinId;
    }

    if (found.totalWinnings.length) {
      const payout = Math.max(
        ...found.totalWinnings
      );

      state.payout = payout;

      if (payout > state.maxPayout) {
        state.maxPayout = payout;
      }

      /*
        同一個 spinId 只記錄一次，
        避免 JSON / Decoder 重複解析造成重複局數。
      */
      if (
        spinId &&
        !state.seenSpinIds.has(spinId)
      ) {
        state.seenSpinIds.add(spinId);
      }

      changed = true;
    }

    if (found.freeCounts.length) {
      state.freeGameCount =
        found.freeCounts[
          found.freeCounts.length - 1
        ];

      changed = true;
    }

    if (found.startFreeGames.length) {
      state.startFreeGame =
        found.startFreeGames[
          found.startFreeGames.length - 1
        ];

      changed = true;
    }

    if (changed) sync();
  }

  function inspectObject(obj) {
    try {
      if (
        !obj ||
        typeof obj !== 'object'
      ) {
        return;
      }

      const found = createFound();

      walk(obj, found);
      applyFound(found);

    } catch (_) {}
  }

  function parseText(text) {
    const s = String(text || '').trim();

    const spots = [
      s.indexOf('['),
      s.indexOf('{')
    ].filter(x => x >= 0);

    if (!spots.length) return;

    const start = Math.min(...spots);

    try {
      const obj =
        nativeJSONParse(
          s.slice(start)
        );

      inspectObject(obj);

    } catch (_) {}
  }

  /*
    回合數：
    只從真正送出的 closeSpin 計算，
    不從 JSON / Decoder 重複增加。
  */
  function inspectOutgoing(data) {
    if (typeof data !== 'string') return;

    const s = String(data);

    if (!s.includes('closeSpin')) return;

    const t = Date.now();

    /*
      300ms 內相同資料視為重複，
      避免同一個 closeSpin 被算兩次。
    */
    if (
      state.lastCloseText === s &&
      t - state.lastCloseAt < 300
    ) {
      return;
    }

    state.lastCloseText = s;
    state.lastCloseAt = t;

    state.rounds++;
    sync();
  }

  function freeText() {
    if (state.freeGameCount !== null) {
      if (state.freeGameCount > 0) {
        return `剩 ${state.freeGameCount} 次`;
      }

      return '未進行';
    }

    if (state.startFreeGame === true) {
      return '已觸發';
    }

    if (state.startFreeGame === false) {
      return '未進行';
    }

    return '—';
  }

  function statusText() {
    return state.connected
      ? '● 即時連線中'
      : '● 等待遊戲資料';
  }

  function render() {
    if (!panel) return;

    if (minimized) {
      panel.innerHTML = `
        <div id="xinyaoHead"
             style="
               font-weight:800;
               font-size:13px;
               cursor:pointer;
             ">
          🌸 芯瑤即時助手
        </div>

        <div style="
          font-size:10px;
          margin-top:2px;
          opacity:.85;
        ">
          ${statusText()}
        </div>
      `;

      bindHead();
      return;
    }

    panel.innerHTML = `
      <div
        id="xinyaoHead"
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          cursor:pointer;
        "
      >
        <div style="
          font-weight:800;
          font-size:14px;
        ">
          🌸 芯瑤 ATG 即時助手
        </div>

        <div style="
          font-size:12px;
          opacity:.75;
        ">
          －
        </div>
      </div>

      <div style="
        margin-top:3px;
        font-size:10px;
        opacity:.85;
      ">
        ${statusText()}
      </div>

      <div style="
        height:1px;
        background:rgba(255,255,255,.15);
        margin:7px 0;
      "></div>

      <div class="xinyaoRow">
        <span>目前點數</span>
        <b>${money(state.balance)}</b>
      </div>

      <div class="xinyaoRow">
        <span>目前押注</span>
        <b>${money(state.stake)}</b>
      </div>

      <div class="xinyaoRow">
        <span>最新一局派彩</span>
        <b>${money(state.payout)}</b>
      </div>

      <div class="xinyaoRow">
        <span>本次最高派彩</span>
        <b>${money(state.maxPayout)}</b>
      </div>

      <div class="xinyaoRow">
        <span>免費遊戲</span>
        <b>${freeText()}</b>
      </div>

      <div class="xinyaoRow">
        <span>本次已完成回合</span>
        <b>${state.rounds}</b>
      </div>

      <div style="
        height:1px;
        background:rgba(255,255,255,.15);
        margin:7px 0 5px;
      "></div>

      <div style="
        font-size:10px;
        opacity:.65;
        text-align:right;
      ">
        最後同步 ${
          state.lastSync || '—'
        }
      </div>
    `;

    bindHead();
  }

  function bindHead() {
    const head =
      panel?.querySelector(
        '#xinyaoHead'
      );

    if (!head) return;

    head.onclick = () => {
      minimized = !minimized;
      render();
    };
  }

  function mountPanel() {
    if (
      panel ||
      !document.documentElement
    ) {
      return;
    }

    const style =
      document.createElement('style');

    style.textContent = `
      #xinyaoATGV4 .xinyaoRow {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:14px;
        margin:4px 0;
        font-size:11px;
      }

      #xinyaoATGV4 .xinyaoRow span {
        opacity:.8;
      }

      #xinyaoATGV4 .xinyaoRow b {
        font-size:12px;
        font-weight:800;
      }
    `;

    document.documentElement.appendChild(
      style
    );

    panel =
      document.createElement('div');

    panel.id = 'xinyaoATGV4';

    Object.assign(
      panel.style,
      {
        position: 'fixed',
        top: '8px',
        left: '8px',
        zIndex: '2147483647',

        minWidth: '175px',

        background:
          'rgba(23,20,30,.91)',

        color: '#fff',

        border:
          '1px solid rgba(255,255,255,.20)',

        borderRadius: '14px',

        padding: '9px 11px',

        boxShadow:
          '0 5px 20px rgba(0,0,0,.30)',

        fontFamily:
          '-apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif',

        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)'
      }
    );

    document.documentElement.appendChild(
      panel
    );

    render();
  }

  function patchWebSocket() {
    const NativeWS = window.WebSocket;

    if (
      !NativeWS ||
      NativeWS.__xinyaoV4Wrapped
    ) {
      return;
    }

    const WrappedWS =
      new Proxy(
        NativeWS,
        {
          construct(
            Target,
            args,
            NewTarget
          ) {
            const ws =
              Reflect.construct(
                Target,
                args,
                NewTarget
              );

            state.connected = true;
            sync();

            try {
              ws.addEventListener(
                'message',
                e => {
                  if (
                    typeof e.data ===
                    'string'
                  ) {
                    parseText(e.data);
                  }
                },
                true
              );
            } catch (_) {}

            try {
              const nativeSend =
                ws.send;

              ws.send =
                function(data) {

                  inspectOutgoing(data);

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
            value:
              NativeWS.CONNECTING
          },

          OPEN: {
            value:
              NativeWS.OPEN
          },

          CLOSING: {
            value:
              NativeWS.CLOSING
          },

          CLOSED: {
            value:
              NativeWS.CLOSED
          },

          __xinyaoV4Wrapped: {
            value: true
          }
        }
      );

    } catch (_) {
      WrappedWS.__xinyaoV4Wrapped =
        true;
    }

    window.WebSocket = WrappedWS;
  }

  function patchJSON() {
    if (
      JSON.parse.__xinyaoV4Wrapped
    ) {
      return;
    }

    const wrapped =
      function(...args) {

        const out =
          nativeJSONParse(...args);

        try {
          inspectObject(out);
        } catch (_) {}

        return out;
      };

    try {
      Object.defineProperty(
        wrapped,
        '__xinyaoV4Wrapped',
        {
          value: true
        }
      );
    } catch (_) {}

    JSON.parse = wrapped;
  }

  function patchDecoder() {
    try {
      if (!window.TextDecoder) return;

      const current =
        TextDecoder.prototype.decode;

      if (
        current.__xinyaoV4Wrapped
      ) {
        return;
      }

      const nativeDecode =
        current;

      const wrapped =
        function(...args) {

          const text =
            nativeDecode.apply(
              this,
              args
            );

          try {
            parseText(text);
          } catch (_) {}

          return text;
        };

      try {
        Object.defineProperty(
          wrapped,
          '__xinyaoV4Wrapped',
          {
            value: true
          }
        );
      } catch (_) {}

      TextDecoder.prototype.decode =
        wrapped;

    } catch (_) {}
  }

  function patchSocketIO() {
    try {
      const proto =
        window.io?.Socket?.prototype;

      if (
        !proto ||
        proto.__xinyaoV4Wrapped
      ) {
        return;
      }

      if (
        typeof proto.onevent ===
        'function'
      ) {
        const native =
          proto.onevent;

        proto.onevent =
          function(packet) {

            try {
              if (packet?.data) {
                inspectObject(
                  packet.data
                );
              }
            } catch (_) {}

            return native.call(
              this,
              packet
            );
          };
      }

      proto.__xinyaoV4Wrapped = true;

    } catch (_) {}
  }

  mountPanel();
  patchWebSocket();
  patchJSON();
  patchDecoder();

  const timer =
    setInterval(
      () => {
        mountPanel();
        patchWebSocket();
        patchJSON();
        patchDecoder();
        patchSocketIO();
      },
      100
    );

  setTimeout(
    () => clearInterval(timer),
    60000
  );

})();
