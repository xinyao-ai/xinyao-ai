// ==UserScript==
// @name         芯瑤💕 ATG 即時助手
// @namespace    xinyao-atg-ios
// @version      1.3.0
// @description  ATG iPhone Safari 即時資料助手＋雲端同步
// @match        https://play.godeebxp.com/*
// @run-at       document-start
// @inject-into  page
// @weight       999
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.__XIANYAO_ATG_V130__) return;
  window.__XIANYAO_ATG_V130__ = true;

  const WORKER =
    'https://xinyao-atg-live.love06130430.workers.dev';

  const CHANNEL_STORAGE_KEY =
    'xinyao_atg_sync_channel_v1';

  const nativeJSONParse =
    JSON.parse.bind(JSON);

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

    completedSpinIds:
      new Set(),

    waitingResult: false,

    lastCloseText: '',
    lastCloseAt: 0,

    lastSync: '',

    cloudChannel: '',
    cloudStatus: '等待同步',
    cloudTime: '',

    lastCloudSignature: '',
    cloudSending: false
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
      Number.isFinite(
        Number(value)
      )
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

    const n =
      Number(value);

    return Number.isFinite(n)
      ? n.toFixed(2)
      : '—';
  }

  function nowText() {
    return new Date()
      .toLocaleTimeString(
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
    state.lastSync =
      nowText();

    render();
  }

  function isObject(value) {
    return (
      value !== null &&
      typeof value ===
        'object'
    );
  }

  // =========================
  // 雲端同步碼
  // =========================

  function createChannel() {
    try {
      const saved =
        localStorage.getItem(
          CHANNEL_STORAGE_KEY
        );

      if (
        saved &&
        /^[A-Z0-9]{10}$/.test(
          saved
        )
      ) {
        return saved;
      }
    } catch (_) {}

    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    let result = '';

    try {
      const bytes =
        new Uint8Array(10);

      crypto.getRandomValues(
        bytes
      );

      for (
        const byte
        of bytes
      ) {
        result +=
          chars[
            byte %
            chars.length
          ];
      }

    } catch (_) {
      for (
        let i = 0;
        i < 10;
        i++
      ) {
        result +=
          chars[
            Math.floor(
              Math.random() *
              chars.length
            )
          ];
      }
    }

    try {
      localStorage.setItem(
        CHANNEL_STORAGE_KEY,
        result
      );
    } catch (_) {}

    return result;
  }

  state.cloudChannel =
    createChannel();

  // =========================
  // ATG 資料解析
  // =========================

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
      typeof value.spinId ===
        'string' &&
      Array.isArray(
        value.gameState
      )
    ) {
      output.push(value);
    }

    if (
      Array.isArray(value)
    ) {
      for (
        const item
        of value
      ) {
        collectEngines(
          item,
          output,
          depth + 1,
          seen
        );
      }

    } else {
      for (
        const child
        of Object.values(
          value
        )
      ) {
        if (
          isObject(child)
        ) {
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

  function getViewNumber(
    item
  ) {
    const n =
      toNumber(
        item?.currentView
      );

    return n === null
      ? -1
      : n;
  }

  function getFinalGameState(
    engine
  ) {
    if (
      !Array.isArray(
        engine?.gameState
      ) ||
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

  function engineScore(
    engine
  ) {
    const finalState =
      getFinalGameState(
        engine
      );

    if (!finalState) {
      return -1;
    }

    const current =
      toNumber(
        finalState.currentView
      );

    const total =
      toNumber(
        finalState.totalViews
      );

    return (
      (current ?? -1) *
        1000 +
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

    if (
      Array.isArray(value)
    ) {
      for (
        const item
        of value
      ) {
        const result =
          findBalance(
            item,
            path,
            depth + 1,
            seen
          );

        if (
          result !== null
        ) {
          return result;
        }
      }

      return null;
    }

    for (
      const [key, val]
      of Object.entries(
        value
      )
    ) {
      const nextPath =
        path
          ? `${path}.${key}`
          : key;

      const lowerPath =
        nextPath
          .toLowerCase();

      if (
        String(key)
          .toLowerCase() ===
          'amount' &&
        lowerPath.includes(
          'balance'
        )
      ) {
        const n =
          toNumber(val);

        if (
          n !== null
        ) {
          return n;
        }
      }

      if (
        isObject(val)
      ) {
        const result =
          findBalance(
            val,
            nextPath,
            depth + 1,
            seen
          );

        if (
          result !== null
        ) {
          return result;
        }
      }
    }

    return null;
  }

  function updateStake(
    finalState
  ) {
    const value =
      toNumber(
        finalState?.totalStake
      );

    if (
      value !== null &&
      value !==
        state.stake
    ) {
      state.stake =
        value;

      return true;
    }

    return false;
  }

  function updateFreeGame(
    finalState
  ) {
    let changed = false;

    const freeCount =
      toNumber(
        finalState
          ?.freeGameCount
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
      typeof finalState
        ?.startFreeGame ===
      'boolean'
    ) {
      if (
        state.startFreeGame !==
        finalState
          .startFreeGame
      ) {
        state.startFreeGame =
          finalState
            .startFreeGame;

        changed = true;
      }
    }

    return changed;
  }

  function isFinalView(
    finalState
  ) {
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

    return (
      toNumber(
        finalState
          .totalWinnings
      ) !== null
    );
  }

  function processEngine(
    engine
  ) {
    if (
      !engine?.spinId
    ) {
      return false;
    }

    const spinId =
      String(
        engine.spinId
      );

    const finalState =
      getFinalGameState(
        engine
      );

    if (!finalState) {
      return false;
    }

    state.lastSeenSpinId =
      spinId;

    let changed =
      false;

    if (
      updateStake(
        finalState
      )
    ) {
      changed = true;
    }

    if (
      updateFreeGame(
        finalState
      )
    ) {
      changed = true;
    }

    // 載入舊資料時
    // 不計入本次統計
    if (
      !state.waitingResult
    ) {
      return changed;
    }

    if (
      !state.currentSpinId &&
      state.previousSpinId &&
      spinId ===
        state.previousSpinId
    ) {
      return changed;
    }

    if (
      !state.currentSpinId
    ) {
      state.currentSpinId =
        spinId;
    }

    if (
      spinId !==
      state.currentSpinId
    ) {
      return changed;
    }

    // 必須等最後一個 view
    if (
      !isFinalView(
        finalState
      )
    ) {
      return changed;
    }

    let payout =
      toNumber(
        finalState
          .totalWinnings
      );

    if (
      payout === null
    ) {
      const values =
        engine.gameState
          .map(
            item =>
              toNumber(
                item
                  ?.totalWinnings
              )
          )
          .filter(
            value =>
              value !== null
          );

      if (
        values.length
      ) {
        payout =
          Math.max(
            ...values
          );
      }
    }

    if (
      payout !== null
    ) {
      if (
        state.latestPayout !==
        payout
      ) {
        state.latestPayout =
          payout;

        changed = true;
      }

      if (
        state.maxPayout ===
          null ||
        payout >
          state.maxPayout
      ) {
        state.maxPayout =
          payout;

        changed = true;
      }
    }

    // 相同 spinId
    // 只統計一次
    if (
      !state
        .completedSpinIds
        .has(spinId)
    ) {
      state
        .completedSpinIds
        .add(spinId);

      state.completedSpins++;

      changed = true;
    }

    state.waitingResult =
      false;

    return changed;
  }

  function inspectObject(
    obj
  ) {
    try {
      if (
        !isObject(obj)
      ) {
        return;
      }

      let changed =
        false;

      const balance =
        findBalance(obj);

      if (
        balance !== null &&
        balance !==
          state.balance
      ) {
        state.balance =
          balance;

        changed = true;
      }

      const engines =
        collectEngines(
          obj
        );

      const bestBySpin =
        new Map();

      for (
        const engine
        of engines
      ) {
        if (
          !engine?.spinId
        ) {
          continue;
        }

        const id =
          String(
            engine.spinId
          );

        const previous =
          bestBySpin.get(
            id
          );

        if (
          !previous ||
          engineScore(
            engine
          ) >=
          engineScore(
            previous
          )
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
          processEngine(
            engine
          )
        ) {
          changed =
            true;
        }
      }

      if (changed) {
        sync();
      }

    } catch (_) {}
  }

  function parseText(
    text
  ) {
    const raw =
      String(
        text || ''
      ).trim();

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

    if (
      !positions.length
    ) {
      return;
    }

    const start =
      Math.min(
        ...positions
      );

    try {
      const parsed =
        nativeJSONParse(
          raw.slice(
            start
          )
        );

      inspectObject(
        parsed
      );

    } catch (_) {}
  }

  function startNewRound(
    data
  ) {
    if (
      typeof data !==
      'string'
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

    state.previousSpinId =
      state.lastSeenSpinId;

    state.currentSpinId =
      '';

    state.waitingResult =
      true;

    sync();
  }

  // =========================
  // Cloudflare 同步
  // =========================

  function buildCloudPayload() {
    const hasData =
      state.balance !== null ||
      state.stake !== null ||
      state.latestPayout !== null;

    if (!hasData) {
      return null;
    }

    return {
      channel:
        state.cloudChannel,

      balance:
        state.balance,

      stake:
        state.stake,

      latestPayout:
        state.latestPayout,

      maxPayout:
        state.maxPayout,

      freeGameCount:
        state.freeGameCount ?? 0,

      freeGameActive:
        (
          (
            state.freeGameCount ??
            0
          ) > 0 ||
          state.startFreeGame ===
            true
        ),

      completedSpins:
        state.completedSpins
    };
  }

  async function pushCloud() {
    if (
      state.cloudSending
    ) {
      return;
    }

    const payload =
      buildCloudPayload();

    if (!payload) {
      return;
    }

    const signature =
      JSON.stringify(
        payload
      );

    if (
      signature ===
      state.lastCloudSignature
    ) {
      return;
    }

    state.cloudSending =
      true;

    state.cloudStatus =
      '同步中';

    render();

    try {
      const response =
        await fetch(
          `${WORKER}/push`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify(
                payload
              ),

            credentials:
              'omit',

            cache:
              'no-store'
          }
        );

      const result =
        await response
          .json()
          .catch(
            () => null
          );

      if (
        !response.ok ||
        !result?.ok
      ) {
        throw new Error(
          result?.error ||
          `HTTP ${
            response.status
          }`
        );
      }

      state.lastCloudSignature =
        signature;

      state.cloudStatus =
        '已同步';

      state.cloudTime =
        nowText();

    } catch (_) {
      state.cloudStatus =
        '同步失敗';

    } finally {
      state.cloudSending =
        false;

      render();
    }
  }

  function freeGameText() {
    if (
      state.freeGameCount !==
      null
    ) {
      if (
        state.freeGameCount >
        0
      ) {
        return (
          `剩 ${
            state.freeGameCount
          } 次`
        );
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

  function cloudText() {
    if (
      state.cloudStatus ===
      '已同步'
    ) {
      return (
        `☁️ 雲端已同步 ${
          state.cloudTime
        }`
      );
    }

    if (
      state.cloudStatus ===
      '同步中'
    ) {
      return (
        '☁️ 雲端同步中…'
      );
    }

    if (
      state.cloudStatus ===
      '同步失敗'
    ) {
      return (
        '⚠️ 雲端同步失敗'
      );
    }

    return (
      '☁️ 等待雲端同步'
    );
  }

  // =========================
  // 畫面
  // =========================

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
        <b>${money(
          state.balance
        )}</b>
      </div>

      <div class="xinyaoRow">
        <span>目前押注</span>
        <b>${money(
          state.stake
        )}</b>
      </div>

      <div class="xinyaoRow">
        <span>最新一局派彩</span>
        <b>${money(
          state.latestPayout
        )}</b>
      </div>

      <div class="xinyaoRow">
        <span>本次最高派彩</span>
        <b>${money(
          state.maxPayout
        )}</b>
      </div>

      <div class="xinyaoRow">
        <span>免費遊戲狀態</span>
        <b>${freeGameText()}</b>
      </div>

      <div class="xinyaoRow">
        <span>本次完成轉數</span>
        <b>${
          state.completedSpins
        }</b>
      </div>

      <div class="xinyaoLine"></div>

      <div
        style="
          font-size:10px;
          opacity:.85;
        "
      >
        ${cloudText()}
      </div>

      <div
        style="
          margin-top:4px;
          display:flex;
          justify-content:space-between;
          gap:12px;
          font-size:10px;
        "
      >
        <span
          style="
            opacity:.62;
          "
        >
          網站同步碼
        </span>

        <b
          style="
            font-size:11px;
            letter-spacing:1px;
          "
        >
          ${state.cloudChannel}
        </b>
      </div>

      <div class="xinyaoLine"></div>

      <div
        style="
          text-align:right;
          font-size:10px;
          opacity:.62;
        "
      >
        最後同步 ${
          state.lastSync ||
          '—'
        }
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

    header.onclick =
      () => {
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
      #xinyaoATGV130 .xinyaoRow {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:15px;
        margin:4px 0;
        font-size:11px;
      }

      #xinyaoATGV130 .xinyaoRow span {
        opacity:.78;
      }

      #xinyaoATGV130 .xinyaoRow b {
        font-size:12px;
        font-weight:800;
      }

      #xinyaoATGV130 .xinyaoLine {
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
      'xinyaoATGV130';

    Object.assign(
      panel.style,
      {
        position:
          'fixed',

        top:
          '8px',

        left:
          '8px',

        zIndex:
          '2147483647',

        minWidth:
          '190px',

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
      .appendChild(
        panel
      );

    render();
  }

  // =========================
  // WebSocket / Decoder Hook
  // =========================

  function patchWebSocket() {
    const NativeWS =
      window.WebSocket;

    if (
      !NativeWS ||
      NativeWS
        .__xinyaoV130Wrapped
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

                  return nativeSend
                    .call(
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

          __xinyaoV130Wrapped: {
            value:
              true
          }
        }
      );

    } catch (_) {
      WrappedWS
        .__xinyaoV130Wrapped =
        true;
    }

    window.WebSocket =
      WrappedWS;
  }

  function patchJSON() {
    if (
      JSON.parse
        .__xinyaoV130Wrapped
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
        '__xinyaoV130Wrapped',
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
          .__xinyaoV130Wrapped
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
          '__xinyaoV130Wrapped',
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
        proto
          .__xinyaoV130Wrapped
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

            return nativeOnevent
              .call(
                this,
                packet
              );
          };
      }

      proto
        .__xinyaoV130Wrapped =
        true;

    } catch (_) {}
  }

  // =========================
  // 啟動
  // =========================

  mountPanel();

  patchWebSocket();
  patchJSON();
  patchTextDecoder();

  const patchTimer =
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

  // 每 1.2 秒檢查一次
  // 有新資料才送，不會一直重複寫 KV
  const cloudTimer =
    setInterval(
      () => {
        pushCloud();
      },
      1200
    );

  setTimeout(
    () => {
      clearInterval(
        patchTimer
      );
    },
    60000
  );

})();
