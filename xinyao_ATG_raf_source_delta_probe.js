/* =========================================================
   芯瑤 ATG RAF Source / Delta Probe v0.1

   PASSIVE ONLY
   - 記錄 requestAnimationFrame 排程 / 執行
   - 記錄 callback timestamp 間隔
   - 記錄 RAF 呼叫來源
   - 不修改 timestamp
   - 不改速度
   - 不按 Spin
   - 不改下注
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';
  const MODE = 'PASSIVE_RAF_SOURCE_DELTA';

  let installed = false;

  let targetGlobals = null;
  let originalRAF = null;
  let stackProvider = null;

  let stats = freshStats();


  /* ======================================================
     初始資料
  ====================================================== */

  function freshStats() {
    return {
      scheduled: 0,
      fired: 0,

      deltas: [],
      lastTimestamp: null,

      sources: {}
    };
  }


  /* ======================================================
     數字整理
     避免 16.700000000000003
  ====================================================== */

  function round1(value) {

    return Math.round(
      Number(value) * 10
    ) / 10;
  }


  /* ======================================================
     來源解析
  ====================================================== */

  function extractSource(stack) {

    const text =
      String(stack || '');

    /*
      抓 stack 裡面的 URL。
    */
    const urls =
      text.match(
        /https?:\/\/[^\s)]+/g
      ) || [];


    for (let url of urls) {

      /*
        去除：
        :123:45
      */
      url =
        url.replace(
          /:\d+:\d+$/,
          ''
        );


      /*
        不要把 Probe 自己當來源。
      */
      if (
        /xinyao_ATG_raf_source_delta_probe\.js/i
          .test(url)
      ) {
        continue;
      }


      return url;
    }


    /*
      沒 URL 時嘗試一般 stack 行。
    */
    const lines =
      text
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);


    for (const line of lines) {

      if (
        /xinyao_ATG_raf_source_delta_probe\.js/i
          .test(line)
      ) {
        continue;
      }


      const match =
        line.match(
          /\(?([^()\s]+\.js)(?::\d+:\d+)?\)?/
        );


      if (match?.[1]) {
        return match[1];
      }
    }


    return 'UNKNOWN';
  }


  /* ======================================================
     Stack
  ====================================================== */

  function getStack() {

    try {

      if (
        typeof stackProvider ===
        'function'
      ) {
        return String(
          stackProvider() || ''
        );
      }


      return String(
        new Error().stack || ''
      );

    } catch {

      return '';
    }
  }


  /* ======================================================
     記錄來源
  ====================================================== */

  function recordSource() {

    const source =
      extractSource(
        getStack()
      );


    stats.sources[source] =
      (
        stats.sources[source] ||
        0
      ) + 1;
  }


  /* ======================================================
     記錄 timestamp / delta
  ====================================================== */

  function recordTimestamp(
    timestamp
  ) {

    const current =
      Number(timestamp);


    if (
      !Number.isFinite(current)
    ) {
      return;
    }


    if (
      Number.isFinite(
        stats.lastTimestamp
      )
    ) {

      const delta =
        round1(
          current -
          stats.lastTimestamp
        );


      /*
        排除負值。
      */
      if (delta >= 0) {
        stats.deltas.push(
          delta
        );
      }
    }


    stats.lastTimestamp =
      current;
  }


  /* ======================================================
     Install
  ====================================================== */

  function install(options = {}) {

    /*
      防止重複包裝。
    */
    if (installed) {
      uninstall();
    }


    targetGlobals =
      options.globals ||
      window;


    stackProvider =
      options.stackProvider ||
      null;


    if (
      !targetGlobals ||
      typeof targetGlobals
        .requestAnimationFrame !==
        'function'
    ) {

      throw new Error(
        '找不到 requestAnimationFrame'
      );
    }


    originalRAF =
      targetGlobals
        .requestAnimationFrame;


    targetGlobals
      .requestAnimationFrame =
      function(callback) {

        stats.scheduled++;

        recordSource();


        /*
          非 function callback：
          完全交還原生函式處理。
        */
        if (
          typeof callback !==
          'function'
        ) {

          return originalRAF.call(
            this,
            callback
          );
        }


        const wrappedCallback =
          function(timestamp) {

            stats.fired++;

            /*
              只讀取 timestamp，
              絕對不修改。
            */
            recordTimestamp(
              timestamp
            );


            return callback.call(
              this,
              timestamp
            );
          };


        /*
          原 RAF 的回傳值直接回傳，
          不做任何修改。
        */
        return originalRAF.call(
          this,
          wrappedCallback
        );
      };


    installed = true;


    return getState();
  }


  /* ======================================================
     Uninstall
  ====================================================== */

  function uninstall() {

    if (
      installed &&
      targetGlobals &&
      originalRAF
    ) {

      targetGlobals
        .requestAnimationFrame =
        originalRAF;
    }


    installed = false;

    targetGlobals = null;

    originalRAF = null;

    stackProvider = null;


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

    const deltas =
      [
        ...stats.deltas
      ];


    let minDelta = 0;
    let maxDelta = 0;
    let averageDelta = 0;
    let lastDelta = 0;


    if (
      deltas.length > 0
    ) {

      minDelta =
        round1(
          Math.min(...deltas)
        );


      maxDelta =
        round1(
          Math.max(...deltas)
        );


      const total =
        deltas.reduce(
          (sum, value) =>
            sum + value,
          0
        );


      averageDelta =
        round1(
          total /
          deltas.length
        );


      lastDelta =
        round1(
          deltas[
            deltas.length - 1
          ]
        );
    }


    return {

      version:
        VERSION,

      mode:
        MODE,

      scheduled:
        stats.scheduled,

      fired:
        stats.fired,

      deltaCount:
        deltas.length,

      minDelta,

      maxDelta,

      averageDelta,

      lastDelta,

      sources: {
        ...stats.sources
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

  window.XinyaoATGRAFSourceDeltaProbe = {

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

      目前完全被動診斷。
    */
  };


  console.log(
    `[芯瑤 ATG RAF Source / Delta Probe] v${VERSION} 已載入｜${MODE}`
  );

})();
