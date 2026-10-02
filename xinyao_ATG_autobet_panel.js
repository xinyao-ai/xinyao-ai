/* =========================================================
   芯瑤 ATG AutoBet Panel
   Session 整合版 v0.2

   顯示：
   - 進房本金
   - 目前點數
   - 盈虧
   - 目前階段
   - 建議下注
   - 剩餘轉數
   - 止盈
   - 止損

   控制：
   ▶ 開始
   ⏸ 暫停
   ▶ 繼續
   🛑 緊急停止

   注意：
   目前仍是模擬模式
   不會按 ATG Spin
   不會修改下注金額
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.2.0';

  let root = null;

  function getConsole() {
    return window.XinyaoAutoBetConsole || null;
  }

  function getSession() {
    return window.XinyaoAutoBetSession || null;
  }

  function money(value) {
    const n = Number(value);

    return Number.isFinite(n)
      ? n.toFixed(2)
      : '—';
  }

  function value(value) {
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return '—';
    }

    return String(value);
  }

  function stateText(status) {
    const map = {
      STOPPED: '已停止',
      RUNNING: '模擬執行中',
      PAUSED: '已暫停'
    };

    return map[status] || status;
  }

  function setText(id, text) {

    if (!root) return;

    const el =
      root.querySelector(
        `#${id}`
      );

    if (el) {
      el.textContent = text;
    }
  }

  function renderStatus() {

    if (!root) return;

    const C = getConsole();

    if (!C) {

      setText(
        'xab-status',
        '核心未載入'
      );

      setText(
        'xab-reason',
        'CONSOLE_NOT_READY'
      );

      return;
    }

    const state =
      C.getState();

    setText(
      'xab-status',
      stateText(
        state.status
      )
    );

    setText(
      'xab-reason',
      state.reason || '—'
    );
  }

  function refreshSession() {

    if (!root) return false;

    const S = getSession();

    if (!S) {

      setText(
        'xab-start-balance',
        '—'
      );

      setText(
        'xab-balance',
        '—'
      );

      setText(
        'xab-profit',
        '—'
      );

      setText(
        'xab-stage',
        '—'
      );

      setText(
        'xab-bet',
        '—'
      );

      setText(
        'xab-remaining',
        '—'
      );

      setText(
        'xab-take-profit',
        '—'
      );

      setText(
        'xab-stop-loss',
        '—'
      );

      return false;
    }

    const state =
      S.getState();

    const decision =
      S.getDecision();

    setText(
      'xab-start-balance',
      money(
        state.startBalance
      )
    );

    setText(
      'xab-balance',
      money(
        state.balance
      )
    );

    setText(
      'xab-profit',
      money(
        state.profit
      )
    );

    setText(
      'xab-stage',
      value(
        state.stage
      )
    );

    setText(
      'xab-bet',
      decision.action === 'CONTINUE'
        ? value(decision.bet)
        : '—'
    );

    setText(
      'xab-remaining',
      decision.action === 'CONTINUE'
        ? value(
            decision.remainingStageSpins
          )
        : '0'
    );

    setText(
      'xab-take-profit',
      money(
        state.settings?.takeProfit
      )
    );

    setText(
      'xab-stop-loss',
      money(
        state.settings?.stopLoss
      )
    );

    /*
      額外顯示目前 AutoBet 決策
    */
    setText(
      'xab-decision',
      decision.action || '—'
    );

    setText(
      'xab-decision-reason',
      decision.reason || '—'
    );

    return true;
  }

  function renderAll() {
    renderStatus();
    refreshSession();
  }

  function bind() {

    const C = getConsole();

    if (!C || !root) return;

    root
      .querySelector('#xab-start')
      ?.addEventListener(
        'click',
        () => {

          /*
            如果有 Session，
            開始時清除緊急停止。
          */
          const S =
            getSession();

          S?.setEmergencyStop?.(
            false
          );

          C.start();

          renderAll();
        }
      );

    root
      .querySelector('#xab-pause')
      ?.addEventListener(
        'click',
        () => {

          C.pause();

          renderAll();
        }
      );

    root
      .querySelector('#xab-resume')
      ?.addEventListener(
        'click',
        () => {

          C.resume();

          renderAll();
        }
      );

    root
      .querySelector('#xab-emergency')
      ?.addEventListener(
        'click',
        () => {

          const S =
            getSession();

          S?.setEmergencyStop?.(
            true
          );

          C.emergencyStop();

          renderAll();
        }
      );
  }

  function dataBox(
    label,
    id,
    initial = '—'
  ) {

    return `
      <div style="
        padding:12px;
        border-radius:14px;
        background:#fff7fb;
        border:1px solid #f7d8e4;
        min-width:0;
      ">

        <div style="
          font-size:11px;
          color:#9b7d89;
        ">
          ${label}
        </div>

        <div
          id="${id}"
          style="
            margin-top:5px;
            font-size:16px;
            font-weight:900;
            color:#59434d;
            word-break:break-word;
          "
        >
          ${initial}
        </div>

      </div>
    `;
  }

  function mount(target) {

    const element =
      typeof target === 'string'
        ? document.querySelector(
            target
          )
        : target;

    if (!element) {
      return false;
    }

    root = element;

    const C =
      getConsole();

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
      每次掛載 Panel，
      Console 回安全停止狀態。

      注意：
      不重設 Session。
    */
    C.reset();

    root.innerHTML = `
      <div style="
        border:1px solid #ffd1e1;
        border-radius:20px;
        background:#fff;
        padding:18px;
        box-shadow:
          0 10px 30px
          rgba(239,55,126,.08);
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

        <!-- ===== 資金狀態 ===== -->

        <div style="
          font-size:13px;
          font-weight:900;
          color:#7f6570;
          margin:4px 0 9px;
        ">
          💰 資金狀態
        </div>

        <div style="
          display:grid;
          grid-template-columns:
            repeat(3,minmax(0,1fr));
          gap:9px;
          margin-bottom:14px;
        ">

          ${dataBox(
            '進房本金',
            'xab-start-balance'
          )}

          ${dataBox(
            '目前點數',
            'xab-balance'
          )}

          ${dataBox(
            '本房盈虧',
            'xab-profit'
          )}

        </div>

        <!-- ===== 自動配注 ===== -->

        <div style="
          font-size:13px;
          font-weight:900;
          color:#7f6570;
          margin:4px 0 9px;
        ">
          🎯 自動配注
        </div>

        <div style="
          display:grid;
          grid-template-columns:
            repeat(3,minmax(0,1fr));
          gap:9px;
          margin-bottom:14px;
        ">

          ${dataBox(
            '目前階段',
            'xab-stage'
          )}

          ${dataBox(
            '建議下注',
            'xab-bet'
          )}

          ${dataBox(
            '剩餘轉數',
            'xab-remaining'
          )}

        </div>

        <!-- ===== 安全條件 ===== -->

        <div style="
          font-size:13px;
          font-weight:900;
          color:#7f6570;
          margin:4px 0 9px;
        ">
          🛡️ 安全條件
        </div>

        <div style="
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          gap:9px;
          margin-bottom:14px;
        ">

          ${dataBox(
            '止盈',
            'xab-take-profit'
          )}

          ${dataBox(
            '止損',
            'xab-stop-loss'
          )}

        </div>

        <!-- ===== 決策狀態 ===== -->

        <div style="
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          gap:9px;
          margin-bottom:14px;
        ">

          ${dataBox(
            '目前決策',
            'xab-decision'
          )}

          ${dataBox(
            '決策原因',
            'xab-decision-reason'
          )}

        </div>

        <!-- ===== Console 狀態 ===== -->

        <div style="
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          gap:9px;
          margin-bottom:14px;
        ">

          ${dataBox(
            '控制狀態',
            'xab-state-label',
            '模擬控制'
          )}

          ${dataBox(
            '最後原因',
            'xab-reason',
            'RESET'
          )}

        </div>

        <!-- ===== 控制按鈕 ===== -->

        <div style="
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
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

          ⚠️ 此面板目前仍是模擬模式，
          不會按 Spin、不會調整 ATG 注額、
          不會送出下注。

        </div>

      </div>
    `;

    bind();
    renderAll();

    return true;
  }

  window.XinyaoAutoBetPanel = {
    version: VERSION,

    mount,

    renderStatus,

    refreshSession,

    renderAll
  };

  console.log(
    `[芯瑤 AutoBet Panel] v${VERSION} 已載入｜Session 整合模擬版`
  );

})();
