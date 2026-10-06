/* =========================================================
   芯瑤 ATG Source Bridge
   被動唯讀來源橋接層 v0.1

   功能：
   - 從外部 sourceReader 取得原始資料
   - 不解析成下注邏輯
   - 不寫入 ATG
   - 不按 Spin
   - 不修改下注金額

   模式：
   PASSIVE_READ_ONLY
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';
  const MODE = 'PASSIVE_READ_ONLY';

  let sourceReader = null;

  function emptyResult(reason = 'SOURCE_NOT_READY') {
    return {
      balance: '',
      bet: '',
      roomId: '',
      freeGameActive: false,
      spinCompleted: false,

      mode: MODE,
      ok: false,
      reason
    };
  }

  function configure(options = {}) {

    if (
      typeof options.sourceReader ===
      'function'
    ) {
      sourceReader =
        options.sourceReader;
    }

    return {
      ok:
        typeof sourceReader ===
        'function',

      mode: MODE
    };
  }

  function reset() {

    sourceReader = null;

    return {
      ok: true,
      mode: MODE
    };
  }

  function read() {

    /*
      沒有來源時：
      不猜、不掃、不修改任何東西。
    */
    if (
      typeof sourceReader !==
      'function'
    ) {
      return emptyResult(
        'SOURCE_NOT_READY'
      );
    }

    let raw;

    try {

      raw =
        sourceReader() || {};

    } catch (error) {

      return emptyResult(
        'SOURCE_READ_ERROR'
      );
    }

    /*
      Source Bridge 盡量保留
      ATG 原始資料格式。

      真正的數字清洗與轉換，
      交給 Read-Only Adapter。
    */
    return {

      balance:
        raw.balance === undefined ||
        raw.balance === null
          ? ''
          : String(raw.balance),

      bet:
        raw.bet === undefined ||
        raw.bet === null
          ? ''
          : String(raw.bet),

      /*
        房號一定保留字串，
        避免 0863 → 863。
      */
      roomId:
        raw.roomId === undefined ||
        raw.roomId === null
          ? ''
          : String(raw.roomId),

      freeGameActive:
        Boolean(
          raw.freeGameActive
        ),

      spinCompleted:
        Boolean(
          raw.spinCompleted
        ),

      mode: MODE,

      ok: true,
      reason: 'OK'
    };
  }

  function getMode() {
    return MODE;
  }

  function isReady() {
    return (
      typeof sourceReader ===
      'function'
    );
  }

  window.XinyaoATGSourceBridge = {
    version: VERSION,

    configure,
    reset,

    read,

    getMode,
    isReady

    /*
      刻意沒有：
      setBet()
      spin()
      click()
      write()
    */
  };

  console.log(
    `[芯瑤 ATG Source Bridge] v${VERSION} 已載入｜${MODE}`
  );

})();
