// ==UserScript==
// @name         芯瑤💕 ATG 即時助手
// @namespace    xinyao-atg-ios
// @version      1.0.0
// @description  ATG iPhone Safari 即時遊戲資料助手
// @match        https://play.godeebxp.com/*
// @run-at       document-start
// @inject-into  page
// @weight       999
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.__XIANYAO_ATG_FINAL__) return;
  window.__XIANYAO_ATG_FINAL__ = true;

  const nativeJSONParse = JSON.parse.bind(JSON);

  const state = {
    connected: false,

    balance: null,
    stake: null,

    latestPayout: null,
    maxPayout: null,

    freeGameCount: null,
    startFreeGame: null,

    rounds: 0,

    lastSeenSpinId: '',
    currentSpinId: '',
    previousSpinId: '',

    completedSpinIds: new Set(),

    waitingResult: false,

    lastCloseText: '',
    lastCloseAt: 0,

    lastSync: ''
  };

  let panel = null;
  let minimized = false;

  function toNumber(value) {
    if (
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      return value;
    }

    if (
      typeof value === 'string' &&
      value.trim() !== '' &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }

    return null;
  }

  function money(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return '—';
    }

    const n = Number(value);

    if (!Number.isFinite(n)) {
      return '—';
    }

    return n.toFixed(2);
  }

  function nowText() {
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
    state.lastSync = nowText();
    render();
  }

  function createFound() {
    return {
      spinIds: [],
      balances: [],
      stakes: [],
      totalWinnings: [],
      freeGameCounts: [],
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
      value === null ||
      value === undefined ||
      depth > 18 ||
      typeof value !== 'object'
    ) {
      return;
    }

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

    for (
      const [key, val]
      of Object.entries(value)
    ) {
      const lowerKey =
        String(key).toLowerCase();

      const nextPath =
        path
          ? `${path}.${key}`
          : key;

      if (
        lowerKey === 'spinid' &&
        val
      ) {
        found.spinIds.push(
          String(val)
        );
      }

      if (
        lowerKey === 'totalstake'
      ) {
        const n = toNumber(val);

        if (n !== null) {
          found.stakes.push(n);
        }
      }

      if (
        lowerKey === 'totalwinnings'
      ) {
        const n = toNumber(val);

        if (n !== null) {
          found.totalWinnings.push(n);
        }
      }

      if (
        lowerKey === 'freegamecount'
      ) {
        const n = toNumber(val);

        if (n !== null) {
          found.freeGameCounts.push(n);
        }
      }

      if (
        lowerKey === 'startfreegame' &&
        typeof val === 'boolean'
      ) {
        found.startFreeGames.push(val);
      }

      if (
        lowerKey === 'amount' &&
        nextPath
          .toLowerCase()
          .includes('balance')
      ) {
        const n = toNumber(val);

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
          nextPath,
          depth + 1,
          seen
        );
      }
    }
  }

  function updateGeneralFields(found) {
    let changed = false;

    if (found.balances.length) {
      const value =
        found.balances[
          found.balances.length - 1
        ];

      if (state.balance !== value) {
        state.balance = value;
        changed = true;
      }
    }

    if (found.stakes.length) {
      const value =
        found.stakes[
          found.stakes.length - 1
        ];

      if (state.stake !== value) {
        state.stake = value;
        changed = true;
      }
    }

    if (found.freeGameCounts.length) {
      const value =
        found.freeGameCounts[
          found.freeGameCounts.length - 1
        ];

      if (
        state.freeGameCount !== value
      ) {
        state.freeGameCount = value;
        changed = true;
      }
    }

    if (
      found.startFreeGames.length
    ) {
      const value =
        found.startFreeGames[
          found.startFreeGames.length - 1
        ];

      if (
        state.startFreeGame !== value
      ) {
        state.startFreeGame = value;
        changed = true;
      }
    }

    return changed;
  }

  function processSpinIds(found) {
    if (!found.spinIds.length) {
      return '';
    }

    const spinId =
      found.spinIds[
        found.spinIds.length - 1
      ];

    state.lastSeenSpinId = spinId;

    return spinId;
  }

  function processRoundResult(
    found,
    spinId
  ) {
    /*
      尚未開始本次新回合時：
      任何載入階段的舊 totalWinnings
      都不列入本次派彩與最高派彩。
    */
    if (!state.waitingResult) {
      return false;
    }

    if (!spinId) {
      return false;
    }

    /*
      closeSpin 前已存在的 spinId
      視為舊局資料。
    */
    if (
      !state.currentSpinId &&
      state.previousSpinId &&
      spinId === state.previousSpinId
    ) {
      return false;
    }

    /*
      第一個真正的新 spinId
      認定為這一局。
    */
    if (!state.currentSpinId) {
      state.currentSpinId = spinId;
    }

    /*
      若後面跑出其他 spinId，
      不混到目前這局裡。
    */
    if (
      spinId !== state.currentSpinId
    ) {
      return false;
    }

    if (
      !found.totalWinnings.length
    ) {
      return false;
    }

    /*
      同一局可能有多個畫面，
      totalWinnings 可能逐步增加。

      這裡取同批資料最大的
      totalWinnings。
    */
    const payout =
      Math.max(
        ...found.totalWinnings
      );

    state.latestPayout = payout;

    /*
      本次最高派彩：
      只有本次開始後的新回合才計算。
    */
    if (
      state.maxPayout === null ||
      payout > state.maxPayout
    ) {
      state.maxPayout = payout;
    }

    /*
      相同 spinId 只算一個完成回合。
    */
    if (
      !state.completedSpinIds.has(
        spinId
      )
    ) {
      state.completedSpinIds.add(
        spinId
      );

      state.rounds++;
    }

    return true;
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

      walk(
        obj,
        found
      );

      const generalChanged =
        updateGeneralFields(found);

      const spinId =
        processSpinIds(found);

      const roundChanged =
        processRoundResult(
          found,
          spinId
        );

      if (
        generalChanged ||
        roundChanged
      ) {
        sync();
      }

    } catch (_) {}
  }

  function parseText(text) {
    const raw =
      String(text || '').trim();

    if (!raw) return;

    const positions = [
      raw.indexOf('['),
      raw.indexOf('{')
    ].filter(
      index => index >= 0
    );

    if (!positions.length) {
      return;
    }

    const start =
      Math.min(...positions);

    try {
      const parsed =
        nativeJSONParse(
          raw.slice(start)
        );

      inspectObject(parsed);

    } catch (_) {}
  }

  function startNewRound(data) {
    if (
      typeof data !== 'string'
    ) {
      return;
    }

    const text =
      String(data);

    if (
      !text.includes('closeSpin')
    ) {
      return;
    }

    const time =
      Date.now();

    /*
      避免同一 closeSpin
      被重複觸發。
    */
    if (
      state.lastCloseText === text &&
      time - state.lastCloseAt < 800
    ) {
      return;
    }

    state.lastCloseText = text;
    state.lastCloseAt = time;

    /*
      記住上一局 spinId。
      新結果必須跟它不同。
    */
    state.previousSpinId =
      state.lastSeenSpinId;

    state.currentSpinId = '';

    /*
      不在這裡增加回合數。
      等真正收到新 spinId +
      totalWinnings 才算完成一局。
    */
    state.waitingResult = true;

    sync();
  }

  function freeGameText() {
    if (
      state.freeGameCount !== null
    ) {
      if (
        state.freeGameCount > 0
      ) {
        return `剩 ${state.freeGameCount} 次`;
      }

      return '未進行';
    }

    if (
      state.startFreeGame === true
    ) {
      return '已觸發';
    }

    if (
      state.startFreeGame === false
    ) {
      return '未進行';
    }

    return '—';
  }

  function connectionText() {
    return state.connected
      ? '● 即時連線中'
      : '● 等待遊戲資料';
  }

  function render() {
    if (!panel) return;

    if (minimized) {
      panel.innerHTML = `
        <div
          id="xinyaoHeader"
          style="
            cursor:pointer;
            font-size:13px;
            font-weight:800;
          "
        >
          🌸 芯瑤 ATG
        </div>

        <div
          style="
            margin-top:2px;
            font-size:10px;
            opacity:.8;
          "
        >
          ${connectionText()}
        </div>
      `;

      bindHeader();
      return;
    }

    panel.innerHTML = `
      <div
        id="xinyaoHeader"
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          cursor:pointer;
        "
      >
        <div
          style="
            font-size:14px;
            font-weight:800;
          "
        >
          🌸 芯瑤 ATG 即時助手
        </div>

        <div
          style="
            opacity:.7;
            font-size:12px;
          "
        >
          －
        </div>
      </div>

      <div
        style="
          margin-top:3px;
          font-size:10px;
          opacity:.82;
        "
      >
        ${connectionText()}
      </div>

      <div class="xinyaoLine"></div>

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
        <b>${money(state.latestPayout)}</b>
      </div>

      <div class="xinyaoRow">
        <span>本次最高派彩</span>
        <b>${money(state.maxPayout)}</b>
      </div>

      <div class="xinyaoRow">
        <span>免費遊戲</span>
        <b>${freeGameText()}</b>
      </div>

      <div class="xinyaoRow">
        <span>本次已完成回合</span>
        <b>${state.rounds}</b>
      </div>

      <div class="xinyaoLine"></div>

      <div
        style="
          text-align:right;
          font-size:10px;
          opacity:.62;
        "
      >
        最後同步 ${state.lastSync || '—'}
      </div>

      <div
        style="
          margin-top:2px;
          text-align:right;
          font-size:9px;
          opacity:.45;
        "
      >
        僅統計本次開啟遊戲後資料
      </div>
    `;

    bindHeader();
  }

  function bindHeader() {
    const header =
      panel?.querySelector(
        '#xinyaoHeader'
      );

    if (!header) return;

    header.onclick = () => {
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
      #xinyaoATGFinal .xinyaoRow {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:15px;
        margin:4px 0;
        font-size:11px;
      }

      #xinyaoATGFinal .xinyaoRow span {
        opacity:.78;
      }

      #xinyaoATGFinal .xinyaoRow b {
        font-size:12px;
        font-weight:800;
      }

      #xinyaoATGFinal .xinyaoLine {
        height:1px;
        margin:7px 0;
        background:
          rgba(255,255,255,.14);
      }
    `;

    document.documentElement
      .appendChild(style);

    panel =
      document.createElement('div');

    panel.id =
      'xinyaoATGFinal';

    Object.assign(
      panel.style,
      {
        position: 'fixed',
        top: '8px',
        left: '8px',

        zIndex: '2147483647',

        minWidth: '182px',

        padding: '9px 11px',

        color: '#fff',

        background:
          'rgba(24,20,31,.92)',

        border:
          '1px solid rgba(255,255,255,.20)',

        borderRadius: '14px',

        boxShadow:
          '0 5px 20px rgba(0,0,0,.32)',

        fontFamily:
          '-apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif',

        backdropFilter:
          'blur(10px)',

        WebkitBackdropFilter:
          'blur(10px)',

        userSelect: 'none',

        WebkitUserSelect: 'none'
      }
    );

    document.documentElement
      .appendChild(panel);

    render();
  }

  function patchWebSocket() {
    const NativeWS =
      window.WebSocket;

    if (
      !NativeWS ||
      NativeWS.__xinyaoFinalWrapped
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
                event => {
                  if (
                    typeof event.data ===
                    'string'
                  ) {
                    parseText(
                      event.data
                    );
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

                  startNewRound(
                    data
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

          __xinyaoFinalWrapped: {
            value: true
          }
        }
      );

    } catch (_) {
      WrappedWS.__xinyaoFinalWrapped =
        true;
    }

    window.WebSocket =
      WrappedWS;
  }

  function patchJSON() {
    if (
      JSON.parse
        .__xinyaoFinalWrapped
    ) {
      return;
    }

    const wrapped =
      function(...args) {
        const result =
          nativeJSONParse(
            ...args
          );

        try {
          inspectObject(
            result
          );
        } catch (_) {}

        return result;
      };

    try {
      Object.defineProperty(
        wrapped,
        '__xinyaoFinalWrapped',
        {
          value: true
        }
      );
    } catch (_) {}

    JSON.parse = wrapped;
  }

  function patchTextDecoder() {
    try {
      if (
        !window.TextDecoder
      ) {
        return;
      }

      const current =
        TextDecoder.prototype.decode;

      if (
        current
          .__xinyaoFinalWrapped
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
          '__xinyaoFinalWrapped',
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
        window.io
          ?.Socket
          ?.prototype;

      if (
        !proto ||
        proto.__xinyaoFinalWrapped
      ) {
        return;
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
              if (
                packet?.data
              ) {
                inspectObject(
                  packet.data
                );
              }
            } catch (_) {}

            return nativeOnevent.call(
              this,
              packet
            );
          };
      }

      proto.__xinyaoFinalWrapped =
        true;

    } catch (_) {}
  }

  mountPanel();
  patchWebSocket();
  patchJSON();
  patchTextDecoder();

  const timer =
    setInterval(
      () => {
        mountPanel();
        patchWebSocket();
        patchJSON();
        patchTextDecoder();
        patchSocketIO();
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
