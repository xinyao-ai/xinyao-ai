/* =========================================================
   芯瑤 ATG Component Instance Probe v0.1.0

   PASSIVE / READ ONLY

   功能：
   - 掃描 ComponentScheduler 內正在排程的 Component
   - 分別記錄各 Component：
       update()
       lateUpdate()
   - 統計呼叫次數
   - 保留 Node 名稱
   - 產生呼叫排行榜

   不會：
   - 修改 dt
   - 修改 Component 行為
   - 加速
   - Spin
   - 改下注
========================================================= */

(() => {
  'use strict';


  const VERSION =
    '0.1.0';


  const MODE =
    'PASSIVE_COMPONENT_INSTANCE_PROBE';


  let installed =
    false;


  let refs = {

    globals: null,

    cc: null,

    director: null,

    componentScheduler: null

  };


  /*
    每一個 Component 對應一筆紀錄。

    key：
      Component instance

    value：
      統計與原函式資訊
  */
  let records =
    new Map();


  let discoveredComponents =
    0;


  let wrappedUpdates =
    0;


  let wrappedLateUpdates =
    0;


  /* ======================================================
     安全讀取
  ====================================================== */

  function safeGet(
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


  /* ======================================================
     找 Cocos
  ====================================================== */

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


  /* ======================================================
     找 Director
  ====================================================== */

  function findDirector(
    cc,
    globals
  ) {

    return (

      safeGet(
        () => cc?.director,
        null
      ) ||

      safeGet(
        () => cc?.Director?.instance,
        null
      ) ||

      safeGet(
        () => globals?.director,
        null
      ) ||

      null

    );
  }


  /* ======================================================
     找 ComponentScheduler
  ====================================================== */

  function findComponentScheduler(
    cc,
    director,
    globals
  ) {

    /*
      Cocos Creator 2.x
    */
    const fromDirector =
      safeGet(
        () =>
          director?._compScheduler ||
          director?.compScheduler,
        null
      );


    if (fromDirector) {
      return fromDirector;
    }


    /*
      Getter fallback
    */
    const fromGetter =
      safeGet(
        () => {

          if (
            typeof director
              ?.getComponentScheduler ===
            'function'
          ) {

            return director
              .getComponentScheduler();
          }


          return null;
        },
        null
      );


    if (fromGetter) {
      return fromGetter;
    }


    /*
      Global fallback
    */
    const fromGlobal =
      safeGet(
        () =>
          globals?.componentScheduler ||
          globals?.compScheduler,
        null
      );


    if (fromGlobal) {
      return fromGlobal;
    }


    /*
      cc fallback
    */
    return (

      safeGet(
        () =>
          cc?._compScheduler ||
          cc?.compScheduler,
        null
      ) ||

      null

    );
  }


  /* ======================================================
     Component 名稱
  ====================================================== */

  function getComponentName(
    component
  ) {

    if (!component) {
      return 'UnknownComponent';
    }


    const candidates = [

      safeGet(
        () => component.__classname__,
        null
      ),

      safeGet(
        () => component.constructor?.__classname__,
        null
      ),

      safeGet(
        () => component.constructor?.name,
        null
      ),

      safeGet(
        () => component.name,
        null
      )

    ];


    for (
      const name of candidates
    ) {

      if (
        typeof name === 'string' &&
        name.trim()
      ) {

        return name.trim();
      }
    }


    return 'UnknownComponent';
  }


  /* ======================================================
     Node 名稱
  ====================================================== */

  function getNodeName(
    component
  ) {

    const value =
      safeGet(
        () => component?.node?.name,
        ''
      );


    return typeof value === 'string'
      ? value
      : '';
  }


  /* ======================================================
     建立 Component 紀錄
  ====================================================== */

  function createRecord(
    component
  ) {

    return {

      component,

      name:
        getComponentName(
          component
        ),

      nodeName:
        getNodeName(
          component
        ),

      updateCount:
        0,

      lateUpdateCount:
        0,

      lastDt:
        0,

      lastUpdateDt:
        0,

      lastLateUpdateDt:
        0,

      updateTotalDt:
        0,

      lateUpdateTotalDt:
        0,

      originalUpdate:
        null,

      originalLateUpdate:
        null,

      updateHadOwn:
        false,

      lateUpdateHadOwn:
        false,

      updateWrapped:
        false,

      lateUpdateWrapped:
        false

    };
  }


  /* ======================================================
     取得 / 建立紀錄
  ====================================================== */

  function getRecord(
    component
  ) {

    if (
      records.has(
        component
      )
    ) {

      return records.get(
        component
      );
    }


    const record =
      createRecord(
        component
      );


    records.set(
      component,
      record
    );


    return record;
  }


  /* ======================================================
     收集排程陣列
  ====================================================== */

  function collectFromInvoker(
    invoker,
    output
  ) {

    if (!invoker) {
      return;
    }


    /*
      Cocos 2.x 常見：
      _neg.array
      _zero.array
      _pos.array
    */
    const groups = [

      safeGet(
        () => invoker._neg?.array,
        null
      ),

      safeGet(
        () => invoker._zero?.array,
        null
      ),

      safeGet(
        () => invoker._pos?.array,
        null
      ),

      /*
        其他可能結構
      */
      safeGet(
        () => invoker.array,
        null
      )

    ];


    for (
      const array of groups
    ) {

      if (
        !Array.isArray(array)
      ) {
        continue;
      }


      for (
        const component of array
      ) {

        if (
          component &&
          (
            typeof component === 'object' ||
            typeof component === 'function'
          )
        ) {

          output.add(
            component
          );
        }
      }
    }
  }


  /* ======================================================
     掃描所有排程 Component
  ====================================================== */

  function discoverComponents() {

    const scheduler =
      refs.componentScheduler;


    const found =
      new Set();


    if (!scheduler) {
      return found;
    }


    /*
      update components
    */
    collectFromInvoker(
      safeGet(
        () => scheduler._updating,
        null
      ),
      found
    );


    /*
      lateUpdate components
    */
    collectFromInvoker(
      safeGet(
        () => scheduler._lateUpdating,
        null
      ),
      found
    );


    /*
      某些 Cocos 版本命名不同
    */
    collectFromInvoker(
      safeGet(
        () => scheduler.updating,
        null
      ),
      found
    );


    collectFromInvoker(
      safeGet(
        () => scheduler.lateUpdating,
        null
      ),
      found
    );


    return found;
  }


  /* ======================================================
     包裝 update()
  ====================================================== */

  function wrapUpdate(
    component,
    record
  ) {

    if (
      !component ||
      typeof component.update !==
      'function'
    ) {

      return false;
    }


    if (
      record.updateWrapped
    ) {

      return true;
    }


    const original =
      component.update;


    record.originalUpdate =
      original;


    record.updateHadOwn =
      Object.prototype
        .hasOwnProperty
        .call(
          component,
          'update'
        );


    component.update =
      function(...args) {

        record.updateCount++;


        if (
          args.length > 0
        ) {

          const dt =
            Number(
              args[0]
            );


          if (
            Number.isFinite(dt)
          ) {

            record.lastDt =
              dt;

            record.lastUpdateDt =
              dt;

            record.updateTotalDt +=
              dt;
          }
        }


        /*
          不改 args。
          不改 this。
          不改回傳值。
        */
        return original.apply(
          this,
          args
        );
      };


    record.updateWrapped =
      true;


    wrappedUpdates++;


    return true;
  }


  /* ======================================================
     包裝 lateUpdate()
  ====================================================== */

  function wrapLateUpdate(
    component,
    record
  ) {

    if (
      !component ||
      typeof component.lateUpdate !==
      'function'
    ) {

      return false;
    }


    if (
      record.lateUpdateWrapped
    ) {

      return true;
    }


    const original =
      component.lateUpdate;


    record.originalLateUpdate =
      original;


    record.lateUpdateHadOwn =
      Object.prototype
        .hasOwnProperty
        .call(
          component,
          'lateUpdate'
        );


    component.lateUpdate =
      function(...args) {

        record.lateUpdateCount++;


        if (
          args.length > 0
        ) {

          const dt =
            Number(
              args[0]
            );


          if (
            Number.isFinite(dt)
          ) {

            record.lastDt =
              dt;

            record.lastLateUpdateDt =
              dt;

            record.lateUpdateTotalDt +=
              dt;
          }
        }


        return original.apply(
          this,
          args
        );
      };


    record.lateUpdateWrapped =
      true;


    wrappedLateUpdates++;


    return true;
  }


  /* ======================================================
     包裝找到的 Component
  ====================================================== */

  function wrapDiscoveredComponents() {

    const found =
      discoverComponents();


    discoveredComponents =
      found.size;


    for (
      const component of found
    ) {

      const record =
        getRecord(
          component
        );


      wrapUpdate(
        component,
        record
      );


      wrapLateUpdate(
        component,
        record
      );
    }


    return found.size;
  }


  /* ======================================================
     安裝
  ====================================================== */

  function install(
    options = {}
  ) {

    if (installed) {
      uninstall();
    }


    /*
      新的一次 install
      從乾淨紀錄開始。
    */
    records =
      new Map();


    discoveredComponents =
      0;


    wrappedUpdates =
      0;


    wrappedLateUpdates =
      0;


    refs.globals =
      options.globals ||
      window;


    refs.cc =
      findCC(
        refs.globals
      );


    refs.director =
      findDirector(
        refs.cc,
        refs.globals
      );


    refs.componentScheduler =
      findComponentScheduler(
        refs.cc,
        refs.director,
        refs.globals
      );


    wrapDiscoveredComponents();


    installed =
      true;


    return getState();
  }


  /* ======================================================
     重新掃描

     真實遊戲可能進入 Spin 後，
     才建立新的 Component。
  ====================================================== */

  function rescan() {

    if (!installed) {
      return 0;
    }


    const found =
      discoverComponents();


    for (
      const component of found
    ) {

      if (
        !records.has(
          component
        )
      ) {

        const record =
          getRecord(
            component
          );


        wrapUpdate(
          component,
          record
        );


        wrapLateUpdate(
          component,
          record
        );
      }
    }


    discoveredComponents =
      records.size;


    return discoveredComponents;
  }


  /* ======================================================
     清零呼叫次數
  ====================================================== */

  function resetCounts() {

    for (
      const record of
      records.values()
    ) {

      record.updateCount =
        0;

      record.lateUpdateCount =
        0;

      record.lastDt =
        0;

      record.lastUpdateDt =
        0;

      record.lastLateUpdateDt =
        0;

      record.updateTotalDt =
        0;

      record.lateUpdateTotalDt =
        0;
    }


    return snapshot();
  }


  /* ======================================================
     Snapshot Component
  ====================================================== */

  function snapshotRecord(
    record
  ) {

    const totalCalls =
      record.updateCount +
      record.lateUpdateCount;


    return {

      name:
        record.name,

      nodeName:
        record.nodeName,

      updateCount:
        record.updateCount,

      lateUpdateCount:
        record.lateUpdateCount,

      totalCalls,

      lastDt:
        record.lastDt,

      lastUpdateDt:
        record.lastUpdateDt,

      lastLateUpdateDt:
        record.lastLateUpdateDt,

      averageUpdateDt:
        record.updateCount > 0
          ? (
              record.updateTotalDt /
              record.updateCount
            )
          : 0,

      averageLateUpdateDt:
        record.lateUpdateCount > 0
          ? (
              record.lateUpdateTotalDt /
              record.lateUpdateCount
            )
          : 0

    };
  }


  /* ======================================================
     Snapshot
  ====================================================== */

  function snapshot() {

    const components =
      Array.from(
        records.values()
      )
      .map(
        snapshotRecord
      );


    const ranking =
      [...components]
        .sort(
          (a, b) => {

            if (
              b.totalCalls !==
              a.totalCalls
            ) {

              return (
                b.totalCalls -
                a.totalCalls
              );
            }


            return a.name
              .localeCompare(
                b.name
              );
          }
        );


    return {

      version:
        VERSION,

      mode:
        MODE,

      components,

      ranking

    };
  }


  /* ======================================================
     Uninstall
  ====================================================== */

  function uninstall() {

    for (
      const record of
      records.values()
    ) {

      const component =
        record.component;


      if (!component) {
        continue;
      }


      /* -----------------------------------------------
         Restore update
      ----------------------------------------------- */

      if (
        record.updateWrapped &&
        record.originalUpdate
      ) {

        if (
          record.updateHadOwn
        ) {

          component.update =
            record.originalUpdate;

        } else {

          /*
            原本 update 來自 prototype，
            移除我們建立的 instance property。
          */
          try {

            delete component.update;

          } catch {

            component.update =
              record.originalUpdate;
          }
        }
      }


      /* -----------------------------------------------
         Restore lateUpdate
      ----------------------------------------------- */

      if (
        record.lateUpdateWrapped &&
        record.originalLateUpdate
      ) {

        if (
          record.lateUpdateHadOwn
        ) {

          component.lateUpdate =
            record.originalLateUpdate;

        } else {

          try {

            delete component.lateUpdate;

          } catch {

            component.lateUpdate =
              record.originalLateUpdate;
          }
        }
      }
    }


    installed =
      false;


    refs = {

      globals: null,

      cc: null,

      director: null,

      componentScheduler: null

    };


    discoveredComponents =
      0;


    wrappedUpdates =
      0;


    wrappedLateUpdates =
      0;


    return getState();
  }


  /* ======================================================
     Reset
  ====================================================== */

  function reset() {

    uninstall();


    records =
      new Map();


    return snapshot();
  }


  /* ======================================================
     State
  ====================================================== */

  function getState() {

    return {

      installed,

      hasCC:
        !!refs.cc,

      hasDirector:
        !!refs.director,

      hasComponentScheduler:
        !!refs.componentScheduler,

      discoveredComponents,

      wrappedUpdates,

      wrappedLateUpdates

    };
  }


  function getMode() {

    return MODE;
  }


  /* ======================================================
     Public API
  ====================================================== */

  window.XinyaoATGComponentInstanceProbe = {

    version:
      VERSION,

    install,

    uninstall,

    reset,

    resetCounts,

    rescan,

    snapshot,

    getState,

    getMode

    /*
      刻意沒有：

      setSpeed()
      spin()
      setBet()
    */
  };


  console.log(
    `[芯瑤 ATG Component Instance Probe] v${VERSION} 已載入｜${MODE}`
  );

})();
