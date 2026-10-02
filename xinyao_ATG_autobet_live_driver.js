/* =========================================================
   芯瑤 ATG AutoBet Live Driver
   自動逐局假資料驅動器 v0.1

   功能：
   - START
   - PAUSE
   - RESUME
   - STOP
   - 依指定時間自動執行下一局
   - 每局完成後刷新 Live Panel
   - 假資料用完後自動停止

   注意：
   目前仍然只跑假資料
   不會按 ATG Spin
   不會修改真正下注金額
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  let timer = null;

  let state = {
    status: 'STOPPED',
    reason: 'INITIAL',
    intervalMs: 1000,
    ticks: 0
  };

  function getLivePanel() {
    return window.XinyaoAutoBetLivePanel || null;
  }

  function getLiveSim() {
    return window.XinyaoAutoBetLiveSim || null;
  }

  function snapshot() {
    return {
      ...state
    };
  }

  function clearTimer() {

    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function reset() {

    clearTimer();

    state = {
      status: 'STOPPED',
      reason: 'RESET',
      intervalMs: 1000,
      ticks: 0
    };

    return snapshot();
  }

  function finishFromLiveSim() {

    const live =
      getLiveSim();

    if (!live) {
      return false;
    }

    const liveState =
      live.getState();

    if (liveState.status !== 'STOPPED') {
      return false;
    }

    clearTimer();

    state.status = 'STOPPED';
    state.reason =
      liveState.reason || 'LIVE_SIM_STOPPED';

    return true;
  }

  function runTick() {

    if (state.status !== 'RUNNING') {
      return {
        ok: false,
        skipped: true,
        reason: 'DRIVER_NOT_RUNNING'
      };
    }

    const livePanel =
      getLivePanel();

    if (!livePanel) {

      clearTimer();

      state.status = 'STOPPED';
      state.reason = 'LIVE_PANEL_NOT_READY';

      return {
        ok: false,
        skipped: false,
        reason: 'LIVE_PANEL_NOT_READY'
      };
    }

    const result =
      livePanel.tickOnce();

    state.ticks += 1;

    /*
      Live Simulator 若因：
      - 假資料跑完
      - 止盈
      - 止損
      - 最大轉數
      等原因停止，
      Driver 也一起停止。
    */
    finishFromLiveSim();

    return result;
  }

  function createTimer() {

    clearTimer();

    timer =
      setInterval(
        () => {

          if (state.status !== 'RUNNING') {
            return;
          }

          runTick();

        },
        state.intervalMs
      );
  }

  function start(options = {}) {

    const livePanel =
      getLivePanel();

    const live =
      getLiveSim();

    if (!livePanel || !live) {

      state.status = 'STOPPED';
      state.reason = 'CORE_NOT_READY';

      return snapshot();
    }

    if (
      options.intervalMs !== undefined &&
      Number.isFinite(
        Number(options.intervalMs)
      )
    ) {
      state.intervalMs =
        Math.max(
          50,
          Number(options.intervalMs)
        );
    }

    /*
      先啟動 Live Simulator，
      再啟動 Driver timer。
    */
    livePanel.start();

    state.status = 'RUNNING';
    state.reason = 'STARTED';

    createTimer();

    return snapshot();
  }

  function pause() {

    if (state.status !== 'RUNNING') {
      return snapshot();
    }

    clearTimer();

    getLivePanel()
      ?.pause
      ?.();

    state.status = 'PAUSED';
    state.reason = 'USER_PAUSE';

    return snapshot();
  }

  function resume() {

    if (state.status !== 'PAUSED') {
      return snapshot();
    }

    const live =
      getLiveSim();

    if (!live) {

      state.status = 'STOPPED';
      state.reason = 'LIVE_SIM_NOT_READY';

      return snapshot();
    }

    getLivePanel()
      ?.resume
      ?.();

    state.status = 'RUNNING';
    state.reason = 'RESUMED';

    createTimer();

    return snapshot();
  }

  function stop(
    reason = 'USER_STOP'
  ) {

    clearTimer();

    getLivePanel()
      ?.stop
      ?.();

    state.status = 'STOPPED';
    state.reason = reason;

    return snapshot();
  }

  function emergencyStop() {

    clearTimer();

    getLivePanel()
      ?.emergencyStop
      ?.();

    state.status = 'STOPPED';
    state.reason = 'EMERGENCY_STOP';

    return snapshot();
  }

  function tickOnce() {
    return runTick();
  }

  function getState() {

    /*
      查詢狀態時順便同步
      Live Simulator 的停止狀態。
    */
    if (state.status === 'RUNNING') {
      finishFromLiveSim();
    }

    return snapshot();
  }

  window.XinyaoAutoBetLiveDriver = {
    version: VERSION,

    reset,

    start,
    pause,
    resume,
    stop,

    emergencyStop,

    tickOnce,

    getState
  };

  console.log(
    `[芯瑤 AutoBet Live Driver] v${VERSION} 已載入｜目前只驅動假資料`
  );

})();
