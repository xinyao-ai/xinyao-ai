/* =========================================================
   芯瑤 ATG Method Source Probe v0.1.0

   PASSIVE / READ ONLY

   功能：
   - 只讀指定 Method
   - 取得 Function source
   - 嘗試解析參數名稱
   - 支援 instance / prototype methods

   不會：
   - 執行 Method
   - 執行 Getter
   - speedUp
   - QuickStop
   - Spin
   - 改下注
========================================================= */

(() => {
  'use strict';

  const VERSION =
    '0.1.0';

  const MODE =
    'PASSIVE_METHOD_SOURCE_PROBE';


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

      methods:
        []

    };
  }


  let lastResult =
    freshResult();


  /* ======================================================
     Safe descriptor
  ====================================================== */

  function descriptors(
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
     Component Name

     不碰 getter。
  ====================================================== */

  function getComponentName(
    target
  ) {

    if (!target) {
      return '';
    }


    let desc =
      descriptors(
        target
      );


    if (
      desc.__classname__ &&
      'value' in desc.__classname__ &&
      typeof desc.__classname__.value ===
        'string'
    ) {

      return desc.__classname__.value;
    }


    try {

      const ctor =
        Object.getPrototypeOf(
          target
        )?.constructor;


      if (
        ctor &&
        typeof ctor.__classname__ ===
          'string' &&
        ctor.__classname__
      ) {

        return ctor.__classname__;
      }


      if (
        ctor &&
        typeof ctor.name ===
          'string'
      ) {

        return ctor.name;
      }

    } catch {}


    return '';
  }


  /* ======================================================
     Node Name

     測試裡 node 是普通 value property。
     真機若是 accessor，就不執行。
  ====================================================== */

  function getNodeName(
    target
  ) {

    const desc =
      descriptors(
        target
      );


    const nodeDesc =
      desc.node;


    if (
      !nodeDesc ||
      !(
        'value' in nodeDesc
      )
    ) {

      return '';
    }


    const node =
      nodeDesc.value;


    if (
      !node ||
      typeof node !==
        'object'
    ) {

      return '';
    }


    const nodeDescriptors =
      descriptors(
        node
      );


    const nameDesc =
      nodeDescriptors.name;


    if (
      nameDesc &&
      'value' in nameDesc &&
      typeof nameDesc.value ===
        'string'
    ) {

      return nameDesc.value;
    }


    return '';
  }


  /* ======================================================
     Function Source

     只呼叫 Function.prototype.toString，
     不執行函式本身。
  ====================================================== */

  function getFunctionSource(
    fn
  ) {

    if (
      typeof fn !==
      'function'
    ) {

      return '';
    }


    try {

      return Function
        .prototype
        .toString
        .call(
          fn
        );

    } catch {

      return '';
    }
  }


  /* ======================================================
     Remove comments
  ====================================================== */

  function removeComments(
    source
  ) {

    return String(
      source || ''
    )
      .replace(
        /\/\*[\s\S]*?\*\//g,
        ''
      )
      .replace(
        /\/\/.*$/gm,
        ''
      );
  }


  /* ======================================================
     Split Parameters

     要避免：
     foo(a = {x:1}, b = [1,2])

     被普通 split(",") 切壞。
  ====================================================== */

  function splitParameters(
    raw
  ) {

    const result =
      [];


    let current =
      '';


    let round =
      0;

    let square =
      0;

    let curly =
      0;


    let quote =
      null;


    let escaped =
      false;


    for (
      let i = 0;
      i < raw.length;
      i++
    ) {

      const ch =
        raw[i];


      if (quote) {

        current +=
          ch;


        if (escaped) {

          escaped =
            false;

          continue;
        }


        if (
          ch === '\\'
        ) {

          escaped =
            true;

          continue;
        }


        if (
          ch === quote
        ) {

          quote =
            null;
        }


        continue;
      }


      if (
        ch === '"' ||
        ch === "'" ||
        ch === '`'
      ) {

        quote =
          ch;

        current +=
          ch;

        continue;
      }


      if (ch === '(') round++;
      if (ch === ')') round--;

      if (ch === '[') square++;
      if (ch === ']') square--;

      if (ch === '{') curly++;
      if (ch === '}') curly--;


      if (
        ch === ',' &&
        round === 0 &&
        square === 0 &&
        curly === 0
      ) {

        if (
          current.trim()
        ) {

          result.push(
            current.trim()
          );
        }


        current =
          '';

        continue;
      }


      current +=
        ch;
    }


    if (
      current.trim()
    ) {

      result.push(
        current.trim()
      );
    }


    return result;
  }


  /* ======================================================
     Extract Parameter Block

     支援：

     function foo(a,b){}
     foo(a,b){}
     async foo(a,b){}
     (a,b)=>{}
     a=>{}
  ====================================================== */

  function extractParameters(
    source
  ) {

    source =
      removeComments(
        source
      ).trim();


    if (!source) {
      return [];
    }


    /*
      Arrow single parameter
      x => ...
    */
    const arrowSingle =
      source.match(
        /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/
      );


    if (arrowSingle) {

      return [
        arrowSingle[1]
      ];
    }


    /*
      找第一個參數括號。
    */
    const openIndex =
      source.indexOf(
        '('
      );


    if (
      openIndex < 0
    ) {

      return [];
    }


    let depth =
      0;


    let quote =
      null;


    let escaped =
      false;


    let closeIndex =
      -1;


    for (
      let i = openIndex;
      i < source.length;
      i++
    ) {

      const ch =
        source[i];


      if (quote) {

        if (escaped) {

          escaped =
            false;

          continue;
        }


        if (
          ch === '\\'
        ) {

          escaped =
            true;

          continue;
        }


        if (
          ch === quote
        ) {

          quote =
            null;
        }


        continue;
      }


      if (
        ch === '"' ||
        ch === "'" ||
        ch === '`'
      ) {

        quote =
          ch;

        continue;
      }


      if (ch === '(') {

        depth++;

      } else if (
        ch === ')'
      ) {

        depth--;


        if (
          depth === 0
        ) {

          closeIndex =
            i;

          break;
        }
      }
    }


    if (
      closeIndex < 0
    ) {

      return [];
    }


    const raw =
      source.slice(
        openIndex + 1,
        closeIndex
      );


    return splitParameters(
      raw
    );
  }


  /* ======================================================
     Find method descriptor

     先 instance，
     再 prototype chain。

     全程只讀 descriptor.value，
     不執行 getter。
  ====================================================== */

  function findMethod(
    target,
    name
  ) {

    if (!target) {
      return null;
    }


    const own =
      descriptors(
        target
      );


    const ownDescriptor =
      own[name];


    if (
      ownDescriptor &&
      'value' in ownDescriptor &&
      typeof ownDescriptor.value ===
        'function'
    ) {

      return {

        fn:
          ownDescriptor.value,

        sourceLocation:
          'instance'

      };
    }


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
      depth < 16
    ) {

      const protoDescriptors =
        descriptors(
          proto
        );


      const descriptor =
        protoDescriptors[name];


      if (
        descriptor &&
        'value' in descriptor &&
        typeof descriptor.value ===
          'function'
      ) {

        return {

          fn:
            descriptor.value,

          sourceLocation:
            `prototype:${depth}`

        };
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


    const target =
      options.target;


    if (
      !target ||
      (
        typeof target !== 'object' &&
        typeof target !== 'function'
      )
    ) {

      return lastResult;
    }


    const wantedMethods =
      Array.isArray(
        options.methods
      )
        ? options.methods
        : [];


    const methods =
      [];


    for (
      const requestedName of
      wantedMethods
    ) {

      const name =
        String(
          requestedName
        );


      const found =
        findMethod(
          target,
          name
        );


      if (!found) {
        continue;
      }


      const source =
        getFunctionSource(
          found.fn
        );


      const parameters =
        extractParameters(
          source
        );


      methods.push({

        name,

        sourceLocation:
          found.sourceLocation,

        parameterCount:
          parameters.length,

        parameters,

        source

      });
    }


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

      methods

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

     刻意沒有：

     invoke()
     speedUp()
     quickStop()
     spin()
     setBet()
  ====================================================== */

  window.XinyaoATGMethodSourceProbe = {

    version:
      VERSION,

    inspect,

    reset,

    getLastResult,

    getMode

  };


  console.log(
    `[芯瑤 ATG Method Source Probe] v${VERSION} 已載入｜${MODE}`
  );

})();
