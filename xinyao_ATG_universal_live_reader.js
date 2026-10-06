/* =========================================================
   芯瑤 ATG Universal Live Reader v0.1

   功能：
   - 使用 Universal Device Resolver 唯讀解析資料
   - DOM 改變時自動更新
   - resize 時自動更新
   - orientationchange 時自動更新
   - 可開始 / 停止 / 重置

   不會：
   - 按 Spin
   - 修改下注
   - 操作真正 ATG
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';
  const MODE = 'UNIVERSAL_LIVE_READ_ONLY';

  let root = null;
  let observer = null;
  let debounceTimer = null;

  let debounceMs = 80;

  let data = freshData();

  let state = {
    status: 'STOPPED',
    refreshCount: 0,
    lastRefreshAt: 0
  };


  /* ======================================================
     初始資料
  ====================================================== */

  function freshData() {
    return {
      roomId: '',
      entryBalance: '',
      balance: '',
      profit: '',
      bet: '',
      freeGameCount: '',
      completedSpins: '',
      shadowRoots: 0,
      scannedElements: 0
    };
  }


  /* ======================================================
     Resolver
  ====================================================== */

  function getResolver() {

    const resolver =
      window.XinyaoATGUniversalDeviceResolver;

    if (
      !resolver ||
      typeof resolver.resolve !== 'function'
    ) {

      throw new Error(
        'Universal Device Resolver 尚未載入'
      );
    }

    return resolver;
  }


  /* ======================================================
     真正重新解析
  ====================================================== */

  function refreshNow() {

    if (
      state.status !== 'RUNNING'
    ) {
      return data;
    }

    if (!root) {
      return data;
    }

    try {

      const resolver =
        getResolver();

      const result =
        resolver.resolve(root);

      data = {
        roomId:
          result.roomId ?? '',

        entryBalance:
          result.entryBalance ?? '',

        balance:
          result.balance ?? '',

        profit:
          result.profit ?? '',

        bet:
          result.bet ?? '',

        freeGameCount:
          result.freeGameCount ?? '',

        completedSpins:
          result.completedSpins ?? '',

        shadowRoots:
          Number(
            result.shadowRoots ?? 0
          ),

        scannedElements:
          Number(
            result.scannedElements ?? 0
          )
      };

      state.refreshCount++;

      state.lastRefreshAt =
        Date.now();

      /*
        之後正式 Panel / Session
        可以直接監聽這個事件。
      */
      window.dispatchEvent(
        new CustomEvent(
          'xinyao-atg-live-reader-update',
          {
            detail:
              getData()
          }
        )
      );

    } catch (error) {

      console.error(
        '[芯瑤 Universal Live Reader] 解析失敗',
        error
      );
    }

    return data;
  }


  /* ======================================================
     Debounce
  ====================================================== */

  function scheduleRefresh() {

    if (
      state.status !== 'RUNNING'
    ) {
      return;
    }

    if (debounceTimer) {
      clearTimeout(
        debounceTimer
      );
    }

    debounceTimer =
      setTimeout(
        () => {

          debounceTimer = null;

          refreshNow();

        },
        debounceMs
      );
  }


  /* ======================================================
     DOM Observer
  ====================================================== */

  function connectObserver() {

    if (
      !root ||
      typeof MutationObserver ===
      'undefined'
    ) {
      return;
    }

    observer =
      new MutationObserver(
        () => {
          scheduleRefresh();
        }
      );

    observer.observe(
      root,
      {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true
      }
    );
  }


  function disconnectObserver() {

    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }


  /* ======================================================
     裝置 / 畫面事件
  ====================================================== */

  function onResize() {
    scheduleRefresh();
  }


  function onOrientationChange() {
    scheduleRefresh();
  }


  function connectWindowEvents() {

    window.addEventListener(
      'resize',
      onResize
    );

    window.addEventListener(
      'orientationchange',
      onOrientationChange
    );
  }


  function disconnectWindowEvents() {

    window.removeEventListener(
      'resize',
      onResize
    );

    window.removeEventListener(
      'orientationchange',
      onOrientationChange
    );
  }


  /* ======================================================
     Start
  ====================================================== */

  function start(options = {}) {

    /*
      防止重複 start 疊加 Observer。
    */
    stop();


    root =
      options.root ||
      document;


    debounceMs =
      Number.isFinite(
        Number(
          options.debounceMs
        )
      )
        ? Math.max(
            0,
            Number(
              options.debounceMs
            )
          )
        : 80;


    state.status =
      'RUNNING';


    connectObserver();

    connectWindowEvents();


    /*
      啟動立即解析一次。
    */
    refreshNow();


    return getState();
  }


  /* ======================================================
     Stop
  ====================================================== */

  function stop() {

    disconnectObserver();

    disconnectWindowEvents();


    if (debounceTimer) {

      clearTimeout(
        debounceTimer
      );

      debounceTimer = null;
    }


    state.status =
      'STOPPED';


    return getState();
  }


  /* ======================================================
     Reset
  ====================================================== */

  function reset() {

    stop();

    root = null;

    debounceMs = 80;

    data =
      freshData();

    state = {
      status: 'STOPPED',
      refreshCount: 0,
      lastRefreshAt: 0
    };


    return getState();
  }


  /* ======================================================
     Read API
  ====================================================== */

  function getData() {

    return {
      ...data
    };
  }


  function getState() {

    return {
      ...state
    };
  }


  function getMode() {
    return MODE;
  }


  function manualRefresh() {

    if (
      state.status !== 'RUNNING'
    ) {
      return getData();
    }

    if (debounceTimer) {

      clearTimeout(
        debounceTimer
      );

      debounceTimer = null;
    }

    refreshNow();

    return getData();
  }


  /* ======================================================
     對外 API
  ====================================================== */

  window.XinyaoATGUniversalLiveReader = {

    version:
      VERSION,

    start,

    stop,

    reset,

    refresh:
      manualRefresh,

    getData,

    getState,

    getMode
  };


  console.log(
    `[芯瑤 ATG Universal Live Reader] v${VERSION} 已載入｜${MODE}`
  );

})();
