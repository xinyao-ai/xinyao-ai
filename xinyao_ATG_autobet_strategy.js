/* =========================================================
   芯瑤 ATG AutoBet Strategy
   分階段配注測試版 v0.1
   注意：
   1. 目前只計算建議
   2. 不會改 ATG 金額
   3. 不會按 Spin
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  const BET_LEVELS = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    12, 14, 16, 18, 20, 24, 28, 30,
    32, 36, 40, 42, 48, 54, 56, 60,
    64, 72, 80, 96, 100, 112, 120,
    128, 140, 144, 160, 180, 200,
    240, 280, 300, 320, 360, 400,
    420, 480, 500, 540, 560, 600,
    640, 700, 720, 800, 840, 900,
    960, 980, 1000, 1080, 1120,
    1200, 1260, 1280, 1400, 1440,
    1600, 1800, 2000
  ];

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function baseBetFromCapital(capital) {
    if (capital < 500) return 1;
    if (capital < 1000) return 2;
    if (capital < 1500) return 3;
    if (capital < 2500) return 4;
    if (capital < 3500) return 5;
    if (capital < 5000) return 6;
    if (capital < 8000) return 8;
    if (capital < 12000) return 10;
    return 12;
  }

  function previousBet(current) {
    const index =
      BET_LEVELS.indexOf(current);

    if (index <= 0) {
      return BET_LEVELS[0];
    }

    return BET_LEVELS[index - 1];
  }

  function nextBet(current) {
    const index =
      BET_LEVELS.indexOf(current);

    if (
      index < 0 ||
      index >= BET_LEVELS.length - 1
    ) {
      return current;
    }

    return BET_LEVELS[index + 1];
  }

  function nextStage(input = {}) {

    const startBalance =
      Math.max(
        0,
        num(input.startBalance)
      );

    const balance =
      Math.max(
        0,
        num(input.balance)
      );

    const stage =
      Math.max(
        1,
        Math.floor(
          num(input.stage, 1)
        )
      );

    const baseBet =
      baseBetFromCapital(
        startBalance
      );

    if (startBalance <= 0) {
      return {
        bet: 1,
        spins: 20,
        reason: 'INVALID_CAPITAL'
      };
    }

    const profit =
      balance - startBalance;

    const ratio =
      balance / startBalance;

    const profitRate =
      profit / startBalance;

    /*
      第一階段：
      用本金決定最初下注。
      2000 本金 = 4 元 × 50 轉
    */
    if (stage === 1) {
      return {
        bet: baseBet,
        spins: 50,
        reason: 'INITIAL_STAGE'
      };
    }

    /*
      剩餘資金低於或等於本金 50%
      主動降一級，並縮短階段。
    */
    if (ratio <= 0.5) {
      return {
        bet: previousBet(
          previousBet(baseBet)
        ),
        spins: 30,
        reason: 'LOW_BALANCE'
      };
    }

    /*
      獲利達本金 30% 以上：
      不追高，回到基礎下注鎖住波動。
    */
    if (profitRate >= 0.3) {
      return {
        bet: baseBet,
        spins: 30,
        reason: 'PROFIT_PROTECT'
      };
    }

    /*
      第二階段
    */
    if (stage === 2) {

      if (profit > 0) {
        return {
          bet: nextBet(
            nextBet(baseBet)
          ),
          spins: 40,
          reason: 'SMALL_PROFIT'
        };
      }

      return {
        bet: baseBet,
        spins: 40,
        reason: 'SMALL_LOSS'
      };
    }

    /*
      第三階段之後先維持保守。
      後面會再加入更完整的動態規則。
    */
    return {
      bet: baseBet,
      spins: 30,
      reason: 'LATER_STAGE'
    };
  }

  window.XinyaoAutoBetStrategy = {
    version: VERSION,
    betLevels: BET_LEVELS.slice(),
    nextStage
  };

  console.log(
    `[芯瑤 AutoBet Strategy] v${VERSION} 已載入｜目前只計算建議，不會操作 ATG`
  );

})();
