// ==UserScript==
// @name         芯瑤💕 ATG 遊戲切換（獨立測試版）
// @namespace    xinyao-atg-game-switcher
// @version      0.1.0
// @description  手動選擇賽特2或虎小妹。只建立獨立遊戲狀態，不宣稱已完成盤面辨識。
// @match        https://play.godeebxp.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__xinyaoGameSwitcherTest) return;
  window.__xinyaoGameSwitcherTest = true;

  const KEY = 'xinyao_atg_selected_game_v1';
  const games = Object.freeze({
    seth2: { label: '戰神賽特2', recognizer: 'seth2' },
    tiger: { label: '虎小妹', recognizer: 'tiger' }
  });
  let selected = null;
  try {
    const saved = localStorage.getItem(KEY);
    if (Object.prototype.hasOwnProperty.call(games, saved)) selected = saved;
  } catch (_) {}

  function publish() {
    window.__XIANYAO_ATG_SELECTED_GAME__ = selected;
    window.dispatchEvent(new CustomEvent('xinyao:game-selected', {
      detail: { gameId: selected, recognizer: selected ? games[selected].recognizer : null }
    }));
  }

  function mount() {
    if (!document.body || document.getElementById('xinyao-test-game-switcher')) return;
    const root = document.createElement('div');
    root.id = 'xinyao-test-game-switcher';
    root.style.cssText = 'position:fixed;top:calc(78px + env(safe-area-inset-top));right:10px;z-index:2147483640;font:13px -apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif;color:#fff;';
    root.innerHTML = `
      <style>
        #xinyao-test-game-switcher button{font:inherit;cursor:pointer;color:#fff;border:1px solid #ffbcd9;background:rgba(21,13,24,.94);border-radius:12px;padding:9px 12px}
        #xinyao-test-game-switcher .xg-menu{margin-top:6px;background:rgba(19,13,23,.97);border:1px solid #ff9dc7;border-radius:13px;padding:8px;box-shadow:0 8px 28px #0008;min-width:175px}
        #xinyao-test-game-switcher .xg-menu button{display:block;width:100%;margin:3px 0;text-align:left}
        #xinyao-test-game-switcher .xg-menu button[aria-pressed="true"]{background:#a33b70}
        #xinyao-test-game-switcher .xg-note{font-size:11px;color:#ffd9e9;line-height:1.5;padding:5px;max-width:175px}
      </style>
      <button type="button" class="xg-toggle" aria-expanded="false">🎮 選擇遊戲</button>
      <div class="xg-menu" hidden>
        <button type="button" data-game="seth2">🎰 戰神賽特2</button>
        <button type="button" data-game="tiger">🐯 虎小妹</button>
        <div class="xg-note">測試版：僅切換遊戲設定，尚未接上獨立圖示辨識。</div>
      </div>`;
    document.body.appendChild(root);
    const toggle = root.querySelector('.xg-toggle');
    const menu = root.querySelector('.xg-menu');
    function draw() {
      toggle.textContent = selected ? '🎮 ' + games[selected].label + ' ▾' : '🎮 選擇遊戲 ▾';
      root.querySelectorAll('[data-game]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.game === selected));
      });
    }
    toggle.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
      toggle.setAttribute('aria-expanded', String(!menu.hidden));
    });
    menu.addEventListener('click', e => {
      const button = e.target.closest('[data-game]');
      if (!button) return;
      const id = button.dataset.game;
      if (!Object.prototype.hasOwnProperty.call(games, id)) return;
      selected = id;
      try { localStorage.setItem(KEY, selected); } catch (_) {}
      publish();
      draw();
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    });
    draw();
    publish();
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
