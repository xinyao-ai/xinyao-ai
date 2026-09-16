// ==UserScript==
// @name         芯瑤💕 ATG 即時助手
// @namespace    xinyao-atg-ios
// @version      1.2.0
// @description  ATG iPhone Safari 即時資料助手
// @match        https://play.godeebxp.com/*
// @run-at       document-start
// @inject-into  page
// @weight       999
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.__XIANYAO_ATG_MEMBER_V120__) return;
  window.__XIANYAO_ATG_MEMBER_V120__ = true;

  const nativeJSONParse = JSON.parse.bind(JSON);

  const state = {
    connected: false,

    balance: null,
    stake: null,

    latestPayout: null,
    maxPayout: null,

    freeGameCount: null,
    startFreeGame: null,

    completedSpins: 0,

    lastSeenSpinId: '',
    previousSpinId: '',
    currentSpinId: '',

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

    return Number.isFinite(n)
      ? n.toFixed(2)
      : '—';
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

  function isObject(value) {
    return (
      value !== null &&
      typeof value === 'object'
    );
  }

  function collectEngines(
    value,
    output = [],
    depth = 0,
    seen = new WeakSet()
  ) {
    if (
      !isObject(value) ||
      depth > 18 ||
      seen.has(value)
    ) {
      return output;
    }

    seen.add(value);

    if (
      typeof value.spinId === 'string' &&
      Array.isArray(value.gameState)
    ) {
      output.push(value);
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        collectEngines(
          item,
          output,
          depth + 1,
          seen
        );
      }
    } else {
      for (const child of Object.values(value)) {
        if (isObject(child)) {
          collectEngines(
            child,
            output,
            depth + 1,
            seen
          );
        }
      }
    }

    return output;
  }

  function getViewNumber(item) {
    const n = toNumber(
      item?.currentView
    );

    return n === null ? -1 : n;
  }

  function getFinalGameState(engine) {
    if (
      !Array.isArray(engine?.gameState) ||
      !engine.gameState.length
    ) {
      return null;
    }

    let best =
      engine.gameState[0];

    for (
      const item
      of engine.gameState
    ) {
      if (
        getViewNumber(item) >=
        getViewNumber(best)
      ) {
        best = item;
      }
    }

    return best;
  }

  function engineScore(engine) {
    const finalState =
      getFinalGameState(engine);

    if (!finalState) return -1;

    const current =
      toNumber(finalState.currentView);

    const total =
      toNumber(finalState.totalViews);

    return (
      (current ?? -1) * 1000 +
      (total ?? 0)
    );
  }

  function findBalance(
    value,
    path = '',
    depth = 0,
    seen = new WeakSet()
  ) {
    if (
      !isObject(value) ||
      depth > 18 ||
      seen.has(value)
    ) {
      return null;
    }

    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const result =
          findBalance(
            item,
            path,
            depth + 1,
            seen
          );

        if (result !== null) {
          return result;
        }
      }

      return null;
    }

    for (
      const [key, val]
      of Object.entries(value)
    ) {
      const nextPath =
        path
          ? `${path}.${key}`
          : key;

      const lowerPath =
        nextPath.toLowerCase();

      if (
        String(key).toLowerCase() ===
          'amount' &&
        lowerPath.includes('balance')
      ) {
        const n =
          toNumber(val);

        if (n !== null) {
          return n;
        }
      }

      if (isObject(val)) {
        const result =
          findBalance(
            val,
            nextPath,
            depth + 1,
            seen
          );

        if (result !== null) {
          return result;
        }
      }
    }

    return null;
  }

  function updateStake(finalState) {
    const value =
      toNumber(
        finalState?.totalStake
      );

    if (
      value !== null &&
      value !== state.stake
    ) {
      state.stake = value;
      return true;
    }

    return false;
  }

  function isFinalView(finalState) {
    if (!finalState) {
      return false;
    }

    const totalViews =
      toNumber(
        finalState.totalViews
      );

    const currentView =
      toNumber(
        finalState.currentView
      );

    /*
      如果 ATG 有 totalViews/currentView，
      一定等到最後一個 view 才視為完整結果。
    */
    if (
      totalViews !== null &&
      currentView !== null &&
      totalViews > 0
    ) {
      return (
        currentView >=
        totalViews - 1
      );
    }

    /*
      某些遊戲沒有 view 資訊時，
      有 totalWinnings 就允許當結果。
    */
    return (
      toNumber(
        finalState.totalWinnings
      ) !== null
    );
  }

  function updateFreeGame(finalState) {
    let changed = false;

    const freeCount =
      toNumber(
        finalState?.freeGameCount
      );

    if (
      freeCount !== null &&
      freeCount !==
        state.freeGameCount
    ) {
      state.freeGameCount =
        freeCount;

      changed = true;
    }

    if (
      typeof finalState?.startFreeGame ===
      'boolean'
    ) {
      if (
        state.startFreeGame !==
        finalState.startFreeGame
      ) {
        state.startFreeGame =
          finalState.startFreeGame;

        changed = true;
      }
    }

    return changed;
  }

  function processEngine(engine) {
    if (!engine?.spinId) {
      return false;
    }

    const spinId =
      String(engine.spinId);

    const finalState =
      getFinalGameState(engine);

    if (!finalState) {
      return false;
    }

    state.lastSeenSpinId =
      spinId;

    let changed = false;

    if (
      updateStake(finalState)
    ) {
      changed = true;
    }

    /*
      免費遊戲狀態也使用目前 engine
      最後 currentView 的資料。
    */
    if (
      updateFreeGame(finalState)
    ) {
      changed = true;
    }

    /*
      尚未開始本次新局：
      不把頁面剛載入時的舊派彩
      算成本次最新/最高派彩。
    */
    if (!state.waitingResult) {
      return changed;
    }

    /*
      closeSpin 前最後看到的 spinId
      是上一局，不能拿來當新局。
    */
    if (
      !state.currentSpinId &&
      state.previousSpinId &&
      spinId ===
        state.previousSpinId
    ) {
      return changed;
    }

    /*
      第一次收到不同 spinId，
      就鎖定為這次新局。
    */
    if (!state.currentSpinId) {
      state.currentSpinId =
        spinId;
    }

    if (
      spinId !==
      state.currentSpinId
    ) {
      return changed;
    }

    /*
      必須等最後 currentView。
      避免 0.75 被當成最後 3.00。
    */
    if (!isFinalView(finalState)) {
      return changed;
    }

    let payout =
      toNumber(
        finalState.totalWinnings
      );

    /*
      保險：
      若最後 view 沒 totalWinnings，
      才退回整局最大值。
    */
    if (payout === null) {
      const values =
        engine.gameState
          .map(item =>
            toNumber(
              item?.totalWinnings
            )
          )
          .filter(
            value =>
              value !== null
          );

      if (values.length) {
        payout =
          Math.max(...values);
      }
    }

    if (payout !== null) {
      if (
        state.latestPayout !==
        payout
      ) {
        state.latestPayout =
          payout;

        changed = true;
      }

      if (
        state.maxPayout === null ||
        payout >
          state.maxPayout
      ) {
        state.maxPayout =
          payout;

        changed = true;
      }
    }

    /*
      相同 spinId 只算一次，
      所以 Decoder / JSON / Socket.IO
      即使重複收到也不會重複加。
    */
    if (
      !state.completedSpinIds.has(
        spinId
      )
    ) {
      state.completedSpinIds.add(
        spinId
      );

      state.completedSpins++;

      changed = true;
    }

    /*
      此局已經拿到完整結果。
      等下一次 closeSpin
      才開始接下一局。
    */
    state.waitingResult = false;

    return changed;
  }

  function inspectObject(obj) {
    try {
      if (!isObject(obj)) {
        return;
      }

      let changed = false;

      const balance =
        findBalance(obj);

      if (
        balance !== null &&
        balance !== state.balance
      ) {
        state.balance =
          balance;

        changed = true;
      }

      const engines =
        collectEngines(obj);

      /*
        同一份資料若出現相同 spinId 多次，
        保留 currentView 較完整的那一份。
      */
      const bestBySpin =
        new Map();

      for (const engine of engines) {
        if (!engine?.spinId) {
          continue;
        }

        const id =
          String(engine.spinId);

        const previous =
          bestBySpin.get(id);

        if (
          !previous ||
          engineScore(engine) >=
            engineScore(previous)
        ) {
          bestBySpin.set(
            id,
            engine
          );
        }
      }

      for (
        const engine
        of bestBySpin.values()
      ) {
        if (
          processEngine(engine)
        ) {
          changed = true;
        }
      }

      if (changed) {
        sync();
      }

    } catch (_) {}
  }

  function parseText(text) {
    const raw =
      String(text || '').trim();

    if (!raw) {
      return;
    }

    const positions = [
      raw.indexOf('['),
      raw.indexOf('{')
    ].filter(
      index =>
        index >= 0
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

      inspectObject(
        parsed
      );

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
      !text.includes(
        'closeSpin'
      )
    ) {
      return;
    }

    const time =
      Date.now();

    /*
      防止同一個 closeSpin
      在極短時間內被算兩次。
    */
    if (
      state.lastCloseText ===
        text &&
      time -
        state.lastCloseAt <
        800
    ) {
      return;
    }

    state.lastCloseText =
      text;

    state.lastCloseAt =
      time;

    /*
      記住上一個 spinId。
      接下來必須等新的 spinId。
    */
    state.previousSpinId =
      state.lastSeenSpinId;

    state.currentSpinId =
      '';

    state.waitingResult =
      true;

    sync();
  }

  function freeGameText() {
    /*
      最後 view 回傳 0 時，
      一律顯示未進行。
      不再卡在剩 1 次。
    */
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
      state.startFreeGame ===
      true
    ) {
      return '已觸發';
    }

    if (
      state.startFreeGame ===
      false
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
    if (!panel) {
      return;
    }

    if (minimized) {
      panel.innerHTML = `
        <div
          id="xinyaoHeader"
          style="
            font-weight:800;
            font-size:13px;
            cursor:pointer;
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
          justify-content:space-between;
          align-items:center;
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
            font-size:12px;
            opacity:.7;
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
        <span>免費遊戲狀態</span>
        <b>${freeGameText()}</b>
      </div>

      <div class="xinyaoRow">
        <span>本次完成轉數</span>
        <b>${state.completedSpins}</b>
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

    if (!header) {
      return;
    }

    header.onclick = () => {
      minimized =
        !minimized;

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
      document.createElement(
        'style'
      );

    style.textContent = `
      #xinyaoATGMemberV120 .xinyaoRow {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:15px;
        margin:4px 0;
        font-size:11px;
      }

      #xinyaoATGMemberV120 .xinyaoRow span {
        opacity:.78;
      }

      #xinyaoATGMemberV120 .xinyaoRow b {
        font-size:12px;
        font-weight:800;
      }

      #xinyaoATGMemberV120 .xinyaoLine {
        height:1px;
        margin:7px 0;
        background:
          rgba(255,255,255,.14);
      }
    `;

    document.documentElement
      .appendChild(style);

    panel =
      document.createElement(
        'div'
      );

    panel.id =
      'xinyaoATGMemberV120';

    Object.assign(
      panel.style,
      {
        position: 'fixed',
        top: '8px',
        left: '8px',

        zIndex:
          '2147483647',

        minWidth:
          '184px',

        padding:
          '9px 11px',

        color:
          '#fff',

        background:
          'rgba(24,20,31,.92)',

        border:
          '1px solid rgba(255,255,255,.20)',

        borderRadius:
          '14px',

        boxShadow:
          '0 5px 20px rgba(0,0,0,.32)',

        fontFamily:
          '-apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif',

        backdropFilter:
          'blur(10px)',

        WebkitBackdropFilter:
          'blur(10px)',

        userSelect:
          'none',

        WebkitUserSelect:
          'none'
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
      NativeWS.__xinyaoV120Wrapped
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

            state.connected =
              true;

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

          __xinyaoV120Wrapped: {
            value: true
          }
        }
      );

    } catch (_) {
      WrappedWS.__xinyaoV120Wrapped =
        true;
    }

    window.WebSocket =
      WrappedWS;
  }

  function patchJSON() {
    if (
      JSON.parse
        .__xinyaoV120Wrapped
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
        '__xinyaoV120Wrapped',
        {
          value: true
        }
      );
    } catch (_) {}

    JSON.parse =
      wrapped;
  }

  function patchTextDecoder() {
    try {
      if (
        !window.TextDecoder
      ) {
        return;
      }

      const current =
        TextDecoder
          .prototype
          .decode;

      if (
        current
          .__xinyaoV120Wrapped
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
            parseText(
              text
            );
          } catch (_) {}

          return text;
        };

      try {
        Object.defineProperty(
          wrapped,
          '__xinyaoV120Wrapped',
          {
            value: true
          }
        );
      } catch (_) {}

      TextDecoder
        .prototype
        .decode =
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
        proto.__xinyaoV120Wrapped
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

      proto.__xinyaoV120Wrapped =
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
      clearInterval(
        timer
      );
    },
    60000
  );

})();
