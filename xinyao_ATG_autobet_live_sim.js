/* =========================================================
   芯瑤 ATG AutoBet Live Simulator
   即時假資料模擬器 v0.1

   功能：
   - START / PAUSE / RESUME / STOP
   - 一次 tickOnce = 模擬完成一局
   - 可依序餵入假點數
   - 每局交給 Simulator + Session 更新

   注意：
   目前不會按 ATG Spin
   不會修改下注金額
   不會操作真正 ATG
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  let state = {
    status: 'STOPPED',
    reason: 'INITIAL',
    index: 0,
    intervalMs: 1000
  };

  let balances = [];
  let timer = null;

  function getSimulator() {
    return window.XinyaoAutoBetSimulator || null;
  }

  function snapshot() {
    return {
      ...state,
      balances: balances.slice()
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
      index: 0,
      intervalMs: 1000
    };

    balances = [];

    return snapshot();
  }

  function configure(options = {}) {

    if (Array.isArray(options.balances)) {
      balances =
        options.balances
          .map(Number)
          .filter(Number.isFinite);
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

    state.index = 0;

    return snapshot();
  }

  function start() {

    state.status = 'RUNNING';
    state.reason = 'STARTED';

    return snapshot();
  }

  function pause() {

    if (state.status !== 'RUNNING') {
      return snapshot();
    }

    state.status = 'PAUSED';
    state.reason = 'USER_PAUSE';

    return snapshot();
  }

  function resume() {

    if (state.status !== 'PAUSED') {
      return snapshot();
    }

    state.status = 'RUNNING';
    state.reason = 'RESUMED';

    return snapshot();
  }

  function stop(reason = 'USER_STOP') {

    clearTimer();

    state.status = 'STOPPED';
    state.reason = reason;

    return snapshot();
  }

  function tickOnce() {

    if (state.status !== 'RUNNING') {
      return {
        ok: false,
        skipped: true,
        reason: 'NOT_RUNNING'
      };
    }

    const simulator =
      getSimulator();

    if (!simulator) {

      stop(
        'SIMULATOR_NOT_READY'
      );

      return {
        ok: false,
        skipped: false,
        reason: 'SIMULATOR_NOT_READY'
      };
    }

    if (
      state.index >=
      balances.length
    ) {

      stop(
        'NO_MORE_FAKE_DATA'
      );

      return {
        ok: false,
        skipped: false,
        reason: 'NO_MORE_FAKE_DATA'
      };
    }

    const balance =
      balances[
        state.index
      ];

    state.index += 1;

    const result =
      simulator.step({
        balance,
        freeGameActive: false
      });

    /*
      如果 AutoBet 判斷已經 STOP，
      Live Simulator 也跟著停。
    */
    if (
      result?.decision?.action ===
      'STOP'
    ) {

      state.status =
        'STOPPED';

      state.reason =
        result.decision.reason ||
        'AUTOBET_STOP';
    }

    return {
      ok: true,
      skipped: false,

      balance,

      index: state.index,

      result
    };
  }

  function startAuto() {

    clearTimer();

    start();

    timer =
      setInterval(
        () => {

          if (
            state.status !==
            'RUNNING'
          ) {
            return;
          }

          tickOnce();

        },
        state.intervalMs
      );

    return snapshot();
  }

  function stopAuto() {
    return stop(
      'USER_STOP'
    );
  }

  function getState() {
    return snapshot();
  }

  window.XinyaoAutoBetLiveSim = {
    version: VERSION,

    reset,
    configure,

    start,
    pause,
    resume,
    stop,

    tickOnce,

    startAuto,
    stopAuto,

    getState
  };

  console.log(
    `[芯瑤 AutoBet Live Simulator] v${VERSION} 已載入｜目前只跑假資料`
  );

})();
