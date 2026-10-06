/* =========================================================
   芯瑤 ATG Read-Only Probe
   真實資料來源診斷器 v0.1

   功能：
   - 被動掃描 DOM 可見/既有文字
   - 尋找「點數 / 餘額」候選
   - 尋找「下注」候選
   - 尋找「房號」候選
   - 尋找免遊文字候選

   不會：
   - 按 Spin
   - 修改下注
   - 寫入 ATG
   - 攔截請求
   - 讀 Cookie / Token
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';
  const MODE = 'PASSIVE_DIAGNOSTIC';

  function uniq(values) {

    return [
      ...new Set(
        values
          .filter(
            value =>
              value !== null &&
              value !== undefined &&
              String(value).trim() !== ''
          )
          .map(
            value =>
              String(value).trim()
          )
      )
    ];

  }

  function normalizeText(value) {

    return String(
      value ?? ''
    )
      .replace(/\s+/g, ' ')
      .trim();

  }

  function collectElements(root) {

    if (!root) {
      return [];
    }

    const elements = [];

    /*
      root 自己也要掃描。
    */
    if (
      root.nodeType === 1
    ) {
      elements.push(root);
    }

    if (
      typeof root.querySelectorAll ===
      'function'
    ) {

      elements.push(
        ...root.querySelectorAll('*')
      );
    }

    return elements;
  }

  function collectTextCandidates(
    elements,
    regex
  ) {

    const results = [];

    for (
      const element of elements
    ) {

      const text =
        normalizeText(
          element.textContent
        );

      if (!text) {
        continue;
      }

      const matches =
        text.match(regex);

      if (
        matches &&
        matches[1] !== undefined
      ) {

        results.push(
          matches[1]
        );
      }
    }

    return uniq(results);
  }

  function collectBalanceCandidates(
    elements
  ) {

    /*
      支援：
      目前餘額 1,000.90
      目前點數 1000.90
      餘額 1000
      點數 1000
    */
    return collectTextCandidates(
      elements,
      /(?:目前餘額|目前點數|餘額|點數)[^\d\-]*(-?\d[\d,]*(?:\.\d+)?)/i
    );
  }

  function collectBetCandidates(
    elements
  ) {

    /*
      支援：
      目前下注 4
      下注 4
      押注 4
      投注 4
    */
    return collectTextCandidates(
      elements,
      /(?:目前下注|下注金額|目前押注|押注金額|下注|押注|投注)[^\d\-]*(-?\d[\d,]*(?:\.\d+)?)/i
    );
  }

  function collectRoomCandidates(
    elements
  ) {

    const results = [];

    for (
      const element of elements
    ) {

      /*
        先看常見 attribute。
        房號一定保留字串，
        不轉 Number。
      */
      const attributes = [
        'data-room-id',
        'data-roomid',
        'data-room',
        'room-id',
        'roomid',
        'data-machine-id',
        'data-machine'
      ];

      for (
        const name of attributes
      ) {

        const value =
          element.getAttribute?.(
            name
          );

        if (
          value !== null &&
          value !== undefined &&
          String(value).trim()
        ) {

          results.push(
            String(value).trim()
          );
        }
      }

      /*
        再從畫面文字找。
      */
      const text =
        normalizeText(
          element.textContent
        );

      const match =
        text.match(
          /(?:房號|房间|房間|機台|机台|room(?:\s*id)?)[^\d]*([0-9]{1,8})/i
        );

      if (
        match &&
        match[1]
      ) {
        results.push(
          match[1]
        );
      }
    }

    return uniq(results);
  }

  function collectFreeGameCandidates(
    elements
  ) {

    const results = [];

    for (
      const element of elements
    ) {

      const text =
        normalizeText(
          element.textContent
        );

      if (!text) {
        continue;
      }

      if (
        /(?:免費遊戲|免费游戏|免遊|免费回合|free\s*game)/i
          .test(text)
      ) {

        results.push(text);
      }
    }

    return uniq(results);
  }

  function scan(root = document) {

    const elements =
      collectElements(root);

    return {

      mode:
        MODE,

      balanceCandidates:
        collectBalanceCandidates(
          elements
        ),

      betCandidates:
        collectBetCandidates(
          elements
        ),

      roomCandidates:
        collectRoomCandidates(
          elements
        ),

      freeGameCandidates:
        collectFreeGameCandidates(
          elements
        ),

      scannedElements:
        elements.length,

      ok:
        true
    };
  }

  function getMode() {
    return MODE;
  }

  window.XinyaoATGReadOnlyProbe = {
    version: VERSION,

    scan,
    getMode

    /*
      刻意不存在：
      spin()
      setBet()
      click()
      write()
    */
  };

  console.log(
    `[芯瑤 ATG Read-Only Probe] v${VERSION} 已載入｜${MODE}`
  );

})();
