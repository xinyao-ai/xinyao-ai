// ==UserScript==
// @name         芯瑤💕 ATG 即時助手
// @namespace    xinyao-atg-live
// @version      2.0.2
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
