/* =========================================================
   芯瑤 ATG AutoBet Controller
   控制流程測試版 v0.1

   功能：
   Engine   = 判斷是否停止 / 暫停
   Strategy = 計算下一階段下注與轉數
   Controller = 統一決策

   注意：
   目前不會按 Spin
   不會修改 ATG 下注金額
   不會操作遊戲
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  function decide(state = {}, settings = {}) {

    const engine =
      window.XinyaoAutoBetEngine;

    const strategy =
      window.XinyaoAutoBetStrategy;

    /*
      安全檢查：
      只要任何核心沒有載入，
      就不允許繼續。
    */
    if (!engine) {
      return {
        action: 'STOP',
        reason: 'ENGINE_NOT_READY',
        bet: null,
        stageSpins: 0
      };
    }

    if (!strategy) {
      return {
        action: 'STOP',
        reason: 'STRATEGY_NOT_READY',
        bet: null,
        stageSpins: 0
      };
    }

    /*
      第一層：
      先問 Engine 是否必須停止 / 暫停。

      這層永遠優先於配注。
    */
    const safety =
      engine.evaluate(
        state,
        settings
      );

    if (
      safety.action === 'STOP' ||
      safety.action === 'PAUSE'
    ) {
      return {
        action: safety.action,
        reason: safety.reason,
        profit: safety.profit,

        bet: null,
        stageSpins: 0
      };
    }

    /*
      第二層：
      Engine 確認可以繼續後，
      才交給 Strategy 計算下一階段。
    */
    const plan =
      strategy.nextStage({
        startBalance:
          state.startBalance,

        balance:
          state.balance,

        stage:
          state.stage
      });

    return {
      action: 'CONTINUE',

      reason:
        plan.reason,

      profit:
        safety.profit,

      bet:
        Number(plan.bet),

      stageSpins:
        Number(plan.spins),

      stage:
        Math.max(
          1,
          Number(state.stage) || 1
        )
    };
  }

  window.XinyaoAutoBetController = {
    version: VERSION,
    decide
  };

  console.log(
    `[芯瑤 AutoBet Controller] v${VERSION} 已載入｜目前為模擬控制模式`
  );

})();
