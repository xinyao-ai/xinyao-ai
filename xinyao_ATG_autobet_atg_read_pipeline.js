/* =========================================================
   芯瑤 ATG Read Pipeline
   Source Bridge → Read-Only Adapter v0.1

   流程：
   Source Bridge
       ↓
   Read-Only Adapter
       ↓
   標準化唯讀資料

   注意：
   - 不按 Spin
   - 不修改下注
   - 不寫入 ATG
   - 不修改舊 userscript
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  let connected = false;

  function getBridge() {
    return window.XinyaoATGSourceBridge || null;
  }

  function getAdapter() {
    return window.XinyaoATGReadOnlyAdapter || null;
  }

  function connect() {

    const bridge =
      getBridge();

    const adapter =
      getAdapter();

    if (!bridge || !adapter) {

      connected = false;

      return {
        ok: false,
        connected: false,
        reason: 'CORE_NOT_READY'
      };
    }

    /*
      Adapter 的 reader
      只向 Source Bridge 讀資料。
    */
    adapter.configure({
      reader: () => bridge.read()
    });

    connected = true;

    return {
      ok: true,
      connected: true,
      mode: 'READ_ONLY',
      reason: 'CONNECTED'
    };
  }

  function disconnect() {

    const adapter =
      getAdapter();

    /*
      只解除 Pipeline 自己的連線，
      不修改 Source Bridge。
    */
    adapter?.reset?.();

    connected = false;

    return {
      ok: true,
      connected: false,
      reason: 'DISCONNECTED'
    };
  }

  function read() {

    if (!connected) {

      return {
        balance: 0,
        bet: 0,
        roomId: '',
        freeGameActive: false,
        spinCompleted: false,

        mode: 'READ_ONLY',

        ok: false,
        reason: 'PIPELINE_NOT_CONNECTED'
      };
    }

    const adapter =
      getAdapter();

    if (!adapter) {

      connected = false;

      return {
        balance: 0,
        bet: 0,
        roomId: '',
        freeGameActive: false,
        spinCompleted: false,

        mode: 'READ_ONLY',

        ok: false,
        reason: 'ADAPTER_NOT_READY'
      };
    }

    return adapter.read();
  }

  function isConnected() {
    return connected;
  }

  function getMode() {
    return 'READ_ONLY';
  }

  window.XinyaoATGReadPipeline = {
    version: VERSION,

    connect,
    disconnect,

    read,

    isConnected,
    getMode
  };

  console.log(
    `[芯瑤 ATG Read Pipeline] v${VERSION} 已載入｜READ ONLY`
  );

})();
