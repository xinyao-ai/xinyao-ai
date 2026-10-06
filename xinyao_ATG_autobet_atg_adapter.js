/* =========================================================
   芯瑤 ATG Read-Only Adapter
   唯讀資料橋接層 v0.1

   功能：
   - 讀取目前點數
   - 讀取目前下注
   - 讀取目前房號
   - 讀取免遊狀態
   - 讀取一局是否完成

   注意：
   READ ONLY
   不會按 Spin
   不會修改下注
   不會操作 ATG
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  let reader = null;

  function numberValue(
    value,
    fallback = 0
  ) {

    const n =
      Number(
        String(
          value ?? ''
        )
          .replace(/,/g, '')
          .trim()
      );

    return Number.isFinite(n)
      ? n
      : fallback;
  }

  function roomValue(value) {

    if (
      value === null ||
      value === undefined
    ) {
      return '';
    }

    /*
      房號一定保留字串，
      避免 0863 變成 863。
    */
    return String(value).trim();
  }

  function configure(options = {}) {

    if (
      typeof options.reader ===
      'function'
    ) {
      reader = options.reader;
    }

    return {
      ok: true,
      mode: 'READ_ONLY'
    };
  }

  function reset() {

    reader = null;

    return {
      ok: true,
      mode: 'READ_ONLY'
    };
  }

  function read() {

    /*
      沒有 reader 時，
      回傳安全空值，
      不自己猜 ATG 資料。
    */
    if (
      typeof reader !== 'function'
    ) {

      return {
        balance: 0,
        bet: 0,
        roomId: '',
        freeGameActive: false,
        spinCompleted: false,

        mode: 'READ_ONLY',

        ok: false,
        reason: 'READER_NOT_READY'
      };
    }

    let raw;

    try {

      raw = reader() || {};

    } catch (error) {

      return {
        balance: 0,
        bet: 0,
        roomId: '',
        freeGameActive: false,
        spinCompleted: false,

        mode: 'READ_ONLY',

        ok: false,
        reason: 'READ_ERROR'
      };
    }

    return {

      balance:
        numberValue(
          raw.balance,
          0
        ),

      bet:
        numberValue(
          raw.bet,
          0
        ),

      /*
        重要：
        房號不轉 Number。
      */
      roomId:
        roomValue(
          raw.roomId
        ),

      freeGameActive:
        Boolean(
          raw.freeGameActive
        ),

      spinCompleted:
        Boolean(
          raw.spinCompleted
        ),

      mode:
        'READ_ONLY',

      ok:
        true,

      reason:
        'OK'
    };
  }

  function getMode() {
    return 'READ_ONLY';
  }

  window.XinyaoATGReadOnlyAdapter = {
    version: VERSION,

    configure,
    reset,

    read,

    getMode
  };

  console.log(
    `[芯瑤 ATG Read-Only Adapter] v${VERSION} 已載入｜READ ONLY`
  );

})();
