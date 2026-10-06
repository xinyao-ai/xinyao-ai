/* =========================================================
   芯瑤 ATG Timer Delay Trace Probe v0.1

   PASSIVE ONLY
   - 只記錄 setTimeout 的延遲時間
   - 不縮短延遲
   - 不修改 callback
   - 不加速
   - 不按 Spin
   - 不改下注
========================================================= */

(() => {
  'use strict';

  const VERSION =
    '0.1.0';

  const MODE =
    'PASSIVE_TIMER_DELAY_TRACE';


  let installed =
    false;

  let targetGlobals =
    null;

  let originalSetTimeout =
    null;


  let stats =
    freshStats();


  /* ======================================================
     初始統計
  ====================================================== */

  function freshStats() {

    return {

      totalScheduled: 0,

      fired: 0,

      delays: {},

      delayValues: []

    };
  }


  /* ======================================================
     延遲值標準化
  ====================================================== */

  function normalizeDelay(
    delay
  ) {

    const number =
      Number(delay);


    if (
      !Number.isFinite(number)
    ) {
      return 0;
    }


    /*
      setTimeout 負數實際上也等同立即排程，
      所以統一視為 0。
    */
    return Math.max(
      0,
      number
    );
  }


  /* ======================================================
     記錄 delay
  ====================================================== */

  function recordDelay(
    delay
  ) {

    const normalized =
      normalizeDelay(delay);


    const key =
      String(normalized);


    stats.totalScheduled++;


    stats.delayValues.push(
      normalized
    );


    stats.delays[key] =
      (
        stats.delays[key] ||
        0
      ) + 1;


    return normalized;
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


    targetGlobals =
      options.globals ||
      window;


    if (
      !targetGlobals ||
      typeof targetGlobals
        .setTimeout !==
        'function'
    ) {

      throw new Error(
        '找不到 setTimeout'
      );
    }


    originalSetTimeout =
      targetGlobals
        .setTimeout;


    targetGlobals
      .setTimeout =
      function(
        callback,
        delay,
        ...args
      ) {

        recordDelay(
          delay
        );


        /*
          callback 不是 function 時，
          不自行改變原始行為。
        */
        if (
          typeof callback !==
          'function'
        ) {

          return originalSetTimeout
            .call(
              this,
              callback,
              delay,
              ...args
            );
        }


        /*
          只包一層來計算 fired。
          延遲值仍然原封不動傳給原 setTimeout。
        */
        const wrappedCallback =
          function(...callbackArgs) {

            stats.fired++;

            return callback.apply(
              this,
              callbackArgs
            );
          };


        return originalSetTimeout
          .call(
            this,
            wrappedCallback,
            delay,
            ...args
          );
      };


    installed =
      true;


    return getState();
  }


  /* ======================================================
     Uninstall
  ====================================================== */

  function uninstall() {

    if (
      installed &&
      targetGlobals &&
      originalSetTimeout
    ) {

      targetGlobals
        .setTimeout =
        originalSetTimeout;
    }


    installed =
      false;

    targetGlobals =
      null;

    originalSetTimeout =
      null;


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

    const values =
      [
        ...stats.delayValues
      ];


    let minDelay =
      0;

    let maxDelay =
      0;

    let averageDelay =
      0;


    if (
      values.length > 0
    ) {

      minDelay =
        Math.min(
          ...values
        );


      maxDelay =
        Math.max(
          ...values
        );


      const total =
        values.reduce(
          (sum, value) =>
            sum + value,
          0
        );


      averageDelay =
        total /
        values.length;
    }


    return {

      version:
        VERSION,

      mode:
        MODE,

      totalScheduled:
        stats.totalScheduled,

      fired:
        stats.fired,

      delays: {
        ...stats.delays
      },

      minDelay,

      maxDelay,

      averageDelay

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

  window.XinyaoATGTimerDelayTraceProbe = {

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

      目前只做被動紀錄。
    */
  };


  console.log(
    `[芯瑤 ATG Timer Delay Trace Probe] v${VERSION} 已載入｜${MODE}`
  );

})();
