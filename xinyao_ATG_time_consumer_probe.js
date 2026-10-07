/* =========================================================
   芯瑤 ATG Time Consumer Probe v0.1

   PASSIVE ONLY

   監聽：
   - Scheduler.update(dt)
   - AnimationManager.update(dt)
   - ActionManager.update(dt)
   - Director.getDeltaTime()

   不會：
   - 修改 dt
   - 修改 timeScale
   - 加速
   - Spin
   - 改下注
========================================================= */

(() => {
  'use strict';

  const VERSION =
    '0.1.0';

  const MODE =
    'PASSIVE_TIME_CONSUMER_PROBE';


  let installed =
    false;


  let refs = {
    globals: null,
    cc: null,
    director: null,
    scheduler: null,
    animationManager: null,
    actionManager: null
  };


  let originals = {
    schedulerUpdate: null,
    animationUpdate: null,
    actionUpdate: null,
    directorGetDeltaTime: null
  };


  let stats =
    freshStats();


  /* ======================================================
     初始統計
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

      scheduler:
        freshEntry(),

      animation:
        freshEntry(),

      action:
        freshEntry(),

      directorDelta:
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
     找 Cocos Runtime
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
     找 Scheduler
  ====================================================== */

  function findScheduler(
    cc,
    director,
    globals
  ) {

    const fromGetter =
      safeGet(
        () => {

          if (
            typeof director
              ?.getScheduler ===
            'function'
          ) {

            return director
              .getScheduler();
          }

          return null;
        },
        null
      );


    if (fromGetter) {
      return fromGetter;
    }


    return (

      safeGet(
        () =>
          director?.scheduler ||
          director?._scheduler,
        null
      ) ||

      safeGet(
        () => globals?.scheduler,
        null
      ) ||

      safeGet(
        () => cc?.scheduler,
        null
      ) ||

      null
    );
  }


  /* ======================================================
     找 AnimationManager
  ====================================================== */

  function findAnimationManager(
    cc,
    director
  ) {

    const fromGetter =
      safeGet(
        () => {

          if (
            typeof director
              ?.getAnimationManager ===
            'function'
          ) {

            return director
              .getAnimationManager();
          }

          return null;
        },
        null
      );


    if (fromGetter) {
      return fromGetter;
    }


    return (

      safeGet(
        () =>
          director?.animationManager ||
          director?._animationManager,
        null
      ) ||

      safeGet(
        () => cc?.animationManager,
        null
      ) ||

      null
    );
  }


  /* ======================================================
     找 ActionManager
  ====================================================== */

  function findActionManager(
    cc,
    director
  ) {

    const fromGetter =
      safeGet(
        () => {

          if (
            typeof director
              ?.getActionManager ===
            'function'
          ) {

            return director
              .getActionManager();
          }

          return null;
        },
        null
      );


    if (fromGetter) {
      return fromGetter;
    }


    return (

      safeGet(
        () =>
          director?.actionManager ||
          director?._actionManager,
        null
      ) ||

      safeGet(
        () => cc?.actionManager,
        null
      ) ||

      null
    );
  }


  /* ======================================================
     包裝 update(dt)
  ====================================================== */

  function wrapUpdate(
    target,
    key,
    statEntry,
    originalKey
  ) {

    if (
      !target ||
      typeof target[key] !==
      'function'
    ) {
      return false;
    }


    const original =
      target[key];


    originals[originalKey] =
      original;


    target[key] =
      function(...args) {

        if (
          args.length > 0
        ) {

          recordDt(
            statEntry,
            args[0]
          );
        }


        /*
          args 完整原樣傳入，
          不修改 dt。
        */
        return original.apply(
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


    refs.scheduler =
      findScheduler(
        refs.cc,
        refs.director,
        refs.globals
      );


    refs.animationManager =
      findAnimationManager(
        refs.cc,
        refs.director
      );


    refs.actionManager =
      findActionManager(
        refs.cc,
        refs.director
      );


    wrapUpdate(
      refs.scheduler,
      'update',
      stats.scheduler,
      'schedulerUpdate'
    );


    wrapUpdate(
      refs.animationManager,
      'update',
      stats.animation,
      'animationUpdate'
    );


    wrapUpdate(
      refs.actionManager,
      'update',
      stats.action,
      'actionUpdate'
    );


    /* ==================================================
       Director.getDeltaTime
    ================================================== */

    if (
      refs.director &&
      typeof refs.director
        .getDeltaTime ===
      'function'
    ) {

      originals.directorGetDeltaTime =
        refs.director
          .getDeltaTime;


      refs.director
        .getDeltaTime =
        function(...args) {

          const result =
            originals
              .directorGetDeltaTime
              .apply(
                this,
                args
              );


          /*
            只讀取回傳值，
            完全原樣回傳。
          */
          recordDt(
            stats.directorDelta,
            result
          );


          return result;
        };
    }


    installed =
      true;


    return getState();
  }


  /* ======================================================
     Uninstall
  ====================================================== */

  function uninstall() {

    if (
      refs.scheduler &&
      originals.schedulerUpdate
    ) {

      refs.scheduler.update =
        originals.schedulerUpdate;
    }


    if (
      refs.animationManager &&
      originals.animationUpdate
    ) {

      refs.animationManager.update =
        originals.animationUpdate;
    }


    if (
      refs.actionManager &&
      originals.actionUpdate
    ) {

      refs.actionManager.update =
        originals.actionUpdate;
    }


    if (
      refs.director &&
      originals.directorGetDeltaTime
    ) {

      refs.director.getDeltaTime =
        originals.directorGetDeltaTime;
    }


    installed =
      false;


    refs = {
      globals: null,
      cc: null,
      director: null,
      scheduler: null,
      animationManager: null,
      actionManager: null
    };


    originals = {
      schedulerUpdate: null,
      animationUpdate: null,
      actionUpdate: null,
      directorGetDeltaTime: null
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

      scheduler:
        cloneEntry(
          stats.scheduler
        ),

      animation:
        cloneEntry(
          stats.animation
        ),

      action:
        cloneEntry(
          stats.action
        ),

      directorDelta:
        cloneEntry(
          stats.directorDelta
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

      hasScheduler:
        !!(
          refs.scheduler &&
          typeof refs.scheduler
            .update ===
          'function'
        ),

      hasAnimationManager:
        !!(
          refs.animationManager &&
          typeof refs.animationManager
            .update ===
          'function'
        ),

      hasActionManager:
        !!(
          refs.actionManager &&
          typeof refs.actionManager
            .update ===
          'function'
        ),

      hasDirectorDelta:
        !!(
          refs.director &&
          typeof refs.director
            .getDeltaTime ===
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

  window.XinyaoATGTimeConsumerProbe = {

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
      setTimeScale()
      spin()
      setBet()
    */
  };


  console.log(
    `[芯瑤 ATG Time Consumer Probe] v${VERSION} 已載入｜${MODE}`
  );

})();
