/* =========================================================
   芯瑤 ATG AutoBet Simulator
   假資料逐局模擬器 v0.1

   功能：
   - 模擬一局完成
   - 更新目前點數
   - 更新盈虧
   - 完成轉數 +1
   - 階段轉數 +1
   - 每局重新取得 AutoBet 決策

   注意：
   目前不會按 Spin
   不會修改 ATG 注額
   不會操作真正 ATG
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  let history = [];

  function getSession() {
    return window.XinyaoAutoBetSession || null;
  }

  function reset() {
    history = [];

    return {
      ok: true,
      history: []
    };
  }

  function step(data = {}) {

    const session =
      getSession();

    if (!session) {
      return {
        ok: false,
        error: 'SESSION_NOT_READY',
        state: null,
        decision: {
          action: 'STOP',
          reason: 'SESSION_NOT_READY'
        }
      };
    }

    /*
      一次 step
      = 模擬一局已經完成

      所以直接交給 Session.recordSpin()
    */
    session.recordSpin({
      balance:
        data.balance,

      freeGameActive:
        Boolean(
          data.freeGameActive
        )
    });

    const state =
      session.getState();

    const decision =
      session.getDecision();

    const record = {
      time: Date.now(),

      balance:
        state.balance,

      profit:
        state.profit,

      totalSpins:
        state.totalSpins,

      stage:
        state.stage,

      stageCompletedSpins:
        state.stageCompletedSpins,

      freeGameActive:
        state.freeGameActive,

      decision: {
        ...decision
      }
    };

    history.push(record);

    return {
      ok: true,

      state: {
        ...state
      },

      decision: {
        ...decision
      },

      record: {
        ...record
      }
    };
  }

  function getHistory() {
    return history.map(
      item => ({
        ...item,
        decision: {
          ...item.decision
        }
      })
    );
  }

  function getLast() {

    if (!history.length) {
      return null;
    }

    const last =
      history[
        history.length - 1
      ];

    return {
      ...last,
      decision: {
        ...last.decision
      }
    };
  }

  window.XinyaoAutoBetSimulator = {
    version: VERSION,

    reset,
    step,
    getHistory,
    getLast
  };

  console.log(
    `[芯瑤 AutoBet Simulator] v${VERSION} 已載入｜目前只跑假資料模擬`
  );

})();
