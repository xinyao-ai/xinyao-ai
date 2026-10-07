/* =========================================================
   芯瑤 ATG Animation DT Controller v0.1

   只控制：
   - AnimationManager.update(dt)

   倍率：
   - 1×
   - 2×
   - 3×
   - 5×

   不會：
   - 修改 Scheduler
   - 修改 requestAnimationFrame
   - 修改 setTimeout
   - 修改 WebSocket
   - 自動 Spin
   - 修改下注
========================================================= */

(() => {
  'use strict';

  const VERSION =
    '0.1.0';

  const MODE =
    'COCOS_ANIMATION_DT_CONTROLLER';

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

  let animationManagerRef =
    null;

  let originalAnimationUpdate =
    null;

  let installed =
    false;

  let ready =
    false;

  let speed =
    1;


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
     找 AnimationManager
  ====================================================== */

  function findAnimationManager(
    cc,
    director,
    globals
  ) {

    /*
      Cocos 2.x 常見
    */
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


    /*
      Director property
    */
    const fromDirector =
      safeGet(
        () =>
          director?.animationManager ||
          director?._animationManager,
        null
      );


    if (fromDirector) {
      return fromDirector;
    }


    /*
      Global fallback
    */
    const fromGlobal =
      safeGet(
        () =>
          globals?.animationManager,
        null
      );


    if (fromGlobal) {
      return fromGlobal;
    }


    /*
      cc fallback
    */
    const fromCC =
      safeGet(
        () =>
          cc?.animationManager,
        null
      );


    if (fromCC) {
      return fromCC;
    }


    return null;
  }


  /* ======================================================
     安裝 update(dt) 包裝
  ====================================================== */

  function installWrapper() {

    if (
      !animationManagerRef ||
      typeof animationManagerRef
        .update !==
      'function'
    ) {

      ready = false;

      installed = false;

      return false;
    }


    originalAnimationUpdate =
      animationManagerRef
        .update;


    animationManagerRef
      .update =
      function(...args) {

        /*
          只修改第一個參數 dt。
          其他所有參數完全原樣。
        */
        if (
          args.length > 0
        ) {

          const originalDt =
            Number(
              args[0]
            );


          if (
            Number.isFinite(
              originalDt
            )
          ) {

            args[0] =
              originalDt *
              speed;
          }
        }


        /*
          原函式回傳值完全保留。
        */
        return originalAnimationUpdate
          .apply(
            this,
            args
          );
      };


    ready = true;

    installed = true;

    return true;
  }


  /* ======================================================
     初始化
  ====================================================== */

  function init(
    options = {}
  ) {

    /*
      避免重複包裝。
    */
    if (installed) {
      uninstall();
    }


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


    animationManagerRef =
      findAnimationManager(
        ccRef,
        directorRef,
        globalsRef
      );


    speed =
      1;


    installWrapper();


    return getState();
  }


  /* ======================================================
     確保還可用
  ====================================================== */

  function ensureReady() {

    if (
      installed &&
      ready &&
      animationManagerRef &&
      typeof animationManagerRef
        .update ===
      'function'
    ) {

      return true;
    }


    if (!globalsRef) {

      globalsRef =
        window;
    }


    init({
      globals:
        globalsRef
    });


    return ready;
  }


  /* ======================================================
     設定倍率
  ====================================================== */

  function setSpeed(
    value
  ) {

    const next =
      Number(value);


    /*
      只允許固定倍率。
    */
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


    speed =
      next;


    return true;
  }


  /* ======================================================
     恢復 1×
  ====================================================== */

  function resetSpeed() {

    return setSpeed(1);
  }


  /* ======================================================
     卸載
  ====================================================== */

  function uninstall() {

    if (
      animationManagerRef &&
      originalAnimationUpdate
    ) {

      animationManagerRef
        .update =
        originalAnimationUpdate;
    }


    installed =
      false;

    ready =
      false;

    speed =
      1;


    ccRef =
      null;

    directorRef =
      null;

    animationManagerRef =
      null;

    originalAnimationUpdate =
      null;


    return getState();
  }


  /* ======================================================
     State
  ====================================================== */

  function getState() {

    return {

      version:
        VERSION,

      installed,

      ready,

      speed,

      allowedSpeeds:
        [
          ...ALLOWED_SPEEDS
        ],

      hasCC:
        !!ccRef,

      hasDirector:
        !!directorRef,

      hasAnimationManager:
        !!animationManagerRef
    };
  }


  function getMode() {

    return MODE;
  }


  /* ======================================================
     Public API
  ====================================================== */

  window.XinyaoATGAnimationDtController = {

    version:
      VERSION,

    init,

    setSpeed,

    resetSpeed,

    uninstall,

    getState,

    getMode

    /*
      刻意沒有：

      spin()
      setBet()
      autoBet()
      setSchedulerSpeed()
    */
  };


  console.log(
    `[芯瑤 ATG Animation DT Controller] v${VERSION} 已載入｜${MODE}`
  );

})();
