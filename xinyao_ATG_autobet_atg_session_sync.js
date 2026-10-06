/* =========================================================
   芯瑤 ATG Read Session Sync
   Read Pipeline → AutoBet Session v0.1

   功能：
   - 同步目前點數
   - 同步免遊狀態
   - 保存唯讀下注 / 房號資料
   - false → true 才視為新的一局完成
   - 避免 spinCompleted 持續 true 被重複計算

   注意：
   READ ONLY
   不按 Spin
   不修改下注
   不寫入 ATG
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  let connected = false;

  let lastRead = null;
  let lastSpinCompleted = false;

  function getPipeline() {
    return window.XinyaoATGReadPipeline || null;
  }

  function getSession() {
    return window.XinyaoAutoBetSession || null;
  }

  function emptyRead() {
    return {
      balance: 0,
      bet: 0,
      roomId: '',
      freeGameActive: false,
      spinCompleted: false,
      mode: 'READ_ONLY',
      ok: false,
      reason: 'NO_DATA'
    };
  }

  function reset() {

    connected = false;

    lastRead =
      emptyRead();

    lastSpinCompleted =
      false;

    return {
      ok: true,
      connected: false
    };
  }

  function connect() {

    const pipeline =
      getPipeline();

    const session =
      getSession();

    if (!pipeline || !session) {

      connected = false;

      return {
        ok: false,
        connected: false,
        reason: 'CORE_NOT_READY'
      };
    }

    if (
      typeof pipeline.isConnected ===
        'function' &&
      !pipeline.isConnected()
    ) {

      connected = false;

      return {
        ok: false,
        connected: false,
        reason: 'PIPELINE_NOT_CONNECTED'
      };
    }

    connected = true;

    /*
      初始值先設 false，
      第一個真正 false → true
      才會算一局完成。
    */
    lastSpinCompleted = false;

    return {
      ok: true,
      connected: true,
      reason: 'CONNECTED'
    };
  }

  function disconnect() {

    connected = false;

    return {
      ok: true,
      connected: false,
      reason: 'DISCONNECTED'
    };
  }

  function syncOnce() {

    if (!connected) {

      return {
        ok: false,
        reason: 'NOT_CONNECTED'
      };
    }

    const pipeline =
      getPipeline();

    const session =
      getSession();

    if (!pipeline || !session) {

      connected = false;

      return {
        ok: false,
        reason: 'CORE_NOT_READY'
      };
    }

    const data =
      pipeline.read();

    if (!data || data.ok === false) {

      return {
        ok: false,
        reason:
          data?.reason ||
          'READ_FAILED'
      };
    }

    /*
      保留最新一次唯讀資料：
      - bet
      - roomId
      - balance
      - freeGameActive
      - spinCompleted
    */
    lastRead = {
      ...data
    };

    /*
      免遊狀態每次都同步。
    */
    session.setFreeGame?.(
      Boolean(
        data.freeGameActive
      )
    );

    /*
      只有 false → true
      才代表「新的完成事件」。
    */
    const newSpinCompleted =
      data.spinCompleted === true &&
      lastSpinCompleted === false;

    if (newSpinCompleted) {

      session.recordSpin({
        balance:
          data.balance,

        freeGameActive:
          data.freeGameActive
      });

    } else {

      /*
        沒有新完成事件時，
        只更新目前點數，
        不增加完成轉數。
      */
      session.updateBalance?.(
        data.balance
      );
    }

    /*
      記住本次狀態，
      防止 true / true / true
      被連續算成很多局。
    */
    lastSpinCompleted =
      Boolean(
        data.spinCompleted
      );

    return {
      ok: true,

      newSpinCompleted,

      data: {
        ...lastRead
      },

      session:
        session.getState()
    };
  }

  function getLastRead() {

    return lastRead
      ? {
          ...lastRead
        }
      : emptyRead();
  }

  function isConnected() {
    return connected;
  }

  function getState() {
    return {
      connected,
      lastSpinCompleted,
      lastRead:
        getLastRead()
    };
  }

  window.XinyaoATGReadSessionSync = {
    version: VERSION,

    reset,

    connect,
    disconnect,

    syncOnce,

    getLastRead,

    isConnected,
    getState
  };

  console.log(
    `[芯瑤 ATG Read Session Sync] v${VERSION} 已載入｜READ ONLY`
  );

})();
