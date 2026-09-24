// ==UserScript==
// @name         芯瑤💕 ATG 即時助手
// @namespace    xinyao-atg-live
// @version      3.1.8
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
  const ROOM_FREE_ENTRY_KEY = 'xinyao_atg_room_free_entry_v1';
  const FULL_SCAN_SESSION_KEY_LIVE = 'xinyao_atg_full_scan_session_v1';
  const RUNTIME_ROOM_KEY = `runtime:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const nativeJSONParse = JSON.parse.bind(JSON);
  const cloudFetch = window.fetch.bind(window);

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
    currentRoomKey: RUNTIME_ROOM_KEY,
    currentRoomNumber: null,
    roomFreeGameEntries: 0,
    roomFreeGameInProgress: false,
    roomFreeGameLastEntrySpinId: '',
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
    pairMessage: '',
    pairBusy: false,
    replaced: false
  };

  let panel = null;
  let minimized = false;
  let pushTimer = null;
  let pushBusy = false;
  let lastPushSignature = '';
  let deviceToken = localStorage.getItem(TOKEN_KEY) || '';
  let fullScanRoomIndexRaw = '';
  let fullScanRoomIndexById = new Map();

  function evolveRoomFreeEntryCounter(previous = {}, event = {}) {
    // ATG 的遊戲結果封包不一定帶 room/table id。
    // 沒有房號時仍必須能計數，因此使用 runtime fallback；真正房號稍後出現時再升級 identity。
    const eventRoomKey = String(event.roomKey || previous.roomKey || '__runtime__');
    const previousRoomKey = String(previous.roomKey || '');
    const roomChanged = Boolean(
      eventRoomKey && previousRoomKey &&
      eventRoomKey !== previousRoomKey &&
      !previousRoomKey.startsWith('runtime:') && previousRoomKey !== '__runtime__'
    );
    const next = {
      roomKey: eventRoomKey || previousRoomKey || '__runtime__',
      roomNumber: event.roomNumber ?? previous.roomNumber ?? null,
      count: roomChanged ? 0 : Math.max(0, Number(previous.count) || 0),
      inProgress: roomChanged ? false : Boolean(previous.inProgress),
      lastEntrySpinId: roomChanged ? '' : String(previous.lastEntrySpinId || '')
    };

    const active = Boolean(event.active);
    const entrySignal = Boolean(event.entrySignal);
    const spinId = String(event.spinId || '');

    // 真正的「開始免遊」訊號優先：同一個 spinId 只計一次。
    // 這樣不需要依賴 ATG 是否會在後續封包持續維持 active=true。
    if (entrySignal && (!spinId || spinId !== next.lastEntrySpinId)) {
      next.count += 1;
      next.inProgress = true;
      next.lastEntrySpinId = spinId;
      return next;
    }

    // 沒有明確 start 訊號時，以 active 的 false -> true 當 fallback。
    if (active) {
      if (!next.inProgress) {
        next.count += 1;
        next.inProgress = true;
        next.lastEntrySpinId = spinId;
      }
    } else if (next.inProgress) {
      next.inProgress = false;
    }
    return next;
  }

  function loadRoomFreeEntrySession() {
    try {
      const raw = sessionStorage.getItem(ROOM_FREE_ENTRY_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        roomKey: String(parsed.roomKey || ''),
        roomNumber: toNumber(parsed.roomNumber),
        count: Math.max(0, Math.trunc(toNumber(parsed.count) || 0)),
        inProgress: Boolean(parsed.inProgress),
        lastEntrySpinId: String(parsed.lastEntrySpinId || '')
      };
    } catch (_) {
      return null;
    }
  }

  function saveRoomFreeEntrySession() {
    // runtime fallback 無法證明重新載入後仍是同一房，因此不持久化，避免換房沿用舊次數。
    if (!state.currentRoomKey || state.currentRoomKey.startsWith('runtime:')) return;
    try {
      sessionStorage.setItem(ROOM_FREE_ENTRY_KEY, JSON.stringify({
        roomKey: state.currentRoomKey,
        roomNumber: state.currentRoomNumber,
        count: state.roomFreeGameEntries,
        inProgress: state.roomFreeGameInProgress,
        lastEntrySpinId: state.roomFreeGameLastEntrySpinId,
        updatedAt: new Date().toISOString()
      }));
    } catch (_) {}
  }

  function fullScanRoomNumberByRoomId(roomId) {
    const id = toNumber(roomId);
    if (id === null) return null;
    try {
      const raw = sessionStorage.getItem(FULL_SCAN_SESSION_KEY_LIVE) || '';
      if (!raw) return null;
      if (raw !== fullScanRoomIndexRaw) {
        const parsed = JSON.parse(raw);
        const next = new Map();
        for (const room of (Array.isArray(parsed?.rooms) ? parsed.rooms : [])) {
          const rid = toNumber(room?.roomId);
          const number = toNumber(room?.number);
          if (rid !== null && number !== null && number >= 1 && number <= 4100) next.set(rid, number);
        }
        fullScanRoomIndexRaw = raw;
        fullScanRoomIndexById = next;
      }
      return fullScanRoomIndexById.get(id) ?? null;
    } catch (_) {
      return null;
    }
  }

  function findNamedNumber(value, names, depth = 0, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || depth > 8 || seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findNamedNumber(item, names, depth + 1, seen);
        if (found !== null) return found;
      }
      return null;
    }
    for (const [key, raw] of Object.entries(value)) {
      const normalized = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (names.has(normalized)) {
        const n = toNumber(raw);
        if (n !== null) return n;
      }
    }
    for (const child of Object.values(value)) {
      if (!child || typeof child !== 'object') continue;
      const found = findNamedNumber(child, names, depth + 1, seen);
      if (found !== null) return found;
    }
    return null;
  }

  function resolveRoomIdentityFromUrl() {
    try {
      const url = new URL(location.href);
      const numberNames = new Set(['roomnumber','roomno','roomnum','tablenumber','tableno','tablenum','machinenumber','machineno']);
      const idNames = new Set(['roomid','tableid']);
      for (const [key, raw] of url.searchParams.entries()) {
        const name = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
        const n = toNumber(raw);
        if (n === null) continue;
        if (numberNames.has(name) && n >= 1 && n <= 4100) return { key: `room:${n}`, roomNumber: n };
        if (idNames.has(name)) {
          const mapped = fullScanRoomNumberByRoomId(n);
          return mapped !== null ? { key: `room:${mapped}`, roomNumber: mapped } : { key: `roomId:${n}`, roomNumber: null };
        }
      }
    } catch (_) {}
    return null;
  }

  function resolveRoomIdentityFromEngine(engine) {
    const numberNames = new Set(['roomnumber','roomno','roomnum','tablenumber','tableno','tablenum','machinenumber','machineno']);
    const directNumber = findNamedNumber(engine, numberNames);
    if (directNumber !== null && directNumber >= 1 && directNumber <= 4100) {
      return { key: `room:${directNumber}`, roomNumber: directNumber };
    }

    const roomId = findNamedNumber(engine, new Set(['roomid','tableid']));
    if (roomId !== null) {
      const mapped = fullScanRoomNumberByRoomId(roomId);
      return mapped !== null
        ? { key: `room:${mapped}`, roomNumber: mapped }
        : { key: `roomId:${roomId}`, roomNumber: null };
    }
    return resolveRoomIdentityFromUrl();
  }

  function applyRoomIdentity(identity) {
    if (!identity?.key) return false;
    const nextKey = String(identity.key);
    if (state.currentRoomKey === nextKey) {
      if (identity.roomNumber !== null && identity.roomNumber !== undefined && state.currentRoomNumber !== identity.roomNumber) {
        state.currentRoomNumber = identity.roomNumber;
        saveRoomFreeEntrySession();
        return true;
      }
      return false;
    }

    // 若目前只是 runtime fallback，現在才拿到真實房號：保留已累積的免遊次數，不視為換房。
    const upgradingRuntimeIdentity = String(state.currentRoomKey || '').startsWith('runtime:');
    state.currentRoomKey = nextKey;
    state.currentRoomNumber = identity.roomNumber ?? null;
    if (!upgradingRuntimeIdentity) {
      state.roomFreeGameEntries = 0;
      state.roomFreeGameInProgress = false;
      state.roomFreeGameLastEntrySpinId = '';
    }
    saveRoomFreeEntrySession();
    return true;
  }

  function restoreRoomFreeEntrySession(expectedRoomKey = '') {
    const saved = loadRoomFreeEntrySession();
    if (!saved?.roomKey || saved.roomKey.startsWith('runtime:')) return false;
    // 只有能從目前 URL 證明仍是同一房時才還原，避免切房後沿用上一房次數。
    if (expectedRoomKey && saved.roomKey !== expectedRoomKey) return false;
    if (!expectedRoomKey) return false;
    state.currentRoomKey = saved.roomKey;
    state.currentRoomNumber = saved.roomNumber;
    state.roomFreeGameEntries = saved.count;
    state.roomFreeGameInProgress = saved.inProgress;
    state.roomFreeGameLastEntrySpinId = saved.lastEntrySpinId;
    return true;
  }

  function updateRoomFreeEntryCounter(active, spinId, entrySignal = false) {
    // 免遊計數不能依賴 ATG 是否有附房號；沒有 identity 時就用本次遊戲 runtime key。
    const roomKey = state.currentRoomKey || RUNTIME_ROOM_KEY;
    const next = evolveRoomFreeEntryCounter({
      roomKey: state.currentRoomKey,
      roomNumber: state.currentRoomNumber,
      count: state.roomFreeGameEntries,
      inProgress: state.roomFreeGameInProgress,
      lastEntrySpinId: state.roomFreeGameLastEntrySpinId
    }, {
      roomKey,
      roomNumber: state.currentRoomNumber,
      active,
      entrySignal,
      spinId
    });

    const changed =
      next.count !== state.roomFreeGameEntries ||
      next.inProgress !== state.roomFreeGameInProgress ||
      next.lastEntrySpinId !== state.roomFreeGameLastEntrySpinId;
    state.roomFreeGameEntries = next.count;
    state.roomFreeGameInProgress = next.inProgress;
    state.roomFreeGameLastEntrySpinId = next.lastEntrySpinId;
    if (changed) saveRoomFreeEntrySession();
    return changed;
  }

  const initialRoomIdentity = resolveRoomIdentityFromUrl();
  if (initialRoomIdentity) {
    if (!restoreRoomFreeEntrySession(initialRoomIdentity.key)) applyRoomIdentity(initialRoomIdentity);
    else applyRoomIdentity(initialRoomIdentity);
  }

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
    let activeFlag = null;
    let positiveCount = null;
    let lastCount = null;

    const normalizeKey = key => String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const startKeys = new Set([
      'startfreegame','startfreespin','startfreespins','triggerfreegame','triggerfreespin','triggerfreespins',
      'freegamestart','freespinstart','freespinsstart','freegametriggered','freespintriggered','freespinstriggered'
    ]);
    const activeKeys = new Set([
      'isfreegame','isfreespin','isfreespins','infreegame','infreespin','infreespins',
      'freegameactive','freespinactive','freespinsactive','isfreegameactive','isfreespinactive'
    ]);
    const countKeys = new Set([
      'freegamecount','freegamescount','freespincount','freespinscount',
      'freegamesleft','freegameleft','freespinsleft','freespinleft',
      'remainingfreegame','remainingfreegames','remainingfreespin','remainingfreespins',
      'freegameremaining','freegamesremaining','freespinremaining','freespinsremaining'
    ]);

    const visit = (value, path = '', depth = 0, seen = new WeakSet()) => {
      if (!value || typeof value !== 'object' || depth > 6 || seen.has(value)) return;
      seen.add(value);
      const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
      for (const [rawKey, rawValue] of entries) {
        const key = normalizeKey(rawKey);
        const nextPath = path ? `${path}.${key}` : key;
        const pathLooksFree = /freegame|freespin/.test(nextPath);

        if (startKeys.has(key) && typeof rawValue === 'boolean') {
          sawExplicit = true;
          if (rawValue) startSignal = true;
        }

        if (activeKeys.has(key) && typeof rawValue === 'boolean') {
          sawExplicit = true;
          activeFlag = activeFlag === true ? true : rawValue;
        }

        if (countKeys.has(key)) {
          const n = toNumber(rawValue);
          if (n !== null) {
            sawExplicit = true;
            const c = Math.max(0, n);
            lastCount = c;
            if (c > 0) positiveCount = c;
          }
        }

        // 有些 ATG 遊戲會包成 freeGame/freeSpin 物件，內層只叫 start/active/count/left/remaining。
        if (pathLooksFree) {
          if ((key === 'start' || key === 'trigger' || key === 'triggered') && typeof rawValue === 'boolean') {
            sawExplicit = true;
            if (rawValue) startSignal = true;
          }
          if ((key === 'active' || key === 'isactive' || key === 'running' || key === 'inprogress') && typeof rawValue === 'boolean') {
            sawExplicit = true;
            activeFlag = activeFlag === true ? true : rawValue;
          }
          if (['count','left','remaining','remain','spins','times'].includes(key)) {
            const n = toNumber(rawValue);
            if (n !== null) {
              sawExplicit = true;
              const c = Math.max(0, n);
              lastCount = c;
              if (c > 0) positiveCount = c;
            }
          }
        }

        if (rawValue && typeof rawValue === 'object') visit(rawValue, nextPath, depth + 1, seen);
      }
    };

    for (const item of states) visit(item);

    const count = positiveCount !== null ? positiveCount : lastCount;
    return {
      sawExplicit,
      startSignal,
      count,
      activeSignal: startSignal || activeFlag === true || (count !== null && count > 0)
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

    const freeGameSignal = readFreeGameSignal(engine);
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

    if (updateRoomFreeEntryCounter(nextFreeGame.active, spinId, freeGameSignal.startSignal)) changed = true;

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

    let changed = false;
    const roomIdentity = resolveRoomIdentityFromEngine(engine);
    if (roomIdentity && applyRoomIdentity(roomIdentity)) changed = true;
    if (updateGeneralFromEngine(engine, finalState, spinId)) changed = true;
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
      completedSpins: state.completedSpins,
      currentRoomNumber: state.currentRoomNumber,
      currentRoomKey: state.currentRoomKey,
      roomFreeGameEntries: state.roomFreeGameEntries
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
      const response = await cloudFetch(`${WORKER}/push`, {
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
    state.pairMessage = '正在驗證配對碼…';
    state.pairBusy = true;
    state.replaced = false;
    render();

    let response;
    let result = {};
    try {
      response = await cloudFetch(`${WORKER}/pair/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairCode,
          deviceId: getDeviceId(),
          deviceName: deviceName(),
          platform: platformName()
        })
      });

      result = await response.json().catch(() => ({}));
    } catch (error) {
      throw new Error(`配對連線失敗：${error?.message || '無法連線'}`);
    }

    if (!response.ok || !result?.ok || !result?.deviceToken) {
      const reason =
        result?.error === 'pair_code_invalid_or_expired'
          ? '配對碼無效或已過期'
          : (result?.message || result?.error || `配對失敗（HTTP ${response.status}）`);
      throw new Error(reason);
    }

    deviceToken = result.deviceToken;
    localStorage.setItem(TOKEN_KEY, deviceToken);
    state.cloudStatus = '✅ 已綁定會員帳號';
    state.pairMessage = '✅ 配對成功';
    state.pairBusy = false;
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
        <button id="xinyaoPairButton" type="button" ${state.pairBusy ? 'disabled' : ''}
          style="border:0;border-radius:8px;background:#ff5f9e;color:#fff;padding:6px 8px;font-size:11px;font-weight:800;cursor:pointer;opacity:${state.pairBusy ? '.55' : '1'};">${state.pairBusy ? '配對中…' : '綁定'}</button>
      </div>
      <div id="xinyaoPairMessage" style="font-size:9px;margin-top:5px;opacity:.82;color:${state.pairMessage.startsWith('✅') ? '#9ff0be' : '#ffd0df'};">${state.pairMessage || ''}</div>
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
      <div class="xinyaoRow"><span>本房免遊次數</span><b>${state.roomFreeGameEntries} 次</b></div>
      <div class="xinyaoRow"><span>本次完成轉數</span><b>${state.completedSpins}</b></div>
      <div class="xinyaoLine"></div>
      <div style="text-align:right;font-size:10px;opacity:.62;">最後同步 ${state.lastSync || '—'}</div>
      <div style="margin-top:2px;text-align:right;font-size:9px;opacity:.45;">本房免遊次數：有房號時依房計算；無房號時依本次進房工作階段計算</div>
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
        if (state.pairBusy) return;
        try {
          await claimPairCode(input?.value);
        } catch (error) {
          state.pairBusy = false;
          state.pairMessage = error?.message || '配對失敗';
          state.cloudStatus = '配對失敗';
          render();
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
      freeGameTextFor,
      evolveRoomFreeEntryCounter,
      resolveRoomIdentityFromEngine
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


/* ===== 芯瑤 ATG 全房分析 v3.1.4｜全裝置自適應＋免彈窗同步＋掃描結果持久化 ===== */
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

    // 平滑動態分數：不再把高得分率硬截在固定上限。
    // 投注量越少，訊號越靠近中性 50；資料量越充足，才讓得分率差異完整反映。
    const weightedSignal = (rate, bet, volumeScale, rateSpread) => {
      if (rate === null) return null;
      const volume = Math.max(0, finiteNumber(bet) || 0);
      const volumeWeight = clamp(Math.log10(volume + 1) / volumeScale, 0.25, 1);
      return Math.tanh((rate - 100) / rateSpread) * volumeWeight;
    };

    const todaySignal = weightedSignal(todayRate, room?.today?.bet, 6.0, 60);
    const totalSignal = weightedSignal(totalRate, room?.bet, 6.5, 55);

    let observationScore = null;
    if (todaySignal !== null || totalSignal !== null) {
      let combinedSignal;
      if (todaySignal !== null && totalSignal !== null) {
        combinedSignal = todaySignal * 0.65 + totalSignal * 0.35;
      } else {
        combinedSignal = todaySignal ?? totalSignal;
      }
      observationScore = clamp(50 + combinedSignal * 50, 0, 100);
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

  // 房號才是 4100 房真正穩定的唯一鍵；roomId 在不同批次/頁面不保證適合作為累積鍵。
  function roomStorageKey(room) {
    const number = finiteNumber(room?.number);
    if (number !== null && number >= 1 && number <= 4100) return `n:${number}`;
    const roomId = finiteNumber(room?.roomId);
    return roomId !== null ? `id:${roomId}` : null;
  }

  // ATG Binary frame 常見格式：04 + zlib(78 9C/DA/01/5E...)。
  // 不寫死只跳 1 byte，而是在前 32 bytes 內找合法 zlib header。
  function findZlibOffset(input) {
    let bytes;
    try {
      if (input instanceof Uint8Array) bytes = input;
      else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
      else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      else return -1;
    } catch (_) {
      return -1;
    }

    const limit = Math.min(Math.max(0, bytes.length - 1), 32);
    for (let i = 0; i < limit; i++) {
      const cmf = bytes[i];
      const flg = bytes[i + 1];
      if ((cmf & 0x0f) !== 8) continue; // deflate
      if (((cmf << 8) + flg) % 31 !== 0) continue;
      return i;
    }
    return -1;
  }

  async function inflateZlibText(bytes) {
    const chunk = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

    // 現代 Chrome / Edge / Safari 優先走原生 API，不需額外套件。
    if (typeof DecompressionStream === 'function') {
      const stream = new Blob([chunk]).stream().pipeThrough(new DecompressionStream('deflate'));
      return await new Response(stream).text();
    }

    // 某些 ATG 頁面本身有 pako，舊瀏覽器可直接借用。
    const pako = typeof globalThis !== 'undefined' ? globalThis.pako : null;
    if (pako && typeof pako.inflate === 'function') {
      const out = pako.inflate(chunk);
      return new TextDecoder().decode(out);
    }

    return '';
  }

  async function decodeBinaryFrameToText(input) {
    let bytes;
    try {
      if (input instanceof Uint8Array) bytes = input;
      else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
      else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      else if (typeof Blob !== 'undefined' && input instanceof Blob) bytes = new Uint8Array(await input.arrayBuffer());
      else return '';
    } catch (_) {
      return '';
    }

    if (!bytes.length) return '';

    const zlibOffset = findZlibOffset(bytes);
    if (zlibOffset >= 0) {
      try {
        const text = await inflateZlibText(bytes.subarray(zlibOffset));
        if (text && text.trim()) return text;
      } catch (_) {}
    }

    // 少數 frame 不是壓縮資料；保留直接 UTF-8 解碼 fallback。
    try {
      const direct = new TextDecoder().decode(bytes);
      if (direct && direct.trim()) return direct.replace(/^\u0004+/, '');
    } catch (_) {}

    return '';
  }

  // ===== 全裝置自適應頁碼定位 =====
  // 不再用「某一支手機 / 某一種解析度」寫死座標。
  // 先從目前畫面挑出真正的遊戲 surface，再準備多組安全的頁碼列假設；
  // 實際點擊後用 ATG 回來的房號區間判斷落在哪一頁，自動修正 X / Y 並記住。
  function selectAdaptiveGameSurface(viewportWidth, viewportHeight, canvasRects = []) {
    const vw = Math.max(1, finiteNumber(viewportWidth) || 1);
    const vh = Math.max(1, finiteNumber(viewportHeight) || 1);
    const viewportArea = vw * vh;

    const rows = (Array.isArray(canvasRects) ? canvasRects : [])
      .map((r, index) => {
        const left = finiteNumber(r?.left) || 0;
        const top = finiteNumber(r?.top) || 0;
        const width = finiteNumber(r?.width) || 0;
        const height = finiteNumber(r?.height) || 0;
        const area = finiteNumber(r?.area) || width * height;
        const widthRatio = width / vw;
        const heightRatio = height / vh;
        const coverage = area / viewportArea;
        const centerX = left + width / 2;
        const centerY = top + height / 2;
        const centerDistance = Math.hypot((centerX - vw / 2) / vw, (centerY - vh / 2) / vh);
        return { index, left, top, width, height, area, widthRatio, heightRatio, coverage, centerDistance };
      })
      .filter(r => r.width >= Math.min(300, vw * 0.45) && r.height >= Math.min(260, vh * 0.45));

    const ranked = rows
      .filter(r => r.coverage >= 0.34 && r.widthRatio >= 0.45 && r.heightRatio >= 0.45)
      .map(r => ({
        ...r,
        score: r.coverage * 6 + Math.min(r.widthRatio, 1) + Math.min(r.heightRatio, 1) - r.centerDistance * 2.5
      }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (best) {
      return {
        source: 'canvas',
        canvasIndex: best.index,
        rect: {
          left: best.left,
          top: best.top,
          width: best.width,
          height: best.height,
          area: best.area
        }
      };
    }

    return {
      source: 'viewport',
      canvasIndex: -1,
      rect: { left: 0, top: 0, width: vw, height: vh, area: viewportArea }
    };
  }

  function buildAdaptivePagerHypotheses(rect, viewportWidth, viewportHeight) {
    if (!rect) return [];
    const width = Math.max(1, finiteNumber(rect.width) || 1);
    const height = Math.max(1, finiteNumber(rect.height) || 1);
    const ratio = width / height;
    const vw = Math.max(1, finiteNumber(viewportWidth) || width);
    const vh = Math.max(1, finiteNumber(viewportHeight) || height);
    const viewportRatio = vw / vh;
    const hypotheses = [];
    const add = (id, x0, step, y, showAllX, showAllY) => {
      const lastX = x0 + step * 8;
      if (x0 <= 0.01 || step <= 0.015 || lastX >= 0.98 || y <= 0.08 || y >= 0.38) return;
      hypotheses.push({ id, x0, step, y, showAllX, showAllY });
    };

    if (ratio >= 1.35 || viewportRatio >= 1.25) {
      // 已驗證的兩種 ATG landscape 排版 + 中間值。
      // 實際裝置若不是其中任何一種，後續 landing feedback 仍會自動修正。
      add('landscape-compact', 0.1771, 0.0528, 0.1814, 0.2430, 0.1050);
      add('landscape-wide',    0.0755, 0.0732, 0.2270, 0.1000, 0.1300);
      add('landscape-mid',     0.1230, 0.0625, 0.2050, 0.1700, 0.1180);
    } else if (ratio <= 0.90 || viewportRatio <= 0.85) {
      add('portrait-main', 0.0520, 0.0990, 0.1810, 0.4430, 0.1470);
      add('portrait-mid',  0.0700, 0.0910, 0.2050, 0.4300, 0.1500);
      add('portrait-wide', 0.0950, 0.0820, 0.2300, 0.4150, 0.1600);
    } else {
      // 平板、分割畫面、特殊縮放比例。
      add('balanced-a', 0.1050, 0.0740, 0.1900, 0.1900, 0.1250);
      add('balanced-b', 0.1350, 0.0640, 0.2150, 0.2050, 0.1350);
      add('balanced-c', 0.0700, 0.0830, 0.2350, 0.1750, 0.1450);
    }

    return hypotheses;
  }

  // 舊函式名稱保留，避免其他程式碼需要大改；但內部已是全裝置自適應。
  function selectFixedPagerProfile(viewportWidth, viewportHeight, canvasRects = []) {
    const vw = Math.max(1, finiteNumber(viewportWidth) || 1);
    const vh = Math.max(1, finiteNumber(viewportHeight) || 1);
    const surface = selectAdaptiveGameSurface(vw, vh, canvasRects);
    const hypotheses = buildAdaptivePagerHypotheses(surface.rect, vw, vh);
    const primary = hypotheses[0] || {
      id: 'fallback', x0: 0.12, step: 0.07, y: 0.21, showAllX: 0.18, showAllY: 0.13
    };
    const aspect = surface.rect.width / Math.max(1, surface.rect.height);
    const viewportAspect = vw / vh;
    const layout = (aspect >= 1.35 || viewportAspect >= 1.25)
      ? '橫版自適應'
      : ((aspect <= 0.90 || viewportAspect <= 0.85) ? '直版自適應' : '平板自適應');
    return {
      key: 'adaptive-surface',
      layout,
      source: surface.source,
      canvasIndex: surface.canvasIndex,
      rect: surface.rect,
      hypotheses,
      ...primary
    };
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

  // ATG 遊戲畫面固定採 9:16 內容區置中。頁碼列在遊戲內容區內的位置穩定，
  // 舊版座標推算保留為內部相容函式；一鍵掃描不使用此路徑。
  function computeGameViewportRect(viewportWidth, viewportHeight) {
    const vw = finiteNumber(viewportWidth);
    const vh = finiteNumber(viewportHeight);
    if (vw === null || vh === null || vw <= 0 || vh <= 0) return null;

    const aspect = 9 / 16;
    if (vw / vh >= aspect) {
      const height = vh;
      const width = height * aspect;
      return {
        left: (vw - width) / 2,
        top: 0,
        width,
        height
      };
    }

    const width = vw;
    const height = width / aspect;
    return {
      left: 0,
      top: (vh - height) / 2,
      width,
      height
    };
  }

  function pagePointFromGameLayout(page, viewportWidth, viewportHeight) {
    const p = finiteNumber(page);
    if (p === null || p < 2 || p > 9) return null;
    const rect = computeGameViewportRect(viewportWidth, viewportHeight);
    if (!rect) return null;

    // 依 ATG v1.1.5.3「選擇機台」頁碼列量測：2 在內容寬 15.1%，每格約 9.9%。
    const relativeX = 0.151 + (p - 2) * 0.099;
    const relativeY = 0.181;
    const absoluteX = rect.left + rect.width * relativeX;
    const absoluteY = rect.top + rect.height * relativeY;

    return {
      x: clamp(absoluteX / viewportWidth, 0.01, 0.99),
      y: clamp(absoluteY / viewportHeight, 0.01, 0.99)
    };
  }

  function buildAutoPagerSequence(totalPages = 9) {
    const total = clamp(finiteNumber(totalPages) || 9, 2, 9);
    const pages = [];
    for (let page = 2; page <= total; page++) pages.push(page);
    return pages;
  }

  function acceptPageTransitionEvidence({
    targetPage,
    currentPage,
    beforeSignature,
    afterSignature,
    beforeSeq,
    afterSeq,
    dataPageSeen
  } = {}) {
    const target = finiteNumber(targetPage);
    const current = finiteNumber(currentPage);
    const oldSeq = finiteNumber(beforeSeq) || 0;
    const newSeq = finiteNumber(afterSeq) || 0;
    if (target === null) return false;

    const stateConfirmed = current === target && Boolean(dataPageSeen);
    const domChanged = Boolean(
      beforeSignature &&
      afterSignature &&
      String(beforeSignature) !== String(afterSignature)
    );
    const dataConfirmed = newSeq > oldSeq && (current === target || Boolean(dataPageSeen));

    return stateConfirmed || domChanged || dataConfirmed;
  }


  function selectPagerRow(records) {
    const items = (Array.isArray(records) ? records : [])
      .map(item => ({
        ...item,
        page: finiteNumber(item?.page),
        x: finiteNumber(item?.x),
        y: finiteNumber(item?.y),
        width: finiteNumber(item?.width),
        height: finiteNumber(item?.height)
      }))
      .filter(item =>
        item.page !== null &&
        item.page >= 1 &&
        item.page <= 9 &&
        item.x !== null &&
        item.y !== null &&
        item.width !== null &&
        item.height !== null
      );

    if (!items.length) return [];

    const rows = [];
    for (const item of items) {
      const cy = item.y + item.height / 2;
      let row = rows.find(candidate =>
        Math.abs(candidate.cy - cy) <= Math.max(16, item.height * 0.65)
      );
      if (!row) {
        row = { cy, items: [] };
        rows.push(row);
      }
      row.items.push(item);
      row.cy = row.items.reduce((sum, v) => sum + v.y + v.height / 2, 0) / row.items.length;
    }

    const scored = rows
      .map(row => {
        const unique = new Map();
        for (const item of row.items) {
          const prev = unique.get(item.page);
          if (!prev || item.width * item.height < prev.width * prev.height) unique.set(item.page, item);
        }
        const ordered = [...unique.values()].sort((a, b) => a.x - b.x);
        const pages = ordered.map(item => item.page);
        let increasing = true;
        for (let i = 1; i < pages.length; i++) {
          if (pages[i] <= pages[i - 1]) {
            increasing = false;
            break;
          }
        }
        const span = ordered.length > 1
          ? (ordered[ordered.length - 1].x - ordered[0].x)
          : 0;
        const avgArea = ordered.length
          ? ordered.reduce((sum, item) => sum + item.width * item.height, 0) / ordered.length
          : Infinity;
        const score =
          ordered.length * 10000 +
          (increasing ? 5000 : 0) +
          Math.min(3000, Math.max(0, span)) -
          Math.min(2000, avgArea / 10);

        return { ordered, increasing, score };
      })
      .filter(row => row.ordered.length >= 4 && row.increasing)
      .sort((a, b) => b.score - a.score);

    return scored[0]?.ordered || [];
  }

  const SCRIPT_VERSION = '3.1.4';

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


  const FULL_SCAN_SESSION_TYPE = 'XIANYAO_ATG_FULL_SCAN_SESSION_V1';

  function normalizePageList(value) {
    const source = value instanceof Set ? [...value] : (Array.isArray(value) ? value : []);
    return [...new Set(source
      .map(finiteNumber)
      .filter(page => page !== null && page >= 1 && page <= 9)
      .map(page => Math.trunc(page)))]
      .sort((a, b) => a - b);
  }

  function buildFullScanSessionSnapshot(summary = {}) {
    const roomMap = new Map();
    for (const rawRoom of (Array.isArray(summary.rooms) ? summary.rooms : [])) {
      const room = normalizeRoom(rawRoom);
      if (!room) continue;
      const key = roomStorageKey(room);
      if (!key) continue;
      roomMap.set(key, {
        roomId: room.roomId,
        number: room.number,
        status: room.status,
        today: {
          bet: room.today?.bet ?? null,
          win: room.today?.win ?? null
        },
        bet: room.bet ?? null,
        win: room.win ?? null
      });
    }

    const rooms = [...roomMap.values()]
      .filter(room => finiteNumber(room.number) !== null)
      .sort((a, b) => a.number - b.number);
    const pagesSeen = normalizePageList(summary.pagesSeen);
    const dataPagesSeen = normalizePageList(summary.dataPagesSeen);

    return {
      type: FULL_SCAN_SESSION_TYPE,
      version: SCRIPT_VERSION,
      capturedAt: new Date().toISOString(),
      rankingSnapshotAt: String(summary.rankingSnapshotAt || new Date().toISOString()),
      totalTableCount: finiteNumber(summary.totalTableCount) ?? rooms.length,
      tablePerPage: finiteNumber(summary.tablePerPage) ?? 500,
      totalPages: finiteNumber(summary.totalPages) ?? 9,
      currentPage: finiteNumber(summary.currentPage),
      pagesSeen,
      dataPagesSeen,
      rooms
    };
  }

  function parseFullScanSessionSnapshot(raw) {
    let parsed = raw;
    try {
      if (typeof raw === 'string') parsed = JSON.parse(raw);
    } catch (_) {
      return null;
    }
    if (!parsed || typeof parsed !== 'object' || parsed.type !== FULL_SCAN_SESSION_TYPE) return null;

    const snapshot = buildFullScanSessionSnapshot({
      rooms: parsed.rooms,
      rankingSnapshotAt: parsed.rankingSnapshotAt || parsed.capturedAt,
      totalTableCount: parsed.totalTableCount,
      tablePerPage: parsed.tablePerPage,
      totalPages: parsed.totalPages,
      currentPage: parsed.currentPage,
      pagesSeen: parsed.pagesSeen,
      dataPagesSeen: parsed.dataPagesSeen
    });

    const requiredPages = [1,2,3,4,5,6,7,8,9];
    const complete = snapshot.rooms.length >= 4100 &&
      snapshot.totalTableCount >= 4100 &&
      snapshot.totalPages >= 9 &&
      requiredPages.every(page => snapshot.pagesSeen.includes(page)) &&
      requiredPages.every(page => snapshot.dataPagesSeen.includes(page));

    if (!complete) return null;

    return {
      ...snapshot,
      capturedAt: String(parsed.capturedAt || snapshot.capturedAt),
      rankingSnapshotAt: String(parsed.rankingSnapshotAt || parsed.capturedAt || snapshot.rankingSnapshotAt),
      rankingSnapshotRooms: snapshot.rooms
        .filter(room => room.status === 'Empty')
        .map(room => ({ ...room, today: { ...room.today } }))
    };
  }

  function markSharedHook(fn) {
    if (typeof fn !== 'function') return fn;
    try { Object.defineProperty(fn, '__xinyaoLiveV200Wrapped', { value: true, configurable: true }); } catch (_) {
      try { fn.__xinyaoLiveV200Wrapped = true; } catch (_) {}
    }
    try { Object.defineProperty(fn, '__xinyaoRoomScannerWrapped', { value: true, configurable: true }); } catch (_) {
      try { fn.__xinyaoRoomScannerWrapped = true; } catch (_) {}
    }
    return fn;
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
      'xinyao-sync-site': 'sync'
    };
    return actions[id] || null;
  }

  const core = {
    normalizeRoom,
    calculateMetrics,
    rankRooms,
    countNumberedRooms,
    roomStorageKey,
    findZlibOffset,
    decodeBinaryFrameToText,
    markSharedHook,
    selectAdaptiveGameSurface,
    buildAdaptivePagerHypotheses,
    selectFixedPagerProfile,
    buildPagerYProbeList,
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
    computeGameViewportRect,
    pagePointFromGameLayout,
    buildAutoPagerSequence,
    acceptPageTransitionEvidence,
    selectPagerRow,
    buildSyncPayload,
    buildFullScanSessionSnapshot,
    parseFullScanSessionSnapshot
  };

  if (typeof globalThis !== 'undefined' && globalThis.__XIANYAO_ATG_TEST__) {
    globalThis.__XIANYAO_ATG_CORE__ = core;
    return;
  }

  if (window.__XIANYAO_ATG_ROOM_SCANNER_V200__) return;
  window.__XIANYAO_ATG_ROOM_SCANNER_V200__ = true;

  const VERSION = SCRIPT_VERSION;
  const SITE_URL = 'https://xinyao-ai.github.io/xinyao-ai/?atgRooms=1';
  const SITE_ORIGIN = 'https://xinyao-ai.github.io';
  const SYNC_READY_TYPE = 'XIANYAO_ATG_SYNC_READY_V1';
  const SYNC_ACK_TYPE = 'XIANYAO_ATG_SYNC_ACK_V1';
  const FULL_SCAN_SESSION_KEY = 'xinyao_atg_full_scan_session_v1';
  let pendingSyncPayload = null;
  let syncHandshakeTimer = null;
  let syncLinkArmedUntil = 0;
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
    learnedPagerY: null,
    pagerSamples: [],
    adaptivePagerCalibration: null,
    pagerSurfaceSignature: '',
    events: [],
    lastSource: '等待資料',
    pageLoadSeq: 0,
    panel: null,
    scanRunning: false,
    scanAbort: false,
    scanVisited: new Set(),
    scanMessage: '尚未開始全房掃描',
    scanError: '',
    rankingSnapshotRooms: null,
    rankingSnapshotAt: '',
    latestTableNumbers: [],
    latestInferredPage: null,
    autoPagerProfile: null,
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

  function clearStoredFullScanSession() {
    try { sessionStorage.removeItem(FULL_SCAN_SESSION_KEY); } catch (_) {}
  }

  function resetFullScanData({ clearStored = true } = {}) {
    if (clearStored) clearStoredFullScanSession();
    state.roomMap.clear();
    state.pagesSeen = new Set();
    state.dataPagesSeen = new Set();
    state.totalTableCount = 0;
    state.tablePerPage = 0;
    state.totalPages = 0;
    state.currentPage = null;
    state.pageIntent = null;
    state.preferClickedPage = false;
    state.pageLoadSeq = 0;
    state.scanVisited = new Set();
    state.rankingSnapshotRooms = null;
    state.rankingSnapshotAt = '';
    state.latestTableNumbers = [];
    state.latestInferredPage = null;
  }

  function saveFullScanSession() {
    const snapshot = buildFullScanSessionSnapshot({
      rooms: [...state.roomMap.values()],
      rankingSnapshotAt: state.rankingSnapshotAt,
      totalTableCount: state.totalTableCount,
      tablePerPage: state.tablePerPage,
      totalPages: state.totalPages,
      currentPage: state.currentPage,
      pagesSeen: state.pagesSeen,
      dataPagesSeen: state.dataPagesSeen
    });

    if (snapshot.rooms.length < 4100 || snapshot.totalPages < 9) return false;
    try {
      sessionStorage.setItem(FULL_SCAN_SESSION_KEY, JSON.stringify(snapshot));
      return true;
    } catch (_) {
      return false;
    }
  }

  function restoreFullScanSession() {
    let raw = '';
    try { raw = sessionStorage.getItem(FULL_SCAN_SESSION_KEY) || ''; } catch (_) { return false; }
    if (!raw) return false;

    const snapshot = parseFullScanSessionSnapshot(raw);
    if (!snapshot) {
      clearStoredFullScanSession();
      return false;
    }

    state.roomMap.clear();
    for (const rawRoom of snapshot.rooms) {
      const room = normalizeRoom(rawRoom);
      const key = roomStorageKey(room);
      if (!room || !key) continue;
      state.roomMap.set(key, room);
    }

    state.pagesSeen = new Set(snapshot.pagesSeen);
    state.dataPagesSeen = new Set(snapshot.dataPagesSeen);
    state.totalTableCount = snapshot.totalTableCount;
    state.tablePerPage = snapshot.tablePerPage;
    state.totalPages = snapshot.totalPages;
    state.currentPage = snapshot.currentPage ?? 9;
    state.scanVisited = new Set(snapshot.pagesSeen);
    state.rankingSnapshotRooms = snapshot.rankingSnapshotRooms;
    state.rankingSnapshotAt = snapshot.rankingSnapshotAt;
    state.scanError = '';
    state.scanMessage = `✅ 已還原全房掃描｜${snapshot.rooms.length} / ${snapshot.totalTableCount}｜9 / 9 頁｜排行榜維持掃描完成時結果`;
    state.lastSource = 'sessionStorage 還原';
    return true;
  }

  restoreFullScanSession();

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


  // ATG 4100 房固定按 500 房分頁：001–500=1、501–1000=2 … 4001–4100=9。
  // 直接從伺服器回傳的房號判定實際頁面，不再依賴 tableMeta.currentPage。
  function inferPageFromRoomNumbers(numbers) {
    const clean = (Array.isArray(numbers) ? numbers : [])
      .map(finiteNumber)
      .filter(n => n !== null && n >= 1 && n <= 4100)
      .sort((a, b) => a - b);
    if (!clean.length) return null;
    const pivot = clean[Math.floor(clean.length / 2)];
    return clamp(Math.floor((pivot - 1) / 500) + 1, 1, 9);
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

    const key = roomStorageKey(room);
    if (!key) return false;

    const idFallbackKey = finiteNumber(room.roomId) !== null ? `id:${room.roomId}` : null;
    const prev = state.roomMap.get(key) || (idFallbackKey ? state.roomMap.get(idFallbackKey) : null) || {};

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

    if (idFallbackKey && idFallbackKey !== key) state.roomMap.delete(idFallbackKey);
    state.roomMap.set(key, merged);
    state.lastSource = source;
    return finiteNumber(merged.number) !== null;
  }

  function applyStatusUpdates(statusObj, source = 'slotTableUpdated') {
    if (!statusObj || typeof statusObj !== 'object' || Array.isArray(statusObj)) return 0;
    let changed = 0;

    for (const [roomIdRaw, status] of Object.entries(statusObj)) {
      const roomId = Number(roomIdRaw);
      if (!Number.isFinite(roomId) || typeof status !== 'string') continue;

      let matched = false;
      for (const [key, prev] of state.roomMap.entries()) {
        if (finiteNumber(prev?.roomId) !== roomId) continue;
        state.roomMap.set(key, {
          ...prev,
          status,
          updatedAt: new Date().toISOString()
        });
        matched = true;
        changed++;
      }

      if (!matched) {
        state.roomMap.set(`id:${roomId}`, {
          roomId,
          number: null,
          status,
          today: { bet: null, win: null },
          updatedAt: new Date().toISOString()
        });
        changed++;
      }
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
      const tableNumbers = [];
      for (const room of tables) {
        const n = finiteNumber(room?.number);
        if (n !== null) tableNumbers.push(n);
        if (upsertRoom(room, `${source}:tables`)) count++;
      }

      if (count || tableNumbers.length) {
        const intent = freshPageIntent();
        const inferredPage = inferPageFromRoomNumbers(tableNumbers);

        state.latestTableNumbers = tableNumbers.slice();
        state.latestInferredPage = inferredPage;

        // 真實房號優先；它比 ATG 偶爾卡住的 tableMeta.currentPage 更可靠。
        if (inferredPage !== null) {
          state.currentPage = inferredPage;
          state.pagesSeen.add(inferredPage);
          state.dataPagesSeen.add(inferredPage);
        } else if (intent) {
          state.currentPage = intent.page;
          state.pagesSeen.add(intent.page);
        }

        state.pageLoadSeq++;
        if (finiteNumber(state.currentPage) !== null) state.dataPagesSeen.add(state.currentPage);

        recordEvent('tableList', {
          count,
          currentPage: state.currentPage,
          inferredPage,
          firstRoom: tableNumbers.length ? Math.min(...tableNumbers) : null,
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

  const scannerJSONParse = markSharedHook(function (...args) {
    const result = nativeJSONParse(...args);
    try {
      ingestObject(result, 'JSON.parse');
      scheduleRender();
    } catch {}
    return result;
  });
  JSON.parse = scannerJSONParse;

  // ATG 某些翻頁資料會直接走 Response.json()，不一定經過全域 JSON.parse。
  // 直接攔截已解析完成的 Response 物件，避免畫面已換頁但掃描器收不到 data.tables。
  try {
    if (window.Response?.prototype?.json) {
      const nativeResponseJson = Response.prototype.json;
      if (!nativeResponseJson.__xinyaoRoomScannerWrapped) {
        Response.prototype.json = markSharedHook(async function (...args) {
          const result = await nativeResponseJson.apply(this, args);
          try {
            ingestObject(result, `Response.json:${sanitizeUrl(this?.url || '')}`);
            scheduleRender();
          } catch {}
          return result;
        });
      }
    }
  } catch {}

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
        // 不再只相信 Content-Type；ATG 某些資料回應標頭不是 json，但 body 仍是 JSON/text。
        clone.text().then(t => {
          if (t && t.trim()) processText(t, `fetch:${sanitizeUrl(response.url || url)}`);
        }).catch(() => {});
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
          if (this.responseType === 'json') {
            ingestObject(this.response, source);
          } else if (this.responseType === '' || this.responseType === 'text') {
            processText(this.responseText, source);
          } else if (this.responseType === 'arraybuffer' && this.response) {
            try {
              const text = new TextDecoder().decode(new Uint8Array(this.response));
              processText(text, `${source}:arraybuffer`);
            } catch {}
          } else if (this.responseType === 'blob' && this.response?.text) {
            this.response.text().then(t => processText(t, `${source}:blob`)).catch(() => {});
          }
          scheduleRender();
        } catch {}
      }, { once: true });

      return nativeSend.call(this, body);
    };
  }

  async function processBinarySocketData(data, source) {
    try {
      const text = await decodeBinaryFrameToText(data);
      if (!text || !text.trim()) return false;

      recordEvent('WS←binary', {
        source,
        preview: sanitizeText(text).slice(0, 280)
      });

      processText(text, `${source}:binary`);
      return true;
    } catch (error) {
      recordEvent('WS←binary-error', {
        source,
        error: String(error?.message || error).slice(0, 240)
      });
      return false;
    }
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
          if (typeof event.data === 'string') {
            processText(event.data, `WebSocket:${safeUrl}`);
          } else {
            processBinarySocketData(event.data, `WebSocket:${safeUrl}`).catch(() => {});
          }
        } catch {}
      });
      return ws;
    }

    XinyaoWebSocket.prototype = NativeWebSocket.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(key => {
      try { Object.defineProperty(XinyaoWebSocket, key, { value: NativeWebSocket[key] }); } catch {}
    });
    markSharedHook(XinyaoWebSocket);
    window.WebSocket = XinyaoWebSocket;
  }

  if (window.TextDecoder) {
    const nativeDecode = TextDecoder.prototype.decode;
    const scannerDecode = markSharedHook(function (...args) {
      const text = nativeDecode.apply(this, args);
      try {
        if (typeof text === 'string' && INTERESTING_TEXT.test(text)) processText(text, 'TextDecoder');
      } catch {}
      return text;
    });
    TextDecoder.prototype.decode = scannerDecode;
  }

  // 部分前端框架 / worker 會把已解析資料用 postMessage 傳回主執行緒。
  try {
    window.addEventListener('message', event => {
      try {
        const value = event?.data;
        if (value && typeof value === 'object') {
          ingestObject(value, 'window.message');
          scheduleRender();
        } else if (typeof value === 'string' && INTERESTING_TEXT.test(value)) {
          processText(value, 'window.message');
        }
      } catch {}
    }, true);
  } catch {}

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 12 && r.height > 12 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0;
  }

  function collectDeepRoots() {
    const roots = [];
    const seen = new Set();

    function visit(root) {
      if (!root || seen.has(root)) return;
      seen.add(root);
      roots.push(root);

      let all = [];
      try { all = [...root.querySelectorAll('*')]; } catch (_) {}
      for (const el of all) {
        try { if (el.shadowRoot) visit(el.shadowRoot); } catch (_) {}
        if (String(el.tagName || '').toLowerCase() === 'iframe') {
          try { if (el.contentDocument) visit(el.contentDocument); } catch (_) {}
        }
      }
    }

    visit(document);
    return roots;
  }

  function findPagerButtons() {
    // 先找一般 DOM，再穿透 open Shadow DOM / 同源 iframe。
    // 找不到也沒關係：scanAllPages 會自動切到 Canvas 點擊模式。
    const selector = 'button,[role="button"],a,li,div,span';
    const candidates = [];

    for (const root of collectDeepRoots()) {
      let nodes = [];
      try { nodes = [...root.querySelectorAll(selector)]; } catch (_) {}
      for (const el of nodes) {
        try {
          if (el.closest?.('#xinyao-atg-room-scanner,#xinyao-room-mini,#xinyao-atg-live-panel,#xinyao-copy-modal')) continue;
          if (!isVisible(el)) continue;
          const text = String(el.textContent || '').trim();
          if (!/^(?:[1-9])$/.test(text)) continue;
          candidates.push({ el, text });
        } catch (_) {}
      }
    }

    const groups = new Map();
    for (const c of candidates) {
      let ancestor = c.el.parentElement;
      for (let depth = 0; ancestor && depth < 8; depth++, ancestor = ancestor.parentElement) {
        if (!groups.has(ancestor)) groups.set(ancestor, new Map());
        const map = groups.get(ancestor);
        const page = Number(c.text);
        if (!map.has(page)) map.set(page, c.el);
      }
    }

    const viable = [...groups.entries()]
      .filter(([, map]) => map.size >= 7 && [2,3,4,5,6,7,8].every(n => map.has(n)))
      .map(([ancestor, map]) => {
        let area = Number.MAX_SAFE_INTEGER;
        try {
          const r = ancestor.getBoundingClientRect();
          area = Math.max(1, r.width * r.height);
        } catch (_) {}
        return { ancestor, map, area };
      })
      .sort((a, b) => a.area - b.area);

    if (!viable.length) return null;
    const out = new Map();
    for (const [page, el] of viable[0].map.entries()) {
      const clickable = el.closest?.('button,[role="button"],a') || el;
      out.set(page, clickable);
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

  function clickPagerElement(el) {
    if (!el || !el.isConnected) return false;

    // 先走 ATG 元素自己的 click handler；昨天可用版本就是這條路。
    try {
      el.click();
      return true;
    } catch (_) {}

    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    const target = document.elementFromPoint(x, y) || el;

    const pointerInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0
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

  function visibleCanvasRects() {
    const out = [];
    for (const canvas of document.querySelectorAll('canvas')) {
      try {
        const r = canvas.getBoundingClientRect();
        const cs = getComputedStyle(canvas);
        if (r.width < 260 || r.height < 260 || cs.display === 'none' || cs.visibility === 'hidden') continue;
        out.push({ el: canvas, left: r.left, top: r.top, width: r.width, height: r.height, area: r.width * r.height });
      } catch (_) {}
    }
    return out.sort((a, b) => b.area - a.area).slice(0, 4);
  }

  function profileSurfaceSignature(profile) {
    const r = profile?.rect;
    if (!r) return '';
    return [
      profile.source || 'unknown',
      Math.round(r.left), Math.round(r.top),
      Math.round(r.width), Math.round(r.height),
      Math.round(window.devicePixelRatio * 100) / 100
    ].join(':');
  }

  function resetAdaptivePagerLearning() {
    state.learnedPagerY = null;
    state.pagerSamples = [];
    state.adaptivePagerCalibration = null;
  }

  function fixedPagerProfile() {
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    const canvases = visibleCanvasRects();
    const selected = selectFixedPagerProfile(vw, vh, canvases);
    const source = selected.canvasIndex >= 0 ? canvases[selected.canvasIndex] : null;
    const profile = {
      ...selected,
      target: source?.el || null,
      rect: source || selected.rect
    };

    const signature = profileSurfaceSignature(profile);
    if (state.pagerSurfaceSignature && state.pagerSurfaceSignature !== signature) {
      resetAdaptivePagerLearning();
    }
    state.pagerSurfaceSignature = signature;
    return profile;
  }

  function activePagerCalibration(profile) {
    if (!profile) return null;
    if (state.adaptivePagerCalibration && state.pagerSurfaceSignature === profileSurfaceSignature(profile)) {
      return state.adaptivePagerCalibration;
    }
    return null;
  }

  function pointForFixedProfile(profile, page, hypothesis = null, xOverrideRatio = null, yOverrideRatio = null) {
    const p = finiteNumber(page);
    if (!profile || p === null || p < 1 || p > 9) return null;
    const r = profile.rect;
    const calibration = activePagerCalibration(profile);
    let ratioPoint = calibration ? pagePoint(calibration, p) : null;
    const h = hypothesis || profile.hypotheses?.[0] || profile;
    if (!ratioPoint) {
      ratioPoint = {
        x: h.x0 + (p - 1) * h.step,
        y: h.y
      };
    }
    const xr = finiteNumber(xOverrideRatio) ?? ratioPoint.x;
    const yr = finiteNumber(yOverrideRatio) ?? ratioPoint.y;
    return {
      x: r.left + r.width * xr,
      y: r.top + r.height * yr,
      xRatio: xr,
      yRatio: yr
    };
  }

  function filterPointForFixedProfile(profile) {
    if (!profile) return null;
    const r = profile.rect;
    const calibration = activePagerCalibration(profile);
    const h = profile.hypotheses?.[0] || profile;
    // show-all 不需要精準到單一像素；用目前版型主假設，並限制在遊戲 surface 內。
    const xRatio = h.showAllX ?? 0.18;
    const yRatio = calibration?.y ? Math.max(0.08, calibration.y - 0.075) : (h.showAllY ?? 0.13);
    return {
      x: r.left + r.width * xRatio,
      y: r.top + r.height * yRatio
    };
  }

  function buildPagerYProbeList(profile, learnedY = null) {
    if (!profile) return [];
    const values = [];
    const push = value => {
      const n = finiteNumber(value);
      if (n === null || n < 0.10 || n > 0.34) return;
      if (!values.some(v => Math.abs(v - n) < 0.0005)) values.push(n);
    };

    push(activePagerCalibration(profile)?.y);
    push(learnedY);
    for (const h of profile.hypotheses || []) {
      push(h.y);
      push(h.y - 0.012);
      push(h.y + 0.012);
    }
    // 最後才走通用安全帶，涵蓋瀏覽器縮放 / 平板分割畫面。
    [0.165, 0.185, 0.205, 0.225, 0.245, 0.265].forEach(push);
    return values;
  }

  function rememberPagerSample(profile, page, xRatio, yRatio) {
    const p = finiteNumber(page);
    const xr = finiteNumber(xRatio);
    const yr = finiteNumber(yRatio);
    if (!profile || p === null || xr === null || yr === null) return;
    state.pagerSamples = upsertCalibrationSample(state.pagerSamples, String(p), xr, yr);
    const calibration = buildPageCalibration(state.pagerSamples);
    if (calibration) state.adaptivePagerCalibration = calibration;
    state.learnedPagerY = yr;
  }

  function waitForPagerLanding(beforeSeq, beforePage, targetPage, timeout = 1800) {
    const target = finiteNumber(targetPage);
    return new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        const inferred = finiteNumber(state.latestInferredPage);
        const seqChanged = state.pageLoadSeq > beforeSeq;
        const targetCount = target !== null ? roomBandCount(target) : 0;
        if (target !== null && targetCount > 0 && inferred === target) {
          clearInterval(timer);
          resolve({ landedPage: inferred, seqChanged, targetCount });
          return;
        }
        if (seqChanged && inferred !== null && inferred !== finiteNumber(beforePage)) {
          clearInterval(timer);
          resolve({ landedPage: inferred, seqChanged, targetCount });
          return;
        }
        if (state.scanAbort || Date.now() - started >= timeout) {
          clearInterval(timer);
          resolve({ landedPage: inferred, seqChanged, targetCount });
        }
      }, 80);
    });
  }

  function dispatchClientPoint(x, y, targetOverride = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
    const target = targetOverride || document.elementFromPoint(Math.round(x), Math.round(y));
    if (!target) return false;

    const init = {
      bubbles: true, cancelable: true, composed: true,
      clientX: Math.round(x), clientY: Math.round(y),
      screenX: Math.round(x), screenY: Math.round(y),
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0
    };

    try { target.dispatchEvent(new PointerEvent('pointermove', { ...init, buttons: 0 })); } catch (_) {}
    try { target.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 })); } catch (_) {}
    try { target.dispatchEvent(new MouseEvent('mousedown', { ...init, buttons: 1 })); } catch (_) {}
    try { target.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 })); } catch (_) {}
    try { target.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 })); } catch (_) {}
    try { target.dispatchEvent(new MouseEvent('click', { ...init, buttons: 0 })); } catch (_) {}
    return true;
  }

  function roomBandCount(page) {
    const p = finiteNumber(page);
    if (p === null || p < 1 || p > 9) return 0;
    const min = (p - 1) * 500 + 1;
    const max = p === 9 ? 4100 : p * 500;
    let count = 0;
    for (const room of state.roomMap.values()) {
      const n = finiteNumber(room?.number);
      if (n !== null && n >= min && n <= max) count++;
    }
    return count;
  }

  function expectedBandCount(page) {
    return Number(page) === 9 ? 100 : 500;
  }

  function waitForPageBand(page, timeout = 8000) {
    const target = expectedBandCount(page);
    return new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        const count = roomBandCount(page);
        if (count >= target) {
          clearInterval(timer);
          resolve({ ok: true, count, target });
          return;
        }
        if (state.scanAbort || Date.now() - started >= timeout) {
          clearInterval(timer);
          resolve({ ok: false, count, target });
        }
      }, 100);
    });
  }

  function deepClickableByText(text) {
    for (const root of collectDeepRoots()) {
      let nodes = [];
      try { nodes = [...root.querySelectorAll('button,[role="button"],a,div,span')]; } catch (_) {}
      for (const el of nodes) {
        try {
          if (!isVisible(el)) continue;
          if (String(el.textContent || '').trim() !== text) continue;
          return el.closest?.('button,[role="button"],a') || el;
        } catch (_) {}
      }
    }
    return null;
  }

  async function ensureShowAll(profile) {
    // 能抓到 DOM 時直接點文字；抓不到（Canvas）就用該版型「顯示全部」固定位置。
    const dom = deepClickableByText('顯示全部');
    if (dom) {
      try { dom.click(); } catch (_) { clickPagerElement(dom); }
      await delay(700);
      return true;
    }

    const point = filterPointForFixedProfile(profile);
    if (!point) return false;
    dispatchClientPoint(point.x, point.y, profile.target || null);
    await delay(800);
    return true;
  }

  async function clickFixedPage(profile, page) {
    const targetCount = expectedBandCount(page);

    if (roomBandCount(page) >= targetCount) {
      state.scanVisited.add(page);
      state.pagesSeen.add(page);
      state.dataPagesSeen.add(page);
      return { ok: true, count: roomBandCount(page), target: targetCount, cached: true };
    }

    const calibration = activePagerCalibration(profile);
    const baseHypotheses = calibration
      ? [{ id: 'learned', x0: calibration.startX, step: calibration.stepX, y: calibration.y }]
      : (profile.hypotheses || []);
    const hypotheses = baseHypotheses.length ? baseHypotheses : [profile];
    const yCandidates = buildPagerYProbeList(profile, state.learnedPagerY);
    if (!yCandidates.length) {
      return { ok: false, reason: 'no-y-candidate', count: roomBandCount(page), target: targetCount };
    }

    for (const hypothesis of hypotheses) {
      const step = Math.abs(finiteNumber(hypothesis.step) || 0.06);
      for (const yRatio of yCandidates) {
        if (state.scanAbort) {
          return { ok: false, reason: 'aborted', count: roomBandCount(page), target: targetCount };
        }

        let xRatio = activePagerCalibration(profile)
          ? pagePoint(activePagerCalibration(profile), page)?.x
          : (hypothesis.x0 + (page - 1) * hypothesis.step);
        if (!Number.isFinite(xRatio)) continue;

        // 同一組 X/Y 最多用實際「落在哪一頁」回饋修正 3 次。
        for (let correction = 0; correction < 3; correction++) {
          xRatio = clamp(xRatio, 0.025, 0.965);
          const point = pointForFixedProfile(profile, page, hypothesis, xRatio, yRatio);
          if (!point) break;

          const beforeSeq = state.pageLoadSeq;
          const beforePage = state.latestInferredPage;
          const beforeBand = roomBandCount(page);
          setPageIntent(page);
          const sent = dispatchClientPoint(point.x, point.y, profile.target || null);
          if (!sent) {
            state.pageIntent = null;
            break;
          }

          state.scanMessage = `🤖 全裝置自動定位｜第 ${page} 頁｜${beforeBand}/${targetCount}`;
          scheduleRender();

          const landing = await waitForPagerLanding(beforeSeq, beforePage, page, 1700);
          const afterBand = roomBandCount(page);
          const landed = finiteNumber(landing.landedPage);

          if (afterBand > beforeBand || landed === page) {
            rememberPagerSample(profile, page, xRatio, yRatio);
            const settled = await waitForPageBand(page, 10000);
            state.pageIntent = null;
            if (settled.ok) {
              state.scanVisited.add(page);
              state.pagesSeen.add(page);
              state.dataPagesSeen.add(page);
              return {
                ok: true,
                ...settled,
                hypothesis: hypothesis.id || 'adaptive',
                xRatio,
                yRatio,
                corrected: correction
              };
            }
            if (settled.count > beforeBand) {
              return { ok: false, reason: 'partial-data-timeout', count: settled.count, target: settled.target };
            }
          }

          if (landed !== null && landed >= 1 && landed <= 9 && landed !== page) {
            // 點到鄰近頁時，不換裝置模板；直接依真實落頁修正 X。
            xRatio = clamp(xRatio + (page - landed) * step, 0.025, 0.965);
            state.pageIntent = null;
            await delay(100);
            continue;
          }

          state.pageIntent = null;
          break;
        }
      }
    }

    return {
      ok: false,
      reason: 'pager-auto-locate-failed',
      count: roomBandCount(page),
      target: targetCount
    };
  }

  function visibleRoomSignature() {
    const values = [];
    const seen = new Set();
    const nodes = document.querySelectorAll('div,span,button,p');

    for (const el of nodes) {
      if (values.length >= 80) break;
      if (el.closest?.('#xinyao-atg-room-scanner,#xinyao-room-mini,#xinyao-atg-live-panel,#xinyao-copy-modal')) continue;
      if (!isVisible(el)) continue;
      const text = String(el.textContent || '').trim();
      if (!/^\d{3,4}$/.test(text) || seen.has(text)) continue;
      seen.add(text);
      values.push(text);
    }

    return values.join('|');
  }

  function waitForNewPageData(beforeCount, beforeSeq, beforeSignature, timeout = 4200) {
    return new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        const count = numberedCount();
        const seqChanged = state.pageLoadSeq > beforeSeq;
        const signature = visibleRoomSignature();
        const domChanged = Boolean(
          beforeSignature &&
          signature &&
          String(beforeSignature) !== String(signature)
        );

        if (count > beforeCount || (seqChanged && domChanged)) {
          clearInterval(timer);
          resolve({
            changed: true,
            count,
            seqChanged,
            domChanged
          });
          return;
        }

        if (state.scanAbort || Date.now() - started > timeout) {
          clearInterval(timer);
          resolve({
            changed: false,
            count,
            seqChanged,
            domChanged
          });
        }
      }, 100);
    });
  }

  async function clickAndCollectPage(page, { allowNoChange = false } = {}) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (state.scanAbort) return { ok: false, changed: false };

      const pager = findPagerButtons();
      const btn = pager?.get(page);
      if (!btn) return { ok: false, changed: false, missing: true };

      const beforeCount = numberedCount();
      const beforeSeq = state.pageLoadSeq;
      const beforeSignature = visibleRoomSignature();

      setPageIntent(page);
      clickPagerElement(btn);

      const result = await waitForNewPageData(
        beforeCount,
        beforeSeq,
        beforeSignature,
        attempt === 1 ? 3600 : 5000
      );

      if (result.changed) {
        state.currentPage = page;
        state.pagesSeen.add(page);
        state.dataPagesSeen.add(page);
        state.pageIntent = null;
        return { ok: true, changed: true };
      }

      // 某一頁可能正好就是目前頁；沒有變化不代表整批掃描要失敗。
      if (allowNoChange) {
        state.pageIntent = null;
        return { ok: true, changed: false };
      }

      await delay(180);
    }

    state.pageIntent = null;
    return { ok: false, changed: false };
  }

  async function scanAllPages({ auto = false } = {}) {
    if (state.scanRunning) return;

    // 使用者主動重新掃描時才清除上一輪持久化結果；進房/重載不會清除。
    if (!auto) resetFullScanData({ clearStored: true });

    state.scanRunning = true;
    state.scanAbort = false;
    state.scanVisited = new Set();
    state.scanError = '';
    state.scanMessage = auto ? '自動刷新掃描中…' : '🤖 一鍵掃描中｜1～9 頁逐頁收完整資料';
    scheduleRender();

    const expected = state.totalTableCount || 4100;
    const pages = [1,2,3,4,5,6,7,8,9];
    const profile = fixedPagerProfile();

    // 全房資料來自 ATG 的 tables 回傳，與畫面「顯示全部 / 顯示空桌」篩選無關。
    // 因此不再為了切篩選器去猜座標，避免不同裝置誤點；只定位遊戲區與頁碼列。
    state.scanMessage = `🤖 ${profile.layout}｜正在自動定位遊戲區與頁碼列…`;
    scheduleRender();

    for (const page of pages) {
      if (state.scanAbort) break;

      const target = expectedBandCount(page);
      state.scanMessage = `🤖 第 ${page} / 9 頁｜等待房號資料 ${roomBandCount(page)} / ${target}｜總計 ${numberedCount()} / ${expected}`;
      scheduleRender();

      const result = await clickFixedPage(profile, page);
      if (!result.ok) {
        state.scanError = result.reason === 'pager-auto-locate-failed'
          ? `第 ${page} 頁未能自動切換成功；程式已嘗試頁碼列安全範圍，掃描停在此頁。`
          : `第 ${page} 頁資料收取失敗：目前 ${result.count ?? roomBandCount(page)} / ${result.target ?? target}。掃描已停在此頁，不會跳過。`;
        state.scanMessage = `掃描暫停｜總計 ${numberedCount()} / ${expected}`;
        state.scanRunning = false;
        scheduleRender();
        return;
      }

      state.scanMessage = `✅ 第 ${page} 頁已收完整 ${result.count}/${result.target}｜總計 ${numberedCount()} / ${expected}`;
      scheduleRender();
      await delay(250);
    }

    state.scanRunning = false;
    const count = numberedCount();
    const completePages = pages.filter(page => roomBandCount(page) >= expectedBandCount(page));

    if (state.scanAbort) {
      state.scanMessage = `已停止｜目前 ${count} / ${expected}`;
    } else if (completePages.length === 9 && count >= 4100) {
      const snapshotCount = captureRankingSnapshot();
      const persisted = saveFullScanSession();
      state.scanError = persisted ? '' : '掃描已完成，但瀏覽器未能保存本次全房資料；進房或重新整理後可能需要重新掃描。';
      state.scanMessage = `✅ 1～9 頁資料全部完成｜${count} / ${expected}｜排行榜已固定 ${snapshotCount} 個空房${persisted ? '｜已保存進房後可還原' : ''}`;
    } else {
      const missing = pages.filter(page => roomBandCount(page) < expectedBandCount(page));
      state.scanError = `資料仍未完整：第 ${missing.join('、')} 頁。`;
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
        if (!state.scanRunning) scanAllPages({ auto: true });
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

  function captureRankingSnapshot() {
    const snapshot = numberedRooms()
      .filter(r => r?.status === 'Empty')
      .map(r => normalizeRoom(r))
      .filter(Boolean);

    state.rankingSnapshotRooms = snapshot;
    state.rankingSnapshotAt = new Date().toISOString();
    return snapshot.length;
  }

  function topRooms() {
    const source = Array.isArray(state.rankingSnapshotRooms)
      ? state.rankingSnapshotRooms
      : numberedRooms();
    return rankRooms(source, { onlyEmpty: true, mode: ui.rankMode }).slice(0, ui.topN);
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

  function prepareSyncToXinyaoSite() {
    const rooms = numberedRooms();
    if (!rooms.length) {
      state.scanError = '目前沒有可同步的房號資料，請先完成全房掃描。';
      scheduleRender();
      return false;
    }

    pendingSyncPayload = buildSyncPayload(rooms, state);
    state.scanError = '';
    state.scanMessage = `準備同步 ${pendingSyncPayload.rooms.length} 房｜正在開啟芯瑤…`;
    scheduleRender();

    if (syncHandshakeTimer) clearTimeout(syncHandshakeTimer);
    syncHandshakeTimer = setTimeout(() => {
      syncHandshakeTimer = null;
      if (!pendingSyncPayload) return;
      state.scanError = '芯瑤頁面尚未回應同步要求；請回到此頁再按一次「同步到芯瑤」。';
      state.scanMessage = `同步等待中｜資料仍保留 ${pendingSyncPayload.rooms.length} 房`;
      scheduleRender();
    }, 20000);

    return true;
  }

  window.addEventListener('message', event => {
    if (event.origin !== SITE_ORIGIN) return;

    if (event.data?.type === SYNC_READY_TYPE) {
      if (!pendingSyncPayload) return;
      try {
        event.source?.postMessage(pendingSyncPayload, SITE_ORIGIN);
        state.scanError = '';
        state.scanMessage = `正在同步 ${pendingSyncPayload.rooms.length} 房到芯瑤…`;
        scheduleRender();
      } catch (_) {}
      return;
    }

    if (event.data?.type === SYNC_ACK_TYPE) {
      const rooms = Number(event.data?.rooms) || pendingSyncPayload?.rooms?.length || 0;
      pendingSyncPayload = null;
      if (syncHandshakeTimer) {
        clearTimeout(syncHandshakeTimer);
        syncHandshakeTimer = null;
      }
      state.scanError = '';
      state.scanMessage = `✅ 已同步 ${rooms} 房｜芯瑤「全房推薦」已更新`;
      scheduleRender();
    }
  }, true);

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

    // 手機上 ATG 資料更新很頻繁。使用者按住「同步到芯瑤」到 click 發生前，
    // 暫停重建面板，避免真正的 <a> 在 pointerdown / click 之間被替換掉。
    if (Date.now() < syncLinkArmedUntil) {
      const wait = Math.max(30, syncLinkArmedUntil - Date.now() + 20);
      if (!state.renderTimer) {
        state.renderTimer = setTimeout(() => {
          state.renderTimer = null;
          render();
        }, wait);
      }
      return;
    }

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
        掃描方式：🤖 一鍵自動掃描 1～9｜共用 JSON / WebSocket 攔截｜不需校準<br>
        <span style="${state.scanError ? 'color:#ff9a9a;' : 'color:#a7f3d0;'}">${escapeHtml(state.scanError || state.scanMessage)}</span>
      </div>

      <div style="margin-top:7px;background:rgba(255,255,255,.06);padding:7px 8px;border-radius:9px;font-size:10.5px;">${escapeHtml(bestText)}</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">
        <button id="xinyao-scan-all" style="${buttonStyle()}">${state.scanRunning ? '掃描中…' : '一鍵掃描 4100 房'}</button>
        <button id="xinyao-stop" style="${secondaryButtonStyle()}">停止掃描</button>
        <button id="xinyao-expand" style="${secondaryButtonStyle()}">${ui.expanded ? '收合分析' : '完整分析'}</button>
        <a id="xinyao-sync-site" href="https://xinyao-ai.github.io/xinyao-ai/?atgRooms=1" target="xinyao-atg-ai" style="${buttonStyle('grid-column:1 / -1;display:block;text-decoration:none;text-align:center;box-sizing:border-box;')}">🌸 同步到芯瑤</a>
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
      const link = event.target?.closest?.('a#xinyao-sync-site');
      if (link && panel.contains(link)) {
        syncLinkArmedUntil = Date.now() + 700;
        if (!prepareSyncToXinyaoSite()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

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
      } else if (action === 'sync') {
        // 同步按鈕已改為真正連結；由 click 事件準備握手資料，不在此攔截。
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

  window.addEventListener('resize', () => {
    resetAdaptivePagerLearning();
    state.pagerSurfaceSignature = '';
  }, { passive: true });

  window.addEventListener('orientationchange', () => {
    resetAdaptivePagerLearning();
    state.pagerSurfaceSignature = '';
  }, { passive: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForPairThenCreatePanel, { once: true });
  } else {
    waitForPairThenCreatePanel();
  }
})();
