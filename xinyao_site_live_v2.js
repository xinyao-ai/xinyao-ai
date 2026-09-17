(() => {
  'use strict';

  if (window.__XIANYAO_SITE_LIVE_V2__) return;
  window.__XIANYAO_SITE_LIVE_V2__ = true;

  const WORKER =
    'https://xinyao-atg-live.love06130430.workers.dev';

  const SCRIPT_URL =
    'https://xinyao-ai.github.io/xinyao-ai/xinyao_ATG_live.user.js?v=200';

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
          ① 安裝共用程式
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
