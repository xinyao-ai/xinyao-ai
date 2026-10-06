/* =========================================================
   芯瑤 ATG Auto Read Sync
   自動唯讀同步器 v0.1

   功能：
   - START
   - PAUSE
   - RESUME
   - STOP
   - 定時執行 Read Panel.syncOnce()
   - 自動刷新 Session + Panel

   注意：
   READ ONLY
   不按 Spin
   不修改下注
   不寫入 ATG
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  let timer = null;

  let state = {
    status: 'STOPPED',
    reason: 'INITIAL',
    intervalMs: 1000,
    syncCount: 0
  };

  function getReadPanel() {
    return window.XinyaoATGReadPanel || null;
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
      syncCount: 0
    };

    return snapshot();
  }

  function syncOnce() {

    if (state.status !== 'RUNNING') {

      return {
        ok: false,
        skipped: true,
        reason: 'NOT_RUNNING'
      };
    }

    const readPanel =
      getReadPanel();

    if (!readPanel) {

      clearTimer();

      state.status = 'STOPPED';
      state.reason = 'READ_PANEL_NOT_READY';

      return {
        ok: false,
        skipped: false,
        reason: 'READ_PANEL_NOT_READY'
      };
    }

    const result =
      readPanel.syncOnce();

    state.syncCount += 1;

    return result;
  }

  function createTimer() {

    clearTimer();

    timer =
      setInterval(
        () => {

          if (
            state.status !==
            'RUNNING'
          ) {
            return;
          }

          syncOnce();

        },
        state.intervalMs
      );
  }

  function start(options = {}) {

    const readPanel =
      getReadPanel();

    if (!readPanel) {

      state.status = 'STOPPED';
      state.reason = 'READ_PANEL_NOT_READY';

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

    clearTimer();

    state.status = 'RUNNING';
    state.reason = 'STARTED';

    createTimer();

    return snapshot();
  }

  function pause() {

    if (
      state.status !==
      'RUNNING'
    ) {
      return snapshot();
    }

    clearTimer();

    state.status = 'PAUSED';
    state.reason = 'USER_PAUSE';

    return snapshot();
  }

  function resume() {

    if (
      state.status !==
      'PAUSED'
    ) {
      return snapshot();
    }

    state.status = 'RUNNING';
    state.reason = 'RESUMED';

    createTimer();

    return snapshot();
  }

  function stop() {

    clearTimer();

    state.status = 'STOPPED';
    state.reason = 'USER_STOP';

    return snapshot();
  }

  function getState() {
    return snapshot();
  }

  window.XinyaoATGAutoReadSync = {
    version: VERSION,

    reset,

    start,
    pause,
    resume,
    stop,

    syncOnce,

    getState
  };

  console.log(
    `[芯瑤 ATG Auto Read Sync] v${VERSION} 已載入｜READ ONLY`
  );

})();
