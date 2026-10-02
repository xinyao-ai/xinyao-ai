/* =========================================================
   芯瑤 ATG AutoBet Live Panel
   Live Simulator ↔ Panel 橋接層 v0.1

   功能：
   - 掛載原本 Panel
   - START / PAUSE / RESUME / STOP
   - 每局完成後自動刷新 Panel
   - 同步 Console 狀態

   注意：
   目前只連接「假資料模擬」
   不會按 ATG Spin
   不會修改真正下注金額
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  let mounted = false;

  function getPanel() {
    return window.XinyaoAutoBetPanel || null;
  }

  function getLiveSim() {
    return window.XinyaoAutoBetLiveSim || null;
  }

  function getConsole() {
    return window.XinyaoAutoBetConsole || null;
  }

  function refresh() {

    const panel =
      getPanel();

    if (!panel) {
      return false;
    }

    /*
      更新 Session 顯示
    */
    panel.refreshSession?.();

    /*
      更新 Console 狀態
    */
    panel.renderStatus?.();

    return true;
  }

  function mount(target) {

    const panel =
      getPanel();

    const live =
      getLiveSim();

    if (!panel || !live) {
      return false;
    }

    const ok =
      panel.mount(target);

    if (!ok) {
      return false;
    }

    mounted = true;

    /*
      Panel.mount 不會重設 Session，
      所以原本測試資料會保留。
    */
    refresh();

    bindPanelButtons();

    return true;
  }

  function start() {

    const live =
      getLiveSim();

    const consoleCore =
      getConsole();

    if (!live) {
      return {
        status: 'STOPPED',
        reason: 'LIVE_SIM_NOT_READY'
      };
    }

    const result =
      live.start();

    /*
      同步原本 Console，
      讓 Panel 右上狀態一起變。
    */
    consoleCore?.start?.();

    refresh();

    return result;
  }

  function pause() {

    const live =
      getLiveSim();

    const consoleCore =
      getConsole();

    if (!live) {
      return null;
    }

    const result =
      live.pause();

    consoleCore?.pause?.();

    refresh();

    return result;
  }

  function resume() {

    const live =
      getLiveSim();

    const consoleCore =
      getConsole();

    if (!live) {
      return null;
    }

    const result =
      live.resume();

    consoleCore?.resume?.();

    refresh();

    return result;
  }

  function stop() {

    const live =
      getLiveSim();

    const consoleCore =
      getConsole();

    if (!live) {
      return null;
    }

    const result =
      live.stop(
        'USER_STOP'
      );

    consoleCore?.stop?.(
      'USER_STOP'
    );

    refresh();

    return result;
  }

  function emergencyStop() {

    const live =
      getLiveSim();

    const consoleCore =
      getConsole();

    const session =
      window.XinyaoAutoBetSession;

    session
      ?.setEmergencyStop
      ?.(
        true
      );

    live?.stop?.(
      'EMERGENCY_STOP'
    );

    consoleCore
      ?.emergencyStop
      ?.();

    refresh();

    return {
      status: 'STOPPED',
      reason: 'EMERGENCY_STOP'
    };
  }

  function tickOnce() {

    const live =
      getLiveSim();

    if (!live) {

      return {
        ok: false,
        reason: 'LIVE_SIM_NOT_READY'
      };
    }

    const result =
      live.tickOnce();

    /*
      不管有沒有執行，
      都重新讀 Session，
      確保畫面跟資料一致。
    */
    refresh();

    /*
      如果 Live Simulator
      因止盈 / 止損而停止，
      Console 也同步停止。
    */
    const liveState =
      live.getState();

    if (
      liveState.status === 'STOPPED'
    ) {

      const consoleCore =
        getConsole();

      if (
        consoleCore &&
        consoleCore.getState().status !==
          'STOPPED'
      ) {

        consoleCore.stop(
          liveState.reason ||
          'AUTOBET_STOP'
        );

        refresh();
      }
    }

    return result;
  }

  function bindPanelButtons() {

    if (!mounted) {
      return;
    }

    /*
      原 Panel 本來已經有 Console click handler。
      這裡額外同步 Live Simulator。

      使用 dataset 避免重複綁定。
    */

    const startButton =
      document.getElementById(
        'xab-start'
      );

    const pauseButton =
      document.getElementById(
        'xab-pause'
      );

    const resumeButton =
      document.getElementById(
        'xab-resume'
      );

    const emergencyButton =
      document.getElementById(
        'xab-emergency'
      );

    if (
      startButton &&
      startButton.dataset.livePanelBound !== '1'
    ) {

      startButton.dataset.livePanelBound = '1';

      startButton.addEventListener(
        'click',
        () => {
          getLiveSim()?.start?.();
          refresh();
        }
      );
    }

    if (
      pauseButton &&
      pauseButton.dataset.livePanelBound !== '1'
    ) {

      pauseButton.dataset.livePanelBound = '1';

      pauseButton.addEventListener(
        'click',
        () => {
          getLiveSim()?.pause?.();
          refresh();
        }
      );
    }

    if (
      resumeButton &&
      resumeButton.dataset.livePanelBound !== '1'
    ) {

      resumeButton.dataset.livePanelBound = '1';

      resumeButton.addEventListener(
        'click',
        () => {
          getLiveSim()?.resume?.();
          refresh();
        }
      );
    }

    if (
      emergencyButton &&
      emergencyButton.dataset.livePanelBound !== '1'
    ) {

      emergencyButton.dataset.livePanelBound = '1';

      emergencyButton.addEventListener(
        'click',
        () => {

          const session =
            window.XinyaoAutoBetSession;

          session
            ?.setEmergencyStop
            ?.(
              true
            );

          getLiveSim()
            ?.stop
            ?.(
              'EMERGENCY_STOP'
            );

          refresh();
        }
      );
    }
  }

  function getState() {

    const live =
      getLiveSim();

    return live
      ? live.getState()
      : {
          status: 'STOPPED',
          reason: 'LIVE_SIM_NOT_READY'
        };
  }

  window.XinyaoAutoBetLivePanel = {
    version: VERSION,

    mount,

    start,
    pause,
    resume,
    stop,

    emergencyStop,

    tickOnce,

    refresh,

    getState
  };

  console.log(
    `[芯瑤 AutoBet Live Panel] v${VERSION} 已載入｜目前只連接假資料模擬`
  );

})();
