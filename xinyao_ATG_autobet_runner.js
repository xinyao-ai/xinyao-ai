/* =========================================================
   芯瑤 ATG AutoBet Runner
   模擬執行器 v0.1

   功能：
   1. 緊急停止
   2. 先做安全判斷
   3. 計算目前階段剩餘轉數
   4. 階段完成後自動進下一階段

   注意：
   目前不會按 Spin
   不會改 ATG 下注金額
   不會操作正式遊戲
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function next(state = {}, settings = {}) {

    const controller =
      window.XinyaoAutoBetController;

    const strategy =
      window.XinyaoAutoBetStrategy;

    /*
      最高優先：
      緊急停止
    */
    if (state.emergencyStop === true) {
      return {
        action: 'STOP',
        reason: 'EMERGENCY_STOP',
        bet: null,
        stage: Math.max(
          1,
          Math.floor(
            num(state.stage, 1)
          )
        ),
        remainingStageSpins: 0
      };
    }

    /*
      核心未載入時一律停止
    */
    if (!controller || !strategy) {
      return {
        action: 'STOP',
        reason: 'CORE_NOT_READY',
        bet: null,
        stage: Math.max(
          1,
          Math.floor(
            num(state.stage, 1)
          )
        ),
        remainingStageSpins: 0
      };
    }

    let stage =
      Math.max(
        1,
        Math.floor(
          num(state.stage, 1)
        )
      );

    let stageCompletedSpins =
      Math.max(
        0,
        Math.floor(
          num(
            state.stageCompletedSpins,
            0
          )
        )
      );

    const totalSpins =
      Math.max(
        0,
        Math.floor(
          num(
            state.totalSpins,
            0
          )
        )
      );

    /*
      先跑安全判斷。

      Controller 原本使用 spins，
      Runner 這裡把 totalSpins 傳進去。
    */
    const safetyDecision =
      controller.decide(
        {
          startBalance:
            state.startBalance,

          balance:
            state.balance,

          spins:
            totalSpins,

          stage,

          freeGameActive:
            state.freeGameActive
        },
        settings
      );

    /*
      止盈 / 止損 / 最大轉數 / 免遊
      任何一個成立都不再往下跑。
    */
    if (
      safetyDecision.action === 'STOP' ||
      safetyDecision.action === 'PAUSE'
    ) {
      return {
        action:
          safetyDecision.action,

        reason:
          safetyDecision.reason,

        profit:
          safetyDecision.profit,

        bet: null,

        stage,

        remainingStageSpins: 0
      };
    }

    /*
      取得目前階段應該跑幾轉。
    */
    let currentPlan =
      strategy.nextStage({
        startBalance:
          state.startBalance,

        balance:
          state.balance,

        stage
      });

    let stageTargetSpins =
      Math.max(
        1,
        Math.floor(
          num(
            currentPlan.spins,
            1
          )
        )
      );

    /*
      如果這階段已經完成，
      自動進下一階段。
    */
    if (
      stageCompletedSpins >=
      stageTargetSpins
    ) {

      stage += 1;

      stageCompletedSpins = 0;

      /*
        進下一階段後重新讓
        Controller 判斷一次。
      */
      const nextDecision =
        controller.decide(
          {
            startBalance:
              state.startBalance,

            balance:
              state.balance,

            spins:
              totalSpins,

            stage,

            freeGameActive:
              state.freeGameActive
          },
          settings
        );

      if (
        nextDecision.action === 'STOP' ||
        nextDecision.action === 'PAUSE'
      ) {
        return {
          action:
            nextDecision.action,

          reason:
            nextDecision.reason,

          profit:
            nextDecision.profit,

          bet: null,

          stage,

          remainingStageSpins: 0
        };
      }

      return {
        action: 'CONTINUE',

        reason:
          nextDecision.reason,

        profit:
          nextDecision.profit,

        bet:
          Number(
            nextDecision.bet
          ),

        stage,

        stageTargetSpins:
          Number(
            nextDecision.stageSpins
          ),

        stageCompletedSpins: 0,

        remainingStageSpins:
          Number(
            nextDecision.stageSpins
          )
      };
    }

    /*
      還在目前階段。
    */
    const remaining =
      Math.max(
        0,
        stageTargetSpins -
        stageCompletedSpins
      );

    return {
      action: 'CONTINUE',

      reason:
        safetyDecision.reason,

      profit:
        safetyDecision.profit,

      bet:
        Number(
          currentPlan.bet
        ),

      stage,

      stageTargetSpins,

      stageCompletedSpins,

      remainingStageSpins:
        remaining
    };
  }

  window.XinyaoAutoBetRunner = {
    version: VERSION,
    next
  };

  console.log(
    `[芯瑤 AutoBet Runner] v${VERSION} 已載入｜目前為模擬執行模式`
  );

})();
