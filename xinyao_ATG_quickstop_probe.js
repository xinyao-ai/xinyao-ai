/* =========================================================
   芯瑤 ATG QuickStop Probe v0.1.0

   PASSIVE / READ ONLY

   用途：
   - 找 SpinButton / QuickStopBtn
   - 只讀 instance properties
   - 只讀 prototype method 名稱
   - 找 quick / stop / reel / click 相關候選方法

   絕對不會：
   - 執行任何方法
   - 觸發 QuickStop
   - Spin
   - 改下注
   - 執行 getter
========================================================= */

(() => {
  'use strict';

  const VERSION =
    '0.1.0';

  const MODE =
    'PASSIVE_QUICKSTOP_PROBE';


  function freshResult() {

    return {

      version:
        VERSION,

      mode:
        MODE,

      found:
        false,

      componentName:
        '',

      nodeName:
        '',

      properties:
        [],

      methods:
        [],

      candidates:
        []

    };
  }


  let lastResult =
    freshResult();


  /* ======================================================
     安全讀 Component 名稱
  ====================================================== */

  function getComponentName(
    component
  ) {

    if (!component) {
      return '';
    }


    try {

      if (
        typeof component.__classname__ ===
          'string' &&
        component.__classname__
      ) {

        return component.__classname__;
      }

    } catch {}


    try {

      if (
        typeof component.constructor
          ?.__classname__ ===
          'string' &&
        component.constructor
          .__classname__
      ) {

        return component.constructor
          .__classname__;
      }

    } catch {}


    try {

      if (
        typeof component.constructor
          ?.name ===
          'string'
      ) {

        return component.constructor
          .name;
      }

    } catch {}


    return '';
  }


  /* ======================================================
     Node Name
  ====================================================== */

  function getNodeName(
    component
  ) {

    try {

      const value =
        component?.node?.name;


      return typeof value ===
        'string'
          ? value
          : '';

    } catch {

      return '';
    }
  }


  /* ======================================================
     不執行 Getter 的 descriptor 掃描
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
     Instance Properties / Methods
  ====================================================== */

  function inspectOwnProperties(
    target,
    properties,
    methods,
    seenMethods
  ) {

    const descriptors =
      getDescriptors(
        target
      );


    for (
      const [
        name,
        descriptor
      ] of Object.entries(
        descriptors
      )
    ) {

      /*
        getter / setter 只標記，
        不執行。
      */
      if (
        !(
          'value' in descriptor
        )
      ) {

        properties.push({

          name,

          type:
            'accessor',

          hasGetter:
            typeof descriptor.get ===
            'function',

          hasSetter:
            typeof descriptor.set ===
            'function',

          source:
            'instance'

        });

        continue;
      }


      const value =
        descriptor.value;


      if (
        typeof value ===
        'function'
      ) {

        if (
          !seenMethods.has(
            name
          )
        ) {

          seenMethods.add(
            name
          );


          methods.push({

            name,

            source:
              'instance'

          });
        }


        continue;
      }


      properties.push({

        name,

        type:
          Array.isArray(value)
            ? 'array'
            : (
                value === null
                  ? 'null'
                  : typeof value
              ),

        source:
          'instance'

      });
    }
  }


  /* ======================================================
     Prototype Methods

     只讀 descriptor.value，
     不執行任何 function。
  ====================================================== */

  function inspectPrototypeChain(
    target,
    methods,
    properties,
    seenMethods
  ) {

    let proto;

    try {

      proto =
        Object.getPrototypeOf(
          target
        );

    } catch {

      proto =
        null;
    }


    let depth =
      0;


    while (
      proto &&
      proto !== Object.prototype &&
      depth < 12
    ) {

      const descriptors =
        getDescriptors(
          proto
        );


      for (
        const [
          name,
          descriptor
        ] of Object.entries(
          descriptors
        )
      ) {

        if (
          name ===
          'constructor'
        ) {

          continue;
        }


        if (
          !(
            'value' in descriptor
          )
        ) {

          /*
            prototype getter 也不執行。
          */
          properties.push({

            name,

            type:
              'accessor',

            hasGetter:
              typeof descriptor.get ===
              'function',

            hasSetter:
              typeof descriptor.set ===
              'function',

            source:
              `prototype:${depth}`

          });

          continue;
        }


        if (
          typeof descriptor.value ===
          'function'
        ) {

          if (
            !seenMethods.has(
              name
            )
          ) {

            seenMethods.add(
              name
            );


            methods.push({

              name,

              source:
                `prototype:${depth}`

            });
          }
        }
      }


      try {

        proto =
          Object.getPrototypeOf(
            proto
          );

      } catch {

        break;
      }


      depth++;
    }
  }


  /* ======================================================
     候選 QuickStop 方法
  ====================================================== */

  function buildCandidates(
    methods
  ) {

    const keywords = [

      'quick',
      'stop',
      'reel',
      'click',
      'skip',
      'finish',
      'fast'

    ];


    return methods
      .filter(
        item => {

          const name =
            String(
              item.name || ''
            ).toLowerCase();


          return keywords.some(
            keyword =>
              name.includes(
                keyword
              )
          );
        }
      )
      .map(
        item => ({

          ...item

        })
      );
  }


  /* ======================================================
     找目標 Component
  ====================================================== */

  function findTarget(
    components,
    componentName,
    nodeName
  ) {

    if (
      !Array.isArray(
        components
      )
    ) {

      return null;
    }


    /*
      第一順位：
      Component + Node 都符合
    */
    for (
      const component of components
    ) {

      if (
        getComponentName(
          component
        ) === componentName &&
        getNodeName(
          component
        ) === nodeName
      ) {

        return component;
      }
    }


    /*
      第二順位：
      Component 名稱符合
    */
    for (
      const component of components
    ) {

      if (
        getComponentName(
          component
        ) === componentName
      ) {

        return component;
      }
    }


    /*
      第三順位：
      Node 名稱符合
    */
    for (
      const component of components
    ) {

      if (
        getNodeName(
          component
        ) === nodeName
      ) {

        return component;
      }
    }


    return null;
  }


  /* ======================================================
     Inspect
  ====================================================== */

  function inspect(
    options = {}
  ) {

    lastResult =
      freshResult();


    const components =
      Array.isArray(
        options.components
      )
        ? options.components
        : [];


    const wantedComponent =
      String(
        options.componentName ||
        'SpinButton'
      );


    const wantedNode =
      String(
        options.nodeName ||
        'QuickStopBtn'
      );


    const target =
      findTarget(
        components,
        wantedComponent,
        wantedNode
      );


    if (!target) {

      return lastResult;
    }


    const properties =
      [];


    const methods =
      [];


    const seenMethods =
      new Set();


    inspectOwnProperties(
      target,
      properties,
      methods,
      seenMethods
    );


    inspectPrototypeChain(
      target,
      methods,
      properties,
      seenMethods
    );


    lastResult = {

      version:
        VERSION,

      mode:
        MODE,

      found:
        true,

      componentName:
        getComponentName(
          target
        ),

      nodeName:
        getNodeName(
          target
        ),

      properties,

      methods,

      candidates:
        buildCandidates(
          methods
        )

    };


    return lastResult;
  }


  /* ======================================================
     Reset
  ====================================================== */

  function reset() {

    lastResult =
      freshResult();


    return lastResult;
  }


  function getLastResult() {

    return lastResult;
  }


  function getMode() {

    return MODE;
  }


  /* ======================================================
     Public API

     注意：
     刻意沒有 trigger / quickStop / spin / setBet
  ====================================================== */

  window.XinyaoATGQuickStopProbe = {

    version:
      VERSION,

    inspect,

    reset,

    getLastResult,

    getMode

  };


  console.log(
    `[芯瑤 ATG QuickStop Probe] v${VERSION} 已載入｜${MODE}`
  );

})();
