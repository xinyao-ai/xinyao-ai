/* =========================================================
   芯瑤 ATG Speed Controller v0.1

   COCOS TIMESCALE ONLY

   功能：
   - 1×
   - 2×
   - 3×
   - 5×
   - 恢復 1×

   不會：
   - 自動 Spin
   - 修改下注
   - 修改 WebSocket
   - 修改 setTimeout
   - 修改 requestAnimationFrame
========================================================= */

(() => {
  'use strict';

  const VERSION =
    '0.1.0';

  const MODE =
    'COCOS_TIMESCALE_CONTROLLER';

  const ALLOWED_SPEEDS =
    Object.freeze([
      1,
      2,
      3,
      5
    ]);


  let globalsRef =
    null;

  let ccRef =
    null;

  let directorRef =
    null;

  let schedulerRef =
    null;

  let ready =
    false;

  let speed =
    1;


  /* ======================================================
     安全執行
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
     尋找 Cocos
  ====================================================== */

  function findCC(
    globals
  ) {

    if (!globals) {
      return null;
    }


    /*
      Cocos Creator 2.x
    */
    if (
      globals.cc &&
      (
        typeof globals.cc === 'object' ||
        typeof globals.cc === 'function'
      )
    ) {
      return globals.cc;
    }


    /*
      部分打包版本
    */
    if (
      globals.legacyCC &&
      (
        typeof globals.legacyCC === 'object' ||
        typeof globals.legacyCC === 'function'
      )
    ) {
      return globals.legacyCC;
    }


    if (
      globals._cc &&
      (
        typeof globals._cc === 'object' ||
        typeof globals._cc === 'function'
      )
    ) {
      return globals._cc;
    }


    /*
      ATG 真機曾出現 CocosEngine Global，
      但只有結構符合時才採用。
    */
    if (
      globals.CocosEngine &&
      (
        globals.CocosEngine.director ||
        globals.CocosEngine.game
      )
    ) {
      return globals.CocosEngine;
    }


    return null;
  }


  /* ======================================================
     尋找 Director
  ====================================================== */

  function findDirector(
    cc,
    globals
  ) {

    const director =
      safeGet(
        () => cc?.director,
        null
      );


    if (director) {
      return director;
    }


    const instance =
      safeGet(
        () => cc?.Director?.instance,
        null
      );


    if (instance) {
      return instance;
    }


    /*
      某些遊戲可能另外暴露 director
    */
    const globalDirector =
      safeGet(
        () => globals?.director,
        null
      );


    if (globalDirector) {
      return globalDirector;
    }


    return null;
  }


  /* ======================================================
     尋找 Scheduler
  ====================================================== */

  function findScheduler(
    cc,
    director,
    globals
  ) {

    /*
      Cocos Creator 常見
    */
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


    /*
      Director property
    */
    const fromDirector =
      safeGet(
        () =>
          director?.scheduler ||
          director?._scheduler,
        null
      );


    if (fromDirector) {
      return fromDirector;
    }


    /*
      ATG 真機 Global 候選中
      已經看到 scheduler。
    */
    const globalScheduler =
      safeGet(
        () => globals?.scheduler,
        null
      );


    if (
      globalScheduler &&
      typeof globalScheduler
        .setTimeScale ===
        'function'
    ) {

      return globalScheduler;
    }


    /*
      cc.scheduler fallback
    */
    const ccScheduler =
      safeGet(
        () => cc?.scheduler,
        null
      );


    if (ccScheduler) {
      return ccScheduler;
    }


    return null;
  }


  /* ======================================================
     初始化
  ====================================================== */

  function init(
    options = {}
  ) {

    globalsRef =
      options.globals ||
      window;


    ccRef =
      findCC(
        globalsRef
      );


    directorRef =
      findDirector(
        ccRef,
        globalsRef
      );


    schedulerRef =
      findScheduler(
        ccRef,
        directorRef,
        globalsRef
      );


    ready =
      !!(
        schedulerRef &&
        typeof schedulerRef
          .setTimeScale ===
          'function'
      );


    if (
      ready &&
      typeof schedulerRef
        .getTimeScale ===
      'function'
    ) {

      const current =
        Number(
          safeGet(
            () =>
              schedulerRef
                .getTimeScale(),
            1
          )
        );


      if (
        Number.isFinite(current)
      ) {

        speed =
          current;
      }

    } else {

      speed =
        1;
    }


    return getState();
  }


  /* ======================================================
     確保 Scheduler 還有效
  ====================================================== */

  function ensureReady() {

    if (
      ready &&
      schedulerRef &&
      typeof schedulerRef
        .setTimeScale ===
      'function'
    ) {

      return true;
    }


    if (!globalsRef) {
      globalsRef = window;
    }


    init({
      globals:
        globalsRef
    });


    return ready;
  }


  /* ======================================================
     設定速度
  ====================================================== */

  function setSpeed(
    value
  ) {

    const next =
      Number(value);


    if (
      !ALLOWED_SPEEDS.includes(
        next
      )
    ) {

      return false;
    }


    if (!ensureReady()) {
      return false;
    }


    try {

      schedulerRef
        .setTimeScale(
          next
        );


      /*
        若 Runtime 有 getTimeScale，
        重新讀取實際值。
      */
      if (
        typeof schedulerRef
          .getTimeScale ===
        'function'
      ) {

        const actual =
          Number(
            schedulerRef
              .getTimeScale()
          );


        if (
          Number.isFinite(actual)
        ) {

          speed =
            actual;

        } else {

          speed =
            next;
        }

      } else {

        speed =
          next;
      }


      return true;

    } catch (error) {

      console.error(
        '[芯瑤 ATG Speed Controller] 設定倍率失敗',
        error
      );

      return false;
    }
  }


  /* ======================================================
     恢復 1×
  ====================================================== */

  function resetSpeed() {

    return setSpeed(1);
  }


  /* ======================================================
     讀取實際 timeScale
  ====================================================== */

  function readTimeScale() {

    if (
      !schedulerRef ||
      typeof schedulerRef
        .getTimeScale !==
      'function'
    ) {

      return speed;
    }


    const value =
      Number(
        safeGet(
          () =>
            schedulerRef
              .getTimeScale(),
          speed
        )
      );


    return Number.isFinite(value)
      ? value
      : speed;
  }


  /* ======================================================
     State
  ====================================================== */

  function getState() {

    return {

      version:
        VERSION,

      ready,

      speed,

      timeScale:
        readTimeScale(),

      allowedSpeeds:
        [
          ...ALLOWED_SPEEDS
        ],

      hasCC:
        !!ccRef,

      hasDirector:
        !!directorRef,

      hasScheduler:
        !!schedulerRef
    };
  }


  function getMode() {

    return MODE;
  }


  /* ======================================================
     Public API
  ====================================================== */

  window.XinyaoATGSpeedController = {

    version:
      VERSION,

    init,

    setSpeed,

    resetSpeed,

    getState,

    getMode

    /*
      刻意沒有：

      spin()
      setBet()
      autoBet()

      這支只負責 Cocos 動畫倍率。
    */
  };


  console.log(
    `[芯瑤 ATG Speed Controller] v${VERSION} 已載入｜${MODE}`
  );

})();
