/* =========================================================
   芯瑤 ATG Runtime Trace Probe v0.1

   PASSIVE TRACE ONLY
   - 記錄 Canvas Context
   - 記錄 requestAnimationFrame
   - 記錄 setTimeout
   - 記錄 setInterval

   不會：
   - 加速
   - 按 Spin
   - 改下注
   - 修改 callback 時間
   - 修改原函式回傳值
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';
  const MODE = 'PASSIVE_RUNTIME_TRACE';

  let installed = false;

  let targetGlobals = null;
  let targetCanvasPrototype = null;

  let originals = {
    requestAnimationFrame: null,
    setTimeout: null,
    setInterval: null,
    getContext: null
  };

  let stats = freshStats();


  /* ======================================================
     初始統計
  ====================================================== */

  function freshStats() {
    return {
      contexts: {
        canvas2d: 0,
        webgl: 0,
        webgl2: 0,
        other: 0
      },

      raf: {
        scheduled: 0
      },

      timers: {
        timeouts: 0,
        intervals: 0
      }
    };
  }


  /* ======================================================
     Canvas Context 分類
  ====================================================== */

  function recordContext(type) {

    const value =
      String(type ?? '')
        .toLowerCase()
        .trim();

    if (value === '2d') {
      stats.contexts.canvas2d++;
      return;
    }

    if (
      value === 'webgl' ||
      value === 'experimental-webgl'
    ) {
      stats.contexts.webgl++;
      return;
    }

    if (value === 'webgl2') {
      stats.contexts.webgl2++;
      return;
    }

    stats.contexts.other++;
  }


  /* ======================================================
     Install
  ====================================================== */

  function install(options = {}) {

    /*
      已安裝時先還原，
      避免重複包裝。
    */
    if (installed) {
      uninstall();
    }


    targetGlobals =
      options.globals ||
      window;


    targetCanvasPrototype =
      options.canvasPrototype ||
      (
        typeof HTMLCanvasElement !==
        'undefined'
          ? HTMLCanvasElement.prototype
          : null
      );


    if (!targetGlobals) {
      throw new Error(
        '找不到 globals'
      );
    }


    /* -------------------------
       RAF
    ------------------------- */

    if (
      typeof targetGlobals
        .requestAnimationFrame ===
      'function'
    ) {

      originals.requestAnimationFrame =
        targetGlobals
          .requestAnimationFrame;


      targetGlobals
        .requestAnimationFrame =
        function(...args) {

          stats.raf.scheduled++;

          return originals
            .requestAnimationFrame
            .apply(
              this,
              args
            );
        };
    }


    /* -------------------------
       setTimeout
    ------------------------- */

    if (
      typeof targetGlobals
        .setTimeout ===
      'function'
    ) {

      originals.setTimeout =
        targetGlobals
          .setTimeout;


      targetGlobals
        .setTimeout =
        function(...args) {

          stats.timers.timeouts++;

          return originals
            .setTimeout
            .apply(
              this,
              args
            );
        };
    }


    /* -------------------------
       setInterval
    ------------------------- */

    if (
      typeof targetGlobals
        .setInterval ===
      'function'
    ) {

      originals.setInterval =
        targetGlobals
          .setInterval;


      targetGlobals
        .setInterval =
        function(...args) {

          stats.timers.intervals++;

          return originals
            .setInterval
            .apply(
              this,
              args
            );
        };
    }


    /* -------------------------
       Canvas getContext
    ------------------------- */

    if (
      targetCanvasPrototype &&
      typeof targetCanvasPrototype
        .getContext ===
      'function'
    ) {

      originals.getContext =
        targetCanvasPrototype
          .getContext;


      targetCanvasPrototype
        .getContext =
        function(type, ...args) {

          recordContext(type);

          return originals
            .getContext
            .call(
              this,
              type,
              ...args
            );
        };
    }


    installed = true;

    return getState();
  }


  /* ======================================================
     Uninstall
  ====================================================== */

  function uninstall() {

    if (!installed) {
      return getState();
    }


    if (
      targetGlobals &&
      originals.requestAnimationFrame
    ) {

      targetGlobals
        .requestAnimationFrame =
        originals
          .requestAnimationFrame;
    }


    if (
      targetGlobals &&
      originals.setTimeout
    ) {

      targetGlobals
        .setTimeout =
        originals
          .setTimeout;
    }


    if (
      targetGlobals &&
      originals.setInterval
    ) {

      targetGlobals
        .setInterval =
        originals
          .setInterval;
    }


    if (
      targetCanvasPrototype &&
      originals.getContext
    ) {

      targetCanvasPrototype
        .getContext =
        originals
          .getContext;
    }


    installed = false;

    targetGlobals = null;
    targetCanvasPrototype = null;

    originals = {
      requestAnimationFrame: null,
      setTimeout: null,
      setInterval: null,
      getContext: null
    };

    return getState();
  }


  /* ======================================================
     Reset
  ====================================================== */

  function reset() {

    uninstall();

    stats =
      freshStats();

    return snapshot();
  }


  /* ======================================================
     Snapshot
  ====================================================== */

  function snapshot() {

    return {
      version:
        VERSION,

      mode:
        MODE,

      contexts: {
        ...stats.contexts
      },

      raf: {
        ...stats.raf
      },

      timers: {
        ...stats.timers
      }
    };
  }


  /* ======================================================
     State
  ====================================================== */

  function getState() {

    return {
      installed
    };
  }


  function getMode() {
    return MODE;
  }


  /* ======================================================
     Public API
  ====================================================== */

  window.XinyaoATGRuntimeTraceProbe = {

    version:
      VERSION,

    install,

    uninstall,

    reset,

    snapshot,

    getState,

    getMode

    /*
      刻意沒有：

      spin()
      setBet()
      setSpeed()
    */
  };


  console.log(
    `[芯瑤 ATG Runtime Trace Probe] v${VERSION} 已載入｜${MODE}`
  );

})();
