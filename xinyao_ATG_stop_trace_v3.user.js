// ==UserScript==
// @name         芯瑤 ATG 停止鍵追蹤器｜DEV v3
// @namespace    xinyao-atg-stop-trace-v3
// @version      3.0.0
// @description  開發用：手動武裝後，追蹤 ATG 真正停止自動轉時所有 Cocos Component 呼叫與狀態變化。
// @match        https://play.godeebxp.com/*
// @match        https://*.godeebxp.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const PANEL_ID = 'xinyao-atg-stop-trace-v3-panel';
  const VERSION = '3.0.0';

  const S = {
    ready: false,
    armed: false,
    tracing: false,
    done: false,
    startedAt: 0,
    armedAt: 0,
    logs: [],
    before: [],
    after: [],
    wrapped: new WeakSet(),
    timer: null,
    stopTimer: null,
    componentCount: 0
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
      safe(() => invoker._neg), safe(() => invoker._zero), safe(() => invoker._pos), invoker
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

  function small(v) {
    if (v == null) return v;
    const t = typeof v;
    if (['string','number','boolean'].includes(t)) return v;
    if (Array.isArray(v)) return {type:'array',length:v.length};
    if (v?.node) return {component:className(v),nodePath:compPath(v)};
    if (v?.name && (v.parent || v._parent)) return {nodePath:nodePath(v)};
    return {type:className(v) || t};
  }

  function primitiveSnapshot(c) {
    const vals = {};
    const names = new Set();
    let cur = c;
    for (let d = 0; cur && d < 5; d++) {
      try { Object.getOwnPropertyNames(cur).forEach(x => names.add(x)); } catch (_) {}
      try { cur = Object.getPrototypeOf(cur); } catch (_) { cur = null; }
    }

    for (const name of names) {
      if (name === 'constructor' || name === 'node') continue;
      const v = safe(() => c[name], undefined);
      if (['string','number','boolean'].includes(typeof v) || v === null) {
        vals[name] = v;
      } else if (Array.isArray(v) && v.length <= 20 && v.every(x => ['string','number','boolean'].includes(typeof x))) {
        vals[name] = v.slice();
      }
    }
    return vals;
  }

  function snapshotAll() {
    const out = [];
    for (const w of sameOriginWindows()) {
      for (const c of discoverComponents(w)) {
        const n = className(c);
        const p = compPath(c);
        if (!n && !p) continue;
        out.push({component:n,nodePath:p,values:primitiveSnapshot(c)});
      }
    }
    return out;
  }

  function log(kind, data = {}) {
    if (!S.tracing) return;
    S.logs.push({
      at:Date.now(),
      dt:Date.now()-S.startedAt,
      kind,
      ...data
    });
    if (S.logs.length > 2200) S.logs.shift();
  }

  function shouldIgnoreMethod(componentName, methodName, path) {
    const m = String(methodName || '');
    if (/^(update|lateUpdate|updateRenderer|fillBuffers|_render|postUpdateAssembler|getRenderMaterial|getMaterial|getMaterialInstance|markForUpdateRenderData|_canRender|getComponent|syncArrowAngle)$/i.test(m)) return true;
    if (/UILabel|Label|Sprite|Render|Mesh|Skeleton/i.test(componentName) && /render|material|buffer|color|dirty|assembler|opacity|entity|update/i.test(m)) return true;
    if (/SymbolView|ReelView\/[^/]+\/[^/]+$/i.test(path) && /render|update/i.test(m)) return true;
    return false;
  }

  function wrapComponent(c) {
    if (!c || S.wrapped.has(c)) return;
    S.wrapped.add(c);

    const names = new Set();
    let cur = c;
    for (let d = 0; cur && d < 6; d++) {
      try { Object.getOwnPropertyNames(cur).forEach(x => names.add(x)); } catch (_) {}
      try { cur = Object.getPrototypeOf(cur); } catch (_) { cur = null; }
    }

    for (const name of names) {
      if (/^(constructor|update|lateUpdate|onLoad|start|onEnable|onDisable|onDestroy|schedule|unschedule)$/i.test(name)) continue;
      const original = safe(() => c[name], null);
      if (typeof original !== 'function' || original.__XIANYAO_TRACE_V3__) continue;

      try {
        const wrapped = function(...args) {
          if (S.tracing) {
            const componentName = className(this || c);
            const path = compPath(this || c);
            if (!shouldIgnoreMethod(componentName, name, path)) {
              log('component-method',{
                component:componentName,
                nodePath:path,
                method:name,
                args:args.slice(0,5).map(small)
              });
            }
          }
          return original.apply(this,args);
        };
        wrapped.__XIANYAO_TRACE_V3__ = true;
        wrapped.__XIANYAO_TRACE_ORIGINAL__ = original;

        try {
          Object.defineProperty(c,name,{configurable:true,writable:true,value:wrapped});
        } catch (_) {
          try { c[name] = wrapped; } catch (_) {}
        }
      } catch (_) {}
    }
  }

  function installNodeHook(w) {
    const cc = ccOf(w);
    const proto = cc?.Node?.prototype;
    if (!proto || typeof proto.emit !== 'function' || proto.emit.__XIANYAO_TRACE_V3__) return;

    const original = proto.emit;
    const wrapped = function(type,...args) {
      if (S.tracing) {
        const p = nodePath(this);
        const t = String(type || '');
        if (/click|touch|mouse|pointer|spin|auto|stop|active-in-hierarchy-changed/i.test(t) ||
            /QuickStopBtn|autoSpinGroup|SpinButton/i.test(p)) {
          log('Node.emit',{nodePath:p,event:t,args:args.slice(0,4).map(small)});
        }
      }
      return original.call(this,type,...args);
    };
    wrapped.__XIANYAO_TRACE_V3__ = true;
    proto.emit = wrapped;
  }

  function installEventHandlerHook(w) {
    const cc = ccOf(w);
    const EH = cc?.Component?.EventHandler || cc?.EventHandler;
    if (!EH || typeof EH.emitEvents !== 'function' || EH.emitEvents.__XIANYAO_TRACE_V3__) return;

    const original = EH.emitEvents;
    const wrapped = function(events,...params) {
      if (S.tracing) {
        const handlers = (Array.isArray(events) ? events : []).map(h => ({
          targetPath:nodePath(h?.target),
          component:String(h?.component || ''),
          handler:String(h?.handler || ''),
          customEventData:h?.customEventData == null ? '' : String(h.customEventData)
        }));
        log('EventHandler.emitEvents',{handlers,params:params.slice(0,4).map(small)});
      }
      return original.call(this,events,...params);
    };
    wrapped.__XIANYAO_TRACE_V3__ = true;
    EH.emitEvents = wrapped;
  }

  function diffSnapshots() {
    const out = [];
    const bm = new Map(S.before.map(x => [`${x.component}|${x.nodePath}`,x]));
    for (const a of S.after) {
      const b = bm.get(`${a.component}|${a.nodePath}`);
      if (!b) continue;
      const changes = {};
      const keys = new Set([...Object.keys(b.values || {}),...Object.keys(a.values || {})]);
      for (const k of keys) {
        const bv = JSON.stringify(b.values?.[k]);
        const av = JSON.stringify(a.values?.[k]);
        if (bv !== av) changes[k] = {before:b.values?.[k],after:a.values?.[k]};
      }
      if (Object.keys(changes).length) out.push({component:a.component,nodePath:a.nodePath,changes});
    }
    return out;
  }

  function arm() {
    scanAndWrap();
    S.logs = [];
    S.before = snapshotAll();
    S.after = [];
    S.armed = true;
    S.tracing = true;
    S.done = false;
    S.armedAt = Date.now();
    S.startedAt = Date.now();
    log('trace-start',{reason:'manual arm before pressing real autoplay stop button'});
    clearTimeout(S.stopTimer);
    S.stopTimer = setTimeout(() => finish('5s manual capture window complete'),5000);
    render();
  }

  function finish(reason) {
    if (!S.tracing) return;
    S.after = snapshotAll();
    log('trace-end',{reason});
    S.tracing = false;
    S.armed = false;
    S.done = true;
    render();
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
    const s = document.getElementById('xinyao-trace-v3-status');
    if (s) s.textContent = '✅ 已複製，直接貼回 ChatGPT';
  }

  function scanAndWrap() {
    let count = 0;
    let quick = 0;
    for (const w of sameOriginWindows()) {
      installNodeHook(w);
      installEventHandlerHook(w);
      const comps = discoverComponents(w);
      for (const c of comps) {
        count++;
        wrapComponent(c);
        if (/QuickStopBtn/i.test(compPath(c))) quick++;
      }
    }
    S.componentCount = count;
    S.ready = count > 0 && quick > 0;
    const meta = document.getElementById('xinyao-trace-v3-meta');
    if (meta) meta.textContent = `Component ${count}｜QuickStop 相關 ${quick}`;
    render();
  }

  function render() {
    const status = document.getElementById('xinyao-trace-v3-status');
    const armBtn = document.getElementById('xinyao-trace-v3-arm');
    const copyBtn = document.getElementById('xinyao-trace-v3-copy');

    if (status) {
      status.textContent =
        S.done ? '✅ 5 秒完整流程已抓到' :
        S.tracing ? '🔴 現在請按遊戲真正的 ■ 停止鍵' :
        S.ready ? '🟢 已就緒｜先按下方「開始追蹤」' :
        '🟡 正在尋找 Cocos 元件…';
    }
    if (armBtn) {
      armBtn.disabled = !S.ready || S.tracing;
      armBtn.style.opacity = (!S.ready || S.tracing) ? '.55' : '1';
    }
    if (copyBtn) copyBtn.style.display = S.done ? 'block' : 'none';
  }

  function mount() {
    if (document.getElementById(PANEL_ID)) return;
    const root = document.createElement('div');
    root.id = PANEL_ID;
    root.style.cssText = 'position:fixed;right:12px;top:12px;z-index:2147483647;width:min(380px,calc(100vw - 24px));background:#18131d;color:#fff;border:1px solid #ff5f9e;border-radius:14px;padding:12px;font:700 12px -apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45)';
    root.innerHTML = `
      <div style="font-size:14px;font-weight:950;color:#ff8bb7;margin-bottom:5px;">🌸 芯瑤 ATG 停止鍵追蹤器 v3</div>
      <div id="xinyao-trace-v3-status">🟡 啟動中…</div>
      <div id="xinyao-trace-v3-meta" style="font-size:10px;opacity:.65;margin-top:4px;">Component 0｜QuickStop 相關 0</div>
      <div style="font-size:10px;line-height:1.5;opacity:.78;margin-top:7px;">1. 先讓自動轉正在跑<br>2. 按「開始追蹤」<br>3. 5 秒內手動按一次真正的 ■ 停止鍵<br>只做這一次開發測試。</div>
      <button id="xinyao-trace-v3-arm" style="width:100%;margin-top:9px;border:0;border-radius:8px;background:#ff5f9e;color:#fff;padding:9px;font-weight:900;cursor:pointer;">🔴 開始追蹤 5 秒</button>
      <button id="xinyao-trace-v3-copy" style="display:none;width:100%;margin-top:7px;border:0;border-radius:8px;background:#6857df;color:#fff;padding:9px;font-weight:900;cursor:pointer;">📋 複製完整結果</button>
    `;
    document.documentElement.appendChild(root);
    root.querySelector('#xinyao-trace-v3-arm')?.addEventListener('click',arm);
    root.querySelector('#xinyao-trace-v3-copy')?.addEventListener('click',copyResult);
  }

  function boot() {
    mount();
    scanAndWrap();
    setInterval(scanAndWrap,700);
  }

  boot();
})();