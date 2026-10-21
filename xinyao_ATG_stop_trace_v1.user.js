// ==UserScript==
// @name         芯瑤 ATG 停止鍵追蹤器｜DEV
// @namespace    xinyao-atg-stop-trace
// @version      1.0.0
// @description  開發用：只追蹤 ATG 右下角 QuickStopBtn 真正執行的 Cocos 事件/方法，不自動下注、不改投注。
// @match        https://play.godeebxp.com/*
// @match        https://*.godeebxp.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const PANEL_ID = 'xinyao-atg-stop-trace-panel';
  const STORAGE_KEY = 'xinyao_atg_stop_trace_v1';
  const VERSION = '1.0.0';

  const state = {
    installed: false,
    ready: false,
    tracing: false,
    done: false,
    startedAt: 0,
    endedAt: 0,
    logs: [],
    snapshots: [],
    wrapped: new WeakSet(),
    cocosWindows: new WeakSet(),
    timer: null
  };

  function now() { return Date.now(); }
  function safe(fn, fallback = null) {
    try {
      const v = fn();
      return v === undefined ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function className(x) {
    return String(
      safe(() => x.__classname__, '') ||
      safe(() => x.constructor.__classname__, '') ||
      safe(() => x.constructor.name, '') ||
      ''
    );
  }

  function nodePath(node) {
    const parts = [];
    let cur = node;
    for (let i = 0; cur && i < 20; i += 1) {
      parts.push(String(cur.name || '?'));
      cur = cur.parent || cur._parent || null;
    }
    return parts.reverse().join('/');
  }

  function componentPath(component) {
    return nodePath(component?.node);
  }

  function small(v) {
    try {
      if (v == null) return v;
      const t = typeof v;
      if (t === 'string' || t === 'number' || t === 'boolean') return v;
      if (Array.isArray(v)) return { type:'array', length:v.length };
      if (v?.node) return { component: className(v), nodePath: nodePath(v.node) };
      if (v?.name && (v.parent || v._parent)) return { nodePath: nodePath(v) };
      return { type: className(v) || t };
    } catch (_) {
      return '?';
    }
  }

  function log(kind, data = {}) {
    if (!state.tracing && !/trace-start|trace-end|ready/.test(kind)) return;
    state.logs.push({
      at: now(),
      dt: state.startedAt ? now() - state.startedAt : 0,
      kind,
      ...data
    });
    if (state.logs.length > 800) state.logs.splice(0, state.logs.length - 800);
    render();
  }

  function sameOriginWindows() {
    const out = [];
    const seen = new Set();
    const walk = w => {
      if (!w || seen.has(w)) return;
      seen.add(w);
      out.push(w);
      try {
        for (let i = 0; i < w.frames.length; i += 1) {
          try {
            const f = w.frames[i];
            void f.location.href;
            walk(f);
          } catch (_) {}
        }
      } catch (_) {}
    };
    walk(window);
    return out;
  }

  function getCocos(w) {
    return w?.cc || w?.legacyCC || w?._cc || null;
  }

  function sceneFor(w) {
    const cc = getCocos(w);
    return cc?.director?.getScene?.() || null;
  }

  function allComponents(w) {
    const cc = getCocos(w);
    const scene = sceneFor(w);
    const Component = cc?.Component;
    if (!scene || !Component || typeof scene.getComponentsInChildren !== 'function') return [];
    try { return scene.getComponentsInChildren(Component) || []; } catch (_) { return []; }
  }

  function allButtons(w) {
    const cc = getCocos(w);
    const scene = sceneFor(w);
    const Button = cc?.Button;
    if (!scene || !Button || typeof scene.getComponentsInChildren !== 'function') return [];
    try { return scene.getComponentsInChildren(Button) || []; } catch (_) { return []; }
  }

  function findQuickStop(w) {
    const buttons = allButtons(w);
    const matches = [];
    for (const button of buttons) {
      const n = button?.node;
      if (!n || n.activeInHierarchy === false) continue;
      const path = nodePath(n);
      const parentName = String(n.parent?.name || n._parent?.name || '');
      if (/(?:^|\/)QuickStopBtn\/Button$/i.test(path) || (/^QuickStopBtn$/i.test(parentName) && /^Button$/i.test(String(n.name || '')))) {
        matches.push({ w, cc:getCocos(w), button, buttonNode:n, quickNode:n.parent || n._parent || null, path });
      }
    }
    matches.sort((a,b) => (/SpinBar/i.test(b.path)?1:0) - (/SpinBar/i.test(a.path)?1:0));
    return matches[0] || null;
  }

  function relevantComponents(w) {
    const comps = allComponents(w);
    return comps.filter(c => {
      const p = componentPath(c);
      const n = className(c);
      return /QuickStopBtn|SpinBarLandScape|autoSpinGroup|startAutoBtn/i.test(p) ||
             /SpinButton|EventComponent|Auto/i.test(n);
    });
  }

  function primitiveSnapshot(component) {
    const out = {};
    const names = new Set();
    let cur = component;
    for (let d = 0; cur && d < 5; d += 1) {
      try { Object.getOwnPropertyNames(cur).forEach(n => names.add(n)); } catch (_) {}
      try { cur = Object.getPrototypeOf(cur); } catch (_) { cur = null; }
    }
    for (const name of names) {
      if (name === 'node' || name === 'constructor') continue;
      const v = safe(() => component[name], undefined);
      if (['string','number','boolean'].includes(typeof v) || v === null) {
        out[name] = v;
      } else if (Array.isArray(v) && v.length <= 10 && v.every(x => ['string','number','boolean'].includes(typeof x))) {
        out[name] = v.slice();
      }
    }
    return out;
  }

  function takeSnapshot(label) {
    const snap = { label, at: now(), components: [] };
    for (const w of sameOriginWindows()) {
      for (const c of relevantComponents(w)) {
        snap.components.push({
          component: className(c),
          nodePath: componentPath(c),
          values: primitiveSnapshot(c)
        });
      }
    }
    state.snapshots.push(snap);
  }

  function wrapComponentMethods(component) {
    if (!component || state.wrapped.has(component)) return;
    state.wrapped.add(component);

    const names = new Set();
    let cur = component;
    for (let d = 0; cur && d < 6; d += 1) {
      try { Object.getOwnPropertyNames(cur).forEach(n => names.add(n)); } catch (_) {}
      try { cur = Object.getPrototypeOf(cur); } catch (_) { cur = null; }
    }

    const skip = /^(constructor|update|lateUpdate|onLoad|start|onEnable|onDisable|onDestroy|schedule|unschedule|setInterval|setTimeout)$/i;

    for (const name of names) {
      if (skip.test(name)) continue;
      const original = safe(() => component[name], null);
      if (typeof original !== 'function') continue;
      if (original.__XIANYAO_TRACE_WRAP__) continue;

      try {
        const wrapped = function(...args) {
          const p = componentPath(this);
          const n = className(this);
          const shouldLog = /QuickStopBtn|SpinBarLandScape|autoSpinGroup/i.test(p) || /SpinButton|EventComponent|Auto/i.test(n);
          if (state.tracing && shouldLog) {
            log('component-method', {
              component: n,
              nodePath: p,
              method: name,
              args: args.slice(0,4).map(small)
            });
          }
          return original.apply(this, args);
        };
        wrapped.__XIANYAO_TRACE_WRAP__ = true;
        wrapped.__XIANYAO_TRACE_ORIGINAL__ = original;
        component[name] = wrapped;
      } catch (_) {}
    }
  }

  function finishTrace(reason = 'captured') {
    if (!state.tracing) return;
    takeSnapshot('after');
    state.tracing = false;
    state.done = true;
    state.endedAt = now();
    state.logs.push({ at:now(), dt:now()-state.startedAt, kind:'trace-end', reason });

    const result = buildResult();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(result)); } catch (_) {}
    render();
  }

  function startTrace(reason = 'QuickStop touch') {
    if (state.tracing) return;
    state.logs = [];
    state.snapshots = [];
    state.done = false;
    state.startedAt = now();
    state.tracing = true;
    takeSnapshot('before');
    state.logs.push({ at:now(), dt:0, kind:'trace-start', reason });
    render();

    clearTimeout(state.timer);
    state.timer = setTimeout(() => finishTrace('timeout-after-stop-press'), 1800);
  }

  function installCocosHooks(w) {
    const cc = getCocos(w);
    if (!cc || state.cocosWindows.has(w)) return;
    state.cocosWindows.add(w);

    const EventHandler = cc?.Component?.EventHandler || cc?.EventHandler;
    if (EventHandler && typeof EventHandler.emitEvents === 'function' && !EventHandler.emitEvents.__XIANYAO_STOP_TRACE_V1__) {
      const original = EventHandler.emitEvents;
      const wrapped = function(events, ...params) {
        if (state.tracing) {
          const info = (Array.isArray(events) ? events : []).map(h => ({
            targetPath: nodePath(h?.target),
            component: String(h?.component || ''),
            handler: String(h?.handler || ''),
            customEventData: h?.customEventData == null ? '' : String(h.customEventData)
          }));
          log('EventHandler.emitEvents', { handlers: info, params: params.slice(0,3).map(small) });
        }
        return original.call(this, events, ...params);
      };
      wrapped.__XIANYAO_STOP_TRACE_V1__ = true;
      EventHandler.emitEvents = wrapped;
    }

    const NodeProto = cc?.Node?.prototype;
    if (NodeProto && typeof NodeProto.emit === 'function' && !NodeProto.emit.__XIANYAO_STOP_TRACE_V1__) {
      const original = NodeProto.emit;
      const wrapped = function(type, ...args) {
        const p = nodePath(this);
        const t = String(type || '');
        const quick = /QuickStopBtn/i.test(p);
        const spinbar = /SpinBarLandScape/i.test(p);

        if (quick && /(touch|click|mouse|pointer)/i.test(t)) {
          if (!state.tracing) startTrace(`${p} :: ${t}`);
          log('Node.emit', { nodePath:p, event:t, args:args.slice(0,3).map(small) });
          if (/(touch[-_]?end|click|mouseup|pointerup)/i.test(t)) {
            clearTimeout(state.timer);
            state.timer = setTimeout(() => finishTrace('quickstop-release'), 1100);
          }
        } else if (state.tracing && spinbar && /(touch|click|spin|auto|stop)/i.test(t)) {
          log('Node.emit', { nodePath:p, event:t, args:args.slice(0,3).map(small) });
        }

        return original.call(this, type, ...args);
      };
      wrapped.__XIANYAO_STOP_TRACE_V1__ = true;
      NodeProto.emit = wrapped;
    }

    state.ready = true;
    render();
  }

  function refreshTargets() {
    let found = false;
    for (const w of sameOriginWindows()) {
      try {
        const cc = getCocos(w);
        if (!cc) continue;
        installCocosHooks(w);

        const quick = findQuickStop(w);
        if (quick) found = true;

        for (const c of relevantComponents(w)) wrapComponentMethods(c);
      } catch (_) {}
    }
    state.ready = found;
    render();
  }

  function buildResult() {
    const before = state.snapshots.find(s => s.label === 'before') || null;
    const after = state.snapshots.find(s => s.label === 'after') || null;

    const changes = [];
    if (before && after) {
      const map = new Map(before.components.map(x => [`${x.component}|${x.nodePath}`, x]));
      for (const a of after.components) {
        const key = `${a.component}|${a.nodePath}`;
        const b = map.get(key);
        if (!b) continue;
        const keys = new Set([...Object.keys(b.values || {}), ...Object.keys(a.values || {})]);
        const diff = {};
        for (const k of keys) {
          const bv = JSON.stringify(b.values?.[k]);
          const av = JSON.stringify(a.values?.[k]);
          if (bv !== av) diff[k] = { before:b.values?.[k], after:a.values?.[k] };
        }
        if (Object.keys(diff).length) changes.push({ component:a.component, nodePath:a.nodePath, changes:diff });
      }
    }

    return {
      tracerVersion: VERSION,
      capturedAt: new Date().toISOString(),
      durationMs: state.endedAt && state.startedAt ? state.endedAt - state.startedAt : 0,
      ready: state.ready,
      logs: state.logs,
      changes
    };
  }

  async function copyResult() {
    const result = buildResult();
    const text = JSON.stringify(result, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      const el = document.getElementById('xinyao-trace-status');
      if (el) el.textContent = '✅ 已複製結果，直接貼回 ChatGPT';
    } catch (_) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        const el = document.getElementById('xinyao-trace-status');
        if (el) el.textContent = '✅ 已複製結果，直接貼回 ChatGPT';
      } catch (_) {}
    }
  }

  function render() {
    const root = document.getElementById(PANEL_ID);
    if (!root) return;
    const status = root.querySelector('#xinyao-trace-status');
    const copy = root.querySelector('#xinyao-trace-copy');
    if (status) {
      status.textContent =
        state.done ? '✅ 已抓到停止鍵真實流程' :
        state.tracing ? '🔴 正在記錄停止事件…' :
        state.ready ? '🟢 已就緒｜請手動按一次遊戲右下角 ■' :
        '🟡 等待 ATG 遊戲元件…';
    }
    if (copy) copy.style.display = state.done ? 'block' : 'none';
  }

  function mountPanel() {
    if (document.getElementById(PANEL_ID) || !document.documentElement) return;
    const box = document.createElement('div');
    box.id = PANEL_ID;
    box.style.cssText = 'position:fixed;right:12px;top:12px;z-index:2147483647;width:min(360px,calc(100vw - 24px));background:#18131d;color:#fff;border:1px solid #ff5f9e;border-radius:14px;padding:12px;font:700 12px -apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45)';
    box.innerHTML = `
      <div style="font-size:14px;font-weight:950;color:#ff8bb7;margin-bottom:6px;">🌸 芯瑤 ATG 停止鍵追蹤器</div>
      <div id="xinyao-trace-status">🟡 等待 ATG 遊戲元件…</div>
      <div style="font-size:10px;line-height:1.5;opacity:.75;margin-top:6px;">只做一次開發追蹤：開自動轉後，手動按一次真正的 ■。抓完後會員不需要做這件事。</div>
      <button id="xinyao-trace-copy" style="display:none;width:100%;margin-top:9px;border:0;border-radius:8px;background:#ff5f9e;color:#fff;padding:8px;font-weight:900;cursor:pointer;">📋 複製追蹤結果</button>
    `;
    document.documentElement.appendChild(box);
    box.querySelector('#xinyao-trace-copy')?.addEventListener('click', copyResult);
    render();
  }

  function boot() {
    mountPanel();
    refreshTargets();
    setInterval(refreshTargets, 700);
  }

  if (document.documentElement) boot();
  else {
    const t = setInterval(() => {
      if (!document.documentElement) return;
      clearInterval(t);
      boot();
    }, 50);
  }
})();