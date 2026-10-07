/* =========================================================
   芯瑤 ATG Component Structure Probe v0.1.0

   PASSIVE / READ ONLY

   用途：
   - 只讀 ComponentScheduler 結構
   - 列出屬性名稱
   - 列出型態
   - 列出陣列長度
   - 標記 circular reference

   不會：
   - 呼叫 Function
   - 執行 Getter
   - 修改任何值
   - 加速
   - Spin
   - 改下注
========================================================= */

(() => {
  'use strict';

  const VERSION =
    '0.1.0';

  const MODE =
    'PASSIVE_COMPONENT_STRUCTURE_PROBE';


  let state = {
    hasCC: false,
    hasDirector: false,
    hasComponentScheduler: false
  };


  let lastResult =
    freshResult();


  /* ======================================================
     Result
  ====================================================== */

  function freshResult() {

    return {
      version: VERSION,
      mode: MODE,
      entries: []
    };
  }


  /* ======================================================
     安全找 Runtime
  ====================================================== */

  function safeRead(
    getter,
    fallback = null
  ) {

    try {

      const value =
        getter();

      return value === undefined
        ? fallback
        : value;

    } catch {

      return fallback;
    }
  }


  function findCC(
    globals
  ) {

    if (!globals) {
      return null;
    }


    return (
      globals.cc ||
      globals.legacyCC ||
      globals._cc ||
      globals.CocosEngine ||
      null
    );
  }


  function findDirector(
    cc,
    globals
  ) {

    return (

      safeRead(
        () => cc?.director,
        null
      ) ||

      safeRead(
        () => cc?.Director?.instance,
        null
      ) ||

      safeRead(
        () => globals?.director,
        null
      ) ||

      null

    );
  }


  function findComponentScheduler(
    cc,
    director,
    globals
  ) {

    return (

      safeRead(
        () =>
          director?._compScheduler ||
          director?.compScheduler,
        null
      ) ||

      safeRead(
        () =>
          globals?._compScheduler ||
          globals?.compScheduler ||
          globals?.componentScheduler,
        null
      ) ||

      safeRead(
        () =>
          cc?._compScheduler ||
          cc?.compScheduler ||
          cc?.componentScheduler,
        null
      ) ||

      null

    );
  }


  /* ======================================================
     型態
  ====================================================== */

  function typeOfValue(
    value
  ) {

    if (value === null) {
      return 'null';
    }


    if (
      Array.isArray(
        value
      )
    ) {

      return 'array';
    }


    const type =
      typeof value;


    if (type === 'function') {
      return 'function';
    }


    if (type === 'object') {
      return 'object';
    }


    return type;
  }


  /* ======================================================
     建立 Entry
  ====================================================== */

  function makeEntry(
    path,
    value,
    extra = {}
  ) {

    const type =
      typeOfValue(
        value
      );


    const entry = {

      path,

      type,

      ...extra

    };


    if (
      type === 'array'
    ) {

      entry.length =
        value.length;
    }


    return entry;
  }


  /* ======================================================
     Property descriptor

     重點：
     Getter 不執行。
  ====================================================== */

  function getDescriptors(
    object
  ) {

    try {

      return Object
        .getOwnPropertyDescriptors(
          object
        );

    } catch {

      return {};
    }
  }


  /* ======================================================
     遞迴掃描
  ====================================================== */

  function walk(
    value,
    path,
    depth,
    options,
    visited
  ) {

    const {
      maxDepth,
      maxArrayItems
    } = options;


    /* --------------------------------------------------
       Primitive / Function
    -------------------------------------------------- */

    const type =
      typeOfValue(
        value
      );


    if (
      type !== 'object' &&
      type !== 'array'
    ) {

      lastResult.entries.push(
        makeEntry(
          path,
          value
        )
      );

      return;
    }


    /* --------------------------------------------------
       Circular
    -------------------------------------------------- */

    if (
      visited.has(
        value
      )
    ) {

      lastResult.entries.push({

        ...makeEntry(
          path,
          value
        ),

        circular: true

      });

      return;
    }


    /*
      先加入 visited，
      所以 self reference 能被正確判斷。
    */
    visited.add(
      value
    );


    /* --------------------------------------------------
       本身
    -------------------------------------------------- */

    lastResult.entries.push(
      makeEntry(
        path,
        value
      )
    );


    /* --------------------------------------------------
       Depth limit
    -------------------------------------------------- */

    if (
      depth >=
      maxDepth
    ) {

      return;
    }


    /* ==================================================
       Array
    ================================================== */

    if (
      Array.isArray(
        value
      )
    ) {

      const limit =
        Math.min(
          value.length,
          maxArrayItems
        );


      for (
        let index = 0;
        index < limit;
        index++
      ) {

        let child;


        try {

          child =
            value[index];

        } catch {

          continue;
        }


        walk(
          child,
          `${path}[${index}]`,
          depth + 1,
          options,
          visited
        );
      }


      return;
    }


    /* ==================================================
       Object
    ================================================== */

    const descriptors =
      getDescriptors(
        value
      );


    for (
      const [
        key,
        descriptor
      ] of Object.entries(
        descriptors
      )
    ) {

      const childPath =
        `${path}.${key}`;


      /* ------------------------------------------------
         Getter / Setter

         只列出，不執行。
      ------------------------------------------------ */

      if (
        !(
          'value' in descriptor
        )
      ) {

        lastResult.entries.push({

          path:
            childPath,

          type:
            'accessor',

          hasGetter:
            typeof descriptor.get ===
            'function',

          hasSetter:
            typeof descriptor.set ===
            'function'

        });

        continue;
      }


      const child =
        descriptor.value;


      /*
        Function 只記錄，
        永遠不呼叫。
      */
      if (
        typeof child ===
        'function'
      ) {

        lastResult.entries.push(
          makeEntry(
            childPath,
            child
          )
        );

        continue;
      }


      walk(
        child,
        childPath,
        depth + 1,
        options,
        visited
      );
    }
  }


  /* ======================================================
     Inspect
  ====================================================== */

  function inspect(
    options = {}
  ) {

    const globals =
      options.globals ||
      window;


    const maxDepth =
      Number.isFinite(
        Number(
          options.maxDepth
        )
      )
        ? Math.max(
            0,
            Number(
              options.maxDepth
            )
          )
        : 4;


    const maxArrayItems =
      Number.isFinite(
        Number(
          options.maxArrayItems
        )
      )
        ? Math.max(
            0,
            Number(
              options.maxArrayItems
            )
          )
        : 20;


    lastResult =
      freshResult();


    const cc =
      findCC(
        globals
      );


    const director =
      findDirector(
        cc,
        globals
      );


    const scheduler =
      findComponentScheduler(
        cc,
        director,
        globals
      );


    state = {

      hasCC:
        !!cc,

      hasDirector:
        !!director,

      hasComponentScheduler:
        !!scheduler

    };


    if (!scheduler) {

      return lastResult;
    }


    const visited =
      new WeakSet();


    walk(
      scheduler,
      '$componentScheduler',
      0,
      {
        maxDepth,
        maxArrayItems
      },
      visited
    );


    return lastResult;
  }


  /* ======================================================
     Reset
  ====================================================== */

  function reset() {

    state = {
      hasCC: false,
      hasDirector: false,
      hasComponentScheduler: false
    };


    lastResult =
      freshResult();


    return lastResult;
  }


  /* ======================================================
     Public
  ====================================================== */

  function getState() {

    return {
      ...state
    };
  }


  function getLastResult() {

    return lastResult;
  }


  function getMode() {

    return MODE;
  }


  window.XinyaoATGComponentStructureProbe = {

    version:
      VERSION,

    inspect,

    reset,

    getState,

    getLastResult,

    getMode

    /*
      刻意沒有：

      setSpeed()
      spin()
      setBet()
    */
  };


  console.log(
    `[芯瑤 ATG Component Structure Probe] v${VERSION} 已載入｜${MODE}`
  );

})();
