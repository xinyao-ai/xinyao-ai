/* =========================================================
   芯瑤 ATG AutoBet Console
   控制台狀態核心 v0.1

   功能：
   START / PAUSE / RESUME / EMERGENCY STOP

   注意：
   目前只控制「模擬狀態」
   不會按 Spin
   不會修改 ATG 下注金額
   不會操作正式遊戲
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  let state = {
    status: 'STOPPED',
    reason: 'INITIAL',
    startedAt: null,
    pausedAt: null,
    stoppedAt: null
  };

  function snapshot() {
    return {
      ...state
    };
  }

  function reset() {

    state = {
      status: 'STOPPED',
      reason: 'RESET',
      startedAt: null,
      pausedAt: null,
      stoppedAt: null
    };

    return snapshot();
  }

  function start() {

    state.status = 'RUNNING';
    state.reason = 'STARTED';
    state.startedAt = Date.now();
    state.pausedAt = null;
    state.stoppedAt = null;

    return snapshot();
  }

  function pause() {

    if (state.status !== 'RUNNING') {
      return snapshot();
    }

    state.status = 'PAUSED';
    state.reason = 'USER_PAUSE';
    state.pausedAt = Date.now();

    return snapshot();
  }

  function resume() {

    if (state.status !== 'PAUSED') {
      return snapshot();
    }

    state.status = 'RUNNING';
    state.reason = 'RESUMED';
    state.pausedAt = null;

    return snapshot();
  }

  function stop(reason = 'USER_STOP') {

    state.status = 'STOPPED';
    state.reason = reason;
    state.stoppedAt = Date.now();

    return snapshot();
  }

  function emergencyStop() {

    state.status = 'STOPPED';
    state.reason = 'EMERGENCY_STOP';
    state.stoppedAt = Date.now();
    state.pausedAt = null;

    return snapshot();
  }

  function getState() {
    return snapshot();
  }

  window.XinyaoAutoBetConsole = {
    version: VERSION,
    reset,
    start,
    pause,
    resume,
    stop,
    emergencyStop,
    getState
  };

  console.log(
    `[芯瑤 AutoBet Console] v${VERSION} 已載入｜目前只控制模擬狀態`
  );

})();
