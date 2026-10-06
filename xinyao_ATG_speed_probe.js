/* =========================================================
   芯瑤 ATG Speed Probe v0.1

   PASSIVE ONLY：
   - 只偵測遊戲動畫環境
   - 不按 Spin
   - 不改下注
   - 不改動畫速度
   - 不攔截遊戲流程
========================================================= */

(() => {
  'use strict';

  const VERSION = '0.1.0';
  const MODE = 'PASSIVE_SPEED_PROBE';


  function safeQueryAll(
    root,
    selector
  ) {
    try {
      if (
        !root ||
        typeof root.querySelectorAll !==
          'function'
      ) {
        return [];
      }

      return [
        ...root.querySelectorAll(
          selector
        )
      ];

    } catch {
      return [];
    }
  }


  function detectEngines(
    globals
  ) {
    const hints = [];

    try {
      if (globals?.PIXI) {
        hints.push('PIXI');
      }

      if (globals?.Phaser) {
        hints.push('PHASER');
      }

      if (
        globals?.cc ||
        globals?.CocosEngine
      ) {
        hints.push('COCOS');
      }

      if (globals?.THREE) {
        hints.push('THREE');
      }

      if (globals?.BABYLON) {
        hints.push('BABYLON');
      }

      if (globals?.createjs) {
        hints.push('CREATEJS');
      }

    } catch {}

    return [
      ...new Set(hints)
    ];
  }


  function detectCanvas(root) {
    return safeQueryAll(
      root,
      'canvas'
    );
  }


  function detectCSSAnimations(
    root
  ) {
    const result = [];

    const elements =
      safeQueryAll(
        root,
        '*'
      );

    for (const el of elements) {
      try {
        const style =
          getComputedStyle(el);

        const animationName =
          style.animationName;

        const transitionDuration =
          style.transitionDuration;

        if (
          animationName &&
          animationName !== 'none'
        ) {
          result.push({
            type:'animation',
            name:animationName
          });

          continue;
        }

        if (
          transitionDuration &&
          transitionDuration !== '0s'
        ) {
          result.push({
            type:'transition',
            duration:
              transitionDuration
          });
        }

      } catch {}
    }

    return result;
  }


  function detectCanvasContexts(
    canvases
  ) {
    let webglPossible = false;
    let canvas2dPossible = false;

    for (const canvas of canvases) {
      try {
        /*
          這裡不主動建立新的 Context，
          只看瀏覽器是否具有相關 API。
        */

        if (
          typeof WebGLRenderingContext !==
          'undefined'
        ) {
          webglPossible = true;
        }

        if (
          typeof CanvasRenderingContext2D !==
          'undefined'
        ) {
          canvas2dPossible = true;
        }

      } catch {}
    }

    return {
      webglPossible,
      canvas2dPossible
    };
  }


  function analyze(options = {}) {

    const root =
      options.root ||
      document;

    const globals =
      options.globals ||
      window;


    const canvases =
      detectCanvas(root);

    const cssAnimations =
      detectCSSAnimations(root);

    const contexts =
      detectCanvasContexts(
        canvases
      );


    return {
      version:
        VERSION,

      mode:
        MODE,

      canvasCount:
        canvases.length,

      hasRAF:
        typeof globals
          ?.requestAnimationFrame ===
        'function',

      hasTimeout:
        typeof globals
          ?.setTimeout ===
        'function',

      hasInterval:
        typeof globals
          ?.setInterval ===
        'function',

      engineHints:
        detectEngines(
          globals
        ),

      cssAnimationCount:
        cssAnimations.length,

      webglPossible:
        contexts.webglPossible,

      canvas2dPossible:
        contexts.canvas2dPossible
    };
  }


  window.XinyaoATGSpeedProbe = {
    version:
      VERSION,

    analyze,

    getMode:
      () => MODE

    /*
      刻意不存在：

      spin()
      setBet()
      setSpeed()

      目前只做診斷。
    */
  };


  console.log(
    `[芯瑤 ATG Speed Probe] v${VERSION} 已載入｜${MODE}`
  );

})();
