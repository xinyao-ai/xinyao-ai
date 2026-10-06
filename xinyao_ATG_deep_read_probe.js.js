/* =========================================================
   芯瑤 ATG Deep Read Probe v0.1

   功能：
   - 深層掃描一般 DOM
   - 遞迴掃描 open Shadow DOM
   - 讀取左側即時助手常用資料
   - 排除「全房掃描 4100/4100」類誤判

   READ ONLY：
   - 不按 Spin
   - 不改注
   - 不寫入 ATG
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';
  const MODE = 'DEEP_PASSIVE_READ_ONLY';

  function normalize(value) {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function collectDeep(root) {
    const elements = [];
    let shadowRoots = 0;

    function walk(container) {
      if (!container) return;

      if (container.nodeType === 1) {
        elements.push(container);
      }

      if (
        typeof container.querySelectorAll !==
        'function'
      ) {
        return;
      }

      const children =
        [...container.querySelectorAll('*')];

      for (const el of children) {
        elements.push(el);

        /*
          只讀取 browser 允許存取的
          open Shadow DOM。
        */
        if (el.shadowRoot) {
          shadowRoots++;
          walk(el.shadowRoot);
        }
      }
    }

    /*
      root 自己如果有 ShadowRoot
      也一起處理。
    */
    if (
      root?.shadowRoot
    ) {
      shadowRoots++;
      walk(root.shadowRoot);
    }

    walk(root);

    return {
      elements:
        [...new Set(elements)],
      shadowRoots
    };
  }

  function elementText(el) {
    const parts = [];

    try {
      const text =
        normalize(
          el.textContent
        );

      if (text) {
        parts.push(text);
      }

      const attrs = [
        'aria-label',
        'title',
        'value',
        'placeholder',
        'data-room-id',
        'data-roomid',
        'data-room'
      ];

      for (const name of attrs) {
        const value =
          el.getAttribute?.(name);

        if (normalize(value)) {
          parts.push(
            `${name}=${normalize(value)}`
          );
        }
      }

    } catch {}

    return normalize(
      parts.join(' | ')
    );
  }

  function extractNumber(
    text,
    regex
  ) {
    const match =
      text.match(regex);

    return match?.[1]
      ? normalize(match[1])
      : '';
  }

  function isAnalysisText(text) {
    return (
      /全房分析|全房掃描|已抓房號|4100\s*\/\s*4100|頁數|目前資料排行|掃描完成/i
        .test(text)
    );
  }

  function findBest(
    elements,
    patterns,
    options = {}
  ) {
    const candidates = [];

    for (const el of elements) {
      const text =
        elementText(el);

      if (!text) continue;

      if (
        options.excludeAnalysis &&
        isAnalysisText(text)
      ) {
        continue;
      }

      patterns.forEach(
        (pattern, index) => {

          const value =
            extractNumber(
              text,
              pattern
            );

          if (!value) return;

          /*
            patterns 越前面優先級越高。
          */
          let score =
            100 - index * 10;

          /*
            精準「目前...」標籤再加分。
          */
          if (
            /目前房號|目前點數|目前下注/
              .test(text)
          ) {
            score += 50;
          }

          candidates.push({
            value,
            score,
            text
          });
        }
      );
    }

    candidates.sort(
      (a, b) =>
        b.score - a.score
    );

    return (
      candidates[0]?.value ||
      ''
    );
  }

  function scan(
    root = document
  ) {
    const deep =
      collectDeep(root);

    const elements =
      deep.elements;

    const live = {
      roomId:
        findBest(
          elements,
          [
            /目前房號\s*[:：]?\s*([0-9]{1,8})/i,
            /房號\s*[:：]?\s*([0-9]{1,8})/i
          ],
          {
            excludeAnalysis:true
          }
        ),

      entryBalance:
        findBest(
          elements,
          [
            /進房金額\s*[:：]?\s*(-?\d[\d,]*(?:\.\d+)?)/i
          ]
        ),

      balance:
        findBest(
          elements,
          [
            /目前點數\s*[:：]?\s*(-?\d[\d,]*(?:\.\d+)?)/i,
            /目前餘額\s*[:：]?\s*(-?\d[\d,]*(?:\.\d+)?)/i
          ]
        ),

      profit:
        findBest(
          elements,
          [
            /本房盈虧\s*[:：]?\s*(-?\d[\d,]*(?:\.\d+)?)/i
          ]
        ),

      bet:
        findBest(
          elements,
          [
            /目前下注\s*[:：]?\s*(-?\d[\d,]*(?:\.\d+)?)/i,
            /目前押注\s*[:：]?\s*(-?\d[\d,]*(?:\.\d+)?)/i
          ]
        ),

      freeGameCount:
        findBest(
          elements,
          [
            /本房免遊次數\s*[:：]?\s*(\d+)/i,
            /免遊次數\s*[:：]?\s*(\d+)/i
          ]
        ),

      completedSpins:
        findBest(
          elements,
          [
            /本次完成轉數\s*[:：]?\s*(\d+)/i,
            /完成轉數\s*[:：]?\s*(\d+)/i
          ]
        )
    };

    return {
      version:VERSION,
      mode:MODE,

      shadowRoots:
        deep.shadowRoots,

      scannedElements:
        elements.length,

      live,

      ok:true
    };
  }

  window.XinyaoATGDeepReadProbe = {
    version:VERSION,
    scan,
    getMode:() => MODE

    /*
      刻意沒有：
      spin()
      setBet()
      click()
      write()
    */
  };

  console.log(
    `[芯瑤 ATG Deep Read Probe] v${VERSION} 已載入｜${MODE}`
  );

})();
