// ==UserScript==
// @name         芯瑤💕 ATG 虎小妹進房探測器 DEV
// @namespace    xinyao-atg-tiger-room-probe
// @version      0.1.3
// @description  虎小妹專屬只讀探測器：只觀察 roomId / getSlotTableDetail / SlotTableView，不修改 test142、不自動進房。
// @match        https://play.godeebxp.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.__XIANYAO_TIGER_ROOM_PROBE__) return;
  window.__XIANYAO_TIGER_ROOM_PROBE__ = true;

  const STORE_KEY = 'xinyao_tiger_room_probe_v1';

  function loadSaved() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      return saved && typeof saved === 'object' ? saved : {};
    } catch (_) {
      return {};
    }
  }

  const saved = loadSaved();

  const state = {
    targetRoomNumber: Number.isFinite(Number(saved.targetRoomNumber)) ? Number(saved.targetRoomNumber) : null,
    targetRoomId: Number.isFinite(Number(saved.targetRoomId)) ? Number(saved.targetRoomId) : null,
    lastRawFrame: String(saved.lastRawFrame || ''),
    lastRawAt: Number(saved.lastRawAt || 0),
    lastDirectRoomId: Number.isFinite(Number(saved.lastDirectRoomId)) ? Number(saved.lastDirectRoomId) : null,
    lastDirectAt: Number(saved.lastDirectAt || 0),
    controller: null,
    active: false,
    note: saved.note ? String(saved.note) : '等待虎小妹模式'
  };

  function saveState() {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({
        targetRoomNumber: state.targetRoomNumber,
        targetRoomId: state.targetRoomId,
        lastRawFrame: state.lastRawFrame,
        lastRawAt: state.lastRawAt,
        lastDirectRoomId: state.lastDirectRoomId,
        lastDirectAt: state.lastDirectAt,
        note: state.note
      }));
    } catch (_) {}
  }

  const num = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  function isTigerMode() {
    // 先讀 test142 已經公開在頁面上的遊戲模式，這是最準的來源。
    try {
      if (String(window.__XIANYAO_ATG_ACTIVE_GAME_MODULE__ || '').toLowerCase() === 'tiger') {
        return true;
      }
    } catch (_) {}

    // 再用會員頁導入時留下的 window.name 標記。
    try {
      if (/^xinyao-hd-launch:tiger:/i.test(String(window.name || ''))) return true;
    } catch (_) {}

    // 最後才退回 ATG 同源 localStorage。
    try {
      return String(localStorage.getItem('xinyao_atg_active_game_module_v1') || '').toLowerCase() === 'tiger';
    } catch (_) {
      return false;
    }
  }

  function sameOriginWindows() {
    const out = [window];
    const seen = new Set([window]);
    const queue = [window];
    while (queue.length) {
      const w = queue.shift();
      let frames = [];
      try { frames = Array.from(w.frames || []); } catch (_) {}
      for (const f of frames) {
        if (seen.has(f)) continue;
        try {
          void f.location.href;
          seen.add(f);
          out.push(f);
          queue.push(f);
        } catch (_) {}
      }
    }
    return out;
  }

  function findSlotTableController() {
    for (const gameWindow of sameOriginWindows()) {
      try {
        const cocos = gameWindow.cc || gameWindow.legacyCC || gameWindow._cc;
        const scene = cocos?.director?.getScene?.();
        if (!scene) continue;

        const nodes = [scene];
        while (nodes.length) {
          const node = nodes.shift();
          if (!node) continue;

          const components = Array.isArray(node.components)
            ? node.components
            : (Array.isArray(node._components) ? node._components : []);

          for (const component of components) {
            if (!component || typeof component !== 'object') continue;

            let currentRoomId = null;
            let selectRoomId = null;
            let mapSize = null;
            let hasSetTableInfo = false;

            try { currentRoomId = num(component.currentRoomId); } catch (_) {}
            try { selectRoomId = num(component.selectRoomId); } catch (_) {}
            try {
              mapSize = component.slotTableMap instanceof Map
                ? component.slotTableMap.size
                : null;
            } catch (_) {}
            try { hasSetTableInfo = typeof component.setTableInfo === 'function'; } catch (_) {}

            if (
              (currentRoomId !== null || selectRoomId !== null) &&
              (mapSize !== null || hasSetTableInfo)
            ) {
              return {
                nodeName: String(node.name || ''),
                currentRoomId,
                selectRoomId,
                mapSize,
                hasSetTableInfo
              };
            }
          }

          let children = [];
          try { children = node.children || node._children || []; } catch (_) {}
          for (const child of children) nodes.push(child);
        }
      } catch (_) {}
    }
    return null;
  }

  function readStableCaptures() {
    try {
      const raw = window.__XIANYAO_ATG_RAW_SELECT_FRAME__;
      if (raw && typeof raw.data === 'string') {
        state.lastRawFrame = raw.data;
        state.lastRawAt = Number(raw.capturedAt || Date.now());
      }
    } catch (_) {}

    try {
      const direct = window.__XIANYAO_ATG_DIRECT_ROOM__;
      const candidates = [
        direct?.roomId,
        direct?.payload?.roomId,
        direct?.data?.roomId,
        direct?.args?.[0]?.roomId
      ];
      for (const value of candidates) {
        const n = num(value);
        if (n !== null) {
          state.lastDirectRoomId = Math.trunc(n);
          state.lastDirectAt = Number(direct?.capturedAt || direct?.at || Date.now());
          break;
        }
      }
    } catch (_) {}

    state.controller = findSlotTableController();
    saveState();
  }

  function parseRoomIdFromFrame(frame) {
    const s = String(frame || '');
    const m =
      s.match(/"roomId"\s*:\s*(\d+)/i) ||
      s.match(/getSlotTableDetail[^\d]+(\d+)/i);
    return m ? Number(m[1]) : null;
  }

  function resultObject() {
    const rawRoomId = parseRoomIdFromFrame(state.lastRawFrame);
    return {
      probeVersion: '0.1.0',
      tigerMode: isTigerMode(),
      target: {
        roomNumber: state.targetRoomNumber,
        roomId: state.targetRoomId
      },
      stableCapture: {
        rawRoomId,
        rawAt: state.lastRawAt || null,
        directRoomId: state.lastDirectRoomId,
        directAt: state.lastDirectAt || null
      },
      controller: state.controller,
      page: {
        href: location.href,
        name: String(window.name || '')
      }
    };
  }

  function esc(text) {
    return String(text ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function ensurePanel() {
    if (!document.body || document.getElementById('xinyao-tiger-room-probe')) return;

    const panel = document.createElement('div');
    panel.id = 'xinyao-tiger-room-probe';
    panel.style.cssText = [
      'position:fixed',
      'left:12px',
      'bottom:12px',
      'z-index:2147483646',
      'width:min(310px,calc(100vw - 24px))',
      'box-sizing:border-box',
      'padding:10px',
      'border:1px solid rgba(255,170,205,.48)',
      'border-radius:14px',
      'background:rgba(28,20,32,.96)',
      'color:#fff',
      'font-family:Arial,"Microsoft JhengHei",sans-serif',
      'box-shadow:0 12px 34px rgba(0,0,0,.35)',
      'font-size:11px'
    ].join(';');
    document.body.appendChild(panel);

    panel.addEventListener('click', async e => {
      const btn = e.target?.closest?.('[data-tiger-probe-action]');
      if (!btn) return;
      const action = btn.dataset.tigerProbeAction;

      if (action === 'refresh') {
        readStableCaptures();
        render();
        return;
      }

      if (action === 'clear') {
        state.targetRoomNumber = null;
        state.targetRoomId = null;
        state.lastRawFrame = '';
        state.lastRawAt = 0;
        state.lastDirectRoomId = null;
        state.lastDirectAt = 0;
        state.note = '已清除舊目標，請重新點排行榜的「進入此房」。';
        saveState();
        render();
        return;
      }

      if (action === 'copy') {
        const text = JSON.stringify(resultObject(), null, 2);
        try {
          await navigator.clipboard.writeText(text);
          state.note = '✅ 已複製檢測結果';
          saveState();
        } catch (_) {
          state.note = '⚠️ 無法自動複製，請直接截圖';
          saveState();
        }
        render();
      }
    });
  }

  function render() {
    const panel = document.getElementById('xinyao-tiger-room-probe');
    if (!panel) return;

    const active = isTigerMode();
    state.active = active;

    if (!active) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';

    const rawRoomId = parseRoomIdFromFrame(state.lastRawFrame);
    const c = state.controller || {};

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <b style="color:#ffb1d1;font-size:12px;">🐯 虎小妹進房探測 DEV</b>
        <span style="font-size:9px;opacity:.65;">只讀・不進房</span>
      </div>
      <div style="margin-top:7px;line-height:1.65;">
        <div>排行榜目標：<b>${esc(state.targetRoomNumber ?? '—')}</b> ｜ roomId=<b>${esc(state.targetRoomId ?? '—')}</b></div>
        <div>最近原生選房：roomId=<b>${esc(rawRoomId ?? state.lastDirectRoomId ?? '—')}</b></div>
        <div>控制器：current=<b>${esc(c.currentRoomId ?? '—')}</b> ｜ select=<b>${esc(c.selectRoomId ?? '—')}</b> ｜ map=<b>${esc(c.mapSize ?? '—')}</b></div>
      </div>
      <div style="margin-top:7px;padding:7px;border-radius:9px;background:rgba(255,255,255,.05);line-height:1.55;">
        ${esc(state.note)}
      </div>
      <div style="display:flex;gap:6px;margin-top:7px;">
        <button data-tiger-probe-action="refresh" type="button" style="flex:1;border:0;border-radius:8px;padding:7px;background:#ff5f9e;color:#fff;font-weight:900;cursor:pointer;">更新資料</button>
        <button data-tiger-probe-action="clear" type="button" style="flex:1;border:1px solid rgba(255,180,212,.35);border-radius:8px;padding:7px;background:rgba(255,255,255,.06);color:#fff;font-weight:900;cursor:pointer;">清除目標</button>
        <button data-tiger-probe-action="copy" type="button" style="flex:1;border:1px solid rgba(255,180,212,.35);border-radius:8px;padding:7px;background:rgba(255,255,255,.06);color:#fff;font-weight:900;cursor:pointer;">複製結果</button>
      </div>
    `;
  }

  function captureRankingTarget(event) {
    if (!isTigerMode()) return;
    const btn = event.target?.closest?.('.xinyao-enter-room');
    if (!btn) return;

    const roomNumber = num(btn.dataset.roomNumber);
    const roomId = num(btn.dataset.roomId);
    if (roomNumber === null && roomId === null) return;

    state.targetRoomNumber = roomNumber === null ? null : Math.trunc(roomNumber);
    state.targetRoomId = roomId === null ? null : Math.trunc(roomId);
    state.note =
      '✅ 已更新排行榜目標：' +
      (state.targetRoomNumber ?? '—') +
      ' 房｜roomId=' +
      (state.targetRoomId ?? '—') +
      '。現在請手動選同一房，再按「更新資料」。';
    saveState();
    readStableCaptures();
    render();
  }

  // pointerdown 會比主程式 click handler 更早發生；
  // 即使右上面板接著被重建，目標也已經先保存。
  document.addEventListener('pointerdown', captureRankingTarget, true);
  document.addEventListener('mousedown', captureRankingTarget, true);
  document.addEventListener('touchstart', captureRankingTarget, { capture:true, passive:true });
  document.addEventListener('click', captureRankingTarget, true);

  function tick() {
    if (!document.body) return;
    ensurePanel();
    if (isTigerMode()) {
      readStableCaptures();
      render();
    } else {
      const panel = document.getElementById('xinyao-tiger-room-probe');
      if (panel) panel.style.display = 'none';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tick, { once:true });
  } else {
    tick();
  }

  setInterval(tick, 700);
})();
