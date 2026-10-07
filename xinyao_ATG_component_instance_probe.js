/* =========================================================
   芯瑤 ATG Component Instance Probe v0.2.0

   PASSIVE / READ ONLY

   支援：

   舊版結構：
   - _updating
   - _lateUpdating

   ATG 真機結構：
   - startInvoker
   - updateInvoker
   - lateUpdateInvoker

   功能：
   - 找出實際被排程的 Component
   - 個別記錄 update()
   - 個別記錄 lateUpdate()
   - 支援中途建立的新 Component
   - 產生活躍排行榜

   不會：
   - 修改 dt
   - 加速
   - Spin
   - 改下注
   - 掃描 Component 內部的 uv / renderData 陣列
========================================================= */

(() => {
  'use strict';


  const VERSION =
    '0.2.0';


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


  let records =
    new Map();


  let discoveredComponents =
    0;


  let wrappedUpdates =
    0;


  let wrappedLateUpdates =
    0;


  /* ======================================================
     Safe Read
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
     Find Cocos
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
     Find Director
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
     Find ComponentScheduler
  ====================================================== */

  function findComponentScheduler(
    cc,
    director,
    globals
  ) {

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


    const fromGlobal =
      safeGet(
        () =>
          globals?._compScheduler ||
          globals?.compScheduler ||
          globals?.componentScheduler,
        null
      );


    if (fromGlobal) {
      return fromGlobal;
    }


    return (

      safeGet(
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
     Component Name
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
      ),

      safeGet(
        () => component.node?.name,
        null
      )

    ];


    for (
      const value of candidates
    ) {

      if (
        typeof value === 'string' &&
        value.trim()
      ) {

        return value.trim();
      }
    }


    return 'UnknownComponent';
  }


  /* ======================================================
     Node Name
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
     判斷是不是 Component 候選

     重點：
     只接受 invoker bucket 直接放的物件。

     不會遞迴跑進：
     _renderData
     uvSliced
     vertices
     sprite frame...
  ====================================================== */

  function isComponentCandidate(
    value
  ) {

    if (
      !value ||
      (
        typeof value !== 'object' &&
        typeof value !== 'function'
      )
    ) {

      return false;
    }


    /*
      一般 Component 至少會有其中一些特徵。
    */
    if (
      typeof value.update ===
        'function' ||

      typeof value.lateUpdate ===
        'function' ||

      typeof value.start ===
        'function' ||

      value.node ||

      value.__classname__
    ) {

      return true;
    }


    return false;
  }


  /* ======================================================
     建立 Record
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
     從 Array 收 Component

     不做深度遞迴。
  ====================================================== */

  function collectArray(
    array,
    output
  ) {

    if (
      !Array.isArray(
        array
      )
    ) {

      return;
    }


    for (
      const item of array
    ) {

      if (
        isComponentCandidate(
          item
        )
      ) {

        output.add(
          item
        );
      }
    }
  }


  /* ======================================================
     掃描一個 Invoker

     支援：

     invoker._neg.array
     invoker._zero.array
     invoker._pos.array

     以及少數 build 可能使用的：

     invoker._neg
     invoker._zero
     invoker._pos
     invoker.array
  ====================================================== */

  function collectFromInvoker(
    invoker,
    output
  ) {

    if (!invoker) {
      return;
    }


    const buckets = [

      safeGet(
        () => invoker._neg,
        null
      ),

      safeGet(
        () => invoker._zero,
        null
      ),

      safeGet(
        () => invoker._pos,
        null
      )

    ];


    for (
      const bucket of buckets
    ) {

      if (!bucket) {
        continue;
      }


      /*
        Bucket 本身就是 Array
      */
      if (
        Array.isArray(
          bucket
        )
      ) {

        collectArray(
          bucket,
          output
        );

        continue;
      }


      /*
        ATG 真機：
        _pos.array
      */
      collectArray(
        safeGet(
          () => bucket.array,
          null
        ),
        output
      );


      /*
        其他 Cocos build fallback
      */
      collectArray(
        safeGet(
          () => bucket._array,
          null
        ),
        output
      );


      collectArray(
        safeGet(
          () => bucket.components,
          null
        ),
        output
      );
    }


    /*
      Invoker 本身可能直接有 array
    */
    collectArray(
      safeGet(
        () => invoker.array,
        null
      ),
      output
    );


    collectArray(
      safeGet(
        () => invoker._array,
        null
      ),
      output
    );
  }


  /* ======================================================
     Discover Components
  ====================================================== */

  function discoverComponents() {

    const scheduler =
      refs.componentScheduler;


    const found =
      new Set();


    if (!scheduler) {
      return found;
    }


    /* ====================================================
       ATG 真機結構
    ==================================================== */

    collectFromInvoker(
      safeGet(
        () =>
          scheduler.startInvoker,
        null
      ),
      found
    );


    collectFromInvoker(
      safeGet(
        () =>
          scheduler.updateInvoker,
        null
      ),
      found
    );


    collectFromInvoker(
      safeGet(
        () =>
          scheduler.lateUpdateInvoker,
        null
      ),
      found
    );


    /* ====================================================
       部分 Cocos build 可能帶底線
    ==================================================== */

    collectFromInvoker(
      safeGet(
        () =>
          scheduler._startInvoker,
        null
      ),
      found
    );


    collectFromInvoker(
      safeGet(
        () =>
          scheduler._updateInvoker,
        null
      ),
      found
    );


    collectFromInvoker(
      safeGet(
        () =>
          scheduler._lateUpdateInvoker,
        null
      ),
      found
    );


    /* ====================================================
       舊版測試 / 其他 Cocos 結構
    ==================================================== */

    collectFromInvoker(
      safeGet(
        () =>
          scheduler._updating,
        null
      ),
      found
    );


    collectFromInvoker(
      safeGet(
        () =>
          scheduler._lateUpdating,
        null
      ),
      found
    );


    collectFromInvoker(
      safeGet(
        () =>
          scheduler.updating,
        null
      ),
      found
    );


    collectFromInvoker(
      safeGet(
        () =>
          scheduler.lateUpdating,
        null
      ),
      found
    );


    return found;
  }


  /* ======================================================
     Wrap update()
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


    const wrapped =
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
            Number.isFinite(
              dt
            )
          ) {

            record.lastDt =
              dt;

            record.lastUpdateDt =
              dt;

            record.updateTotalDt +=
              dt;
          }
        }


        return original.apply(
          this,
          args
        );
      };


    /*
      某些 Component 可能封印 property。
      寫不進去就安全跳過。
    */
    try {

      component.update =
        wrapped;

    } catch {

      return false;
    }


    if (
      component.update !==
      wrapped
    ) {

      return false;
    }


    record.updateWrapped =
      true;


    wrappedUpdates++;


    return true;
  }


  /* ======================================================
     Wrap lateUpdate()
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


    const wrapped =
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
            Number.isFinite(
              dt
            )
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


    try {

      component.lateUpdate =
        wrapped;

    } catch {

      return false;
    }


    if (
      component.lateUpdate !==
      wrapped
    ) {

      return false;
    }


    record.lateUpdateWrapped =
      true;


    wrappedLateUpdates++;


    return true;
  }


  /* ======================================================
     Wrap All Discovered
  ====================================================== */

  function wrapDiscoveredComponents() {

    const found =
      discoverComponents();


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


    discoveredComponents =
      records.size;


    return discoveredComponents;
  }


  /* ======================================================
     Install
  ====================================================== */

  function install(
    options = {}
  ) {

    if (installed) {
      uninstall();
    }


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
     Rescan

     ATG 進入 Bonus / 免費遊戲後，
     可能才建立新的 Component。
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


    discoveredComponents =
      records.size;


    return discoveredComponents;
  }


  /* ======================================================
     Reset Counts
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
     Snapshot Record
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


    /*
      排名優先看 update 呼叫。

      原因：
      Reel / Spin 邏輯主要會出現在 update，
      lateUpdate 作為第二順位。

      這也避免：
      update 2 + late 1
      跟
      update 3
      都算成 total 3 時無法區分。
    */
    const ranking =
      [...components]
        .sort(
          (a, b) => {

            if (
              b.updateCount !==
              a.updateCount
            ) {

              return (
                b.updateCount -
                a.updateCount
              );
            }


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
     Restore Method
  ====================================================== */

  function restoreMethod(
    component,
    property,
    original,
    hadOwn
  ) {

    if (
      !component ||
      !original
    ) {

      return;
    }


    if (hadOwn) {

      try {

        component[property] =
          original;

      } catch {}

      return;
    }


    /*
      原函式來自 prototype。

      我們之前在 instance 建了一個 wrapper，
      現在把 instance property 刪掉，
      就會重新回到 prototype 原函式。
    */
    try {

      delete component[property];

    } catch {

      try {

        component[property] =
          original;

      } catch {}
    }
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


      if (
        record.updateWrapped
      ) {

        restoreMethod(
          component,
          'update',
          record.originalUpdate,
          record.updateHadOwn
        );
      }


      if (
        record.lateUpdateWrapped
      ) {

        restoreMethod(
          component,
          'lateUpdate',
          record.originalLateUpdate,
          record.lateUpdateHadOwn
        );
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

  };


  console.log(
    `[芯瑤 ATG Component Instance Probe] v${VERSION} 已載入｜${MODE}`
  );

})();
