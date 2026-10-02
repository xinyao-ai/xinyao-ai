/* =========================================================
   芯瑤 ATG AutoBet Engine
   隔離開發版 v0.1
   注意：目前只做判斷，不會操作 ATG、不會自動下注
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';

  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function evaluate(state = {}, settings = {}) {
    const startBalance = toNumber(state.startBalance);
    const balance = toNumber(state.balance);
    const spins = Math.max(0, Math.floor(toNumber(state.spins)));
    const freeGameActive = Boolean(state.freeGameActive);

    const takeProfit = Math.max(0, toNumber(settings.takeProfit));
    const stopLoss = Math.max(0, toNumber(settings.stopLoss));
    const maxSpins = Math.max(0, Math.floor(toNumber(settings.maxSpins)));

    const profit = balance - startBalance;

    if (freeGameActive) {
      return {
        action: 'PAUSE',
        reason: 'FREE_GAME',
        profit
      };
    }

    if (takeProfit > 0 && profit >= takeProfit) {
      return {
        action: 'STOP',
        reason: 'TAKE_PROFIT',
        profit
      };
    }

    if (stopLoss > 0 && profit <= -stopLoss) {
      return {
        action: 'STOP',
        reason: 'STOP_LOSS',
        profit
      };
    }

    if (maxSpins > 0 && spins >= maxSpins) {
      return {
        action: 'STOP',
        reason: 'MAX_SPINS',
        profit
      };
    }

    return {
      action: 'CONTINUE',
      reason: 'NORMAL',
      profit
    };
  }

  window.XinyaoAutoBetEngine = {
    version: VERSION,
    evaluate
  };

  console.log(
    `[芯瑤 AutoBet Engine] v${VERSION} 已載入｜目前為純判斷模式，不會操作下注`
  );
})();
