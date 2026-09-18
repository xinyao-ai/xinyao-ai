(() => {
  'use strict';

  if (window.__XIANYAO_SITE_LIVE_V2__) return;
  window.__XIANYAO_SITE_LIVE_V2__ = true;

  const WORKER =
    'https://xinyao-atg-live.love06130430.workers.dev';

  const SCRIPT_URL =
    'https://xinyao-ai.github.io/xinyao-ai/xinyao_ATG_live.user.js?v=202';

  const GUIDE_IMAGES = {
    ios: './xinyao_guide_ios.png?v=203',
    android: './xinyao_guide_android.png?v=203'
  };

  const TAMPERMONKEY_URL =
    'https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=zh-TW';

  const USERSCRIPTS_APP_STORE_URL =
    'https://apps.apple.com/tw/app/userscripts/id1463298887';

  const DESKTOP_GUIDE_STEPS = [
    {
      stepNumber: 1,
      title: '先確認：娛樂城與芯瑤程式使用同一個瀏覽器',
      bodyHtml: `
        <p>請先確認 <b>HD 皇鼎娛樂城</b> 與 <b>芯瑤💕 ATG AI助手</b> 都使用 <b>同一個 Chrome 瀏覽器</b> 開啟。</p>
        <p>不要一個用 Chrome、另一個用其他瀏覽器，否則後面的安裝與綁定可能無法正常運作。</p>
      `,
      images: [
        './pc_step1.png?v=203'
      ]
    },
    {
      stepNumber: 2,
      title: '安裝 Tampermonkey 擴充功能',
      bodyHtml: `
        <p>先按下方按鈕複製 Tampermonkey 安裝網址，再貼到 <b>Google Chrome 網址列</b> 開啟。</p>
        <p>進入商店後依序點擊：<b>【加到 Chrome】→【新增擴充功能】</b>。</p>
      `,
      images: [
        './pc_step2.png?v=203'
      ],
      copyTampermonkey: true
    },
    {
      stepNumber: 3,
      title: '安裝芯瑤 ATG 共用程式',
      bodyHtml: `
        <p>回到 <b>【芯瑤💕 ATG AI助手】</b>。</p>
        <p>依序操作：<b>【安裝共用程式／查看教學】→ 往下滑 →【我看完教學｜開啟共用程式】→【安裝】</b>。</p>
        <p>安裝完成後再回到這個教學頁，繼續下一步。</p>
      `,
      images: [
        './pc_step3_1.png?v=203',
        './pc_step3_2.png?v=203',
        './pc_step3_3.png?v=203'
      ],
      openSharedScript: true
    },
    {
      stepNumber: 4,
      title: '開啟「允許使用者指令碼」',
      bodyHtml: `
        <p>登入 <b>ATG</b> 後，依序點擊：</p>
        <p><b>右上【⋮】→【擴充功能】→【管理擴充功能】→【Tampermonkey／竄改猴】→【詳細資料】</b></p>
        <p>最後把 <b>【允許使用者指令碼】</b> 的開關打開。這一步一定要完成，不然芯瑤助手不會在 ATG 頁面執行。</p>
      `,
      images: [
        './pc_step4_1.png?v=203',
        './pc_step4_2.png?v=203',
        './pc_step4_3.png?v=203'
      ]
    },
    {
      stepNumber: 5,
      title: '產生配對碼並完成綁定',
      bodyHtml: `
        <p>回到 <b>【芯瑤💕 ATG AI助手】</b>，點擊 <b>【產生配對碼】→【複製配對碼】</b>。</p>
        <p>再回到 ATG：<b>重新整理頁面</b> → 左上角出現 <b>【芯瑤 ATG 即時助手】</b> → 貼上配對碼 → 點擊 <b>【綁定】</b>。</p>
        <p>看到綁定成功後，就可以開始遊戲了 ✅</p>
      `,
      images: [
        './pc_step5_1.png?v=203',
        './pc_step5_2.png?v=203'
      ]
    }
  ];


  const IOS_GUIDE_STEPS = [
    {
      stepNumber: 1,
      title: '先確認：娛樂城與芯瑤程式使用同一個 Safari',
      bodyHtml: `
        <p>請先確認 <b>HD 皇鼎娛樂城</b> 與 <b>芯瑤💕 ATG AI助手</b> 都使用 <b>同一個 Safari 瀏覽器</b> 開啟。</p>
        <p>不要一個用 Safari、另一個用其他瀏覽器，否則後面的安裝、配對與同步可能無法正常運作。</p>
      `,
      images: [
        './ios_step1.png?v=204'
      ]
    },
    {
      stepNumber: 2,
      title: '到 App Store 安裝 Userscripts',
      bodyHtml: `
        <p>點下方按鈕可直接前往 App Store 的 <b>Userscripts</b> 安裝頁，不需要自己搜尋。</p>
        <p>進入 App Store 後，點擊 <b>【取得】／下載圖示</b> 完成安裝。</p>
      `,
      images: [
        './ios_step2.png?v=204'
      ],
      openUserscriptsAppStore: true
    },
    {
      stepNumber: 3,
      title: '開啟 Userscripts 的 Safari 延伸功能權限',
      bodyHtml: `
        <p>到 iPhone 的 <b>【設定】→【App】→【Safari】→【延伸功能】→【Userscripts】</b>。</p>
        <p>進去後請打開 <b>【允許延伸功能】</b> 與 <b>【在「私密瀏覽」中允許】</b>。</p>
        <p>如果下方有網站權限，也請確認相關網站設定為 <b>允許</b>。</p>
      `,
      images: [
        './ios_step3.png?v=204'
      ]
    },
    {
      stepNumber: 4,
      title: '回到芯瑤頁面，開啟共用程式',
      bodyHtml: `
        <p>回到 <b>【芯瑤💕 ATG AI助手】</b>。</p>
        <p>點擊 <b>【安裝共用程式／查看教學】</b> → 將教學往下滑 → 點擊 <b>【我看完教學｜開啟共用程式】</b>。</p>
        <p>開啟共用程式頁面後，請繼續下一步安裝。</p>
      `,
      images: [
        './ios_step4.png?v=204'
      ],
      openSharedScript: true
    },
    {
      stepNumber: 5,
      title: '用 Userscripts 安裝芯瑤共用程式',
      bodyHtml: `
        <p>在共用程式頁面，依序操作：</p>
        <p><b>網址左側【拼圖／延伸功能符號】→【Userscripts】→ 黃色提示列【Tap to install】→【Install】</b>。</p>
        <p>看到綠色 <b>【Userscript Installed】</b> 後，再把上方右側的腳本開關打開。</p>
      `,
      images: [
        './ios_step5_1.png?v=204',
        './ios_step5_2.png?v=204'
      ]
    },
    {
      stepNumber: 6,
      title: '產生配對碼並完成綁定',
      bodyHtml: `
        <p>回到 <b>【芯瑤💕 ATG AI助手】</b>，點擊 <b>【產生配對碼】→【複製配對碼】</b>。</p>
        <p>再回到 ATG：<b>重新整理頁面</b> → 左上角出現 <b>【芯瑤 ATG 即時助手】</b> → 貼上剛剛複製的 <b>配對碼</b> → 點擊 <b>【綁定】</b>。</p>
        <p>看到綁定成功後，就可以開始遊戲了 ✅</p>
      `,
      images: [
        './ios_step6.png?v=204'
      ]
    }
  ];

  const SESSION_KEY =
    'xinyao_atg_site_session_v2';

  let memberAccount = '';
  let sessionToken = '';
  let sessionExpiresAt = 0;
  let sessionPromise = null;

  let pairCode = '';
  let pairExpiresAt = 0;

  let pollBusy = false;
  let lastBoundState = false;

  const $ = id =>
    document.getElementById(id);

  function money(value) {
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return '—';
    }

    const n =
      Number(value);

    return Number.isFinite(n)
      ? n.toFixed(2)
      : '—';
  }

  function timeText(value) {
    const n =
      Number(value);

    if (
      !Number.isFinite(n) ||
      n <= 0
    ) {
      return '—';
    }

    return new Date(n)
      .toLocaleTimeString(
        'zh-TW',
        {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }
      );
  }

  function getMemberAccount() {
    const fromSession =
      String(
        sessionStorage.getItem(
          'memberAccount'
        ) || ''
      ).trim();

    if (fromSession) {
      return fromSession;
    }

    const display =
      $('memberDisplay');

    const text =
      String(
        display?.textContent || ''
      ).trim();

    return (
      text &&
      text !== '--'
    )
      ? text
      : '';
  }

  function clearSavedSession() {
    sessionToken = '';
    sessionExpiresAt = 0;

    try {
      sessionStorage.removeItem(
        SESSION_KEY
      );
    } catch (_) {}
  }

  function loadSavedSession(
    account
  ) {
    try {
      const raw =
        sessionStorage.getItem(
          SESSION_KEY
        );

      if (!raw) {
        return false;
      }

      const saved =
        JSON.parse(raw);

      if (
        saved?.memberAccount ===
          account &&
        typeof saved
          ?.sessionToken ===
          'string' &&
        Number(
          saved?.expiresAt || 0
        ) >
          Date.now() + 15000
      ) {
        sessionToken =
          saved.sessionToken;

        sessionExpiresAt =
          Number(
            saved.expiresAt
          );

        return true;
      }

    } catch (_) {}

    return false;
  }

  function saveSession(
    account,
    token,
    expiresAt
  ) {
    sessionToken =
      token;

    sessionExpiresAt =
      Number(
        expiresAt || 0
      );

    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          memberAccount:
            account,

          sessionToken:
            token,

          expiresAt:
            sessionExpiresAt
        })
      );
    } catch (_) {}
  }

  function detectPlatform() {
    const ua =
      navigator.userAgent || '';

    if (
      /iPhone|iPad|iPod/i
        .test(ua)
    ) {
      return 'iOS';
    }

    if (
      /Android/i
        .test(ua)
    ) {
      return 'Android';
    }

    if (
      /Windows/i
        .test(ua)
    ) {
      return 'Windows';
    }

    if (
      /Macintosh|Mac OS X/i
        .test(ua)
    ) {
      return 'macOS';
    }

    return '電腦';
  }

  function installHint() {
    const platform =
      detectPlatform();

    if (
      platform === 'iOS'
    ) {
      return 'iPhone / iPad：使用 Safari＋Userscripts，第一次安裝一次即可。';
    }

    if (
      platform === 'Android'
    ) {
      return 'Android：使用支援 UserScript 的瀏覽器／擴充功能，第一次安裝一次即可。';
    }

    return '電腦：使用 Tampermonkey 安裝一次即可。';
  }

  async function createSession(
    force = false
  ) {
    const account =
      getMemberAccount();

    if (!account) {
      throw new Error(
        '請先登入芯瑤會員帳號'
      );
    }

    if (
      memberAccount !==
      account
    ) {
      memberAccount =
        account;

      clearSavedSession();

      loadSavedSession(
        account
      );
    }

    if (
      !force &&
      sessionToken &&
      sessionExpiresAt >
        Date.now() + 15000
    ) {
      return sessionToken;
    }

    if (
      !force &&
      loadSavedSession(
        account
      )
    ) {
      return sessionToken;
    }

    if (sessionPromise) {
      return sessionPromise;
    }

    sessionPromise =
      (async () => {

        const response =
          await fetch(
            `${WORKER}/session`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json'
              },

              body:
                JSON.stringify({
                  memberAccount:
                    account
                })
            }
          );

        const result =
          await response
            .json()
            .catch(
              () => ({})
            );

        if (
          !response.ok ||
          !result?.ok ||
          !result?.sessionToken
        ) {
          throw new Error(
            result?.message ||
            '會員驗證失敗'
          );
        }

        saveSession(
          account,
          result.sessionToken,
          result.expiresAt
        );

        return sessionToken;

      })();

    try {
      return await sessionPromise;

    } finally {
      sessionPromise = null;
    }
  }

  async function api(
    path,
    options = {},
    retry = true
  ) {
    const token =
      await createSession(
        false
      );

    const headers =
      new Headers(
        options.headers ||
        {}
      );

    headers.set(
      'Authorization',
      `Bearer ${token}`
    );

    const response =
      await fetch(
        `${WORKER}${path}`,
        {
          ...options,
          headers,
          cache: 'no-store'
        }
      );

    if (
      response.status === 401 &&
      retry
    ) {
      clearSavedSession();

      await createSession(
        true
      );

      return api(
        path,
        options,
        false
      );
    }

    const result =
      await response
        .json()
        .catch(
          () => ({})
        );

    if (
      !response.ok ||
      !result?.ok
    ) {
      throw new Error(
        result?.message ||
        result?.error ||
        '連線失敗'
      );
    }

    return result;
  }

  function setLiveStatus(
    text,
    ok = false
  ) {
    const el =
      $('xinyaoLiveStatus');

    if (!el) {
      return;
    }

    el.textContent =
      text;

    if (ok) {
      el.classList.add(
        'ok'
      );
    } else {
      el.classList.remove(
        'ok'
      );
    }
  }

  function renderLiveData(
    data
  ) {
    if (!data) {
      return;
    }

    if (
      $('xinyaoLiveGame')
    ) {
      $('xinyaoLiveGame')
        .textContent =
        'ATG 即時連線';
    }

    if (
      $('xinyaoLiveBalance')
    ) {
      $('xinyaoLiveBalance')
        .textContent =
        money(
          data.balance
        );
    }

    if (
      $('xinyaoLiveBet')
    ) {
      $('xinyaoLiveBet')
        .textContent =
        money(
          data.stake
        );
    }

    if (
      $('xinyaoLivePayout')
    ) {
      $('xinyaoLivePayout')
        .textContent =
        money(
          data.latestPayout
        );
    }

    if (
      $('xinyaoLiveMaxPayout')
    ) {
      $('xinyaoLiveMaxPayout')
        .textContent =
        money(
          data.maxPayout
        );
    }

    const freeCount =
      Math.max(
        0,
        Number(
          data.freeGameCount ||
          0
        )
      );

    if (
      $('xinyaoLiveFreeGame')
    ) {
      $('xinyaoLiveFreeGame')
        .textContent =
        (
          data.freeGameActive ||
          freeCount > 0
        )
          ? `進行中｜剩餘 ${freeCount} 次`
          : '目前未進入';
    }

    if (
      $('xinyaoLiveRoundCount')
    ) {
      $('xinyaoLiveRoundCount')
        .textContent =
        `${
          Math.max(
            0,
            Number(
              data.completedSpins ||
              0
            )
          )
        } 轉`;
    }

    if (
      $('xinyaoLiveTime')
    ) {
      $('xinyaoLiveTime')
        .textContent =
        timeText(
          data.updatedAt
        );
    }

    const confirmed =
      $('xinyaoLiveConfirmedRows');

    if (confirmed) {
      confirmed.textContent =
        [
          `目前點數 ${money(data.balance)}`,
          `目前押注 ${money(data.stake)}`,
          `最新派彩 ${money(data.latestPayout)}`,

          (
            data.freeGameActive ||
            freeCount > 0
          )
            ? `免費遊戲剩餘 ${freeCount} 次`
            : '目前未進行免費遊戲'

        ].join('｜');
    }

    const currentBalance =
      $('currentBalance');

    if (
      currentBalance &&
      Number.isFinite(
        Number(
          data.balance
        )
      )
    ) {
      currentBalance.value =
        Number(
          data.balance
        ).toFixed(2);
    }

    const maxWin =
      $('maxWin');

    if (
      maxWin &&
      Number.isFinite(
        Number(
          data.maxPayout
        )
      )
    ) {
      maxWin.value =
        Number(
          data.maxPayout
        ).toFixed(2);
    }

    const freeGameCount =
      $('freeGameCount');

    if (freeGameCount) {
      freeGameCount.value =
        String(
          freeCount
        );
    }

    const age =
      Date.now() -
      Number(
        data.updatedAt ||
        0
      );

    setLiveStatus(
      age < 30000
        ? '雲端即時接收中'
        : '資料暫停更新',

      age < 30000
    );
  }

  function pairCountdownText() {
    if (
      !pairCode ||
      !pairExpiresAt
    ) {
      return '';
    }

    const remain =
      Math.max(
        0,
        Math.ceil(
          (
            pairExpiresAt -
            Date.now()
          ) / 1000
        )
      );

    const min =
      Math.floor(
        remain / 60
      );

    const sec =
      remain % 60;

    return (
      `有效時間 ${min}:${
        String(sec)
          .padStart(
            2,
            '0'
          )
      }`
    );
  }

  function ensureBox() {
    const card =
      $('xinyaoLiveDataPanel');

    if (!card) {
      return null;
    }

    const old =
      $('xinyaoCloudSyncBox');

    if (old) {
      old.remove();
    }

    let box =
      $('xinyaoDeviceConnectV2');

    if (box) {
      return box;
    }

    box =
      document.createElement(
        'div'
      );

    box.id =
      'xinyaoDeviceConnectV2';

    box.style.cssText =
      'margin:12px 0 14px;padding:14px;border-radius:16px;background:#fff7fb;border:1px solid #ffd7e8;';

    const head =
      card.querySelector(
        '.atg-live-head'
      );

    if (
      head?.nextSibling
    ) {
      card.insertBefore(
        box,
        head.nextSibling
      );
    } else {
      card.prepend(
        box
      );
    }

    return box;
  }

  function normalizeGuidePlatform(value) {
    if (value === 'iOS') return 'ios';
    if (value === 'Android') return 'android';
    return 'desktop';
  }

  function guideMeta(platformKey) {
    const map = {
      desktop: {
        title: '💻 電腦安裝教學',
        subtitle: 'Chrome＋Tampermonkey｜共 5 步，一面一個步驟'
      },
      ios: {
        title: '📱 iPhone / iPad 安裝教學',
        subtitle: 'Safari＋Userscripts｜共 6 步，一面一個步驟'
      },
      android: {
        title: '🤖 Android 安裝教學',
        subtitle: '請依圖片步驟完成安裝與設定',
        image: GUIDE_IMAGES.android,
        button: '開啟共用程式'
      }
    };

    return map[platformKey] || map.desktop;
  }

  async function copyTextWithFallback(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.focus();
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
      } catch (_) {
        return false;
      }
    }
  }

  function openInstallGuide(
    initialPlatform = detectPlatform()
  ) {
    const existing =
      $('xinyaoInstallGuideV3');

    if (existing) {
      existing.remove();
    }

    let activePlatform =
      normalizeGuidePlatform(
        initialPlatform
      );

    let desktopStepIndex = 0;
    let iosStepIndex = 0;

    const modal =
      document.createElement(
        'div'
      );

    modal.id =
      'xinyaoInstallGuideV3';

    modal.style.cssText = `
      position:fixed;
      inset:0;
      z-index:2147483647;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:14px;
      box-sizing:border-box;
      background:rgba(45,30,40,.52);
      backdrop-filter:blur(7px);
      -webkit-backdrop-filter:blur(7px);
    `;

    modal.innerHTML = `
      <div
        id="xinyaoGuideDialog"
        role="dialog"
        aria-modal="true"
        aria-label="芯瑤安裝教學"
        style="
          width:min(620px,100%);
          max-height:94vh;
          display:flex;
          flex-direction:column;
          overflow:hidden;
          box-sizing:border-box;
          border-radius:22px;
          background:#fff;
          color:#594750;
          box-shadow:0 18px 55px rgba(0,0,0,.22);
          font-family:-apple-system,BlinkMacSystemFont,'PingFang TC',sans-serif;
        "
      >
        <div style="padding:16px 16px 0;">
          <div
            style="
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:12px;
            "
          >
            <div>
              <div
                id="xinyaoGuideTitle"
                style="
                  font-size:19px;
                  font-weight:900;
                  color:#d94c89;
                "
              ></div>

              <div
                id="xinyaoGuideSubtitle"
                style="
                  margin-top:3px;
                  font-size:11px;
                  line-height:1.5;
                  color:#95858c;
                "
              ></div>
            </div>

            <button
              id="xinyaoCloseInstallGuide"
              type="button"
              aria-label="關閉"
              style="
                flex:0 0 auto;
                width:36px;
                height:36px;
                border:0;
                border-radius:50%;
                background:#fff0f6;
                color:#d94c89;
                font-size:20px;
                cursor:pointer;
              "
            >
              ×
            </button>
          </div>

          <div
            style="
              display:grid;
              grid-template-columns:repeat(3,1fr);
              gap:7px;
              margin-top:14px;
            "
          >
            <button class="xinyaoGuideTab" data-platform="desktop" type="button">💻 電腦</button>
            <button class="xinyaoGuideTab" data-platform="ios" type="button">🍎 iOS</button>
            <button class="xinyaoGuideTab" data-platform="android" type="button">🤖 Android</button>
          </div>
        </div>

        <div
          id="xinyaoGuideScroll"
          style="
            flex:1 1 auto;
            min-height:0;
            overflow:auto;
            padding:12px 16px 16px;
            -webkit-overflow-scrolling:touch;
          "
        >
          <div id="xinyaoGuideBody"></div>
        </div>
      </div>
    `;

    document.body.appendChild(
      modal
    );

    const tabs =
      Array.from(
        modal.querySelectorAll(
          '.xinyaoGuideTab'
        )
      );

    tabs.forEach(tab => {
      tab.style.cssText = `
        border:1px solid #f3c1d5;
        border-radius:12px;
        padding:9px 5px;
        background:#fff;
        color:#d94c89;
        font-size:12px;
        font-weight:900;
        cursor:pointer;
      `;
    });

    const renderDesktopStep = () => {
      const body =
        $('xinyaoGuideBody');

      if (!body) return;

      const step =
        DESKTOP_GUIDE_STEPS[
          desktopStepIndex
        ];

      const total =
        DESKTOP_GUIDE_STEPS.length;

      const imageHtml =
        step.images
          .map((src, index) => `
            <div
              style="
                margin-top:${index === 0 ? 12 : 10}px;
                border:1px solid #ffd5e6;
                border-radius:15px;
                overflow:hidden;
                background:#fff7fb;
              "
            >
              <img
                src="${src}"
                alt="電腦安裝教學第 ${step.stepNumber} 步圖片 ${index + 1}"
                style="
                  display:block;
                  width:100%;
                  height:auto;
                  background:#fff;
                "
              >
            </div>
          `)
          .join('');

      body.innerHTML = `
        <div
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:10px;
            margin-bottom:10px;
          "
        >
          <div
            id="xinyaoGuideProgress"
            style="
              display:inline-flex;
              align-items:center;
              gap:7px;
              padding:7px 11px;
              border-radius:999px;
              background:#fff0f6;
              color:#d94c89;
              font-size:12px;
              font-weight:900;
            "
          >
            步驟 ${step.stepNumber} / ${total}
          </div>

          <div
            style="
              flex:1;
              height:7px;
              overflow:hidden;
              border-radius:999px;
              background:#ffe5ef;
            "
          >
            <div
              style="
                width:${((desktopStepIndex + 1) / total) * 100}%;
                height:100%;
                border-radius:999px;
                background:#ff5f9e;
                transition:width .2s ease;
              "
            ></div>
          </div>
        </div>

        <div
          style="
            padding:15px;
            border:1px solid #ffd5e6;
            border-radius:16px;
            background:#fff9fc;
          "
        >
          <div
            style="
              font-size:18px;
              font-weight:950;
              line-height:1.45;
              color:#d94c89;
            "
          >
            ${step.stepNumber}. ${step.title}
          </div>

          <div
            style="
              margin-top:10px;
              font-size:13px;
              line-height:1.8;
              color:#604e57;
            "
          >
            ${step.bodyHtml}
          </div>

          ${
            step.copyTampermonkey
              ? `
                <button
                  id="xinyaoCopyTampermonkeyUrl"
                  type="button"
                  style="
                    width:100%;
                    margin-top:12px;
                    padding:12px 14px;
                    border:0;
                    border-radius:12px;
                    background:#ff5f9e;
                    color:#fff;
                    font-size:13px;
                    font-weight:900;
                    cursor:pointer;
                  "
                >
                  📋 複製 Tampermonkey 安裝網址
                </button>

                <div
                  style="
                    margin-top:7px;
                    padding:8px 10px;
                    border-radius:10px;
                    background:#fff;
                    border:1px dashed #f2bfd3;
                    color:#9b7e8a;
                    font-size:10px;
                    line-height:1.5;
                    word-break:break-all;
                  "
                >
                  ${TAMPERMONKEY_URL}
                </div>
              `
              : ''
          }

          ${
            step.openSharedScript
              ? `
                <button
                  id="xinyaoOpenSharedScriptDesktop"
                  type="button"
                  style="
                    width:100%;
                    margin-top:12px;
                    padding:12px 14px;
                    border:0;
                    border-radius:12px;
                    background:#ff5f9e;
                    color:#fff;
                    font-size:13px;
                    font-weight:900;
                    cursor:pointer;
                  "
                >
                  我看完教學｜開啟共用程式
                </button>
              `
              : ''
          }
        </div>

        ${imageHtml}

        <div
          style="
            display:flex;
            gap:9px;
            margin-top:14px;
          "
        >
          <button
            id="xinyaoGuidePrev"
            type="button"
            ${desktopStepIndex === 0 ? 'disabled' : ''}
            style="
              flex:1;
              padding:11px 12px;
              border:1px solid #f2bfd3;
              border-radius:12px;
              background:#fff;
              color:${desktopStepIndex === 0 ? '#c9bcc2' : '#d94c89'};
              font-size:13px;
              font-weight:900;
              cursor:${desktopStepIndex === 0 ? 'default' : 'pointer'};
            "
          >
            ← 上一步
          </button>

          <button
            id="xinyaoGuideNext"
            type="button"
            style="
              flex:1.35;
              padding:11px 12px;
              border:0;
              border-radius:12px;
              background:#ff5f9e;
              color:#fff;
              font-size:13px;
              font-weight:900;
              cursor:pointer;
            "
          >
            ${desktopStepIndex === total - 1 ? '完成教學 ✓' : '下一步 →'}
          </button>
        </div>
      `;

      $('xinyaoCopyTampermonkeyUrl')
        ?.addEventListener(
          'click',
          async event => {
            const button =
              event.currentTarget;

            const ok =
              await copyTextWithFallback(
                TAMPERMONKEY_URL
              );

            button.textContent = ok
              ? '✅ 已複製！請貼到 Chrome 網址列開啟'
              : '請長按下方網址複製';

            setTimeout(
              () => {
                if (
                  document.body.contains(
                    button
                  )
                ) {
                  button.textContent =
                    '📋 複製 Tampermonkey 安裝網址';
                }
              },
              2200
            );
          }
        );

      $('xinyaoOpenSharedScriptDesktop')
        ?.addEventListener(
          'click',
          () => {
            const opened =
              window.open(
                SCRIPT_URL,
                '_blank'
              );

            if (!opened) {
              window.location.href =
                SCRIPT_URL;
            }
          }
        );

      $('xinyaoGuidePrev')
        ?.addEventListener(
          'click',
          () => {
            if (desktopStepIndex <= 0) return;
            desktopStepIndex -= 1;
            renderDesktopStep();
            const scroll = $('xinyaoGuideScroll');
            if (scroll) scroll.scrollTop = 0;
          }
        );

      $('xinyaoGuideNext')
        ?.addEventListener(
          'click',
          () => {
            if (
              desktopStepIndex <
              total - 1
            ) {
              desktopStepIndex += 1;
              renderDesktopStep();
              const scroll = $('xinyaoGuideScroll');
              if (scroll) scroll.scrollTop = 0;
              return;
            }

            modal.remove();
          }
        );
    };

    const renderIOSStep = () => {
      const body =
        $('xinyaoGuideBody');

      if (!body) return;

      const step =
        IOS_GUIDE_STEPS[
          iosStepIndex
        ];

      const total =
        IOS_GUIDE_STEPS.length;

      const imageHtml =
        step.images
          .map((src, index) => `
            <div
              style="
                margin-top:${index === 0 ? 12 : 10}px;
                border:1px solid #ffd5e6;
                border-radius:15px;
                overflow:hidden;
                background:#fff7fb;
              "
            >
              <img
                src="${src}"
                alt="iOS 安裝教學第 ${step.stepNumber} 步圖片 ${index + 1}"
                style="
                  display:block;
                  width:100%;
                  height:auto;
                  background:#fff;
                "
              >
            </div>
          `)
          .join('');

      body.innerHTML = `
        <div
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:10px;
            margin-bottom:10px;
          "
        >
          <div
            style="
              display:inline-flex;
              align-items:center;
              gap:7px;
              padding:7px 11px;
              border-radius:999px;
              background:#fff0f6;
              color:#d94c89;
              font-size:12px;
              font-weight:900;
            "
          >
            步驟 ${step.stepNumber} / ${total}
          </div>

          <div
            style="
              flex:1;
              height:7px;
              overflow:hidden;
              border-radius:999px;
              background:#ffe5ef;
            "
          >
            <div
              style="
                width:${((iosStepIndex + 1) / total) * 100}%;
                height:100%;
                border-radius:999px;
                background:#ff5f9e;
                transition:width .2s ease;
              "
            ></div>
          </div>
        </div>

        <div
          style="
            padding:15px;
            border:1px solid #ffd5e6;
            border-radius:16px;
            background:#fff9fc;
          "
        >
          <div
            style="
              font-size:18px;
              font-weight:950;
              line-height:1.45;
              color:#d94c89;
            "
          >
            ${step.stepNumber}. ${step.title}
          </div>

          <div
            style="
              margin-top:10px;
              font-size:13px;
              line-height:1.8;
              color:#604e57;
            "
          >
            ${step.bodyHtml}
          </div>

          ${
            step.openUserscriptsAppStore
              ? `
                <button
                  id="xinyaoOpenUserscriptsAppStore"
                  type="button"
                  style="
                    width:100%;
                    margin-top:12px;
                    padding:12px 14px;
                    border:0;
                    border-radius:12px;
                    background:#ff5f9e;
                    color:#fff;
                    font-size:13px;
                    font-weight:900;
                    cursor:pointer;
                  "
                >
                  📱 前往 App Store 安裝 Userscripts
                </button>
              `
              : ''
          }

          ${
            step.openSharedScript
              ? `
                <button
                  id="xinyaoOpenSharedScriptIOS"
                  type="button"
                  style="
                    width:100%;
                    margin-top:12px;
                    padding:12px 14px;
                    border:0;
                    border-radius:12px;
                    background:#ff5f9e;
                    color:#fff;
                    font-size:13px;
                    font-weight:900;
                    cursor:pointer;
                  "
                >
                  我看完教學｜開啟共用程式
                </button>
              `
              : ''
          }
        </div>

        ${imageHtml}

        <div
          style="
            display:flex;
            gap:9px;
            margin-top:14px;
          "
        >
          <button
            id="xinyaoIOSGuidePrev"
            type="button"
            ${iosStepIndex === 0 ? 'disabled' : ''}
            style="
              flex:1;
              padding:11px 12px;
              border:1px solid #f2bfd3;
              border-radius:12px;
              background:#fff;
              color:${iosStepIndex === 0 ? '#c9bcc2' : '#d94c89'};
              font-size:13px;
              font-weight:900;
              cursor:${iosStepIndex === 0 ? 'default' : 'pointer'};
            "
          >
            ← 上一步
          </button>

          <button
            id="xinyaoIOSGuideNext"
            type="button"
            style="
              flex:1.35;
              padding:11px 12px;
              border:0;
              border-radius:12px;
              background:#ff5f9e;
              color:#fff;
              font-size:13px;
              font-weight:900;
              cursor:pointer;
            "
          >
            ${iosStepIndex === total - 1 ? '完成教學 ✓' : '下一步 →'}
          </button>
        </div>
      `;

      $('xinyaoOpenUserscriptsAppStore')
        ?.addEventListener(
          'click',
          () => {
            const opened =
              window.open(
                USERSCRIPTS_APP_STORE_URL,
                '_blank'
              );

            if (!opened) {
              window.location.href =
                USERSCRIPTS_APP_STORE_URL;
            }
          }
        );

      $('xinyaoOpenSharedScriptIOS')
        ?.addEventListener(
          'click',
          () => {
            const opened =
              window.open(
                SCRIPT_URL,
                '_blank'
              );

            if (!opened) {
              window.location.href =
                SCRIPT_URL;
            }
          }
        );

      $('xinyaoIOSGuidePrev')
        ?.addEventListener(
          'click',
          () => {
            if (iosStepIndex <= 0) return;
            iosStepIndex -= 1;
            renderIOSStep();
            const scroll = $('xinyaoGuideScroll');
            if (scroll) scroll.scrollTop = 0;
          }
        );

      $('xinyaoIOSGuideNext')
        ?.addEventListener(
          'click',
          () => {
            if (
              iosStepIndex <
              total - 1
            ) {
              iosStepIndex += 1;
              renderIOSStep();
              const scroll = $('xinyaoGuideScroll');
              if (scroll) scroll.scrollTop = 0;
              return;
            }

            modal.remove();
          }
        );
    };

    const renderSimpleGuide = () => {
      const meta =
        guideMeta(
          activePlatform
        );

      const body =
        $('xinyaoGuideBody');

      if (!body) return;

      body.innerHTML = `
        <div
          style="
            border:1px solid #ffd5e6;
            border-radius:16px;
            overflow:hidden;
            background:#fff7fb;
          "
        >
          <img
            src="${meta.image}"
            alt="${meta.title}"
            style="
              display:block;
              width:100%;
              height:auto;
              background:#fff7fb;
            "
          >
        </div>

        <div
          style="
            margin-top:10px;
            padding:10px 12px;
            border-radius:13px;
            background:#fff7fb;
            border:1px solid #ffe0ec;
            font-size:11px;
            line-height:1.6;
            color:#8b7780;
          "
        >
          第一次設定完成後不用重複安裝。之後直接開啟 ATG 即可。
          如要換手機或換電腦，回到芯瑤按「更換裝置」重新綁定即可。
        </div>

        <button
          id="xinyaoOpenSharedScript"
          type="button"
          style="
            width:100%;
            margin-top:12px;
            padding:13px 15px;
            border:0;
            border-radius:14px;
            background:#ff5f9e;
            color:#fff;
            font-size:14px;
            font-weight:900;
            cursor:pointer;
          "
        >
          我看完教學｜${meta.button}
        </button>
      `;

      $('xinyaoOpenSharedScript')
        ?.addEventListener(
          'click',
          () => {
            const opened =
              window.open(
                SCRIPT_URL,
                '_blank'
              );

            if (!opened) {
              window.location.href =
                SCRIPT_URL;
            }
          }
        );
    };

    const renderGuide = () => {
      const meta =
        guideMeta(
          activePlatform
        );

      const title =
        $('xinyaoGuideTitle');

      const subtitle =
        $('xinyaoGuideSubtitle');

      if (title) {
        title.textContent =
          meta.title;
      }

      if (subtitle) {
        subtitle.textContent =
          meta.subtitle;
      }

      tabs.forEach(tab => {
        const selected =
          tab.dataset.platform ===
          activePlatform;

        tab.style.background =
          selected
            ? '#ff5f9e'
            : '#fff';

        tab.style.color =
          selected
            ? '#fff'
            : '#d94c89';

        tab.style.borderColor =
          selected
            ? '#ff5f9e'
            : '#f3c1d5';
      });

      const scroll =
        $('xinyaoGuideScroll');

      if (scroll) {
        scroll.scrollTop = 0;
      }

      if (
        activePlatform ===
        'desktop'
      ) {
        renderDesktopStep();
      } else if (
        activePlatform ===
        'ios'
      ) {
        renderIOSStep();
      } else {
        renderSimpleGuide();
      }
    };

    tabs.forEach(tab => {
      tab.addEventListener(
        'click',
        () => {
          activePlatform =
            tab.dataset.platform ||
            'desktop';

          if (activePlatform === 'desktop') {
            desktopStepIndex = 0;
          }

          if (activePlatform === 'ios') {
            iosStepIndex = 0;
          }

          renderGuide();
        }
      );
    });

    $('xinyaoCloseInstallGuide')
      ?.addEventListener(
        'click',
        () => modal.remove()
      );

    modal.addEventListener(
      'click',
      event => {
        if (event.target === modal) {
          modal.remove();
        }
      }
    );

    renderGuide();
  }

  function renderConnectBox(
    status = {}
  ) {
    const box =
      ensureBox();

    if (!box) {
      return;
    }

    const bound =
      Boolean(
        status.bound
      );

    const device =
      status.device ||
      null;

    box.innerHTML = `
      <div
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
        "
      >
        <div>
          <div
            style="
              font-weight:900;
              color:#d94c89;
              font-size:15px;
            "
          >
            🔗 連接此裝置
          </div>

          <div
            style="
              font-size:11px;
              color:#817782;
              line-height:1.55;
              margin-top:4px;
            "
          >
            ${installHint()}
          </div>
        </div>

        <span
          style="
            font-size:11px;
            font-weight:800;
            padding:6px 9px;
            border-radius:999px;
            background:${
              bound
                ? '#e9fff1'
                : '#fff0f6'
            };
            color:${
              bound
                ? '#219653'
                : '#d94c89'
            };
          "
        >
          ${
            bound
              ? '已綁定'
              : '尚未綁定'
          }
        </span>
      </div>

      ${
        bound
          ? `
            <div
              style="
                margin-top:10px;
                padding:10px;
                border-radius:12px;
                background:white;
                border:1px solid #f4d5e2;
                font-size:12px;
                color:#6e5963;
                line-height:1.6;
              "
            >
              目前裝置：
              <b>
                ${
                  device?.deviceName ||
                  '已綁定裝置'
                }
              </b>

              ${
                device?.platform
                  ? `｜${device.platform}`
                  : ''
              }

              <br>

              如要換手機或換電腦，
              直接按「更換裝置」，
              新裝置會自動取代舊裝置。
            </div>
          `
          : ''
      }

      ${
        pairCode
          ? `
            <div
              style="
                margin-top:11px;
                padding:12px;
                border-radius:14px;
                background:white;
                border:1px solid #f2bfd3;
                text-align:center;
              "
            >
              <div
                style="
                  font-size:11px;
                  color:#8a7880;
                "
              >
                請到 ATG 畫面的
                「芯瑤 ATG 即時助手」
                輸入這組配對碼
              </div>

              <div
                style="
                  font-size:28px;
                  font-weight:1000;
                  letter-spacing:4px;
                  color:#d94c89;
                  margin:6px 0;
                "
              >
                ${pairCode}
              </div>

              <div
                id="xinyaoPairCountdown"
                style="
                  font-size:10px;
                  color:#9b8b92;
                "
              >
                ${pairCountdownText()}
              </div>

              <button
                id="xinyaoCopyPairCode"
                type="button"
                style="
                  margin-top:8px;
                  border:0;
                  border-radius:10px;
                  padding:8px 12px;
                  background:#fff0f6;
                  color:#d94c89;
                  font-weight:900;
                  cursor:pointer;
                "
              >
                複製配對碼
              </button>
            </div>
          `
          : ''
      }

      <div
        style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-top:11px;
        "
      >
        <a
          id="xinyaoInstallProgramV2"
          href="${SCRIPT_URL}"
          target="_blank"
          rel="noopener noreferrer"
          style="
            text-decoration:none;
            border-radius:11px;
            padding:9px 12px;
            background:#ffffff;
            border:1px solid #f2bfd3;
            color:#d94c89;
            font-size:12px;
            font-weight:900;
          "
        >
          ① 安裝共用程式／查看教學
        </a>

        <button
          id="xinyaoStartPairV2"
          type="button"
          style="
            border:0;
            border-radius:11px;
            padding:9px 12px;
            background:#ff5f9e;
            color:white;
            font-size:12px;
            font-weight:900;
            cursor:pointer;
          "
        >
          ${
            bound
              ? '② 更換裝置'
              : '② 產生配對碼'
          }
        </button>
      </div>

      <div
        id="xinyaoDeviceHintV2"
        style="
          margin-top:8px;
          font-size:11px;
          color:#968a91;
          line-height:1.55;
        "
      >
        ${
          bound
            ? '這個會員帳號目前已綁定一台裝置。'
            : '先安裝一次共用程式，再產生配對碼；之後不需要重複設定。'
        }
      </div>
    `;

    $('xinyaoStartPairV2')
      ?.addEventListener(
        'click',
        startPairing
      );

    $('xinyaoCopyPairCode')
      ?.addEventListener(
        'click',
        copyPairCode
      );

    $('xinyaoInstallProgramV2')
      ?.addEventListener(
        'click',
        event => {
          event.preventDefault();
          event.stopPropagation();

          openInstallGuide(
            detectPlatform()
          );
        }
      );
  }

  async function copyPairCode() {
    if (!pairCode) {
      return;
    }

    try {
      await navigator
        .clipboard
        .writeText(
          pairCode
        );

      const btn =
        $('xinyaoCopyPairCode');

      if (btn) {
        btn.textContent =
          '已複製 ✓';

        setTimeout(
          () => {
            if (btn) {
              btn.textContent =
                '複製配對碼';
            }
          },
          1300
        );
      }

    } catch (_) {
      prompt(
        '請複製配對碼：',
        pairCode
      );
    }
  }

  async function startPairing() {
    const button =
      $('xinyaoStartPairV2');

    const hint =
      $('xinyaoDeviceHintV2');

    if (button) {
      button.disabled =
        true;
    }

    if (hint) {
      hint.textContent =
        '正在產生配對碼…';
    }

    try {
      const result =
        await api(
          '/pair/start',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            }
          }
        );

      pairCode =
        String(
          result.pairCode ||
          ''
        );

      pairExpiresAt =
        Number(
          result.expiresAt ||
          0
        );

      const status =
        await api(
          '/device/status',
          {
            method: 'GET'
          }
        );

      renderConnectBox(
        status
      );

    } catch (error) {
      if (hint) {
        hint.textContent =
          error?.message ||
          '產生配對碼失敗';
      }

    } finally {
      if (button) {
        button.disabled =
          false;
      }
    }
  }

  async function pollMemberLive() {
    if (pollBusy) {
      return;
    }

    const account =
      getMemberAccount();

    if (!account) {
      memberAccount = '';

      clearSavedSession();

      pairCode = '';
      pairExpiresAt = 0;

      return;
    }

    pollBusy = true;

    try {
      const status =
        await api(
          '/device/status',
          {
            method: 'GET'
          }
        );

      if (
        status.bound &&
        !lastBoundState &&
        pairCode
      ) {
        pairCode = '';
        pairExpiresAt = 0;
      }

      lastBoundState =
        Boolean(
          status.bound
        );

      renderConnectBox(
        status
      );

      if (status.bound) {
        const latest =
          await api(
            '/latest',
            {
              method: 'GET'
            }
          );

        if (
          latest.found &&
          latest.data
        ) {
          renderLiveData(
            latest.data
          );
        } else {
          setLiveStatus(
            '等待 ATG 遊戲資料'
          );
        }

      } else {
        setLiveStatus(
          '等待裝置連接'
        );
      }

    } catch (error) {
      const box =
        ensureBox();

      if (box) {
        renderConnectBox({
          bound: false
        });

        const hint =
          $('xinyaoDeviceHintV2');

        if (hint) {
          hint.textContent =
            error?.message ||
            '暫時無法連線，系統會自動重試。';
        }
      }

      setLiveStatus(
        '雲端連線失敗'
      );

    } finally {
      pollBusy = false;
    }
  }

  function tickCountdown() {
    const el =
      $('xinyaoPairCountdown');

    if (!el) {
      return;
    }

    if (
      !pairCode ||
      !pairExpiresAt ||
      pairExpiresAt <=
        Date.now()
    ) {
      pairCode = '';
      pairExpiresAt = 0;

      pollMemberLive();

      return;
    }

    el.textContent =
      pairCountdownText();
  }

  function start() {
    try {
      localStorage.removeItem(
        'xinyao_atg_cloud_channel'
      );
    } catch (_) {}

    ensureBox();

    pollMemberLive();

    setInterval(
      pollMemberLive,
      2000
    );

    setInterval(
      tickCountdown,
      1000
    );

    const refresh =
      $('xinyaoLiveRefresh');

    if (refresh) {
      refresh.textContent =
        '重新同步會員資料';

      refresh.addEventListener(
        'click',
        pollMemberLive
      );
    }
  }

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      start,
      {
        once: true
      }
    );

  } else {
    start();
  }
})();
