// ==UserScript==
// @name         芯瑤💕 ATG 全房分析
// @namespace    xinyao-atg-room-scanner
// @version      1.0.1
// @description  一鍵掃描 ATG 全房、整理房號狀態與歷史統計、提供資料排行；資料只保留在本機，不自動上傳。
// @match        https://play.godeebxp.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

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

  const core = {
    normalizeRoom,
    calculateMetrics,
    rankRooms,
    countNumberedRooms,
    buildScanSequence
  };

  if (typeof globalThis !== 'undefined' && globalThis.__XIANYAO_ATG_TEST__) {
    globalThis.__XIANYAO_ATG_CORE__ = core;
    return;
  }

  if (window.__XIANYAO_ATG_ROOM_SCANNER_V100__) return;
  window.__XIANYAO_ATG_ROOM_SCANNER_V100__ = true;

  const VERSION = '1.0.0';
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
    events: [],
    lastSource: '等待資料',
    pageLoadSeq: 0,
    panel: null,
    scanRunning: false,
    scanAbort: false,
    scanVisited: new Set(),
    scanMessage: '尚未開始全房掃描',
    scanError: '',
    autoTimer: null,
    renderTimer: null
  };

  const now = () => new Date().toLocaleTimeString('zh-TW', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
    state.events.push({ time: now(), type, ...payload });
    if (state.events.length > 500) state.events.shift();
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

    const totalTableCount = finiteNumber(meta.totalTableCount);
    const currentPage = finiteNumber(meta.currentPage);
    const tablePerPage = finiteNumber(meta.tablePerPage);
    const totalPages = finiteNumber(meta.totalPages);

    if ([totalTableCount, currentPage, tablePerPage, totalPages].every(v => v === null)) return false;

    if (totalTableCount !== null) state.totalTableCount = totalTableCount;
    if (tablePerPage !== null) state.tablePerPage = tablePerPage;
    if (totalPages !== null) state.totalPages = totalPages;
    if (currentPage !== null) {
      state.currentPage = currentPage;
      state.pagesSeen.add(currentPage);
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
        state.pageLoadSeq++;
        if (finiteNumber(state.currentPage) !== null) state.dataPagesSeen.add(state.currentPage);
        recordEvent('tableList', {
          count,
          currentPage: state.currentPage,
          roomsKnown: numberedCount()
        });
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
        if (typeof data === 'string' && INTERESTING_TEXT.test(data)) {
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
      .filter(([, map]) => [1,2,3,4,5,6,7,8,9].every(n => map.has(n)))
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

  function waitForPage(page, beforeSeq, timeout = 8000) {
    return new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        const ok = state.currentPage === page && state.pageLoadSeq > beforeSeq && state.dataPagesSeen.has(page);
        if (ok) {
          clearInterval(timer);
          resolve(true);
          return;
        }
        if (state.scanAbort || Date.now() - started > timeout) {
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  async function scanAllPages({ auto = false } = {}) {
    if (state.scanRunning) return;
    const pager = findPagerButtons();
    if (!pager) {
      state.scanError = '找不到 1～9 頁選房按鈕，請先開啟「選擇機台」畫面。';
      state.scanMessage = '掃描未開始';
      scheduleRender();
      return;
    }

    const totalPages = state.totalPages || pager.size || 9;
    const startPage = finiteNumber(state.currentPage) || 1;
    const sequence = buildScanSequence(startPage, totalPages);

    state.scanRunning = true;
    state.scanAbort = false;
    state.scanVisited = new Set();
    state.scanError = '';
    state.scanMessage = auto ? '自動刷新掃描中…' : '全房掃描中…';
    scheduleRender();

    for (const page of sequence) {
      if (state.scanAbort) break;
      const freshPager = findPagerButtons();
      const btn = freshPager?.get(page);
      if (!btn) {
        state.scanError = `找不到第 ${page} 頁按鈕。`;
        break;
      }

      const beforeSeq = state.pageLoadSeq;
      state.scanMessage = `掃描第 ${page} / ${totalPages} 頁…`;
      scheduleRender();

      try { btn.click(); } catch {}
      const loaded = await waitForPage(page, beforeSeq, 8000);
      if (!loaded) {
        state.scanError = `第 ${page} 頁載入逾時，請再按一次「一鍵掃描」。`;
        break;
      }
      state.scanVisited.add(page);
      await delay(220);
    }

    state.scanRunning = false;
    const count = numberedCount();
    const expected = state.totalTableCount || 4100;
    const allPages = state.scanVisited.size >= totalPages;

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
        if (!state.scanRunning && findPagerButtons()) scanAllPages({ auto: true });
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
        scanMessage: state.scanMessage
      },
      note: '觀察分數僅依目前已取得的歷史統計排序，不代表未來結果或獲利保證。',
      topEmptyRooms: topRooms(),
      rooms,
      recentEvents: state.events.slice(-250)
    };
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
    const text = JSON.stringify(exportData(), null, 2);
    openCopyDialog(text);
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
        </div>`;
    }

    state.panel.style.width = ui.expanded ? '520px' : '330px';
    state.panel.style.maxHeight = ui.expanded ? '88vh' : 'none';
    state.panel.style.overflow = ui.expanded ? 'auto' : 'visible';

    state.panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:7px;">
        <div style="font-weight:800;font-size:14px;">🔎 芯瑤 ATG 全房分析 <span style="font-size:10px;opacity:.65;">v1.0 Final</span></div>
        <button id="xinyao-room-hide" style="${secondaryButtonStyle('padding:4px 8px;')}">縮小</button>
      </div>

      <div style="font-size:11px;line-height:1.65;">
        <span>${state.enabled ? '🟢 偵測中' : '⚪ 已暫停'}</span><br>
        已抓房號：<b>${count}</b> / ${expected}　頁數：<b>${pageKnown}</b> / ${pages}<br>
        目前頁：${state.currentPage ?? '—'}　已看頁：${escapeHtml(pageList)}<br>
        <span style="${state.scanError ? 'color:#ff9a9a;' : 'color:#a7f3d0;'}">${escapeHtml(state.scanError || state.scanMessage)}</span>
      </div>

      <div style="margin-top:7px;background:rgba(255,255,255,.06);padding:7px 8px;border-radius:9px;font-size:10.5px;">${escapeHtml(bestText)}</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">
        <button id="xinyao-scan-all" style="${buttonStyle()}">${state.scanRunning ? '掃描中…' : '一鍵掃描 4100 房'}</button>
        <button id="xinyao-stop" style="${secondaryButtonStyle()}">停止掃描</button>
        <button id="xinyao-room-copy" style="${secondaryButtonStyle()}">複製結果</button>
        <button id="xinyao-expand" style="${secondaryButtonStyle()}">${ui.expanded ? '收合分析' : '完整分析'}</button>
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

      <div style="margin-top:8px;font-size:9px;opacity:.55;line-height:1.45;">僅整理房號、狀態、投注與派彩統計；不輸出帳密、Cookie 或 Token，也不自動上傳。歷史統計不保證未來結果。</div>
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
    document.getElementById('xinyao-scan-all')?.addEventListener('click', () => scanAllPages());
    document.getElementById('xinyao-stop')?.addEventListener('click', stopScan);
    document.getElementById('xinyao-room-copy')?.addEventListener('click', copyResults);
    document.getElementById('xinyao-expand')?.addEventListener('click', () => { ui.expanded = !ui.expanded; scheduleRender(); });
    document.getElementById('xinyao-room-hide')?.addEventListener('click', () => {
      state.panel.style.display = 'none';
      mini.style.display = 'block';
    });
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
    document.getElementById('xinyao-prev')?.addEventListener('click', () => { ui.roomListPage = Math.max(1, ui.roomListPage - 1); scheduleRender(); });
    document.getElementById('xinyao-next')?.addEventListener('click', () => { ui.roomListPage += 1; scheduleRender(); });
  }

  function createPanel() {
    if (state.panel || !document.body) return;
    const panel = document.createElement('div');
    panel.id = 'xinyao-atg-room-scanner';
    panel.style.cssText = 'position:fixed;top:12px;right:12px;width:330px;z-index:2147483647;background:rgba(22,18,28,.97);color:#fff;padding:12px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.38);font-family:Arial,"Microsoft JhengHei",sans-serif;box-sizing:border-box;';
    document.body.appendChild(panel);
    state.panel = panel;

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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createPanel, { once: true });
  else createPanel();
})();
