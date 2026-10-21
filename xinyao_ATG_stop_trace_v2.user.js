// ==UserScript==
// @name         芯瑤 ATG 停止鍵追蹤器｜DEV v2
// @namespace    xinyao-atg-stop-trace-v2
// @version      2.0.0
// @description  開發用：從 Cocos ComponentScheduler 直接抓 QuickStopBtn/SpinButton，追蹤真正停止流程。
// @match        https://play.godeebxp.com/*
// @match        https://*.godeebxp.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const PANEL_ID = 'xinyao-atg-stop-trace-v2-panel';
  const VERSION = '2.0.0';

  const S = {
    ready: false,
    tracing: false,
    done: false,
    startedAt: 0,
    logs: [],
    before: [],
    after: [],
    wrapped: new WeakSet(),
    hookedNodeProtos: new WeakSet(),
    hookedEventHandlers: new WeakSet(),
    timeout: null
  };

  const safe = (fn, fallback = null) => {
    try {
      const v = fn();
      return v === undefined ? fallback : v;
    } catch (_) {
      return fallback;
    }
  };

  function ccOf(w) {
    return safe(() => w.cc) || safe(() => w.legacyCC) || safe(() => w._cc) || null;
  }

  function directorOf(cc, w) {
    return safe(() => cc.director) ||
      safe(() => cc.Director.instance) ||
      safe(() => w.director) || null;
  }

  function schedulerOf(cc, director, w) {
    return safe(() => director._compScheduler) ||
      safe(() => director.compScheduler) ||
      safe(() => w._compScheduler) ||
      safe(() => w.compScheduler) ||
      safe(() => w.componentScheduler) ||
      safe(() => cc._compScheduler) ||
      safe(() => cc.compScheduler) ||
      safe(() => cc.componentScheduler) || null;
  }

  function collectArray(arr, out) {
    if (!Array.isArray(arr)) return;
    for (const x of arr) if (x && (typeof x === 'object' || typeof x === 'function')) out.add(x);
  }

  function collectInvoker(invoker, out) {
    if (!invoker) return;
    const buckets = [
      safe(() => invoker._neg), safe(() => invoker._zero), safe(() => invoker._pos),
      invoker
    ];
    for (const b of buckets) {
      if (!b) continue;
      if (Array.isArray(b)) {
        collectArray(b, out);
        continue;
      }
      collectArray(safe(() => b.array), out);
      collectArray(safe(() => b._array), out);
      collectArray(safe(() => b.components), out);
    }
  }

  function discoverComponents(w) {
    const cc = ccOf(w);
    const director = directorOf(cc, w);
    const scheduler = schedulerOf(cc, director, w);
    const out = new Set();
    if (!scheduler) return out;

    const invokers = [
      safe(() => scheduler.startInvoker),
      safe(() => scheduler.updateInvoker),
      safe(() => scheduler.lateUpdateInvoker),
      safe(() => scheduler._startInvoker),
      safe(() => scheduler._updateInvoker),
      safe(() => scheduler._lateUpdateInvoker),
      safe(() => scheduler._updating),
      safe(() => scheduler._lateUpdating),
      safe(() => scheduler.updating),
      safe(() => scheduler.lateUpdating)
    ];
    for (const invoker of invokers) collectInvoker(invoker, out);
    return out;
  }

  function sameOriginWindows() {
    const out = [];
    const seen = new Set();
    function walk(w) {
      if (!w || seen.has(w)) return;
      seen.add(w);
      out.push(w);
      try {
        for (let i = 0; i < w.frames.length; i++) {
          try {
            const f = w.frames[i];
            void f.location.href;
            walk(f);
          } catch (_) {}
        }
      } catch (_) {}
    }
    walk(window);
    return out;
  }

  function className(c) {
    return String(
      safe(() => c.__classname__, '') ||
      safe(() => c.constructor.__classname__, '') ||
      safe(() => c.constructor.name, '') ||
      ''
    );
  }

  function nodePath(node) {
    const parts = [];
    let cur = node;
    for (let i = 0; cur && i < 24; i++) {
      parts.push(String(cur.name || '?'));
      cur = cur.parent || cur._parent || null;
    }
    return parts.reverse().join('/');
  }

  function compPath(c) {
    return nodePath(c?.node);
  }

  function isQuickStopComponent(c) {
    const n = className(c);
    const p = compPath(c);
    return /SpinButton/i.test(n) && /(?:^|\/)QuickStopBtn(?:\/|$)/i.test(p);
  }

  function isRelatedComponent(c) {
    const n = className(c);
    const p = compPath(c);
    return /QuickStopBtn|SpinBarLandScape|autoSpinGroup|SpinButton\/Button/i.test(p) ||
      /SpinButton|EventComponent|AutoSpin|Auto/i.test(n);
  }

  function primitiveSnapshot(c) {
    const vals = {};
    const names = new Set();
    let cur = c;
    for (let d = 0; cur && d < 6; d++) {
      try { Object.getOwnPropertyNames(cur).forEach(x => names.add(x)); } catch (_) {}
      try { cur = Object.getPrototypeOf(cur); } catch (_) { cur = null; }
    }
    for (const name of names) {
      if (name === 'constructor' || name === 'node') continue;
      const v = safe(() => c[name], undefined);
      if (['string','number','boolean'].includes(typeof v) || v === null) {
        vals[name] = v;
      } else if (Array.isArray(v) && v.length <= 12 && v.every(x => ['string','number','boolean'].includes(typeof x))) {
        vals[name] = v.slice();
      }
    }
    return vals;
  }

  function snapshot() {
    const out = [];
    for (const w of sameOriginWindows()) {
      for (const c of discoverComponents(w)) {
        if (!isRelatedComponent(c)) continue;
        out.push({
          component: className(c),
          nodePath: compPath(c),
          values: primitiveSnapshot(c)
        });
      }
    }
    return out;
  }

  function small(v) {
    if (v == null) return v;
    const t = typeof v;
    if (['string','number','boolean'].includes(t)) return v;
    if (Array.isArray(v)) return { type:'array', length:v.length };
    if (v?.node) return { component:className(v), nodePath:compPath(v) };
    if (v?.name && (v.parent || v._parent)) return { nodePath:nodePath(v) };
    return { type: className(v) || t };
  }

  function push(kind, data = {}) {
    if (!S.tracing && kind !== 'trace-start' && kind !== 'trace-end') return;
    S.logs.push({
      at: Date.now(),
      dt: S.startedAt ? Date.now() - S.startedAt : 0,
      kind,
      ...data
    });
    if (S.logs.length > 1000) S.logs.shift();
    render();
  }

  function begin(reason) {
    if (S.tracing) return;
    S.logs = [];
    S.before = snapshot();
    S.after = [];
    S.startedAt = Date.now();
    S.tracing = true;
    S.done = false;
    S.logs.push({at:Date.now(),dt:0,kind:'trace-start',reason});
    clearTimeout(S.timeout);
    S.timeout = setTimeout(() => finish('timeout'), 1800);
    render();
  }

  function finish(reason) {
    if (!S.tracing) return;
    S.after = snapshot();
    S.tracing = false;
    S.done = true;
    S.logs.push({at:Date.now(),dt:Date.now()-S.startedAt,kind:'trace-end',reason});
    render();
  }

  function wrapComponent(c) {
    if (!c || S.wrapped.has(c)) return;
    S.wrapped.add(c);

    const names = new Set();
    let cur = c;
    for (let d = 0; cur && d < 7; d++) {
      try { Object.getOwnPropertyNames(cur).forEach(x => names.add(x)); } catch (_) {}
      try { cur = Object.getPrototypeOf(cur); } catch (_) { cur = null; }
    }

    const skip = /^(constructor|update|lateUpdate|onLoad|start|onEnable|onDisable|onDestroy|schedule|unschedule)$/i;

    for (const name of names) {
      if (skip.test(name)) continue;
      const original = safe(() => c[name], null);
      if (typeof original !== 'function' || original.__XIANYAO_TRACE_V2__) continue;

      try {
        const wrapped = function(...args) {
          const self = this || c;
          const n = className(self);
          const p = compPath(self);
          const quick = isQuickStopComponent(self);

          if (!S.tracing && quick) {
            begin(`${n}.${name} @ ${p}`);
          }

          if (S.tracing && isRelatedComponent(self)) {
            push('component-method', {
              component:n,
              nodePath:p,
              method:name,
              args:args.slice(0,4).map(small)
            });
          }

          return original.apply(this, args);
        };
        wrapped.__XIANYAO_TRACE_V2__ = true;
        wrapped.__XIANYAO_TRACE_ORIGINAL__ = original;

        try {
          Object.defineProperty(c, name, {
            configurable:true,
            writable:true,
            value:wrapped
          });
        } catch (_) {
          try { c[name] = wrapped; } catch (_) {}
        }
      } catch (_) {}
    }
  }

  function installGlobalHooks(w) {
    const cc = ccOf(w);
    if (!cc) return;

    const EventHandler = cc?.Component?.EventHandler || cc?.EventHandler;
    if (EventHandler && typeof EventHandler.emitEvents === 'function' && !EventHandler.emitEvents.__XIANYAO_TRACE_V2__) {
      const original = EventHandler.emitEvents;
      const wrapped = function(events, ...params) {
        const handlers = (Array.isArray(events) ? events : []).map(h => ({
          targetPath:nodePath(h?.target),
          component:String(h?.component || ''),
          handler:String(h?.handler || ''),
          customEventData:h?.customEventData == null ? '' : String(h.customEventData)
        }));
        const hasQuick = handlers.some(h => /QuickStopBtn/i.test(h.targetPath));
        if (!S.tracing && hasQuick) begin('EventHandler QuickStopBtn');
        if (S.tracing) push('EventHandler.emitEvents', {handlers,params:params.slice(0,3).map(small)});
        return original.call(this, events, ...params);
      };
      wrapped.__XIANYAO_TRACE_V2__ = true;
      EventHandler.emitEvents = wrapped;
    }

    const NodeProto = cc?.Node?.prototype;
    if (NodeProto && typeof NodeProto.emit === 'function' && !NodeProto.emit.__XIANYAO_TRACE_V2__) {
      const original = NodeProto.emit;
      const wrapped = function(type, ...args) {
        const p = nodePath(this);
        const t = String(type || '');
        const quick = /QuickStopBtn/i.test(p);
        if (!S.tracing && quick && /(touch|click|mouse|pointer)/i.test(t)) {
          begin(`${p} :: ${t}`);
        }
        if (S.tracing && (/QuickStopBtn|SpinBarLandScape/i.test(p) || /(stop|auto|spin|touch|click)/i.test(t))) {
          push('Node.emit',{nodePath:p,event:t,args:args.slice(0,3).map(small)});
        }
        const result = original.call(this, type, ...args);
        if (S.tracing && quick && /(touch[-_]?end|click|mouseup|pointerup)/i.test(t)) {
          clearTimeout(S.timeout);
          S.timeout = setTimeout(() => finish('QuickStop release captured'), 900);
        }
        return result;
      };
      wrapped.__XIANYAO_TRACE_V2__ = true;
      NodeProto.emit = wrapped;
    }
  }

  function diffSnapshots() {
    const out = [];
    const beforeMap = new Map(S.before.map(x => [`${x.component}|${x.nodePath}`,x]));
    for (const a of S.after) {
      const b = beforeMap.get(`${a.component}|${a.nodePath}`);
      if (!b) continue;
      const changes = {};
      const keys = new Set([...Object.keys(b.values || {}),...Object.keys(a.values || {})]);
      for (const k of keys) {
        if (JSON.stringify(b.values?.[k]) !== JSON.stringify(a.values?.[k])) {
          changes[k] = {before:b.values?.[k],after:a.values?.[k]};
        }
      }
      if (Object.keys(changes).length) out.push({component:a.component,nodePath:a.nodePath,changes});
    }
    return out;
  }

  function resultObject() {
    return {
      tracerVersion:VERSION,
      capturedAt:new Date().toISOString(),
      logs:S.logs,
      changes:diffSnapshots()
    };
  }

  async function copyResult() {
    const txt = JSON.stringify(resultObject(),null,2);
    try {
      await navigator.clipboard.writeText(txt);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position='fixed';
      ta.style.opacity='0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const s = document.getElementById('xinyao-trace-v2-status');
    if (s) s.textContent = '✅ 已複製，直接貼回 ChatGPT';
  }

  function scan() {
    let quickCount = 0;
    let relatedCount = 0;

    for (const w of sameOriginWindows()) {
      installGlobalHooks(w);
      const comps = discoverComponents(w);
      for (const c of comps) {
        if (isRelatedComponent(c)) {
          relatedCount++;
          wrapComponent(c);
        }
        if (isQuickStopComponent(c)) quickCount++;
      }
    }

    S.ready = quickCount > 0;
    const meta = document.getElementById('xinyao-trace-v2-meta');
    if (meta) meta.textContent = `QuickStop ${quickCount}｜相關元件 ${relatedCount}`;
    render();
  }

  function render() {
    const status = document.getElementById('xinyao-trace-v2-status');
    const copy = document.getElementById('xinyao-trace-v2-copy');
    if (status) {
      status.textContent =
        S.done ? '✅ 已抓到停止鍵真實流程' :
        S.tracing ? '🔴 正在記錄停止事件…' :
        S.ready ? '🟢 已就緒｜開自動轉後手動按一次 ■' :
        '🟡 正在從 Cocos Scheduler 尋找 QuickStopBtn…';
    }
    if (copy) copy.style.display = S.done ? 'block' : 'none';
  }

  function mount() {
    if (document.getElementById(PANEL_ID)) return;
    const root = document.createElement('div');
    root.id = PANEL_ID;
    root.style.cssText = 'position:fixed;right:12px;top:12px;z-index:2147483647;width:min(370px,calc(100vw - 24px));background:#18131d;color:#fff;border:1px solid #ff5f9e;border-radius:14px;padding:12px;font:700 12px -apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45)';
    root.innerHTML = `
      <div style="font-size:14px;font-weight:950;color:#ff8bb7;margin-bottom:5px;">🌸 芯瑤 ATG 停止鍵追蹤器 v2</div>
      <div id="xinyao-trace-v2-status">🟡 啟動中…</div>
      <div id="xinyao-trace-v2-meta" style="font-size:10px;opacity:.65;margin-top:4px;">QuickStop 0｜相關元件 0</div>
      <div style="font-size:10px;line-height:1.5;opacity:.75;margin-top:6px;">這版直接從 Cocos ComponentScheduler 抓元件，不再靠畫面 Scene 掃描。</div>
      <button id="xinyao-trace-v2-copy" style="display:none;width:100%;margin-top:9px;border:0;border-radius:8px;background:#ff5f9e;color:#fff;padding:8px;font-weight:900;cursor:pointer;">📋 複製追蹤結果</button>
    `;
    document.documentElement.appendChild(root);
    root.querySelector('#xinyao-trace-v2-copy')?.addEventListener('click',copyResult);
  }

  function boot() {
    mount();
    scan();
    setInterval(scan,600);
  }

  boot();
})();