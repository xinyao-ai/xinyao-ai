/* =========================================================
   芯瑤 ATG Component Runtime Probe v0.1

   PASSIVE ONLY

   監聽：
   - ComponentScheduler.startPhase()
   - ComponentScheduler.updatePhase(dt)
   - ComponentScheduler.lateUpdatePhase(dt)

   不會：
   - 修改 dt
   - 加速
   - Spin
   - 改下注
========================================================= */

(() => {
  'use strict';

  const VERSION =
    '0.1.0';

  const MODE =
    'PASSIVE_COMPONENT_RUNTIME_PROBE';


  let installed =
    false;


  let refs = {
    globals: null,
    cc: null,
    director: null,
    componentScheduler: null
  };


  let originals = {
    startPhase: null,
    updatePhase: null,
    lateUpdatePhase: null
  };


  let stats =
    freshStats();


  /* ======================================================
     統計資料
  ====================================================== */

  function freshEntry() {

    return {
      count: 0,
      lastDt: 0,
      minDt: 0,
      maxDt: 0,
      totalDt: 0,
      averageDt: 0
    };
  }


  function freshStats() {

    return {

      start: {
        count: 0
      },

      update:
        freshEntry(),

      late:
        freshEntry()
    };
  }


  /* ======================================================
     安全取值
  ====================================================== */

  function safeGet(
    getter,
    fallback = null
  ) {

    try {

      const value =
        getter();

      return value === undefined
        ? fallback
        : value;

    } catch {

      return fallback;
    }
  }


  /* ======================================================
     紀錄 dt
  ====================================================== */

  function recordDt(
    entry,
    value
  ) {

    const dt =
      Number(value);


    if (
      !Number.isFinite(dt)
    ) {
      return;
    }


    entry.count++;

    entry.lastDt =
      dt;

    entry.totalDt +=
      dt;


    if (
      entry.count === 1
    ) {

      entry.minDt =
        dt;

      entry.maxDt =
        dt;

    } else {

      entry.minDt =
        Math.min(
          entry.minDt,
          dt
        );

      entry.maxDt =
        Math.max(
          entry.maxDt,
          dt
        );
    }


    entry.averageDt =
      entry.totalDt /
      entry.count;
  }


  /* ======================================================
     找 Cocos
  ====================================================== */

  function findCC(
    globals
  ) {

    if (!globals) {
      return null;
    }


    return (
      globals.cc ||
      globals.legacyCC ||
      globals._cc ||
      globals.CocosEngine ||
      null
    );
  }


  /* ======================================================
     找 Director
  ====================================================== */

  function findDirector(
    cc,
    globals
  ) {

    return (

      safeGet(
        () => cc?.director,
        null
      ) ||

      safeGet(
        () => cc?.Director?.instance,
        null
      ) ||

      safeGet(
        () => globals?.director,
        null
      ) ||

      null
    );
  }


  /* ======================================================
     找 ComponentScheduler
  ====================================================== */

  function findComponentScheduler(
    cc,
    director,
    globals
  ) {

    /*
      Cocos Creator 2.x 常見：
      director._compScheduler
    */
    const fromDirector =
      safeGet(
        () =>
          director?._compScheduler ||
          director?.compScheduler,
        null
      );


    if (fromDirector) {
      return fromDirector;
    }


    /*
      某些版本可能有 getter
    */
    const fromGetter =
      safeGet(
        () => {

          if (
            typeof director
              ?.getComponentScheduler ===
            'function'
          ) {

            return director
              .getComponentScheduler();
          }

          return null;
        },
        null
      );


    if (fromGetter) {
      return fromGetter;
    }


    /*
      Global fallback
    */
    const fromGlobal =
      safeGet(
        () =>
          globals?.componentScheduler ||
          globals?.compScheduler,
        null
      );


    if (fromGlobal) {
      return fromGlobal;
    }


    /*
      cc fallback
    */
    return (

      safeGet(
        () =>
          cc?._compScheduler ||
          cc?.compScheduler,
        null
      ) ||

      null
    );
  }


  /* ======================================================
     包裝 startPhase
  ====================================================== */

  function wrapStartPhase() {

    const target =
      refs.componentScheduler;


    if (
      !target ||
      typeof target.startPhase !==
      'function'
    ) {

      return false;
    }


    originals.startPhase =
      target.startPhase;


    target.startPhase =
      function(...args) {

        stats.start.count++;


        /*
          參數完全原樣傳入。
          回傳值完全原樣回傳。
        */
        return originals
          .startPhase
          .apply(
            this,
            args
          );
      };


    return true;
  }


  /* ======================================================
     包裝 updatePhase(dt)
  ====================================================== */

  function wrapUpdatePhase() {

    const target =
      refs.componentScheduler;


    if (
      !target ||
      typeof target.updatePhase !==
      'function'
    ) {

      return false;
    }


    originals.updatePhase =
      target.updatePhase;


    target.updatePhase =
      function(...args) {

        if (
          args.length > 0
        ) {

          /*
            只讀。
            不修改 args[0]。
          */
          recordDt(
            stats.update,
            args[0]
          );
        }


        return originals
          .updatePhase
          .apply(
            this,
            args
          );
      };


    return true;
  }


  /* ======================================================
     包裝 lateUpdatePhase(dt)
  ====================================================== */

  function wrapLateUpdatePhase() {

    const target =
      refs.componentScheduler;


    if (
      !target ||
      typeof target.lateUpdatePhase !==
      'function'
    ) {

      return false;
    }


    originals.lateUpdatePhase =
      target.lateUpdatePhase;


    target.lateUpdatePhase =
      function(...args) {

        if (
          args.length > 0
        ) {

          /*
            一樣只讀 dt。
          */
          recordDt(
            stats.late,
            args[0]
          );
        }


        return originals
          .lateUpdatePhase
          .apply(
            this,
            args
          );
      };


    return true;
  }


  /* ======================================================
     Install
  ====================================================== */

  function install(
    options = {}
  ) {

    /*
      避免重複包裝。
    */
    if (installed) {
      uninstall();
    }


    refs.globals =
      options.globals ||
      window;


    refs.cc =
      findCC(
        refs.globals
      );


    refs.director =
      findDirector(
        refs.cc,
        refs.globals
      );


    refs.componentScheduler =
      findComponentScheduler(
        refs.cc,
        refs.director,
        refs.globals
      );


    wrapStartPhase();

    wrapUpdatePhase();

    wrapLateUpdatePhase();


    installed =
      true;


    return getState();
  }


  /* ======================================================
     Uninstall
  ====================================================== */

  function uninstall() {

    const target =
      refs.componentScheduler;


    if (
      target &&
      originals.startPhase
    ) {

      target.startPhase =
        originals.startPhase;
    }


    if (
      target &&
      originals.updatePhase
    ) {

      target.updatePhase =
        originals.updatePhase;
    }


    if (
      target &&
      originals.lateUpdatePhase
    ) {

      target.lateUpdatePhase =
        originals.lateUpdatePhase;
    }


    installed =
      false;


    refs = {
      globals: null,
      cc: null,
      director: null,
      componentScheduler: null
    };


    originals = {
      startPhase: null,
      updatePhase: null,
      lateUpdatePhase: null
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

  function cloneEntry(
    entry
  ) {

    return {

      count:
        entry.count,

      lastDt:
        entry.lastDt,

      minDt:
        entry.minDt,

      maxDt:
        entry.maxDt,

      totalDt:
        entry.totalDt,

      averageDt:
        entry.averageDt
    };
  }


  function snapshot() {

    return {

      version:
        VERSION,

      mode:
        MODE,

      start: {
        count:
          stats.start.count
      },

      update:
        cloneEntry(
          stats.update
        ),

      late:
        cloneEntry(
          stats.late
        )
    };
  }


  /* ======================================================
     State
  ====================================================== */

  function getState() {

    return {

      installed,

      hasCC:
        !!refs.cc,

      hasDirector:
        !!refs.director,

      hasComponentScheduler:
        !!refs.componentScheduler,

      hasStartPhase:
        !!(
          refs.componentScheduler &&
          typeof refs.componentScheduler
            .startPhase ===
          'function'
        ),

      hasUpdatePhase:
        !!(
          refs.componentScheduler &&
          typeof refs.componentScheduler
            .updatePhase ===
          'function'
        ),

      hasLateUpdatePhase:
        !!(
          refs.componentScheduler &&
          typeof refs.componentScheduler
            .lateUpdatePhase ===
          'function'
        )
    };
  }


  function getMode() {

    return MODE;
  }


  /* ======================================================
     Public API
  ====================================================== */

  window.XinyaoATGComponentRuntimeProbe = {

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

      setSpeed()
      spin()
      setBet()
    */
  };


  console.log(
    `[芯瑤 ATG Component Runtime Probe] v${VERSION} 已載入｜${MODE}`
  );

})();
