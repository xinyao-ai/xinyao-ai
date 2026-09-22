// ==UserScript==
// @name         芯瑤💕 ATG 即時助手
// @namespace    xinyao-atg-live
// @version      2.2.2
// @description  電腦 / iOS / Android 共用 ATG 即時資料助手；一次配對後自動同步至芯瑤會員帳號。
// @match        https://play.godeebxp.com/*
// @run-at       document-start
// @inject-into  page
// @weight       999
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.__XIANYAO_ATG_LIVE_V202__) return;
  window.__XIANYAO_ATG_LIVE_V202__ = true;

  const WORKER = 'https://xinyao-atg-live.love06130430.workers.dev';
  const TOKEN_KEY = 'xinyao_atg_device_token_v2';
  const DEVICE_ID_KEY = 'xinyao_atg_device_id_v2';
  const nativeJSONParse = JSON.parse.bind(JSON);

  const state = {
    connected: false,
    balance: null,
    stake: null,
    latestPayout: null,
    maxPayout: null,
    freeGameCount: null,
    startFreeGame: null,
    freeGameActive: false,
    freeGameLastPositiveSpinId: '',
    freeGameZeroSpinId: '',
    completedSpins: 0,
    lastSeenSpinId: '',
    previousSpinId: '',
    currentSpinId: '',
    completedSpinIds: new Set(),
    waitingResult: false,
    lastCloseText: '',
    lastCloseAt: 0,
    lastRoundSignalAt: 0,
    lastRoundSignalType: '',
    lastSync: '',
    cloudStatus: '等待配對',
    cloudTime: '',
    replaced: false
  };

  let panel = null;
  let minimized = false;
  let pushTimer = null;
  let pushBusy = false;
  let lastPushSignature = '';
  let deviceToken = localStorage.getItem(TOKEN_KEY) || '';

  function toNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return null;
  }

  function money(value) {
    if (value === null || value === undefined) return '—';
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : '—';
  }

  function nowText() {
    return new Date().toLocaleTimeString('zh-TW', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function randomId(length = 24) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY) || '';
    if (!id) {
      id = randomId(24);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  function platformName() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
    return 'Browser';
  }

  function deviceName() {
    const ua = navigator.userAgent || '';
    const platform = platformName();
    let browser = 'Browser';
    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/Chrome\//i.test(ua) || /CriOS\//i.test(ua)) browser = 'Chrome';
    else if (/Firefox\//i.test(ua) || /FxiOS\//i.test(ua)) browser = 'Firefox';
    else if (/Safari\//i.test(ua)) browser = 'Safari';
    return `${platform} ${browser}`;
  }

  function sync() {
    state.lastSync = nowText();
    render();
    schedulePush();
  }

  function safeObject(value) {
    return value && typeof value === 'object';
  }

  function collectEngines(value, out = [], depth = 0, seen = new WeakSet()) {
    if (!safeObject(value) || depth > 18 || seen.has(value)) return out;
    seen.add(value);

    if (typeof value.spinId === 'string' && Array.isArray(value.gameState)) {
      out.push(value);
    }

    if (Array.isArray(value)) {
      for (const item of value) collectEngines(item, out, depth + 1, seen);
    } else {
      for (const child of Object.values(value)) {
        if (safeObject(child)) collectEngines(child, out, depth + 1, seen);
      }
    }

    return out;
  }

  function getFinalGameState(engine) {
    if (!Array.isArray(engine?.gameState) || !engine.gameState.length) return null;

    let best = engine.gameState[engine.gameState.length - 1];
    for (const item of engine.gameState) {
      const current = toNumber(item?.currentView);
      const bestCurrent = toNumber(best?.currentView);
      if (current !== null && (bestCurrent === null || current >= bestCurrent)) best = item;
    }
    return best;
  }

  function isFinalGameState(item) {
    if (!item) return false;
    const current = toNumber(item.currentView);
    const total = toNumber(item.totalViews);
    if (current === null || total === null || total <= 0) return true;
    return current >= total - 1;
  }

  function readFreeGameSignal(engine) {
    const states = Array.isArray(engine?.gameState) ? engine.gameState : [];
    let sawExplicit = false;
    let startSignal = false;
    let positiveCount = null;
    let lastCount = null;

    for (const item of states) {
      if (!item || typeof item !== 'object') continue;

      if (typeof item.startFreeGame === 'boolean') {
        sawExplicit = true;
        if (item.startFreeGame) startSignal = true;
      }

      const count = toNumber(item.freeGameCount);
      if (count !== null) {
        sawExplicit = true;
        lastCount = Math.max(0, count);
        if (count > 0) positiveCount = count;
      }
    }

    const count = positiveCount !== null ? positiveCount : lastCount;
    return {
      sawExplicit,
      startSignal,
      count,
      activeSignal: startSignal || (count !== null && count > 0)
    };
  }

  function computeFreeGameState(previous, engine, spinId) {
    const prev = previous || {};
    const next = {
      active: Boolean(prev.active),
      count: prev.count ?? null,
      start: prev.start ?? null,
      lastPositiveSpinId: String(prev.lastPositiveSpinId || ''),
      zeroSpinId: String(prev.zeroSpinId || '')
    };

    const signal = readFreeGameSignal(engine);
    if (!signal.sawExplicit) return next;

    if (signal.activeSignal) {
      next.active = true;
      next.start = Boolean(signal.startSignal);
      if (signal.count !== null && signal.count > 0) {
        next.count = signal.count;
      } else if (next.count === null) {
        next.count = 0;
      }
      next.lastPositiveSpinId = String(spinId || '');
      next.zeroSpinId = '';
      return next;
    }

    if (!next.active) {
      next.count = signal.count ?? 0;
      next.start = false;
      next.zeroSpinId = '';
      return next;
    }

    const currentSpinId = String(spinId || '');

    // 觸發免遊的同一個 spin 內，最後一個 view 可能又回報 0 / false。
    // 同一 spin 不可因此把剛偵測到的免遊狀態清掉。
    if (!currentSpinId || currentSpinId === next.lastPositiveSpinId) {
      return next;
    }

    // ATG 偶爾會有一個零值封包夾在免遊流程中。
    // 連續兩個不同 spin 都明確回報 0 / false，才確認免遊已結束。
    if (!next.zeroSpinId) {
      next.zeroSpinId = currentSpinId;
      return next;
    }

    if (next.zeroSpinId !== currentSpinId) {
      next.active = false;
      next.count = 0;
      next.start = false;
      next.lastPositiveSpinId = '';
      next.zeroSpinId = '';
    }

    return next;
  }

  function freeGameTextFor(snapshot) {
    const active = Boolean(snapshot?.active);
    const count = toNumber(snapshot?.count);

    if (active) {
      return count !== null && count > 0 ? `剩 ${count} 次` : '進行中';
    }

    if (count === null && snapshot?.start == null) return '—';
    return '未進行';
  }

  function findBalance(value, path = '', depth = 0, seen = new WeakSet()) {
    if (!safeObject(value) || depth > 18 || seen.has(value)) return null;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findBalance(item, path, depth + 1, seen);
        if (found !== null) return found;
      }
      return null;
    }

    for (const [key, val] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      const lowerPath = nextPath.toLowerCase();
      if (String(key).toLowerCase() === 'amount' && lowerPath.includes('balance')) {
        const n = toNumber(val);
        if (n !== null) return n;
      }
      if (safeObject(val)) {
        const found = findBalance(val, nextPath, depth + 1, seen);
        if (found !== null) return found;
      }
    }
    return null;
  }

  function updateGeneralFromEngine(engine, finalState, spinId) {
    let changed = false;

    if (finalState) {
      const stake = toNumber(finalState.totalStake);
      if (stake !== null && state.stake !== stake) {
        state.stake = stake;
        changed = true;
      }
    }

    const nextFreeGame = computeFreeGameState(
      {
        active: state.freeGameActive,
        count: state.freeGameCount,
        start: state.startFreeGame,
        lastPositiveSpinId: state.freeGameLastPositiveSpinId,
        zeroSpinId: state.freeGameZeroSpinId
      },
      engine,
      spinId
    );

    if (state.freeGameActive !== nextFreeGame.active) {
      state.freeGameActive = nextFreeGame.active;
      changed = true;
    }
    if (state.freeGameCount !== nextFreeGame.count) {
      state.freeGameCount = nextFreeGame.count;
      changed = true;
    }
    if (state.startFreeGame !== nextFreeGame.start) {
      state.startFreeGame = nextFreeGame.start;
      changed = true;
    }
    if (state.freeGameLastPositiveSpinId !== nextFreeGame.lastPositiveSpinId) {
      state.freeGameLastPositiveSpinId = nextFreeGame.lastPositiveSpinId;
      changed = true;
    }
    if (state.freeGameZeroSpinId !== nextFreeGame.zeroSpinId) {
      state.freeGameZeroSpinId = nextFreeGame.zeroSpinId;
      changed = true;
    }

    return changed;
  }

  function processEngine(engine) {
    if (!engine?.spinId) return false;

    const spinId = String(engine.spinId);
    const finalState = getFinalGameState(engine);
    state.lastSeenSpinId = spinId;

    let changed = updateGeneralFromEngine(engine, finalState, spinId);
    if (!state.waitingResult) return changed;

    if (!state.currentSpinId && state.previousSpinId && spinId === state.previousSpinId) {
      return changed;
    }

    if (!state.currentSpinId) state.currentSpinId = spinId;

    // 自動轉時，ATG 可能不會每一局都送出 closeSpin。
    // 若上一個 spin 已完成，而封包出現新的 final spinId，視為下一局自動轉結果。
    if (spinId !== state.currentSpinId) {
      if (
        finalState &&
        isFinalGameState(finalState) &&
        state.completedSpinIds.has(state.currentSpinId)
      ) {
        state.previousSpinId = state.currentSpinId;
        state.currentSpinId = spinId;
      } else {
        return changed;
      }
    }

    if (!finalState || !isFinalGameState(finalState)) return changed;

    let payout = toNumber(finalState.totalWinnings);
    if (payout === null) {
      const candidates = engine.gameState
        .filter(isFinalGameState)
        .map(x => toNumber(x?.totalWinnings))
        .filter(x => x !== null);
      if (candidates.length) payout = Math.max(...candidates);
    }

    if (payout !== null) {
      if (state.latestPayout !== payout) {
        state.latestPayout = payout;
        changed = true;
      }
      if (state.maxPayout === null || payout > state.maxPayout) {
        state.maxPayout = payout;
        changed = true;
      }
    }

    if (!state.completedSpinIds.has(spinId)) {
      state.completedSpinIds.add(spinId);
      state.completedSpins += 1;
      changed = true;
    }

    return changed;
  }

  function inspectObject(obj) {
    try {
      if (!safeObject(obj)) return;
      let changed = false;

      const balance = findBalance(obj);
      if (balance !== null && state.balance !== balance) {
        state.balance = balance;
        changed = true;
      }

      const engines = collectEngines(obj);
      const bySpin = new Map();
      for (const engine of engines) {
        if (engine?.spinId) bySpin.set(String(engine.spinId), engine);
      }
      for (const engine of bySpin.values()) {
        if (processEngine(engine)) changed = true;
      }

      if (changed) sync();
    } catch (_) {}
  }

  function parseText(text) {
    const raw = String(text || '').trim();
    if (!raw) return;

    const positions = [raw.indexOf('['), raw.indexOf('{')].filter(index => index >= 0);
    if (!positions.length) return;
    const start = Math.min(...positions);

    try {
      inspectObject(nativeJSONParse(raw.slice(start)));
    } catch (_) {}
  }

  async function inspectMessageData(data) {
    try {
      if (typeof data === 'string') {
        parseText(data);
        return;
      }
      if (data instanceof ArrayBuffer) {
        parseText(new TextDecoder().decode(new Uint8Array(data)));
        return;
      }
      if (ArrayBuffer.isView(data)) {
        parseText(new TextDecoder().decode(data));
        return;
      }
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        parseText(await data.text());
      }
    } catch (_) {}
  }

  function startNewRound(data) {
    if (typeof data !== 'string') return;
    const text = String(data);

    // 手動轉通常會出現 closeSpin；自動轉較常只持續送 spin。
    // 兩種都納入，並避免同一局 spin + closeSpin 被重複當成兩局。
    const isCloseSpin = text.includes('closeSpin');
    const isSpin = /[\[,{]\s*["']spin["']\s*[,}\]]/i.test(text);
    if (!isCloseSpin && !isSpin) return;

    const time = Date.now();
    const signalType = isSpin ? 'spin' : 'closeSpin';

    if (
      signalType === 'closeSpin' &&
      state.lastRoundSignalType === 'spin' &&
      time - state.lastRoundSignalAt < 1200
    ) {
      return;
    }

    if (
      signalType === state.lastRoundSignalType &&
      time - state.lastRoundSignalAt < 250
    ) {
      return;
    }

    state.lastRoundSignalAt = time;
    state.lastRoundSignalType = signalType;
    state.lastCloseText = text;
    state.lastCloseAt = time;
    state.previousSpinId = state.lastSeenSpinId;
    state.currentSpinId = '';
    state.waitingResult = true;
    sync();
  }

  function freeGameText() {
    return freeGameTextFor({
      active: state.freeGameActive,
      count: state.freeGameCount,
      start: state.startFreeGame
    });
  }

  function connectionText() {
    return state.connected ? '● 即時連線中' : '● 等待遊戲資料';
  }

  function cloudText() {
    if (state.replaced) return '⚠️ 此裝置已被新裝置取代';
    if (!deviceToken) return '尚未綁定會員帳號';
    return state.cloudStatus || '等待同步';
  }

  function payload() {
    return {
      balance: state.balance,
      stake: state.stake,
      latestPayout: state.latestPayout,
      maxPayout: state.maxPayout,
      freeGameCount: state.freeGameCount,
      freeGameActive: state.freeGameActive,
      completedSpins: state.completedSpins
    };
  }

  function payloadSignature() {
    return JSON.stringify(payload());
  }

  function schedulePush() {
    if (!deviceToken || pushTimer) return;
    pushTimer = setTimeout(() => {
      pushTimer = null;
      pushCloud(false);
    }, 250);
  }

  async function pushCloud(force = false) {
    if (!deviceToken || pushBusy) return;
    const signature = payloadSignature();
    if (!force && signature === lastPushSignature) return;

    pushBusy = true;
    try {
      const response = await fetch(`${WORKER}/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceToken}`
        },
        body: JSON.stringify(payload())
      });
      const result = await response.json().catch(() => ({}));

      if (response.status === 401 || response.status === 409) {
        localStorage.removeItem(TOKEN_KEY);
        deviceToken = '';
        state.replaced = response.status === 409 || result?.error === 'device_replaced';
        state.cloudStatus = state.replaced ? '裝置已失效' : '需要重新配對';
        render();
        return;
      }

      if (!response.ok || !result?.ok) throw new Error(result?.error || 'sync_failed');

      lastPushSignature = signature;
      state.cloudStatus = '☁️ 雲端已同步';
      state.cloudTime = nowText();
      render();
    } catch (_) {
      state.cloudStatus = '☁️ 雲端暫時連不上';
      render();
    } finally {
      pushBusy = false;
    }
  }

  async function claimPairCode(code) {
    const pairCode = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (pairCode.length < 4) throw new Error('請輸入配對碼');

    state.cloudStatus = '正在配對…';
    state.replaced = false;
    render();

    const response = await fetch(`${WORKER}/pair/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairCode,
        deviceId: getDeviceId(),
        deviceName: deviceName(),
        platform: platformName()
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok || !result?.deviceToken) {
      throw new Error(
        result?.error === 'pair_code_invalid_or_expired'
          ? '配對碼無效或已過期'
          : (result?.message || '配對失敗')
      );
    }

    deviceToken = result.deviceToken;
    localStorage.setItem(TOKEN_KEY, deviceToken);
    state.cloudStatus = '✅ 已綁定會員帳號';
    state.replaced = false;
    lastPushSignature = '';
    render();
    await pushCloud(true);
    return true;
  }

  function render() {
    if (!panel) return;

    if (minimized) {
      panel.innerHTML = `
        <div id="xinyaoHeader" style="font-weight:800;font-size:13px;cursor:pointer;">🌸 芯瑤 ATG</div>
        <div style="font-size:10px;margin-top:2px;opacity:.8;">${connectionText()}</div>
      `;
      bindPanelEvents();
      return;
    }

    const pairBox = !deviceToken ? `
      <div class="xinyaoLine"></div>
      <div style="font-size:10px;line-height:1.45;opacity:.84;margin-bottom:6px;">
        第一次使用請輸入芯瑤網站顯示的配對碼
      </div>
      <div style="display:flex;gap:5px;">
        <input id="xinyaoPairInput" maxlength="12" placeholder="配對碼"
          style="width:100px;min-width:0;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:rgba(255,255,255,.09);color:#fff;padding:6px 7px;font-size:11px;outline:none;text-transform:uppercase;">
        <button id="xinyaoPairButton" type="button"
          style="border:0;border-radius:8px;background:#ff5f9e;color:#fff;padding:6px 8px;font-size:11px;font-weight:800;cursor:pointer;">綁定</button>
      </div>
      <div id="xinyaoPairMessage" style="font-size:9px;margin-top:5px;opacity:.68;"></div>
    ` : '';

    panel.innerHTML = `
      <div id="xinyaoHeader" style="display:flex;justify-content:space-between;align-items:center;gap:12px;cursor:pointer;">
        <div style="font-size:14px;font-weight:800;">🌸 芯瑤 ATG 即時助手</div>
        <div style="font-size:12px;opacity:.7;">－</div>
      </div>
      <div style="margin-top:3px;font-size:10px;opacity:.82;">${connectionText()}</div>
      <div style="margin-top:2px;font-size:9px;opacity:.68;">${cloudText()}${state.cloudTime ? ` ${state.cloudTime}` : ''}</div>
      <div class="xinyaoLine"></div>
      <div class="xinyaoRow"><span>目前點數</span><b>${money(state.balance)}</b></div>
      <div class="xinyaoRow"><span>目前押注</span><b>${money(state.stake)}</b></div>
      <div class="xinyaoRow"><span>最新一局派彩</span><b>${money(state.latestPayout)}</b></div>
      <div class="xinyaoRow"><span>本次最高派彩</span><b>${money(state.maxPayout)}</b></div>
      <div class="xinyaoRow"><span>免費遊戲狀態</span><b>${freeGameText()}</b></div>
      <div class="xinyaoRow"><span>本次完成轉數</span><b>${state.completedSpins}</b></div>
      <div class="xinyaoLine"></div>
      <div style="text-align:right;font-size:10px;opacity:.62;">最後同步 ${state.lastSync || '—'}</div>
      <div style="margin-top:2px;text-align:right;font-size:9px;opacity:.45;">僅統計本次開啟遊戲後資料</div>
      ${pairBox}
    `;

    bindPanelEvents();
  }

  function bindPanelEvents() {
    const header = panel?.querySelector('#xinyaoHeader');
    if (header) {
      header.onclick = () => {
        minimized = !minimized;
        render();
      };
    }

    const button = panel?.querySelector('#xinyaoPairButton');
    const input = panel?.querySelector('#xinyaoPairInput');
    const message = panel?.querySelector('#xinyaoPairMessage');

    if (input) {
      input.addEventListener('input', () => {
        input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') button?.click();
      });
    }

    if (button) {
      button.onclick = async event => {
        event.stopPropagation();
        button.disabled = true;
        try {
          await claimPairCode(input?.value);
        } catch (error) {
          if (message) message.textContent = error?.message || '配對失敗';
          state.cloudStatus = '配對失敗';
          render();
        } finally {
          button.disabled = false;
        }
      };
    }
  }

  function mountPanel() {
    if (panel || !document.documentElement) return;

    const style = document.createElement('style');
    style.textContent = `
      #xinyaoATGLiveV200 .xinyaoRow { display:flex;justify-content:space-between;align-items:center;gap:15px;margin:4px 0;font-size:11px; }
      #xinyaoATGLiveV200 .xinyaoRow span { opacity:.78; }
      #xinyaoATGLiveV200 .xinyaoRow b { font-size:12px;font-weight:800; }
      #xinyaoATGLiveV200 .xinyaoLine { height:1px;margin:7px 0;background:rgba(255,255,255,.14); }
      #xinyaoATGLiveV200 input::placeholder { color:rgba(255,255,255,.48); }
    `;
    document.documentElement.appendChild(style);

    panel = document.createElement('div');
    panel.id = 'xinyaoATGLiveV200';
    Object.assign(panel.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      zIndex: '2147483647',
      minWidth: '190px',
      padding: '9px 11px',
      color: '#fff',
      background: 'rgba(24,20,31,.92)',
      border: '1px solid rgba(255,255,255,.20)',
      borderRadius: '14px',
      boxShadow: '0 5px 20px rgba(0,0,0,.32)',
      fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      userSelect: 'none',
      WebkitUserSelect: 'none'
    });

    document.documentElement.appendChild(panel);
    render();
  }

  function patchWebSocket() {
    const NativeWS = window.WebSocket;
    if (!NativeWS || NativeWS.__xinyaoLiveV200Wrapped) return;

    const WrappedWS = new Proxy(NativeWS, {
      construct(Target, args, NewTarget) {
        const ws = Reflect.construct(Target, args, NewTarget);
        state.connected = true;
        sync();

        try {
          ws.addEventListener('message', event => {
            inspectMessageData(event.data);
          }, true);
        } catch (_) {}

        try {
          const nativeSend = ws.send;
          ws.send = function(data) {
            startNewRound(data);
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
        __xinyaoLiveV200Wrapped: { value: true }
      });
    } catch (_) {
      WrappedWS.__xinyaoLiveV200Wrapped = true;
    }

    window.WebSocket = WrappedWS;
  }

  function patchJSON() {
    if (JSON.parse.__xinyaoLiveV200Wrapped) return;

    const wrapped = function(...args) {
      const result = nativeJSONParse(...args);
      try { inspectObject(result); } catch (_) {}
      return result;
    };

    try {
      Object.defineProperty(wrapped, '__xinyaoLiveV200Wrapped', { value: true });
    } catch (_) {}
    JSON.parse = wrapped;
  }

  function patchTextDecoder() {
    try {
      if (!window.TextDecoder) return;
      const current = TextDecoder.prototype.decode;
      if (current.__xinyaoLiveV200Wrapped) return;
      const nativeDecode = current;

      const wrapped = function(...args) {
        const text = nativeDecode.apply(this, args);
        try { parseText(text); } catch (_) {}
        return text;
      };

      try {
        Object.defineProperty(wrapped, '__xinyaoLiveV200Wrapped', { value: true });
      } catch (_) {}
      TextDecoder.prototype.decode = wrapped;
    } catch (_) {}
  }

  function patchSocketIO() {
    try {
      const proto = window.io?.Socket?.prototype;
      if (!proto || proto.__xinyaoLiveV200Wrapped) return;
      if (typeof proto.onevent === 'function') {
        const nativeOnevent = proto.onevent;
        proto.onevent = function(packet) {
          try { if (packet?.data) inspectObject(packet.data); } catch (_) {}
          return nativeOnevent.call(this, packet);
        };
      }
      proto.__xinyaoLiveV200Wrapped = true;
    } catch (_) {}
  }


  if (window.__XIANYAO_ATG_TEST_MODE__) {
    window.__XIANYAO_ATG_LIVE_TEST__ = {
      readFreeGameSignal,
      computeFreeGameState,
      freeGameTextFor
    };
  }

  mountPanel();
  patchWebSocket();
  patchJSON();
  patchTextDecoder();

  const patchTimer = setInterval(() => {
    mountPanel();
    patchWebSocket();
    patchJSON();
    patchTextDecoder();
    patchSocketIO();
  }, 100);
  setTimeout(() => clearInterval(patchTimer), 60000);

  setInterval(() => {
    if (deviceToken) pushCloud(false);
  }, 1200);

  if (deviceToken) {
    state.cloudStatus = '☁️ 已綁定，等待同步';
    setTimeout(() => pushCloud(true), 1200);
  }
})();


/* ===== 芯瑤 ATG 全房分析 v2.1.4｜配對成功後自動顯示 ===== */
(() => {
  'use strict';

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const finiteNumber = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const safeRate = (win, bet) => {
    const w = finiteNumber(win);
    const b = finiteNumber(bet);
    if (w === null || b === null || b <= 0) return null;
    return (w / b) * 100;
  };

  function normalizeRoom(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const roomId = finiteNumber(obj.roomId);
    const number = finiteNumber(obj.number);
    if (roomId === null) return null;

    return {
      roomId,
      number,
      status: typeof obj.status === 'string' ? obj.status : null,
      bet: finiteNumber(obj.bet),
      win: finiteNumber(obj.win),
      today: {
        bet: finiteNumber(obj.today?.bet),
        win: finiteNumber(obj.today?.win)
      },
      updatedAt: new Date().toISOString()
    };
  }

  function calculateMetrics(room) {
    const todayRate = safeRate(room?.today?.win, room?.today?.bet);
    const totalRate = safeRate(room?.win, room?.bet);

    const weightedDelta = (rate, bet, scale, maxAbs) => {
      if (rate === null) return null;
      const volume = Math.max(0, finiteNumber(bet) || 0);
      const weight = clamp(Math.log10(volume + 1) / scale, 0.2, 1);
      return clamp((rate - 100) * weight, -maxAbs, maxAbs);
    };

    const td = weightedDelta(todayRate, room?.today?.bet, 5.5, 45);
    const cd = weightedDelta(totalRate, room?.bet, 6, 35);

    let observationScore = null;
    if (td !== null || cd !== null) {
      if (td !== null && cd !== null) {
        observationScore = clamp(50 + td * 0.65 + cd * 0.35, 0, 100);
      } else if (td !== null) {
        observationScore = clamp(50 + td, 0, 100);
      } else {
        observationScore = clamp(50 + cd, 0, 100);
      }
    }

    return {
      todayRate,
      totalRate,
      observationScore,
      todayBet: finiteNumber(room?.today?.bet),
      totalBet: finiteNumber(room?.bet)
    };
  }

  function rankRooms(rooms, options = {}) {
    const {
      onlyEmpty = true,
      mode = 'observation'
    } = options;

    const prepared = (rooms || [])
      .filter(Boolean)
      .filter(r => finiteNumber(r.number) !== null)
      .filter(r => !onlyEmpty || r.status === 'Empty')
      .map(r => ({ ...r, metrics: calculateMetrics(r) }));

    const value = (r) => {
      if (mode === 'today') return r.metrics.todayRate;
      if (mode === 'total') return r.metrics.totalRate;
      if (mode === 'todayBet') return r.metrics.todayBet;
      return r.metrics.observationScore;
    };

    return prepared.sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (av === null && bv === null) return a.number - b.number;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (bv !== av) return bv - av;
      return a.number - b.number;
    });
  }

  function countNumberedRooms(rooms) {
    return (rooms || []).filter(r => finiteNumber(r?.number) !== null).length;
  }

  function buildScanSequence(startPage, totalPages) {
    const total = Math.max(1, finiteNumber(totalPages) || 1);
    const start = clamp(finiteNumber(startPage) || 1, 1, total);
    return Array.from({ length: total }, (_, i) => ((start + i) % total) + 1);
  }

  function buildMissingScanSequence(startPage, totalPages, seenPages = new Set()) {
    const total = Math.max(1, finiteNumber(totalPages) || 1);
    const start = clamp(finiteNumber(startPage) || 1, 1, total);
    const seen = new Set(
      [...(seenPages instanceof Set ? seenPages : (Array.isArray(seenPages) ? seenPages : []))]
        .map(finiteNumber)
        .filter(p => p !== null && p >= 1 && p <= total)
    );
    const ascending = [];
    for (let page = 1; page <= total; page++) {
      if (!seen.has(page)) ascending.push(page);
    }
    if (!ascending.length) return [];
    const descending = [...ascending].reverse();
    const ascDistance = Math.abs(ascending[0] - start);
    const descDistance = Math.abs(descending[0] - start);
    return descDistance < ascDistance ? descending : ascending;
  }

  function buildPageCalibration(samples) {
    const unique = new Map();
    for (const sample of samples || []) {
      const page = finiteNumber(sample?.page);
      const x = finiteNumber(sample?.x);
      const y = finiteNumber(sample?.y);
      if (page === null || x === null || y === null) continue;
      if (page < 1 || page > 99 || x < 0 || x > 1 || y < 0 || y > 1) continue;
      unique.set(page, { page, x, y });
    }
    const rows = [...unique.values()].sort((a, b) => a.page - b.page);
    if (rows.length < 2) return null;
    const a = rows[0];
    const b = rows[rows.length - 1];
    if (a.page === b.page) return null;
    const stepX = (b.x - a.x) / (b.page - a.page);
    if (!Number.isFinite(stepX) || Math.abs(stepX) < 0.002) return null;
    const startX = a.x - stepX * (a.page - 1);
    const y = (a.y + b.y) / 2;
    return { startX, stepX, y, samplePages: [a.page, b.page] };
  }

  function pagePoint(calibration, page) {
    if (!calibration) return null;
    const p = finiteNumber(page);
    if (p === null) return null;
    const x = finiteNumber(calibration.startX);
    const stepX = finiteNumber(calibration.stepX);
    const y = finiteNumber(calibration.y);
    if (x === null || stepX === null || y === null) return null;
    return { x: x + stepX * (p - 1), y };
  }


  function correctPageClickX(clickedX, targetPage, landedPage, stepX) {
    const x = finiteNumber(clickedX);
    const target = finiteNumber(targetPage);
    const landed = finiteNumber(landedPage);
    const step = finiteNumber(stepX);
    if (x === null || target === null || landed === null || step === null || step === 0) return x;
    return clamp(x + (target - landed) * step, 0.01, 0.99);
  }

  function buildProbeOffsets(stepX) {
    const step = Math.abs(finiteNumber(stepX) || 0.04);
    return [0, -step * 0.4, step * 0.4, -step * 0.8, step * 0.8, -step * 1.2, step * 1.2];
  }

  function pageNumberFromText(text) {
    const value = String(text ?? '').trim();
    return /^[1-9]$/.test(value) ? Number(value) : null;
  }

  function upsertCalibrationSample(samples, page, x, y) {
    const p = pageNumberFromText(page);
    const nx = finiteNumber(x);
    const ny = finiteNumber(y);
    const list = Array.isArray(samples) ? samples.slice() : [];
    if (p === null || nx === null || ny === null) return list;
    const next = list.filter(sample => finiteNumber(sample?.page) !== p);
    next.push({ page: p, x: nx, y: ny });
    return next;
  }

  function resolveTrackedPage(metaPage, intentPage, previousPage, preferClickedPage = false) {
    const intended = finiteNumber(intentPage);
    const previous = finiteNumber(previousPage);
    const meta = finiteNumber(metaPage);
    if (intended !== null) return intended;
    if (preferClickedPage && previous !== null) return previous;
    return meta;
  }

  const SCRIPT_VERSION = '2.1.4';

  function getVersion() {
    return SCRIPT_VERSION;
  }

  function buildSyncPayload(rooms, summary = {}) {
    const safeRooms = (Array.isArray(rooms) ? rooms : [])
      .map(normalizeRoom)
      .filter(Boolean)
      .map(room => ({
        roomId: room.roomId,
        number: room.number,
        status: room.status,
        today: {
          bet: room.today?.bet ?? null,
          win: room.today?.win ?? null
        },
        bet: room.bet ?? null,
        win: room.win ?? null
      }));

    return {
      type: 'XIANYAO_ATG_ROOM_SNAPSHOT_V1',
      version: SCRIPT_VERSION,
      capturedAt: new Date().toISOString(),
      summary: {
        roomsKnown: safeRooms.length,
        totalTableCount: finiteNumber(summary.totalTableCount) ?? safeRooms.length,
        totalPages: finiteNumber(summary.totalPages),
        pagesSeen: summary.pagesSeen instanceof Set
          ? [...summary.pagesSeen].sort((a, b) => a - b)
          : (Array.isArray(summary.pagesSeen) ? summary.pagesSeen.slice() : [])
      },
      rooms: safeRooms
    };
  }

  function resolvePanelAction(id) {
    const actions = {
      'xinyao-scan-all': 'scan',
      'xinyao-stop': 'stop',
      'xinyao-room-copy': 'copy',
      'xinyao-expand': 'expand',
      'xinyao-room-hide': 'hide',
      'xinyao-prev': 'prev',
      'xinyao-next': 'next',
      'xinyao-calibrate': 'calibrate',
      'xinyao-sync-site': 'sync'
    };
    return actions[id] || null;
  }

  const core = {
    normalizeRoom,
    calculateMetrics,
    rankRooms,
    countNumberedRooms,
    buildScanSequence,
    buildMissingScanSequence,
    getVersion,
    resolvePanelAction,
    buildPageCalibration,
    pagePoint,
    correctPageClickX,
    buildProbeOffsets,
    pageNumberFromText,
    upsertCalibrationSample,
    resolveTrackedPage,
    buildSyncPayload
  };

  if (typeof globalThis !== 'undefined' && globalThis.__XIANYAO_ATG_TEST__) {
    globalThis.__XIANYAO_ATG_CORE__ = core;
    return;
  }

  if (window.__XIANYAO_ATG_ROOM_SCANNER_V200__) return;
  window.__XIANYAO_ATG_ROOM_SCANNER_V200__ = true;

  const VERSION = SCRIPT_VERSION;
  const SENSITIVE_KEY = /(token|cookie|authorization|password|passwd|secret|username|userid|user_id|email|phone|login|session|ticket|credential|access[_-]?key|^t$)/i;
  const INTERESTING_TEXT = /(room|table|page|lobby|slotTableUpdated|tableMeta|totalTableCount)/i;
  const nativeJSONParse = JSON.parse.bind(JSON);

  const ui = {
    expanded: false,
    filter: 'All',
    sort: 'number',
    search: '',
    roomListPage: 1,
    perPage: 100,
    rankMode: 'observation',
    topN: 10,
    autoRefreshMins: 0
  };

  const state = {
    enabled: true,
    roomMap: new Map(),
    pagesSeen: new Set(),
    dataPagesSeen: new Set(),
    totalTableCount: 0,
    tablePerPage: 0,
    totalPages: 0,
    currentPage: null,
    pageIntent: null,
    preferClickedPage: false,
    events: [],
    lastSource: '等待資料',
    pageLoadSeq: 0,
    panel: null,
    scanRunning: false,
    scanAbort: false,
    scanVisited: new Set(),
    scanMessage: '尚未開始全房掃描',
    scanError: '',
    learningPageNav: false,
    learningStartPage: null,
    learningEvents: [],
    learningResult: [],
    pageCalibration: null,
    calibrationActive: false,
    calibrationSamples: [],
    calibrationPendingPointer: null,
    calibrationThenScan: false,
    autoTimer: null,
    renderTimer: null
  };

  function setPageIntent(page) {
    const p = finiteNumber(page);
    if (p === null || p < 1 || p > 9) return null;
    state.pageIntent = { page: p, ts: Date.now() };
    state.preferClickedPage = true;
    return p;
  }

  function freshPageIntent(maxAge = 6000) {
    const intent = state.pageIntent;
    if (!intent) return null;
    if (Date.now() - Number(intent.ts || 0) > maxAge) {
      state.pageIntent = null;
      return null;
    }
    return intent;
  }

  function clickedPageFromTarget(target) {
    let el = target && target.nodeType === 1 ? target : target?.parentElement;
    for (let depth = 0; el && depth < 5; depth++, el = el.parentElement) {
      if (el.closest?.('#xinyao-atg-room-scanner,#xinyao-room-mini,#xinyao-copy-modal')) return null;
      const page = pageNumberFromText(el.textContent);
      if (page !== null) return page;
    }
    return null;
  }

  const now = () => new Date().toLocaleTimeString('zh-TW', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const CALIBRATION_KEY = 'xinyao_atg_page_calibration_v2';

  function loadPageCalibration() {
    try {
      const raw = localStorage.getItem(CALIBRATION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const test = pagePoint(parsed, 1);
      return test && test.x >= 0 && test.x <= 1 && test.y >= 0 && test.y <= 1 ? parsed : null;
    } catch {
      return null;
    }
  }

  function savePageCalibration(calibration) {
    state.pageCalibration = calibration || null;
    try {
      if (calibration) localStorage.setItem(CALIBRATION_KEY, JSON.stringify(calibration));
      else localStorage.removeItem(CALIBRATION_KEY);
    } catch {}
  }

  state.pageCalibration = loadPageCalibration();

  function startPageCalibration({ thenScan = false } = {}) {
    state.calibrationActive = true;
    state.calibrationSamples = [];
    state.calibrationPendingPointer = null;
    state.calibrationThenScan = thenScan;
    state.scanError = '';
    state.scanMessage = '🧭 校準中 0/2：請手動點兩個不同頁碼（建議 2 → 9）。';
    scheduleRender();
  }

  function finishPageCalibrationIfReady() {
    const calibration = buildPageCalibration(state.calibrationSamples);
    if (!calibration) return false;
    savePageCalibration(calibration);
    state.calibrationActive = false;
    state.calibrationPendingPointer = null;
    state.scanMessage = state.calibrationThenScan
      ? `✅ 頁碼校準完成（${calibration.samplePages.join('、')}）｜正在掃描尚未抓取的頁面…`
      : `✅ 頁碼校準完成（${calibration.samplePages.join('、')}）｜可按「一鍵掃描 4100 房」`;
    scheduleRender();
    if (state.calibrationThenScan) {
      state.calibrationThenScan = false;
      setTimeout(() => scanAllPages(), 500);
    }
    return true;
  }

  function captureCalibrationPointer(event) {
    if (!state.calibrationActive) return;
    const target = event.target;
    if (target?.closest?.('#xinyao-atg-room-scanner,#xinyao-room-mini,#xinyao-copy-modal')) return;
    if (!window.innerWidth || !window.innerHeight) return;

    const pointer = {
      x: event.clientX / window.innerWidth,
      y: event.clientY / window.innerHeight,
      ts: Date.now()
    };
    state.calibrationPendingPointer = pointer;

    // 部分裝置的 tableMeta.currentPage 會停在舊頁。
    // 校準直接採用使用者實際點到的頁碼，不再等待 meta.currentPage 變化。
    const clickedPage = clickedPageFromTarget(target);
    if (clickedPage !== null) {
      setPageIntent(clickedPage);
      state.calibrationSamples = upsertCalibrationSample(
        state.calibrationSamples,
        clickedPage,
        pointer.x,
        pointer.y
      );
      state.calibrationPendingPointer = null;

      const pages = state.calibrationSamples.map(sample => sample.page).sort((a, b) => a - b);
      state.scanMessage = pages.length === 1
        ? `🧭 校準中 1/2：已記錄第 ${pages[0]} 頁，請再點另一個不同頁碼（建議第 9 頁）`
        : `🧭 已記錄頁碼 ${pages.join('、')}`;
      finishPageCalibrationIfReady();
      scheduleRender();
    }
  }

  document.addEventListener('pointerdown', captureCalibrationPointer, true);

  function scheduleRender() {
    if (state.renderTimer) return;
    state.renderTimer = setTimeout(() => {
      state.renderTimer = null;
      render();
    }, 80);
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

  function numberedRooms() {
    return [...state.roomMap.values()].filter(r => finiteNumber(r.number) !== null);
  }

  function numberedCount() {
    return countNumberedRooms(numberedRooms());
  }

  function recordEvent(type, payload = {}) {
    if (!state.enabled) return;
    const entry = { ts: Date.now(), time: now(), type, ...payload };
    state.events.push(entry);
    if (state.events.length > 500) state.events.shift();

    if (state.learningPageNav && ['fetch→', 'XHR→', 'WS→'].includes(type)) {
      state.learningEvents.push(entry);
      if (state.learningEvents.length > 40) state.learningEvents.shift();
    }
    scheduleRender();
  }

  function upsertRoom(obj, source = 'unknown') {
    const room = normalizeRoom(obj);
    if (!room) return false;

    const prev = state.roomMap.get(room.roomId) || {};
    const merged = {
      ...prev,
      ...room,
      number: room.number ?? prev.number ?? null,
      status: room.status ?? prev.status ?? null,
      bet: room.bet ?? prev.bet ?? null,
      win: room.win ?? prev.win ?? null,
      today: {
        bet: room.today?.bet ?? prev.today?.bet ?? null,
        win: room.today?.win ?? prev.today?.win ?? null
      }
    };

    state.roomMap.set(room.roomId, merged);
    state.lastSource = source;
    return finiteNumber(merged.number) !== null;
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
        today: { bet: null, win: null }
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

    const previousPage = finiteNumber(state.currentPage);
    const totalTableCount = finiteNumber(meta.totalTableCount);
    const metaCurrentPage = finiteNumber(meta.currentPage);
    const intent = freshPageIntent();
    const currentPage = resolveTrackedPage(
      metaCurrentPage,
      intent?.page ?? null,
      previousPage,
      state.preferClickedPage
    );
    const tablePerPage = finiteNumber(meta.tablePerPage);
    const totalPages = finiteNumber(meta.totalPages);

    if ([totalTableCount, metaCurrentPage, tablePerPage, totalPages].every(v => v === null)) return false;

    if (totalTableCount !== null) state.totalTableCount = totalTableCount;
    if (tablePerPage !== null) state.tablePerPage = tablePerPage;
    if (totalPages !== null) state.totalPages = totalPages;
    if (currentPage !== null) {
      state.currentPage = currentPage;
      state.pagesSeen.add(currentPage);

      if (state.calibrationActive && previousPage !== null && currentPage !== previousPage) {
        const pointer = state.calibrationPendingPointer;
        if (pointer && Date.now() - pointer.ts < 3000) {
          state.calibrationSamples = state.calibrationSamples.filter(s => s.page !== currentPage);
          state.calibrationSamples.push({ page: currentPage, x: pointer.x, y: pointer.y });
          state.calibrationPendingPointer = null;
          const pages = state.calibrationSamples.map(s => s.page).sort((a, b) => a - b);
          state.scanMessage = pages.length === 1
            ? `🧭 校準中 1/2：已記錄第 ${pages[0]} 頁，請再點另一個不同頁碼（建議第 9 頁）`
            : `🧭 已記錄頁碼 ${pages.join('、')}`;
          finishPageCalibrationIfReady();
        }
      }

      if (state.learningPageNav && previousPage !== null && currentPage !== previousPage) {
        state.learningPageNav = false;
        state.learningResult = state.learningEvents.slice(-20);
        state.scanError = '';
        state.scanMessage = `✅ 已捕捉翻頁 ${previousPage} → ${currentPage}｜通訊 ${state.learningResult.length} 筆`;
      }
    }

    state.lastSource = source;
    return true;
  }

  function ingestObject(value, source = 'object', depth = 0) {
    if (!state.enabled || value == null || depth > 8) return;

    if (Array.isArray(value)) {
      for (const item of value) ingestObject(item, source, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;

    if (value.tableMeta) ingestMeta(value.tableMeta, `${source}:tableMeta`);
    if (value.data?.tableMeta) ingestMeta(value.data.tableMeta, `${source}:data.tableMeta`);

    const tables = Array.isArray(value.tables)
      ? value.tables
      : (Array.isArray(value.data?.tables) ? value.data.tables : null);

    if (tables) {
      let count = 0;
      for (const room of tables) if (upsertRoom(room, `${source}:tables`)) count++;
      if (count) {
        const intent = freshPageIntent();
        if (intent) {
          state.currentPage = intent.page;
          state.pagesSeen.add(intent.page);
        }

        state.pageLoadSeq++;
        if (finiteNumber(state.currentPage) !== null) state.dataPagesSeen.add(state.currentPage);

        recordEvent('tableList', {
          count,
          currentPage: state.currentPage,
          roomsKnown: numberedCount()
        });

        if (intent) state.pageIntent = null;
      }
    }

    upsertRoom(value, source);

    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) continue;
      if (key === 'tables' || key === 'tableMeta') continue;
      ingestObject(child, source, depth + 1);
    }
  }

  function processSocketIoText(text, source) {
    const s = String(text || '').trim();
    if (!s.startsWith('42[')) return false;

    try {
      const packet = nativeJSONParse(s.slice(2));
      if (!Array.isArray(packet) || packet.length < 2) return false;
      const [eventName, payload] = packet;

      if (eventName === 'slotTableUpdated') {
        const changed = applyStatusUpdates(payload, source);
        recordEvent('slotTableUpdated', { changed });
      } else if (INTERESTING_TEXT.test(String(eventName))) {
        recordEvent('socketEvent', {
          eventName: String(eventName),
          preview: sanitizeText(JSON.stringify(payload)).slice(0, 1800)
        });
      }

      ingestObject(payload, `${source}:${eventName}`);
      return true;
    } catch {
      return false;
    }
  }

  function processText(text, source) {
    if (!state.enabled || typeof text !== 'string' || !text.trim()) return;

    if (processSocketIoText(text, source)) {
      scheduleRender();
      return;
    }

    const trimmed = text.trim();
    try {
      const parsed = nativeJSONParse(trimmed);
      ingestObject(parsed, source);
      scheduleRender();
      return;
    } catch {}

    if (INTERESTING_TEXT.test(trimmed)) {
      recordEvent('textMatch', {
        source,
        preview: sanitizeText(trimmed).slice(0, 1800)
      });
    }
  }

  JSON.parse = function (...args) {
    const result = nativeJSONParse(...args);
    try {
      ingestObject(result, 'JSON.parse');
      scheduleRender();
    } catch {}
    return result;
  };

  const nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = async function (...args) {
      const input = args[0];
      const init = args[1] || {};
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = init.method || input?.method || 'GET';
      const body = typeof init.body === 'string' ? sanitizeText(init.body) : null;

      recordEvent('fetch→', { method, url: sanitizeUrl(url), body });
      const response = await nativeFetch.apply(this, args);

      try {
        const clone = response.clone();
        const type = clone.headers.get('content-type') || '';
        recordEvent('fetch←', {
          status: response.status,
          url: sanitizeUrl(response.url || url),
          contentType: type
        });
        if (type.includes('json') || type.includes('text') || type.includes('javascript')) {
          clone.text().then(t => processText(t, `fetch:${sanitizeUrl(response.url || url)}`)).catch(() => {});
        }
      } catch {}
      return response;
    };
  }

  const NativeXHR = window.XMLHttpRequest;
  if (NativeXHR) {
    const nativeOpen = NativeXHR.prototype.open;
    const nativeSend = NativeXHR.prototype.send;

    NativeXHR.prototype.open = function (method, url, ...rest) {
      this.__xinyaoMethod = method;
      this.__xinyaoUrl = url;
      return nativeOpen.call(this, method, url, ...rest);
    };

    NativeXHR.prototype.send = function (body) {
      recordEvent('XHR→', {
        method: this.__xinyaoMethod || '',
        url: sanitizeUrl(this.__xinyaoUrl || ''),
        body: typeof body === 'string' ? sanitizeText(body) : null
      });

      this.addEventListener('load', () => {
        try {
          const source = `XHR:${sanitizeUrl(this.__xinyaoUrl || '')}`;
          recordEvent('XHR←', { status: this.status, url: sanitizeUrl(this.__xinyaoUrl || '') });
          if (this.responseType === 'json') ingestObject(this.response, source);
          else if (this.responseType === '' || this.responseType === 'text') processText(this.responseText, source);
          scheduleRender();
        } catch {}
      }, { once: true });

      return nativeSend.call(this, body);
    };
  }

  const NativeWebSocket = window.WebSocket;
  if (NativeWebSocket) {
    function XinyaoWebSocket(url, protocols) {
      const ws = protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
      const safeUrl = sanitizeUrl(url);
      const nativeSend = ws.send.bind(ws);

      ws.send = function (data) {
        if (typeof data === 'string' && (state.learningPageNav || INTERESTING_TEXT.test(data))) {
          recordEvent('WS→', { url: safeUrl, preview: sanitizeText(data).slice(0, 1800) });
        }
        return nativeSend(data);
      };

      ws.addEventListener('message', event => {
        try {
          if (typeof event.data === 'string') processText(event.data, `WebSocket:${safeUrl}`);
        } catch {}
      });
      return ws;
    }

    XinyaoWebSocket.prototype = NativeWebSocket.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(key => {
      try { Object.defineProperty(XinyaoWebSocket, key, { value: NativeWebSocket[key] }); } catch {}
    });
    window.WebSocket = XinyaoWebSocket;
  }

  if (window.TextDecoder) {
    const nativeDecode = TextDecoder.prototype.decode;
    TextDecoder.prototype.decode = function (...args) {
      const text = nativeDecode.apply(this, args);
      try {
        if (typeof text === 'string' && INTERESTING_TEXT.test(text)) processText(text, 'TextDecoder');
      } catch {}
      return text;
    };
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 12 && r.height > 12 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0;
  }

  function findPagerButtons() {
    const candidates = [...document.querySelectorAll('button,[role="button"],a,li,div,span')]
      .filter(el => !el.closest('#xinyao-atg-room-scanner') && !el.closest('#xinyao-room-mini'))
      .filter(isVisible)
      .map(el => ({ el, text: (el.textContent || '').trim() }))
      .filter(x => /^(?:[1-9])$/.test(x.text));

    const groups = new Map();
    for (const c of candidates) {
      let ancestor = c.el.parentElement;
      for (let depth = 0; ancestor && depth < 5; depth++, ancestor = ancestor.parentElement) {
        if (ancestor.id === 'xinyao-atg-room-scanner') break;
        if (!groups.has(ancestor)) groups.set(ancestor, new Map());
        const map = groups.get(ancestor);
        const n = Number(c.text);
        if (!map.has(n)) map.set(n, c.el);
      }
    }

    const viable = [...groups.entries()]
      .filter(([, map]) => map.size >= 8)
      .map(([ancestor, map]) => {
        const r = ancestor.getBoundingClientRect();
        return { ancestor, map, area: r.width * r.height };
      })
      .sort((a, b) => a.area - b.area);

    if (!viable.length) return null;
    const best = viable[0];
    const out = new Map();

    for (const [n, el] of best.map.entries()) {
      const clickable = el.closest('button,[role="button"],a') || el;
      out.set(n, clickable);
    }
    return out;
  }

  function dispatchNormalizedPoint(xNorm, yNorm) {
    const x = Math.round(clamp(xNorm, 0.01, 0.99) * window.innerWidth);
    const y = Math.round(clamp(yNorm, 0.01, 0.99) * window.innerHeight);
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
    const target = document.elementFromPoint(x, y);
    if (!target) return false;

    const pointerInit = {
      bubbles: true, cancelable: true, composed: true,
      clientX: x, clientY: y, screenX: x, screenY: y,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0
    };
    try { target.dispatchEvent(new PointerEvent('pointermove', { ...pointerInit, buttons: 0 })); } catch {}
    try { target.dispatchEvent(new PointerEvent('pointerdown', { ...pointerInit, buttons: 1 })); } catch {}
    try { target.dispatchEvent(new MouseEvent('mousedown', { ...pointerInit, buttons: 1 })); } catch {}
    try { target.dispatchEvent(new PointerEvent('pointerup', { ...pointerInit, buttons: 0 })); } catch {}
    try { target.dispatchEvent(new MouseEvent('mouseup', { ...pointerInit, buttons: 0 })); } catch {}
    try { target.dispatchEvent(new MouseEvent('click', { ...pointerInit, buttons: 0 })); } catch {}
    return true;
  }

  function dispatchPagePoint(page, xOverride = null) {
    const point = pagePoint(state.pageCalibration, page);
    if (!point) return false;
    setPageIntent(page);
    return dispatchNormalizedPoint(xOverride ?? point.x, point.y);
  }

  function waitForPageOutcome(targetPage, beforeSeq, beforePage, timeout = 1800) {
    return new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
const current = finiteNumber(state.currentPage);
        const seqChanged = state.pageLoadSeq > beforeSeq;
        if (current === targetPage && seqChanged && state.dataPagesSeen.has(targetPage)) {
          clearInterval(timer);
          resolve({ ok: true, landedPage: current, changed: true });
          return;
        }
        if (seqChanged && current !== null && current !== beforePage) {
          clearInterval(timer);
          resolve({ ok: false, landedPage: current, changed: true });
          return;
        }
        if (state.scanAbort || Date.now() - started > timeout) {
          clearInterval(timer);
          resolve({ ok: false, landedPage: current, changed: false });
        }
      }, 80);
    });
  }

  async function navigateToPageAdaptive(page, totalPages) {
    if (finiteNumber(state.currentPage) === page && state.dataPagesSeen.has(page)) return true;

    const pager = findPagerButtons();
    const btn = pager?.get(page);
    if (btn) {
      const beforeSeq = state.pageLoadSeq;
      const beforePage = finiteNumber(state.currentPage);
      setPageIntent(page);
      try { btn.click(); } catch {
        state.pageIntent = null;
        return false;
      }
      const outcome = await waitForPageOutcome(page, beforeSeq, beforePage, 3200);
      if (outcome.ok) return true;
    }

    const calibration = state.pageCalibration;
    const point = pagePoint(calibration, page);
    if (!calibration || !point) return false;

    const stepX = finiteNumber(calibration.stepX) || 0.05;
    const probes = buildProbeOffsets(stepX);
    let learnedX = null;

    for (const offset of probes) {
      if (state.scanAbort) return false;
      const candidateX = clamp((learnedX ?? point.x) + offset, 0.01, 0.99);
      const beforeSeq = state.pageLoadSeq;
      const beforePage = finiteNumber(state.currentPage);
      if (!dispatchPagePoint(page, candidateX)) continue;
      const outcome = await waitForPageOutcome(page, beforeSeq, beforePage, 1600);
      if (outcome.ok) return true;

      if (outcome.changed && finiteNumber(outcome.landedPage) !== null) {
        const correctedX = correctPageClickX(candidateX, page, outcome.landedPage, stepX);
        if (correctedX !== null && Math.abs(correctedX - candidateX) > 0.002) {
          learnedX = correctedX;
          const seq2 = state.pageLoadSeq;
          const page2 = finiteNumber(state.currentPage);
          if (dispatchPagePoint(page, correctedX)) {
            const correctedOutcome = await waitForPageOutcome(page, seq2, page2, 1900);
            if (correctedOutcome.ok) return true;
            if (correctedOutcome.changed && finiteNumber(correctedOutcome.landedPage) !== null) {
              learnedX = correctPageClickX(correctedX, page, correctedOutcome.landedPage, stepX);
            }
          }
        }
      }
    }

    return false;
  }

  async function scanAllPages({ auto = false } = {}) {
    if (state.scanRunning) return;
    const pager = findPagerButtons();
    if (!pager && !state.pageCalibration) {
      startPageCalibration({ thenScan: true });
      return;
    }

    const totalPages = state.totalPages || pager?.size || 9;
    const startPage = finiteNumber(state.currentPage) || 1;

    // 窄版 / 手機版選房頁可能不會同時顯示第 1 與最後一頁。
    // 校準時第 1 頁與最後一頁已由使用者實際點過並完成資料擷取，
    // 掃描時直接略過已抓到的頁面，避免從最後一頁硬跳回第 1 頁而失敗。
    if (state.dataPagesSeen.size >= totalPages) {
      const keep = new Set();
      for (const page of state.pageCalibration?.samplePages || []) keep.add(page);
      if (finiteNumber(state.currentPage) !== null) keep.add(state.currentPage);
      state.dataPagesSeen = keep;
    }

    const sequence = buildMissingScanSequence(startPage, totalPages, state.dataPagesSeen);

    state.scanRunning = true;
    state.scanAbort = false;
    state.scanVisited = new Set(state.dataPagesSeen);
    state.scanError = '';
    state.scanMessage = auto ? '自動刷新掃描中…' : '全房掃描中…';
    scheduleRender();

    for (const page of sequence) {
      if (state.scanAbort) break;
      state.scanMessage = `掃描第 ${page} / ${totalPages} 頁…`;
      scheduleRender();

      const loaded = await navigateToPageAdaptive(page, totalPages);
      if (!loaded) {
        state.scanError = `第 ${page} 頁自動切換失敗；已嘗試自動修正位置。請保持「選擇機台」畫面開啟後再試一次。`;
        break;
      }
      state.scanVisited.add(page);
      await delay(220);
    }

    state.scanRunning = false;
    const count = numberedCount();
    const expected = state.totalTableCount || 4100;
    const allPages = state.scanVisited.size >= totalPages || state.dataPagesSeen.size >= totalPages;

    if (state.scanAbort) {
      state.scanMessage = `已停止｜目前 ${count} / ${expected}`;
    } else if (!state.scanError && allPages && count >= expected) {
      state.scanMessage = `✅ 全房掃描完成｜${count} / ${expected}`;
    } else if (!state.scanError) {
      state.scanMessage = `掃描結束｜目前 ${count} / ${expected}`;
    }
    scheduleRender();
  }

  function stopScan() {
    if (!state.scanRunning) return;
    state.scanAbort = true;
    state.scanMessage = '正在停止…';
    scheduleRender();
  }

  function setAutoRefresh(minutes) {
    ui.autoRefreshMins = minutes;
    if (state.autoTimer) {
      clearInterval(state.autoTimer);
      state.autoTimer = null;
    }
    if (minutes > 0) {
      state.autoTimer = setInterval(() => {
        if (!state.scanRunning && (findPagerButtons() || state.pageCalibration)) scanAllPages({ auto: true });
      }, minutes * 60 * 1000);
    }
    scheduleRender();
  }

  function formatPct(v) {
    return v === null || !Number.isFinite(v) ? '—' : `${v.toFixed(2)}%`;
  }

  function formatNum(v) {
    return v === null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString('zh-TW', { maximumFractionDigits: 2 });
  }

  function statusLabel(status) {
    if (status === 'Empty') return '空房';
    if (status === 'Full') return '使用中';
    if (status === 'Locked') return '鎖定';
    return status || '未知';
  }

  function statusBadge(status) {
    const bg = status === 'Empty' ? '#1f9d64' : status === 'Locked' ? '#8b5cf6' : status === 'Full' ? '#64748b' : '#475569';
    return `<span style="background:${bg};padding:2px 7px;border-radius:999px;font-size:10px;white-space:nowrap;">${statusLabel(status)}</span>`;
  }

  function filteredSortedRooms() {
    let rooms = numberedRooms().map(r => ({ ...r, metrics: calculateMetrics(r) }));
    const q = ui.search.trim();
    if (q) rooms = rooms.filter(r => String(r.number).includes(q) || String(r.roomId).includes(q));
    if (ui.filter !== 'All') rooms = rooms.filter(r => r.status === ui.filter);

    const score = (r) => {
      if (ui.sort === 'today') return r.metrics.todayRate;
      if (ui.sort === 'total') return r.metrics.totalRate;
      if (ui.sort === 'todayBet') return r.metrics.todayBet;
      if (ui.sort === 'score') return r.metrics.observationScore;
      return r.number;
    };

    rooms.sort((a, b) => {
      if (ui.sort === 'number') return a.number - b.number;
      const av = score(a), bv = score(b);
      if (av === null && bv === null) return a.number - b.number;
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av || a.number - b.number;
    });
    return rooms;
  }

  function topRooms() {
    return rankRooms(numberedRooms(), { onlyEmpty: true, mode: ui.rankMode }).slice(0, ui.topN);
  }

  function exportData() {
    const rooms = numberedRooms()
      .map(r => ({ ...r, metrics: calculateMetrics(r) }))
      .sort((a, b) => a.number - b.number);
    return {
      version: VERSION,
      capturedAt: new Date().toISOString(),
      page: sanitizeUrl(location.href),
      summary: {
        roomsKnown: rooms.length,
        totalTableCount: state.totalTableCount,
        pagesSeen: [...state.pagesSeen].sort((a, b) => a - b),
        currentPage: state.currentPage,
        tablePerPage: state.tablePerPage,
        totalPages: state.totalPages,
        scanMessage: state.scanMessage,
        learningPageNav: state.learningPageNav,
        pageCalibrationReady: !!state.pageCalibration,
        calibrationActive: state.calibrationActive,
        learningStartPage: state.learningStartPage
      },
      note: '觀察分數僅依目前已取得的歷史統計排序，不代表未來結果或獲利保證。',
      topEmptyRooms: topRooms(),
      rooms,
      pageNavigationDiagnostics: state.learningResult,
      recentEvents: state.events.slice(-250)
    };
  }

  function syncToXinyaoSite() {
    const rooms = numberedRooms();
    if (!rooms.length) {
      state.scanError = '目前沒有可同步的房號資料，請先完成全房掃描。';
      scheduleRender();
      return;
    }

    const payload = buildSyncPayload(rooms, state);
    const siteUrl = 'https://xinyao-ai.github.io/xinyao-ai/?atgRooms=1';
    const targetOrigin = 'https://xinyao-ai.github.io';
    const target = window.open(siteUrl, 'xinyao-atg-ai');

    if (!target) {
      state.scanError = '瀏覽器阻擋開啟芯瑤頁面，請允許彈出式視窗後再按一次。';
      scheduleRender();
      return;
    }

    state.scanError = '';
    state.scanMessage = `正在同步 ${payload.rooms.length} 房到芯瑤…`;
    scheduleRender();

    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      try {
        target.postMessage(payload, targetOrigin);
      } catch (_) {}

      if (tries >= 16) {
        clearInterval(timer);
        state.scanMessage = `✅ 已送出 ${payload.rooms.length} 房｜請到芯瑤「全房推薦」查看`;
        scheduleRender();
      }
    }, 500);
  }

  function closeCopyDialog() {
    document.getElementById('xinyao-copy-modal')?.remove();
  }

  function openCopyDialog(text) {
    closeCopyDialog();

    const overlay = document.createElement('div');
    overlay.id = 'xinyao-copy-modal';
    overlay.style.cssText = `
      position:fixed;
      inset:0;
      z-index:2147483647;
      background:rgba(0,0,0,.72);
      display:flex;
      align-items:center;
      justify-content:center;
      padding:18px;
      font-family:Arial,"Microsoft JhengHei",sans-serif;
    `;

    overlay.innerHTML = `
      <div style="
        width:min(760px,94vw);
        height:min(680px,86vh);
        background:#17131d;
        color:#fff;
        border:1px solid rgba(255,255,255,.15);
        border-radius:16px;
        padding:16px;
        box-shadow:0 18px 60px rgba(0,0,0,.5);
        display:flex;
        flex-direction:column;
        gap:10px;
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div>
            <div style="font-size:16px;font-weight:800;">📋 ATG 偵測結果</div>
            <div style="font-size:11px;opacity:.7;margin-top:3px;">
              如果自動複製失敗，按「全選文字」後再按 Ctrl + C
            </div>
          </div>
          <button id="xinyao-copy-close" style="
            border:0;border-radius:8px;background:rgba(255,255,255,.1);
            color:#fff;padding:7px 11px;cursor:pointer;
          ">✕</button>
        </div>

        <textarea id="xinyao-copy-text" readonly style="
          flex:1;width:100%;min-height:0;resize:none;box-sizing:border-box;
          border:1px solid rgba(255,255,255,.15);border-radius:10px;
          background:#0d0b11;color:#fff;padding:12px;font-size:11px;
          line-height:1.5;outline:none;white-space:pre;
        "></textarea>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button id="xinyao-copy-select" style="
            border:0;border-radius:10px;padding:10px;cursor:pointer;
            background:#ff5a9d;color:#fff;font-weight:800;
          ">全選文字</button>

          <button id="xinyao-copy-direct" style="
            border:1px solid rgba(255,255,255,.18);border-radius:10px;
            padding:10px;cursor:pointer;background:rgba(255,255,255,.08);
            color:#fff;font-weight:800;
          ">複製文字</button>
        </div>

        <div id="xinyao-copy-status" style="
          min-height:18px;font-size:11px;text-align:center;opacity:.8;
        "></div>
      </div>
    `;

    document.body.appendChild(overlay);

    const textarea = document.getElementById('xinyao-copy-text');
    const status = document.getElementById('xinyao-copy-status');
    textarea.value = text;

    function selectText() {
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
    }

    document.getElementById('xinyao-copy-select')?.addEventListener('click', () => {
      selectText();
      status.textContent = '✅ 已全選，現在按 Ctrl + C';
    });

    document.getElementById('xinyao-copy-direct')?.addEventListener('click', () => {
      selectText();

      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }

      status.textContent = copied
        ? '✅ 已複製，可以直接貼到 ChatGPT'
        : '⚠️ 瀏覽器未允許自動複製，請直接按 Ctrl + C';
    });

    document.getElementById('xinyao-copy-close')?.addEventListener('click', closeCopyDialog);

    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeCopyDialog();
    });

    setTimeout(() => {
      selectText();
      status.textContent = '文字已全選，可直接按 Ctrl + C';
    }, 50);
  }

  function copyResults() {
    try {
      const text = JSON.stringify(exportData(), null, 2);
      openCopyDialog(text);
    } catch (error) {
      openCopyDialog(JSON.stringify({
        version: VERSION,
        error: '建立匯出資料失敗',
        message: String(error?.message || error)
      }, null, 2));
    }
  }

  function clearResults() {
    if (state.scanRunning) return;
    state.roomMap.clear();
    state.pagesSeen.clear();
    state.dataPagesSeen.clear();
    state.totalTableCount = 0;
    state.tablePerPage = 0;
    state.totalPages = 0;
    state.currentPage = null;
    state.events = [];
    state.lastSource = '等待資料';
    state.scanVisited.clear();
    state.scanMessage = '已清空，等待新資料';
    state.scanError = '';
    state.learningPageNav = false;
    state.learningStartPage = null;
    state.learningEvents = [];
    state.learningResult = [];
    ui.roomListPage = 1;
    scheduleRender();
  }

  function buttonStyle(extra = '') {
    return `border:0;border-radius:9px;padding:8px 8px;cursor:pointer;background:#ff5a9d;color:#fff;font-weight:700;font-size:12px;${extra}`;
  }

  function secondaryButtonStyle(extra = '') {
    return `border:1px solid rgba(255,255,255,.18);border-radius:9px;padding:8px 8px;cursor:pointer;background:rgba(255,255,255,.08);color:#fff;font-weight:700;font-size:12px;${extra}`;
  }

  function escapeHtml(text) {
    return String(text ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  const mini = document.createElement('button');

  function flash(text) {
    const el = document.getElementById('xinyao-room-copy');
    if (!el) return;
    const old = el.textContent;
    el.textContent = text;
    setTimeout(() => { if (el) el.textContent = old; }, 1500);
  }

  function topRowsHtml() {
    const rows = topRooms();
    if (!rows.length) return `<div style="opacity:.65;padding:8px 0;">尚無可排行的空房資料。</div>`;
    return rows.map((r, i) => {
      const m = r.metrics;
      return `<div style="display:grid;grid-template-columns:34px 58px 1fr 1fr 58px;gap:5px;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:11px;">
        <b>#${i + 1}</b>
        <b>${String(r.number).padStart(4, '0')}</b>
        <span>今日 ${formatPct(m.todayRate)}</span>
        <span>累計 ${formatPct(m.totalRate)}</span>
        <span style="text-align:right;">${m.observationScore === null ? '—' : m.observationScore.toFixed(1)}</span>
      </div>`;
    }).join('');
  }

  function roomTableHtml() {
    const rooms = filteredSortedRooms();
    const totalPages = Math.max(1, Math.ceil(rooms.length / ui.perPage));
    ui.roomListPage = clamp(ui.roomListPage, 1, totalPages);
    const start = (ui.roomListPage - 1) * ui.perPage;
    const pageRooms = rooms.slice(start, start + ui.perPage);

    const rows = pageRooms.map(r => {
      const m = r.metrics;
      return `<div style="display:grid;grid-template-columns:52px 62px 76px 76px 76px;gap:5px;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:10.5px;">
        <b>${String(r.number).padStart(4, '0')}</b>
        ${statusBadge(r.status)}
        <span>${formatPct(m.todayRate)}</span>
        <span>${formatPct(m.totalRate)}</span>
        <span>${formatNum(m.todayBet)}</span>
      </div>`;
    }).join('') || `<div style="padding:10px 0;opacity:.65;">沒有符合條件的房號。</div>`;

    return {
      html: `<div style="display:grid;grid-template-columns:52px 62px 76px 76px 76px;gap:5px;font-size:10px;opacity:.7;padding:4px 0;"><span>房號</span><span>狀態</span><span>今日率</span><span>累計率</span><span>今日投注</span></div>${rows}`,
      count: rooms.length,
      totalPages
    };
  }

  function render() {
    if (!state.panel) return;

    const count = numberedCount();
    const expected = state.totalTableCount || '?';
    const pageKnown = state.pagesSeen.size;
    const pages = state.totalPages || '?';
    const pageList = [...state.pagesSeen].sort((a, b) => a - b).join(', ') || '—';
    const top = topRooms();
    const best = top[0];
    const bestText = best
      ? `目前資料排行：${String(best.number).padStart(4, '0')} 房｜觀察分數 ${best.metrics.observationScore?.toFixed(1) ?? '—'}`
      : '目前尚無空房排行資料';

    let expanded = '';
    if (ui.expanded) {
      const table = roomTableHtml();
      expanded = `
        <div style="margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.12);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
            <b style="font-size:13px;">📊 空房資料排行</b>
            <select id="xinyao-rank-mode" style="${selectStyle()}">
              <option value="observation" ${ui.rankMode === 'observation' ? 'selected' : ''}>觀察分數</option>
              <option value="today" ${ui.rankMode === 'today' ? 'selected' : ''}>今日得分率</option>
              <option value="total" ${ui.rankMode === 'total' ? 'selected' : ''}>累計得分率</option>
              <option value="todayBet" ${ui.rankMode === 'todayBet' ? 'selected' : ''}>今日投注量</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:34px 58px 1fr 1fr 58px;gap:5px;font-size:10px;opacity:.7;padding-bottom:3px;"><span>名次</span><span>房號</span><span>今日率</span><span>累計率</span><span>分數</span></div>
          ${topRowsHtml()}
          <div style="font-size:9.5px;opacity:.6;line-height:1.5;margin-top:6px;">觀察分數只整理已發生的統計資料，並以投注量做簡單權重修正，不代表下一局結果。</div>
        </div>

        <div style="margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.12);">
          <b style="font-size:13px;">🔍 全房查詢</b>
          <div style="display:grid;grid-template-columns:1fr 92px 105px;gap:5px;margin-top:7px;">
            <input id="xinyao-search" value="${escapeHtml(ui.search)}" placeholder="搜尋房號 / roomId" style="${inputStyle()}" />
            <select id="xinyao-filter" style="${selectStyle()}">
              <option value="All" ${ui.filter === 'All' ? 'selected' : ''}>全部</option>
              <option value="Empty" ${ui.filter === 'Empty' ? 'selected' : ''}>空房</option>
              <option value="Full" ${ui.filter === 'Full' ? 'selected' : ''}>使用中</option>
              <option value="Locked" ${ui.filter === 'Locked' ? 'selected' : ''}>鎖定</option>
            </select>
            <select id="xinyao-sort" style="${selectStyle()}">
              <option value="number" ${ui.sort === 'number' ? 'selected' : ''}>房號</option>
              <option value="score" ${ui.sort === 'score' ? 'selected' : ''}>觀察分數</option>
              <option value="today" ${ui.sort === 'today' ? 'selected' : ''}>今日率</option>
              <option value="total" ${ui.sort === 'total' ? 'selected' : ''}>累計率</option>
              <option value="todayBet" ${ui.sort === 'todayBet' ? 'selected' : ''}>今日投注</option>
            </select>
          </div>
          <div style="margin-top:7px;max-height:260px;overflow:auto;padding-right:2px;">${table.html}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px;font-size:10.5px;">
            <span>符合 ${table.count} 房｜第 ${ui.roomListPage} / ${table.totalPages} 頁</span>
            <div style="display:flex;gap:5px;">
              <button id="xinyao-prev" style="${secondaryButtonStyle('padding:5px 9px;')}">上一頁</button>
              <button id="xinyao-next" style="${secondaryButtonStyle('padding:5px 9px;')}">下一頁</button>
            </div>
          </div>
        </div>

        ${(state.learningPageNav || state.learningResult.length) ? `
        <div style="margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.12);">
          <b style="font-size:13px;">🧪 翻頁診斷</b>
          <div style="margin-top:6px;font-size:10px;line-height:1.55;opacity:.8;">
            ${state.learningPageNav
              ? '正在等待妳手動切換到另一頁，只需要點一次。'
              : `已捕捉 ${state.learningResult.length} 筆翻頁前送出的通訊。`}
          </div>
          ${state.learningResult.length ? `<pre style="margin-top:6px;max-height:170px;overflow:auto;white-space:pre-wrap;word-break:break-all;background:#0d0b11;border-radius:8px;padding:8px;font-size:9.5px;line-height:1.4;">${escapeHtml(JSON.stringify(state.learningResult.slice(-8), null, 2))}</pre>` : ''}
        </div>` : ''}`;
    }

    state.panel.style.width = ui.expanded ? '520px' : '330px';
    state.panel.style.maxHeight = ui.expanded ? '88vh' : 'none';
    state.panel.style.overflow = ui.expanded ? 'auto' : 'visible';

    state.panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:7px;">
        <div style="font-weight:800;font-size:14px;">🌸 芯瑤 ATG 全房分析</div>
        <button id="xinyao-room-hide" style="${secondaryButtonStyle('padding:4px 8px;')}">縮小</button>
      </div>

      <div style="font-size:11px;line-height:1.65;">
        <span>${state.enabled ? '🟢 偵測中' : '⚪ 已暫停'}</span><br>
        已抓房號：<b>${count}</b> / ${expected}　頁數：<b>${pageKnown}</b> / ${pages}<br>
        目前頁：${state.currentPage ?? '—'}　已看頁：${escapeHtml(pageList)}<br>
        頁碼校準：${state.pageCalibration ? '✅ 已完成' : (state.calibrationActive ? `🧭 進行中 ${state.calibrationSamples.length}/2` : '尚未校準')}<br>
        <span style="${state.scanError ? 'color:#ff9a9a;' : 'color:#a7f3d0;'}">${escapeHtml(state.scanError || state.scanMessage)}</span>
      </div>

      <div style="margin-top:7px;background:rgba(255,255,255,.06);padding:7px 8px;border-radius:9px;font-size:10.5px;">${escapeHtml(bestText)}</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">
        <button id="xinyao-scan-all" style="${buttonStyle()}">${state.scanRunning ? '掃描中…' : '一鍵掃描 4100 房'}</button>
        <button id="xinyao-stop" style="${secondaryButtonStyle()}">停止掃描</button>
        <button id="xinyao-expand" style="${secondaryButtonStyle()}">${ui.expanded ? '收合分析' : '完整分析'}</button>
        <button id="xinyao-sync-site" style="${buttonStyle('grid-column:1 / -1;')}">🌸 同步到芯瑤</button>
        <button id="xinyao-calibrate" style="${secondaryButtonStyle('grid-column:1 / -1;')}">${state.calibrationActive
          ? `校準中 ${state.calibrationSamples.length}/2｜請點兩個頁碼`
          : (state.pageCalibration ? '重新校準頁碼' : '校準頁碼位置')}</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 120px;gap:6px;margin-top:6px;align-items:center;">
        <span style="font-size:10px;opacity:.7;">自動刷新（只在選房頁執行）</span>
        <select id="xinyao-auto" style="${selectStyle()}">
          <option value="0" ${ui.autoRefreshMins === 0 ? 'selected' : ''}>關閉</option>
          <option value="3" ${ui.autoRefreshMins === 3 ? 'selected' : ''}>每 3 分鐘</option>
          <option value="5" ${ui.autoRefreshMins === 5 ? 'selected' : ''}>每 5 分鐘</option>
          <option value="10" ${ui.autoRefreshMins === 10 ? 'selected' : ''}>每 10 分鐘</option>
        </select>
      </div>

      ${expanded}

      <div style="margin-top:8px;font-size:9px;opacity:.55;line-height:1.45;">僅整理房號、狀態、投注與派彩統計；不輸出帳密、Cookie 或 Token，同步功能只會傳送房號、狀態、投注與派彩統計到芯瑤頁面，不包含帳密、Cookie 或 Token。歷史統計不保證未來結果。</div>
    `;

    bindUiEvents();
  }

  function inputStyle() {
    return 'box-sizing:border-box;width:100%;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:rgba(255,255,255,.08);color:#fff;padding:7px;font-size:11px;outline:none;';
  }

  function selectStyle() {
    return 'box-sizing:border-box;width:100%;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:#2b2535;color:#fff;padding:6px;font-size:10.5px;outline:none;';
  }

  function bindUiEvents() {
    document.getElementById('xinyao-auto')?.addEventListener('change', e => setAutoRefresh(Number(e.target.value) || 0));
    document.getElementById('xinyao-rank-mode')?.addEventListener('change', e => { ui.rankMode = e.target.value; scheduleRender(); });
    document.getElementById('xinyao-filter')?.addEventListener('change', e => { ui.filter = e.target.value; ui.roomListPage = 1; scheduleRender(); });
    document.getElementById('xinyao-sort')?.addEventListener('change', e => { ui.sort = e.target.value; ui.roomListPage = 1; scheduleRender(); });
    document.getElementById('xinyao-search')?.addEventListener('input', e => {
      ui.search = e.target.value;
      ui.roomListPage = 1;
      clearTimeout(e.target.__xinyaoTimer);
      e.target.__xinyaoTimer = setTimeout(scheduleRender, 180);
    });
  }

  function createPanel() {
    if (state.panel || !document.body) return;
    const panel = document.createElement('div');
    panel.id = 'xinyao-atg-room-scanner';
    panel.style.cssText = 'position:fixed;top:12px;right:12px;width:330px;z-index:2147483647;background:rgba(22,18,28,.97);color:#fff;padding:12px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.38);font-family:Arial,"Microsoft JhengHei",sans-serif;box-sizing:border-box;';
    document.body.appendChild(panel);
    state.panel = panel;

    // 使用固定在 panel 本體上的 pointerdown 事件代理。
    // ATG 即時資料很頻繁，render() 會重建 panel 內容；若把 click 綁在每顆
    // 臨時按鈕上，按下與放開之間節點可能已被替換，造成看起來「沒反應」。
    panel.addEventListener('pointerdown', event => {
      const button = event.target?.closest?.('button[id]');
      if (!button || !panel.contains(button)) return;
      const action = resolvePanelAction(button.id);
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();

      if (action === 'scan') {
        scanAllPages();
      } else if (action === 'stop') {
        stopScan();
      } else if (action === 'copy') {
        copyResults();
      } else if (action === 'expand') {
        ui.expanded = !ui.expanded;
        scheduleRender();
      } else if (action === 'hide') {
        panel.style.display = 'none';
        mini.style.display = 'block';
      } else if (action === 'prev') {
        ui.roomListPage = Math.max(1, ui.roomListPage - 1);
        scheduleRender();
      } else if (action === 'next') {
        ui.roomListPage += 1;
        scheduleRender();
      } else if (action === 'calibrate') {
        savePageCalibration(null);
        startPageCalibration({ thenScan: false });
      } else if (action === 'sync') {
        syncToXinyaoSite();
      }
    }, true);

    mini.id = 'xinyao-room-mini';
    mini.textContent = '🔎 全房分析';
    mini.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;border:0;border-radius:999px;padding:9px 12px;background:#ff5a9d;color:#fff;font-weight:800;display:none;cursor:pointer;';
    mini.addEventListener('click', () => {
      mini.style.display = 'none';
      panel.style.display = 'block';
    });
    document.body.appendChild(mini);
    render();
  }

  function waitForPairThenCreatePanel() {
    const PAIR_TOKEN_KEY = 'xinyao_atg_device_token_v2';

    function checkPair() {
      const paired = !!localStorage.getItem(PAIR_TOKEN_KEY);
      if (paired) {
        createPanel();
        return true;
      }
      return false;
    }

    if (checkPair()) return;

    const pairTimer = setInterval(() => {
      if (checkPair()) {
        clearInterval(pairTimer);
      }
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForPairThenCreatePanel, { once: true });
  } else {
    waitForPairThenCreatePanel();
  }
})();
