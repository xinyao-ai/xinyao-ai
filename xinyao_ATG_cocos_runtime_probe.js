/* =========================================================
   芯瑤 ATG Cocos Runtime Probe v0.1

   PASSIVE ONLY
   - 偵測 Cocos Runtime
   - 偵測 Director / Scheduler
   - 偵測 Tween / Animation
   - 讀取目前 timeScale
   - 不修改 timeScale
   - 不加速
   - 不按 Spin
   - 不改下注
========================================================= */

(() => {
  'use strict';

  const VERSION =
    '0.1.0';

  const MODE =
    'PASSIVE_COCOS_RUNTIME_PROBE';


  /* ======================================================
     安全取值
  ====================================================== */

  function safeGet(
    getter,
    fallback = undefined
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
     找 Cocos Runtime
  ====================================================== */

  function findCC(
    globals
  ) {

    if (!globals) {
      return null;
    }


    /*
      Cocos Creator 2.x 常見
    */
    if (
      globals.cc &&
      typeof globals.cc === 'object'
    ) {
      return globals.cc;
    }


    /*
      某些版本 / 打包方式
    */
    if (
      globals.legacyCC &&
      typeof globals.legacyCC === 'object'
    ) {
      return globals.legacyCC;
    }


    if (
      globals._cc &&
      typeof globals._cc === 'object'
    ) {
      return globals._cc;
    }


    return null;
  }


  /* ======================================================
     找 Director
  ====================================================== */

  function findDirector(
    cc
  ) {

    if (!cc) {
      return null;
    }


    return (
      safeGet(
        () => cc.director,
        null
      ) ||

      safeGet(
        () => cc.Director?.instance,
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
    director
  ) {

    if (!cc) {
      return null;
    }


    /*
      Cocos Creator 2.x 常見
    */
    const fromDirector =
      safeGet(
        () =>
          typeof director?.getScheduler ===
          'function'
            ? director.getScheduler()
            : null,
        null
      );


    if (fromDirector) {
      return fromDirector;
    }


    /*
      部分版本可能直接掛 scheduler
    */
    const direct =
      safeGet(
        () => director?.scheduler,
        null
      );


    if (direct) {
      return direct;
    }


    return null;
  }


  /* ======================================================
     Director Animation Manager
  ====================================================== */

  function findDirectorAnimationManager(
    director
  ) {

    if (!director) {
      return null;
    }


    return safeGet(
      () => {

        if (
          typeof director
            .getAnimationManager ===
          'function'
        ) {

          return director
            .getAnimationManager();
        }


        return (
          director
            .animationManager ||
          null
        );
      },
      null
    );
  }


  /* ======================================================
     inspect
  ====================================================== */

  function inspect(
    options = {}
  ) {

    const globals =
      options.globals ||
      window;


    const cc =
      findCC(
        globals
      );


    if (!cc) {

      return {

        version:
          null,

        mode:
          MODE,

        detected:
          false,

        hasDirector:
          false,

        hasScheduler:
          false,

        schedulerHasSetTimeScale:
          false,

        schedulerHasGetTimeScale:
          false,

        currentTimeScale:
          null,

        hasGame:
          false,

        frameRate:
          null,

        hasTween:
          false,

        hasAnimation:
          false,

        hasAnimationManager:
          false,

        hasDirectorAnimationManager:
          false
      };
    }


    const director =
      findDirector(
        cc
      );


    const scheduler =
      findScheduler(
        cc,
        director
      );


    const directorAnimationManager =
      findDirectorAnimationManager(
        director
      );


    const hasSetTimeScale =
      typeof scheduler
        ?.setTimeScale ===
      'function';


    const hasGetTimeScale =
      typeof scheduler
        ?.getTimeScale ===
      'function';


    let currentTimeScale =
      null;


    /*
      只讀，不修改。
    */
    if (hasGetTimeScale) {

      currentTimeScale =
        safeGet(
          () =>
            scheduler
              .getTimeScale(),
          null
        );
    }


    const game =
      safeGet(
        () => cc.game,
        null
      );


    const frameRate =
      safeGet(
        () => game?.frameRate,
        null
      );


    return {

      mode:
        MODE,

      detected:
        true,

      version:
        safeGet(
          () =>
            cc.VERSION ??
            cc.version ??
            'UNKNOWN',
          'UNKNOWN'
        ),

      hasDirector:
        !!director,

      hasScheduler:
        !!scheduler,

      schedulerHasSetTimeScale:
        hasSetTimeScale,

      schedulerHasGetTimeScale:
        hasGetTimeScale,

      currentTimeScale,

      hasGame:
        !!game,

      frameRate,

      hasTween:
        (
          typeof cc.tween ===
          'function'
        ) ||
        !!cc.Tween,

      hasAnimation:
        !!cc.Animation,

      hasAnimationManager:
        !!cc.AnimationManager,

      hasDirectorAnimationManager:
        !!directorAnimationManager
    };
  }


  /* ======================================================
     Public API
  ====================================================== */

  window.XinyaoATGCocosRuntimeProbe = {

    version:
      VERSION,

    inspect,

    getMode() {
      return MODE;
    }

    /*
      刻意沒有：

      setSpeed()
      setTimeScale()
      spin()
      setBet()

      目前純診斷。
    */
  };


  console.log(
    `[芯瑤 ATG Cocos Runtime Probe] v${VERSION} 已載入｜${MODE}`
  );

})();
