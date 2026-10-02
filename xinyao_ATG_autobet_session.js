/* =========================================================
   芯瑤 ATG AutoBet Session
   執行狀態核心 v0.1

   負責保存：
   - 進房本金
   - 目前點數
   - 本房盈虧
   - 總完成轉數
   - 目前階段
   - 階段完成轉數
   - 止盈 / 止損
   - 最大轉數
   - 免遊狀態

   注意：
   目前只管理資料
   不會按 Spin
   不會改注
   不會操作 ATG
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  let state = {};
  let settings = {};

  function freshState() {
    return {
      startBalance: 0,
      balance: 0,
      profit: 0,

      totalSpins: 0,

      stage: 1,
      stageCompletedSpins: 0,

      freeGameActive: false,

      emergencyStop: false,

      lastUpdatedAt: null
    };
  }

  function freshSettings() {
    return {
      takeProfit: 0,
      stopLoss: 0,
      maxSpins: 0
    };
  }

  function recalc() {
    state.profit =
      num(state.balance) -
      num(state.startBalance);

    state.lastUpdatedAt =
      Date.now();
  }

  function reset(options = {}) {

    state =
      freshState();

    settings =
      freshSettings();

    state.startBalance =
      Math.max(
        0,
        num(options.startBalance)
      );

    state.balance =
      Math.max(
        0,
        num(
          options.balance,
          state.startBalance
        )
      );

    settings.takeProfit =
      Math.max(
        0,
        num(options.takeProfit)
      );

    settings.stopLoss =
      Math.max(
        0,
        num(options.stopLoss)
      );

    settings.maxSpins =
      Math.max(
        0,
        Math.floor(
          num(options.maxSpins)
        )
      );

    recalc();

    return getState();
  }

  function getState() {

    return {
      ...state,

      settings: {
        ...settings
      }
    };
  }

  function updateBalance(value) {

    const balance =
      Number(value);

    if (!Number.isFinite(balance)) {
      return getState();
    }

    state.balance =
      Math.max(
        0,
        balance
      );

    recalc();

    return getState();
  }

  function setFreeGame(active) {

    state.freeGameActive =
      Boolean(active);

    state.lastUpdatedAt =
      Date.now();

    return getState();
  }

  function setEmergencyStop(active) {

    state.emergencyStop =
      Boolean(active);

    state.lastUpdatedAt =
      Date.now();

    return getState();
  }

  function recordSpin(data = {}) {

    /*
      一次 recordSpin
      = 一次已完成的正常遊戲回合。

      之後正式接 ATG 時，
      必須等確認一局完成後才呼叫。
    */

    state.totalSpins += 1;
    state.stageCompletedSpins += 1;

    if (
      data.balance !== undefined &&
      Number.isFinite(
        Number(data.balance)
      )
    ) {
      state.balance =
        Math.max(
          0,
          Number(data.balance)
        );
    }

    if (
      data.freeGameActive !== undefined
    ) {
      state.freeGameActive =
        Boolean(
          data.freeGameActive
        );
    }

    recalc();

    return getState();
  }

  function nextStage() {

    state.stage += 1;
    state.stageCompletedSpins = 0;

    state.lastUpdatedAt =
      Date.now();

    return getState();
  }

  function getDecision() {

    const runner =
      window.XinyaoAutoBetRunner;

    if (!runner) {

      return {
        action: 'STOP',
        reason: 'RUNNER_NOT_READY',
        bet: null,
        remainingStageSpins: 0
      };
    }

    return runner.next(
      {
        startBalance:
          state.startBalance,

        balance:
          state.balance,

        totalSpins:
          state.totalSpins,

        stage:
          state.stage,

        stageCompletedSpins:
          state.stageCompletedSpins,

        freeGameActive:
          state.freeGameActive,

        emergencyStop:
          state.emergencyStop
      },

      {
        takeProfit:
          settings.takeProfit,

        stopLoss:
          settings.stopLoss,

        maxSpins:
          settings.maxSpins
      }
    );
  }

  function setSettings(next = {}) {

    if (
      next.takeProfit !== undefined
    ) {
      settings.takeProfit =
        Math.max(
          0,
          num(next.takeProfit)
        );
    }

    if (
      next.stopLoss !== undefined
    ) {
      settings.stopLoss =
        Math.max(
          0,
          num(next.stopLoss)
        );
    }

    if (
      next.maxSpins !== undefined
    ) {
      settings.maxSpins =
        Math.max(
          0,
          Math.floor(
            num(next.maxSpins)
          )
        );
    }

    return getState();
  }

  /*
    初始化成安全空白狀態
  */
  state = freshState();
  settings = freshSettings();

  window.XinyaoAutoBetSession = {
    version: VERSION,

    reset,
    getState,

    updateBalance,
    recordSpin,

    setFreeGame,
    setEmergencyStop,

    nextStage,
    getDecision,
    setSettings
  };

  console.log(
    `[芯瑤 AutoBet Session] v${VERSION} 已載入｜目前只管理模擬資料`
  );

})();
