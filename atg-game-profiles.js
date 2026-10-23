/*
 * 芯瑤💕ATG：遊戲設定註冊表（測試版）
 * 只管理手動選擇的遊戲類別；不臆測盤面、不碰遊戲 API、不自動點擊。
 * 待下一階段依已驗證的遊戲畫面與素材，加入各遊戲獨立的辨識器。
 */
(function (root) {
  'use strict';
  const PROFILES = Object.freeze({
    seth2: Object.freeze({
      id: 'seth2',
      name: '戰神賽特二代',
      recognizer: 'seth2',
      symbolsVerified: false
    }),
    tiger: Object.freeze({
      id: 'tiger',
      name: '虎小妹',
      recognizer: 'tiger',
      symbolsVerified: false
    })
  });

  let selected = null;
  function selectGame(id) {
    if (!Object.prototype.hasOwnProperty.call(PROFILES, id)) {
      throw new Error('不支援的遊戲類別：' + String(id));
    }
    selected = id;
    return PROFILES[id];
  }
  function currentGame() {
    return selected ? PROFILES[selected] : null;
  }
  function listGames() {
    return Object.values(PROFILES);
  }
  function requireRecognizer() {
    const game = currentGame();
    if (!game) throw new Error('請先選擇遊戲');
    if (!game.symbolsVerified) {
      throw new Error(game.name + ' 尚未完成獨立圖示辨識驗證');
    }
    return game.recognizer;
  }

  const api = Object.freeze({ listGames, selectGame, currentGame, requireRecognizer });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.XinyaoGameProfiles = api;
})(typeof window !== 'undefined' ? window : null);
