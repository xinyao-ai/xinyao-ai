/* =========================================================
   芯瑤 ATG Read Panel
   Session Sync → AutoBet Panel v0.1

   功能：
   - 掛載原本粉色 Panel
   - 執行一次唯讀同步
   - Session 更新後立即刷新 Panel
   - 提供最新 ATG 唯讀資料

   注意：
   READ ONLY
   不按 Spin
   不修改下注
   不寫入 ATG
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  let mounted = false;
  let target = null;

  function getPanel() {
    return window.XinyaoAutoBetPanel || null;
  }

  function getSync() {
    return window.XinyaoATGReadSessionSync || null;
  }

  function refreshPanel() {

    const panel = getPanel();

    if (!panel) {
      return false;
    }

    /*
      重新讀取 Session 資料，
      更新：
      - 本金
      - 點數
      - 盈虧
      - 階段
      - 建議下注
      - 剩餘轉數
      - 止盈止損
      - 決策
    */
    panel.refreshSession?.();

    /*
      若原 Panel 有狀態區，
      一併更新。
    */
    panel.renderStatus?.();

    return true;
  }

  function mount(selector) {

    const panel = getPanel();

    if (!panel) {

      return {
        ok: false,
        reason: 'PANEL_NOT_READY'
      };
    }

    target = selector;

    const result =
      panel.mount(selector);

    /*
      有些 Panel.mount() 沒有回傳值，
      所以只要 DOM 已建立也視為成功。
    */
    const exists =
      typeof selector === 'string'
        ? Boolean(document.querySelector(selector))
        : Boolean(selector);

    if (result === false || !exists) {

      mounted = false;

      return {
        ok: false,
        reason: 'MOUNT_FAILED'
      };
    }

    mounted = true;

    refreshPanel();

    return {
      ok: true,
      mounted: true
    };
  }

  function syncOnce() {

    const sync = getSync();

    if (!sync) {

      return {
        ok: false,
        reason: 'SESSION_SYNC_NOT_READY'
      };
    }

    if (!mounted) {

      return {
        ok: false,
        reason: 'PANEL_NOT_MOUNTED'
      };
    }

    /*
      第一步：
      Read Pipeline → Session
    */
    const result =
      sync.syncOnce();

    /*
      第二步：
      Session → Panel
    */
    refreshPanel();

    return result;
  }

  function getLastRead() {

    const sync = getSync();

    if (!sync) {

      return {
        balance: 0,
        bet: 0,
        roomId: '',
        freeGameActive: false,
        spinCompleted: false,
        mode: 'READ_ONLY',
        ok: false
      };
    }

    return sync.getLastRead();
  }

  function refresh() {
    return refreshPanel();
  }

  function isMounted() {
    return mounted;
  }

  function getState() {

    return {
      mounted,
      target,
      lastRead:
        getLastRead()
    };
  }

  window.XinyaoATGReadPanel = {
    version: VERSION,

    mount,
    syncOnce,

    refresh,
    getLastRead,

    isMounted,
    getState
  };

  console.log(
    `[芯瑤 ATG Read Panel] v${VERSION} 已載入｜READ ONLY`
  );

})();
