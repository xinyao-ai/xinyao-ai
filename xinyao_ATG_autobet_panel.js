/* =========================================================
   芯瑤 ATG AutoBet Panel
   模擬控制面板 v0.1

   功能：
   ▶ 開始
   ⏸ 暫停
   ▶ 繼續
   🛑 緊急停止

   注意：
   目前只控制模擬狀態
   不會按 ATG Spin
   不會修改下注金額
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  let root = null;

  function getConsole() {
    return window.XinyaoAutoBetConsole || null;
  }

  function stateText(status) {
    const map = {
      STOPPED: '已停止',
      RUNNING: '模擬執行中',
      PAUSED: '已暫停'
    };

    return map[status] || status;
  }

  function renderStatus() {

    if (!root) return;

    const C = getConsole();

    const statusEl =
      root.querySelector('#xab-status');

    const reasonEl =
      root.querySelector('#xab-reason');

    if (!C) {

      if (statusEl) {
        statusEl.textContent =
          '核心未載入';
      }

      if (reasonEl) {
        reasonEl.textContent =
          'CONSOLE_NOT_READY';
      }

      return;
    }

    const state =
      C.getState();

    if (statusEl) {
      statusEl.textContent =
        stateText(state.status);
    }

    if (reasonEl) {
      reasonEl.textContent =
        state.reason || '—';
    }
  }

  function bind() {

    const C = getConsole();

    if (!C || !root) return;

    root
      .querySelector('#xab-start')
      ?.addEventListener(
        'click',
        () => {
          C.start();
          renderStatus();
        }
      );

    root
      .querySelector('#xab-pause')
      ?.addEventListener(
        'click',
        () => {
          C.pause();
          renderStatus();
        }
      );

    root
      .querySelector('#xab-resume')
      ?.addEventListener(
        'click',
        () => {
          C.resume();
          renderStatus();
        }
      );

    root
      .querySelector('#xab-emergency')
      ?.addEventListener(
        'click',
        () => {
          C.emergencyStop();
          renderStatus();
        }
      );
  }

  function mount(target) {

    const element =
      typeof target === 'string'
        ? document.querySelector(target)
        : target;

    if (!element) {
      return false;
    }

    root = element;

    const C = getConsole();

    if (!C) {

      root.innerHTML = `
        <div style="
          padding:16px;
          border:1px solid #ffb7cc;
          border-radius:16px;
          background:#fff1f6;
          color:#d83d58;
          font-weight:800;
        ">
          ❌ AutoBet Console 尚未載入
        </div>
      `;

      return false;
    }

    /*
      每次重新 mount，
      先回到安全停止狀態。
    */
    C.reset();

    root.innerHTML = `
      <div style="
        border:1px solid #ffd1e1;
        border-radius:20px;
        background:#fff;
        padding:18px;
        box-shadow:0 10px 30px rgba(239,55,126,.08);
      ">

        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          flex-wrap:wrap;
          margin-bottom:14px;
        ">

          <div>
            <div style="
              font-size:18px;
              font-weight:900;
              color:#ef377e;
            ">
              🌸 芯瑤 AutoBet
            </div>

            <div style="
              margin-top:4px;
              font-size:12px;
              color:#9a7d89;
            ">
              模擬模式｜目前不會操作 ATG
            </div>
          </div>

          <div style="
            padding:8px 12px;
            border-radius:999px;
            background:#fff0f6;
            color:#e33878;
            font-weight:900;
          ">
            <span id="xab-status">
              已停止
            </span>
          </div>

        </div>

        <div style="
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:10px;
          margin-bottom:14px;
        ">

          <div style="
            padding:12px;
            border-radius:14px;
            background:#fff7fb;
            border:1px solid #f7d8e4;
          ">
            <div style="
              font-size:11px;
              color:#9b7d89;
            ">
              控制狀態
            </div>

            <div style="
              margin-top:4px;
              font-weight:900;
            ">
              <span id="xab-state-label">
                模擬控制
              </span>
            </div>
          </div>

          <div style="
            padding:12px;
            border-radius:14px;
            background:#fff7fb;
            border:1px solid #f7d8e4;
          ">
            <div style="
              font-size:11px;
              color:#9b7d89;
            ">
              最後原因
            </div>

            <div
              id="xab-reason"
              style="
                margin-top:4px;
                font-weight:900;
              "
            >
              RESET
            </div>
          </div>

        </div>

        <div style="
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:10px;
        ">

          <button
            id="xab-start"
            type="button"
            style="
              padding:13px;
              border:0;
              border-radius:14px;
              background:#ef377e;
              color:#fff;
              font-weight:900;
              cursor:pointer;
            "
          >
            ▶️ 開始模擬
          </button>

          <button
            id="xab-pause"
            type="button"
            style="
              padding:13px;
              border:1px solid #efc8d8;
              border-radius:14px;
              background:#fff5f9;
              color:#d94c89;
              font-weight:900;
              cursor:pointer;
            "
          >
            ⏸️ 暫停
          </button>

          <button
            id="xab-resume"
            type="button"
            style="
              padding:13px;
              border:1px solid #efc8d8;
              border-radius:14px;
              background:#fff5f9;
              color:#d94c89;
              font-weight:900;
              cursor:pointer;
            "
          >
            ▶️ 繼續
          </button>

          <button
            id="xab-emergency"
            type="button"
            style="
              padding:13px;
              border:0;
              border-radius:14px;
              background:#d93855;
              color:#fff;
              font-weight:900;
              cursor:pointer;
            "
          >
            🛑 緊急停止
          </button>

        </div>

        <div style="
          margin-top:14px;
          padding:11px 12px;
          border-radius:12px;
          background:#fff8fb;
          color:#8e7480;
          font-size:11px;
          line-height:1.7;
        ">
          ⚠️ 此面板目前只控制模擬狀態，
          不會按 Spin、不會調注、不會送出下注。
        </div>

      </div>
    `;

    bind();
    renderStatus();

    return true;
  }

  window.XinyaoAutoBetPanel = {
    version: VERSION,
    mount,
    renderStatus
  };

  console.log(
    `[芯瑤 AutoBet Panel] v${VERSION} 已載入｜模擬模式`
  );

})();
