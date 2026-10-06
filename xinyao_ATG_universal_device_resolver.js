/* =========================================================
   芯瑤 ATG Universal Device Resolver v0.1

   目的：
   - 電腦 / iPhone / Android / 平板
   - 橫式 / 直式
   - 一般 DOM / open Shadow DOM
   - 不依賴固定位置或螢幕尺寸

   READ ONLY：
   - 不按 Spin
   - 不改下注
   - 不操作 ATG
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';
  const MODE = 'UNIVERSAL_DEVICE_RESOLVER';


  /* ======================================================
     基本工具
  ====================================================== */

  function normalize(value) {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }


  function cleanNumber(value) {
    return normalize(value)
      .replace(/,/g, '');
  }


  function collectDeep(root) {

    const elements = [];
    const seen = new Set();

    let shadowRoots = 0;


    function add(el) {

      if (
        !el ||
        el.nodeType !== 1 ||
        seen.has(el)
      ) {
        return;
      }

      seen.add(el);
      elements.push(el);
    }


    function walk(container) {

      if (!container) {
        return;
      }


      if (
        container.nodeType === 1
      ) {
        add(container);

        if (
          container.shadowRoot
        ) {
          shadowRoots++;

          walk(
            container.shadowRoot
          );
        }
      }


      if (
        typeof container.querySelectorAll !==
        'function'
      ) {
        return;
      }


      const children =
        container.querySelectorAll('*');


      for (const el of children) {

        add(el);


        /*
          open Shadow DOM
        */
        if (
          el.shadowRoot
        ) {

          shadowRoots++;

          walk(
            el.shadowRoot
          );
        }
      }
    }


    walk(root);


    return {
      elements,
      shadowRoots
    };
  }


  function elementText(el) {

    try {

      const parts = [];


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
        'name',

        'data-room-id',
        'data-roomid',
        'data-room',

        'room-id',
        'roomid',

        'data-machine-id',
        'data-machine',

        'data-bet',
        'data-balance',
        'data-credit'
      ];


      for (
        const name of attrs
      ) {

        const value =
          el.getAttribute?.(
            name
          );


        if (
          value !== null &&
          value !== undefined &&
          normalize(value)
        ) {

          parts.push(
            `${name}=${normalize(value)}`
          );
        }
      }


      return normalize(
        parts.join(' | ')
      );

    } catch {

      return '';
    }
  }


  /* ======================================================
     排除「全房掃描總數」類型資料
  ====================================================== */

  function isFullScanContext(text) {

    return (
      /全房掃描|全房分析|已抓房號|掃描完成|總房數|頁數\s*[:：]?\s*\d+\s*\/\s*\d+/i
        .test(text)
    );
  }


  function looksLikeRoomCounter(
    value,
    text
  ) {

    const escaped =
      String(value)
        .replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        );


    /*
      例如：
      4100 / 4100

      這是房間總數，不是目前房號。
    */
    const counterRegex =
      new RegExp(
        `${escaped}\\s*\\/\\s*${escaped}`
      );


    if (
      counterRegex.test(text)
    ) {
      return true;
    }


    if (
      isFullScanContext(text) &&
      /已抓房號|總房數|全房掃描/i
        .test(text)
    ) {

      return true;
    }


    return false;
  }


  /* ======================================================
     房號解析
  ====================================================== */

  function resolveRoomId(elements) {

    const candidates = [];


    function addCandidate(
      value,
      score,
      source,
      text = ''
    ) {

      value =
        normalize(value);


      if (
        !/^\d{1,8}$/
          .test(value)
      ) {
        return;
      }


      if (
        looksLikeRoomCounter(
          value,
          text
        )
      ) {
        return;
      }


      candidates.push({
        value,
        score,
        source,
        text
      });
    }


    for (
      const el of elements
    ) {

      const text =
        elementText(el);


      /*
        第一順位：
        目前房號：3032
      */
      {
        const match =
          text.match(
            /目前房號\s*[:：]?\s*([0-9]{1,8})/i
          );


        if (
          match?.[1]
        ) {

          addCandidate(
            match[1],
            1000,
            'CURRENT_ROOM',
            text
          );
        }
      }


      /*
        第二順位：
        目前資料排行：3032 房
      */
      {
        const match =
          text.match(
            /目前資料排行\s*[:：]?\s*([0-9]{1,8})\s*房/i
          );


        if (
          match?.[1]
        ) {

          addCandidate(
            match[1],
            900,
            'CURRENT_RANKING_ROOM',
            text
          );
        }
      }


      /*
        第三順位：
        目前遊玩中：3032 房
      */
      {
        const match =
          text.match(
            /目前遊玩中\s*[:：]?\s*([0-9]{1,8})\s*房/i
          );


        if (
          match?.[1]
        ) {

          addCandidate(
            match[1],
            850,
            'CURRENT_PLAYING_ROOM',
            text
          );
        }
      }


      /*
        其他明確房號
      */
      {
        const match =
          text.match(
            /(?:房號|房号)\s*[:：]?\s*([0-9]{1,8})/i
          );


        if (
          match?.[1]
        ) {

          addCandidate(
            match[1],
            700,
            'ROOM_LABEL',
            text
          );
        }
      }


      /*
        DOM attribute fallback
      */
      const roomAttributes = [
        ['data-room-id', 650],
        ['data-roomid', 640],
        ['data-room', 630],
        ['room-id', 620],
        ['roomid', 610],
        ['data-machine-id', 600],
        ['data-machine', 590]
      ];


      for (
        const [
          name,
          score
        ] of roomAttributes
      ) {

        const value =
          el.getAttribute?.(
            name
          );


        if (
          normalize(value)
        ) {

          addCandidate(
            value,
            score,
            `ATTRIBUTE:${name}`,
            text
          );
        }
      }
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


  /* ======================================================
     一般數值解析器
  ====================================================== */

  function resolveNumber(
    elements,
    rules
  ) {

    const candidates = [];


    for (
      const el of elements
    ) {

      const text =
        elementText(el);


      if (!text) {
        continue;
      }


      rules.forEach(
        (
          rule,
          index
        ) => {

          const match =
            text.match(
              rule.regex
            );


          if (
            !match?.[1]
          ) {
            return;
          }


          let score =
            rule.score ??
            (
              500 -
              index * 20
            );


          /*
            小元素通常比整個大容器可靠
          */
          if (
            text.length <= 80
          ) {
            score += 30;
          }


          candidates.push({
            value:
              normalize(
                match[1]
              ),

            score,

            source:
              rule.source,

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


  /* ======================================================
     點數
  ====================================================== */

  function resolveBalance(
    elements
  ) {

    return resolveNumber(
      elements,
      [
        {
          regex:
            /目前點數\s*[:：]?\s*(-?\d[\d,]*(?:\.\d+)?)/i,

          score:1000,
          source:'CURRENT_BALANCE'
        },

        {
          regex:
            /目前餘額\s*[:：]?\s*(-?\d[\d,]*(?:\.\d+)?)/i,

          score:900,
          source:'CURRENT_WALLET'
        },

        {
          regex:
            /點數\s*[:：]?\s*(-?\d[\d,]*(?:\.\d+)?)/i,

          score:700,
          source:'BALANCE'
        }
      ]
    );
  }


  /* ======================================================
     下注
  ====================================================== */

  function resolveBet(
    elements
  ) {

    return resolveNumber(
      elements,
      [
        {
          regex:
            /目前下注\s*[:：]?\s*(-?\d[\d,]*(?:\.\d+)?)/i,

          score:1000,
          source:'CURRENT_BET'
        },

        {
          regex:
            /目前押注\s*[:：]?\s*(-?\d[\d,]*(?:\.\d+)?)/i,

          score:950,
          source:'CURRENT_STAKE'
        },

        {
          regex:
            /下注金額\s*[:：]?\s*(-?\d[\d,]*(?:\.\d+)?)/i,

          score:850,
          source:'BET_AMOUNT'
        }
      ]
    );
  }


  /* ======================================================
     進房金額
  ====================================================== */

  function resolveEntryBalance(
    elements
  ) {

    return resolveNumber(
      elements,
      [
        {
          regex:
            /進房金額\s*[:：]?\s*(-?\d[\d,]*(?:\.\d+)?)/i,

          score:1000,
          source:'ENTRY_BALANCE'
        }
      ]
    );
  }


  /* ======================================================
     盈虧
  ====================================================== */

  function resolveProfit(
    elements
  ) {

    return resolveNumber(
      elements,
      [
        {
          regex:
            /本房盈虧\s*[:：]?\s*(-?\d[\d,]*(?:\.\d+)?)/i,

          score:1000,
          source:'ROOM_PROFIT'
        }
      ]
    );
  }


  /* ======================================================
     免遊次數
  ====================================================== */

  function resolveFreeGameCount(
    elements
  ) {

    return resolveNumber(
      elements,
      [
        {
          regex:
            /本房免遊次數\s*[:：]?\s*(\d+)/i,

          score:1000,
          source:'FREE_GAME_COUNT'
        },

        {
          regex:
            /免遊次數\s*[:：]?\s*(\d+)/i,

          score:900,
          source:'FREE_GAME_COUNT_ALT'
        }
      ]
    );
  }


  /* ======================================================
     完成轉數
  ====================================================== */

  function resolveCompletedSpins(
    elements
  ) {

    return resolveNumber(
      elements,
      [
        {
          regex:
            /本次完成轉數\s*[:：]?\s*(\d+)/i,

          score:1000,
          source:'COMPLETED_SPINS'
        },

        {
          regex:
            /完成轉數\s*[:：]?\s*(\d+)/i,

          score:900,
          source:'COMPLETED_SPINS_ALT'
        }
      ]
    );
  }


  /* ======================================================
     最終 Resolver
  ====================================================== */

  function resolve(
    root = document
  ) {

    const deep =
      collectDeep(root);


    const elements =
      deep.elements;


    return {

      version:
        VERSION,

      mode:
        MODE,

      roomId:
        resolveRoomId(
          elements
        ),

      entryBalance:
        resolveEntryBalance(
          elements
        ),

      balance:
        resolveBalance(
          elements
        ),

      profit:
        resolveProfit(
          elements
        ),

      bet:
        resolveBet(
          elements
        ),

      freeGameCount:
        resolveFreeGameCount(
          elements
        ),

      completedSpins:
        resolveCompletedSpins(
          elements
        ),

      shadowRoots:
        deep.shadowRoots,

      scannedElements:
        elements.length
    };
  }


  /* ======================================================
     對外 API
  ====================================================== */

  window.XinyaoATGUniversalDeviceResolver = {

    version:
      VERSION,

    resolve,

    getMode:
      () =>
        MODE
  };


  console.log(
    `[芯瑤 ATG Universal Device Resolver] v${VERSION} 已載入｜${MODE}`
  );

})();
