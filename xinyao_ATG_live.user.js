// ==UserScript==
// @name         賽特神諭｜ATG 即時助手（賽特1＋賽特2＋虎小妹）
// @namespace    xinyao-atg-live-v4-hud-test
// @version      4.1.35
// @description  單檔三遊戲：賽特一代與賽特二、虎小妹共用自動掃描與進房流程，賽特二及虎小妹原版維持。
// @match        https://play.godeebxp.com/*
// @run-at       document-start
// @inject-into  page
// @weight       999
// @updateURL    https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/main/xinyao_ATG_live.user.js
// @downloadURL  https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/main/xinyao_ATG_live.user.js
// @grant        none
// ==/UserScript==




// ===== test135：皇鼎來源限制（不碰掃描核心） =====
const XIANYAO_HD_SESSION_KEY = 'xinyao_atg_hd_access_v1';
const XIANYAO_HD_BLOCK_KEY = 'xinyao_atg_hd_block_v1';
const XIANYAO_HD_ONLY_CACHE_KEY = 'xinyao_atg_hd_only_remote_v1';
const XIANYAO_HD_CONTROL_ENDPOINT = 'https://xinyao-atg-live.love06130430.workers.dev/maintenance';
const XIANYAO_HD_ONLY_MARK_RE = /\[\[XIANYAO_HD_ONLY=(0|1)\]\]/i;
const XIANYAO_HD_ALLOWED_HOSTS = ['hd5577.com'];

function xinyaoHdOnlyFromMessage(message) {
  const match = String(message || '').match(XIANYAO_HD_ONLY_MARK_RE);
  if (!match) return true;
  return match[1] !== '0';
}

function xinyaoLoadRemoteHdOnly() {
  try {
    const raw = localStorage.getItem(XIANYAO_HD_ONLY_CACHE_KEY);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch (_) {}
  return true;
}

function xinyaoSaveRemoteHdOnly(enabled) {
  try { localStorage.setItem(XIANYAO_HD_ONLY_CACHE_KEY, enabled ? '1' : '0'); } catch (_) {}
}

async function xinyaoSyncRemoteHdOnly() {
  try {
    const response = await fetch(`${XIANYAO_HD_CONTROL_ENDPOINT}?t=${Date.now()}`, {
      method:'GET',
      cache:'no-store',
      credentials:'omit'
    });
    if (!response.ok) return;
    const data = await response.json();
    if (!data?.ok) return;

    const next = xinyaoHdOnlyFromMessage(data.message);
    const current = xinyaoLoadRemoteHdOnly();

    if (next !== current) {
      xinyaoSaveRemoteHdOnly(next);
      try {
        sessionStorage.setItem('xinyao_atg_hd_only_reload_v1', String(Date.now()));
      } catch (_) {}
      location.reload();
      return;
    }

    try {
      window.__XIANYAO_HD_ONLY_ENABLED__ = next;
    } catch (_) {}
  } catch (_) {}
}

function xinyaoIsHuangDingHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return XIANYAO_HD_ALLOWED_HOSTS.some(base => host === base || host.endsWith(`.${base}`));
}

function xinyaoResolveHuangDingAccess() {
  let refHost = '';
  try {
    if (document.referrer) refHost = new URL(document.referrer).hostname;
  } catch (_) {}

  const currentHost = String(location.hostname || '').toLowerCase();
  const externalReferrer = Boolean(refHost && refHost !== currentHost);

  // test142：會員頁先選遊戲，再經皇鼎轉進 ATG 時，中間轉址可能讓 document.referrer
  // 不再是 hd5577.com。此時改用同一分頁 window.name 的短效接力標記確認來源流程。
  try {
    const launch = String(window.name || '').match(/^xinyao-hd-launch:(seth|tiger|seth1|baphomet|vampire|wuxia|scarlet):(\d+):([a-z0-9]+)$/i);
    if (launch) {
      const launchedAt = Number(launch[2] || 0);
      const fresh = Number.isFinite(launchedAt) && launchedAt > 0 &&
        Math.abs(Date.now() - launchedAt) <= 10 * 60 * 1000;
      if (fresh) {
        sessionStorage.setItem(XIANYAO_HD_SESSION_KEY, JSON.stringify({
          ok:true,
          source:'xinyao-member-launcher',
          game:String(launch[1] || '').toLowerCase(),
          at:Date.now()
        }));
        sessionStorage.removeItem(XIANYAO_HD_BLOCK_KEY);
        return true;
      }
    }

    // 相容 test141 已經留下的舊標記，升級後第一次仍可順利進入。
    const legacy = String(window.name || '').match(/^xinyao-game:(seth|tiger)$/i);
    if (legacy) {
      sessionStorage.setItem(XIANYAO_HD_SESSION_KEY, JSON.stringify({
        ok:true,
        source:'xinyao-member-launcher-legacy',
        game:String(legacy[1] || '').toLowerCase(),
        at:Date.now()
      }));
      sessionStorage.removeItem(XIANYAO_HD_BLOCK_KEY);
      return true;
    }
  } catch (_) {}

  // 從皇鼎頁面正式開啟 ATG：建立 / 更新本分頁授權，並解除「本次其他來源停用」標記。
  if (xinyaoIsHuangDingHost(refHost)) {
    try {
      sessionStorage.setItem(XIANYAO_HD_SESSION_KEY, JSON.stringify({
        ok:true,
        source:refHost,
        at:Date.now()
      }));
      sessionStorage.removeItem(XIANYAO_HD_BLOCK_KEY);
    } catch (_) {}
    return true;
  }

  // 從其他外部網站導入 ATG：這一次不允許使用，但「不刪掉」原本皇鼎授權。
  // 另外留下 block 標記，避免使用者在被擋的 ATG 頁面重新整理後，又因舊授權被放行。
  // 之後只要重新從皇鼎平台進入，就會自動解除 block 並恢復使用。
  if (externalReferrer) {
    try {
      sessionStorage.setItem(XIANYAO_HD_BLOCK_KEY, JSON.stringify({
        blocked:true,
        source:refHost,
        at:Date.now()
      }));
    } catch (_) {}
    return false;
  }

  // 如果本分頁目前是「其他來源導入」狀態，即使重新整理也維持停用；
  // 但原本皇鼎授權仍然保留，等下一次從皇鼎正式進入再解除。
  try {
    const blockedRaw = sessionStorage.getItem(XIANYAO_HD_BLOCK_KEY);
    if (blockedRaw) {
      const blocked = JSON.parse(blockedRaw);
      if (blocked?.blocked) return false;
    }
  } catch (_) {}

  // ATG 內部換房 / 重新載入通常沒有外部 referrer；沿用同一分頁的皇鼎授權。
  try {
    const raw = sessionStorage.getItem(XIANYAO_HD_SESSION_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved?.ok) return false;
    // 最長保留 12 小時，避免分頁長期殘留授權。
    if (Date.now() - Number(saved.at || 0) > 12 * 60 * 60 * 1000) {
      sessionStorage.removeItem(XIANYAO_HD_SESSION_KEY);
      return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

const XIANYAO_HD_ONLY_ENABLED = xinyaoLoadRemoteHdOnly();
const XIANYAO_HD_ACCESS_ALLOWED =
  ['egyptian-mythology','hades','new-vampire-hunter','wuxia-caishen','scarlet-three-kingdoms'].includes(new URL(location.href).searchParams.get('gn'))
  || !XIANYAO_HD_ONLY_ENABLED || xinyaoResolveHuangDingAccess();

try {
  window.__XIANYAO_HD_ONLY_ENABLED__ = XIANYAO_HD_ONLY_ENABLED;
  window.__XIANYAO_HD_ACCESS_ALLOWED__ = XIANYAO_HD_ACCESS_ALLOWED;
} catch (_) {}

xinyaoSyncRemoteHdOnly();
setInterval(xinyaoSyncRemoteHdOnly, 10000);

function xinyaoRenderHuangDingOnlyNotice() {
  const apply = () => {
    if (!document.body) return false;
    let notice = document.getElementById('xinyao-hd-only-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'xinyao-hd-only-notice';
      notice.style.cssText = [
        'position:fixed','inset:0','z-index:2147483647',
        'display:flex','align-items:center','justify-content:center',
        'background:rgba(10,8,14,.82)','backdrop-filter:blur(8px)',
        '-webkit-backdrop-filter:blur(8px)','font-family:-apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif'
      ].join(';');
      notice.innerHTML = `
        <div style="width:min(360px,calc(100vw - 32px));box-sizing:border-box;padding:22px 20px;border:1px solid rgba(255,150,195,.5);border-radius:18px;background:rgba(30,22,35,.97);color:#fff;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.45);">
          <div style="font-size:18px;font-weight:900;color:#ff9bc3;">🌸 芯瑤 ATG</div>
          <div style="margin-top:10px;font-size:14px;font-weight:800;">僅限皇鼎娛樂城使用</div>
          <div style="margin-top:7px;font-size:11px;line-height:1.6;opacity:.76;">請由皇鼎平台進入 ATG 遊戲後再使用本輔助程式。</div>
        </div>`;
      document.body.appendChild(notice);
    }
    return true;
  };
  if (!apply()) document.addEventListener('DOMContentLoaded', apply, { once:true });
}

if (!XIANYAO_HD_ACCESS_ALLOWED) xinyaoRenderHuangDingOnlyNotice();

if (XIANYAO_HD_ACCESS_ALLOWED) {

// ===== test140：全域遊戲模式（掃描共用；盤面監測 / 進房分流） =====
const XIANYAO_GAME_MODULE_KEY = 'xinyao_atg_active_game_module_v1';
const XIANYAO_GAME_MODULES = Object.freeze({
  scarlet:{ id:'scarlet', label:'赤三國', shortLabel:'赤三國', icon:'🔥' },
  wuxia:{ id:'wuxia', label:'武俠', shortLabel:'武俠', icon:'⚔️' },
  vampire:{ id:'vampire', label:'惡魔血域', shortLabel:'血域', icon:'🦇' },
  baphomet:{ id:'baphomet', label:'古神巴風特', shortLabel:'巴風特', icon:'🔥' },
  seth1:{ id:'seth1', label:'戰神賽特1', shortLabel:'賽特1', icon:'👁️' },
  seth: { id:'seth', label:'戰神賽特2', shortLabel:'賽特2', icon:'👁️' },
  tiger:{ id:'tiger', label:'虎小妹', shortLabel:'虎小妹', icon:'🐯' }
});

function xinyaoNormalizeGameModule(value) {
  const id = String(value || '').toLowerCase();
  return XIANYAO_GAME_MODULES[id] ? id : '';
}

function xinyaoLoadActiveGameModule() {
  if (new URL(location.href).searchParams.get('gn') === 'scarlet-three-kingdoms') return 'scarlet';
  if (new URL(location.href).searchParams.get('gn') === 'wuxia-caishen') return 'wuxia';
  if (new URL(location.href).searchParams.get('gn') === 'new-vampire-hunter') return 'vampire';
  if (new URL(location.href).searchParams.get('gn') === 'hades') return 'baphomet';
  if (new URL(location.href).searchParams.get('gn') === 'egyptian-mythology') return 'seth1';
  // 從芯瑤會員頁點遊戲進皇鼎時，會員頁會把選擇寫在同一 browsing context 的 window.name。
  // 優先使用這個入口標記，再保存到 ATG 自己的 localStorage，確保進房重載後仍維持同一遊戲機制。
  try {
    const launchName = String(window.name || '');
    const launchMatch =
      launchName.match(/^xinyao-hd-launch:(seth|tiger):\d+:[a-z0-9]+$/i) ||
      launchName.match(/^xinyao-game:(seth|tiger)$/i);
    const launched = xinyaoNormalizeGameModule(launchMatch?.[1] || '');
    if (launched) {
      try { localStorage.setItem(XIANYAO_GAME_MODULE_KEY, launched); } catch (_) {}
      return launched;
    }
  } catch (_) {}

  try {
    const saved = xinyaoNormalizeGameModule(localStorage.getItem(XIANYAO_GAME_MODULE_KEY));
    if (saved) return saved;
  } catch (_) {}

  // 沒有入口紀錄時維持 test137 已驗證的賽特2穩定路徑。
  return 'seth';
}

function xinyaoActiveGameModule() {
  if (new URL(location.href).searchParams.get('gn') === 'scarlet-three-kingdoms') return 'scarlet';
  if (new URL(location.href).searchParams.get('gn') === 'wuxia-caishen') return 'wuxia';
  if (new URL(location.href).searchParams.get('gn') === 'new-vampire-hunter') return 'vampire';
  if (new URL(location.href).searchParams.get('gn') === 'hades') return 'baphomet';
  if (new URL(location.href).searchParams.get('gn') === 'egyptian-mythology') return 'seth1';
  const live = xinyaoNormalizeGameModule(window.__XIANYAO_ATG_ACTIVE_GAME_MODULE__);
  return live || xinyaoLoadActiveGameModule();
}

function xinyaoSetActiveGameModule(value, source = 'ui') {
  const id = xinyaoNormalizeGameModule(value);
  if (!id) return '';
  const previous = xinyaoActiveGameModule();
  try { localStorage.setItem(XIANYAO_GAME_MODULE_KEY, id); } catch (_) {}
  try { window.__XIANYAO_ATG_ACTIVE_GAME_MODULE__ = id; } catch (_) {}
  if (previous !== id) {
    try {
      window.dispatchEvent(new CustomEvent('xinyao:game-module-changed', {
        detail:{ profile:id, source:String(source || 'ui') }
      }));
    } catch (_) {}
  }
  return id;
}

try { window.__XIANYAO_ATG_ACTIVE_GAME_MODULE__ = xinyaoLoadActiveGameModule(); } catch (_) {}

// ===== 芯瑤 ATG 全域維護控制 =====
const XIANYAO_MAINTENANCE_ENDPOINT = 'https://xinyao-atg-live.love06130430.workers.dev/maintenance';
window.__XIANYAO_MAINTENANCE_STATE__ = window.__XIANYAO_MAINTENANCE_STATE__ || {
  enabled: false,
  message: '',
  updatedAt: null
};

function xinyaoMaintenanceMessage(state) {
  return String(state?.message || '芯瑤 ATG 系統升級維護中，完成後將立即開放使用。')
    .replace(XIANYAO_HD_ONLY_MARK_RE, '')
    .trim();
}

function xinyaoRenderMaintenance(state) {
  const enabled = Boolean(state?.enabled);
  const apply = () => {
    if (!document.body) return false;
    document.body.classList.toggle('xinyao-atg-maintenance-active', enabled);

    let style = document.getElementById('xinyao-atg-maintenance-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'xinyao-atg-maintenance-style';
      style.textContent = `
        body.xinyao-atg-maintenance-active #xinyaoATGLiveV200,
        body.xinyao-atg-maintenance-active #xinyao-atg-room-scanner,
        body.xinyao-atg-maintenance-active #xinyao-room-mini,
        body.xinyao-atg-maintenance-active #xinyao-copy-modal { display:none !important; }
        #xinyao-atg-maintenance-notice{
          position:fixed;top:16px;left:50%;transform:translateX(-50%);
          z-index:2147483647;width:min(420px,calc(100vw - 24px));box-sizing:border-box;
          padding:14px 16px;border-radius:16px;background:rgba(35,22,30,.96);color:#fff;
          box-shadow:0 14px 40px rgba(0,0,0,.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
          text-align:center;line-height:1.55;pointer-events:none;
        }
        #xinyao-atg-maintenance-notice b{display:block;font-size:14px;margin-bottom:4px;color:#ffb8d4}
        #xinyao-atg-maintenance-notice span{font-size:11px;opacity:.88}
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    let notice = document.getElementById('xinyao-atg-maintenance-notice');
    if (!enabled) {
      notice?.remove();
      return true;
    }
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'xinyao-atg-maintenance-notice';
      notice.setAttribute('role','status');
      notice.setAttribute('aria-live','polite');
      document.body.appendChild(notice);
    }
    notice.innerHTML = `<b>🛠️ 芯瑤 ATG 系統維護中</b><span></span>`;
    const text = notice.querySelector('span');
    if (text) text.textContent = xinyaoMaintenanceMessage(state);
    return true;
  };

  if (!apply()) {
    document.addEventListener('DOMContentLoaded', apply, { once:true });
  }
}

async function xinyaoCheckMaintenance() {
  try {
    const response = await fetch(`${XIANYAO_MAINTENANCE_ENDPOINT}?t=${Date.now()}`, {
      method:'GET', cache:'no-store', credentials:'omit'
    });
    if (!response.ok) return;
    const data = await response.json();
    if (!data?.ok) return;
    const next = {
      enabled:Boolean(data.enabled),
      message:String(data.message || ''),
      updatedAt:data.updatedAt ?? null
    };
    const previousEnabled = Boolean(window.__XIANYAO_MAINTENANCE_STATE__?.enabled);
    window.__XIANYAO_MAINTENANCE_STATE__ = next;
    xinyaoRenderMaintenance(next);
    if (previousEnabled !== next.enabled) {
      window.dispatchEvent(new CustomEvent('xinyao:maintenance', { detail: next }));
    }
  } catch (_) {
    // 維護狀態查詢失敗時 fail-open，不因網路問題誤鎖會員。
  }
}

xinyaoCheckMaintenance();
setInterval(xinyaoCheckMaintenance, 10000);

function xinyaoIsPhoneUi() {
  // test87：桌機 / 全裝置 / 橫式 / 直式全部統一使用同一套迷你 HUD。
  return true;
}

function xinyaoApplyPhoneUiClass() {
  try {
    const root = document.documentElement;
    if (!root) return;
    root.classList.toggle('xinyao-phone-ui', xinyaoIsPhoneUi());
  } catch (_) {}
}

xinyaoApplyPhoneUiClass();
try {
  window.addEventListener('resize', xinyaoApplyPhoneUiClass, { passive:true });
  window.addEventListener('orientationchange', () => {
    setTimeout(xinyaoApplyPhoneUiClass, 60);
    setTimeout(xinyaoApplyPhoneUiClass, 300);
  }, { passive:true });
} catch (_) {}

(() => {
  'use strict';

  if (window.__XIANYAO_ATG_LIVE_V4_TEST__) return;
  window.__XIANYAO_ATG_LIVE_V4_TEST__ = true;

  const WORKER = 'https://xinyao-atg-live.love06130430.workers.dev';
  const TOKEN_KEY = 'xinyao_atg_device_token_v2';
  const TOKEN_SESSION_KEY = 'xinyao_atg_device_token_session_v1';
  // 直接進房時舊頁 / 新頁可能短暫同時存在；這段時間不要把同一裝置的配對誤判成失效。
  const TOKEN_BOOT_GRACE_MS = 45000;
  const TOKEN_BOOT_AT = Date.now();
  const DEVICE_ID_KEY = 'xinyao_atg_device_id_v2';
  const ROOM_FREE_ENTRY_KEY = 'xinyao_atg_room_free_entry_v1';
  const STAGE_PLAN_KEY = 'xinyao_atg_stage_plan_v1';
  const FULL_SCAN_SESSION_KEY_LIVE = 'xinyao_atg_full_scan_session_v1';
  const RUNTIME_ROOM_KEY = `runtime:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const nativeJSONParse = JSON.parse.bind(JSON);
  const cloudFetch = window.fetch.bind(window);

  const state = {
    connected: false,
    balance: null,
    stake: null,
    latestPayout: null,
    maxPayout: null,
    freeGameCount: null,
    startFreeGame: null,
    freeGameActive: false,
    freeGameLastPositiveSpinId: '',
    freeGameZeroSpinId: '',
    currentRoomKey: RUNTIME_ROOM_KEY,
    currentRoomId: null,
    currentRoomNumber: null,
    roomEntryBalance: null,
    roomProfit: null,
    roomFreeGameEntries: 0,
    roomFreeGameInProgress: false,
    roomFreeGameLastEntrySpinId: '',
    completedSpins: 0,
    lastSeenSpinId: '',
    previousSpinId: '',
    currentSpinId: '',
    completedSpinIds: new Set(),
    waitingResult: false,
    lastCloseText: '',
    lastCloseAt: 0,
    lastRoundSignalAt: 0,
    lastRoundSignalType: '',
    lastSync: '',
    cloudStatus: '等待配對',
    cloudTime: '',
    pairMessage: '',
    pairBusy: false,
    replaced: false
  };

  let panel = null;
  const XIANYAO_MOBILE_UI = () => xinyaoIsPhoneUi();
  let minimized = false;
  let mobileDetailOpen = false;
  let pushTimer = null;
  let pushBusy = false;
  let lastPushSignature = '';
  // 配對跨進房雙層保存：localStorage 負責跨頁/跨分頁，sessionStorage 負責同分頁快速恢復。
  let deviceToken = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_SESSION_KEY) || '';
  try {
    if (deviceToken) {
      localStorage.setItem(TOKEN_KEY, deviceToken);
      sessionStorage.setItem(TOKEN_SESSION_KEY, deviceToken);
    }
  } catch (_) {}
  let fullScanRoomIndexRaw = '';
  let fullScanRoomIndexById = new Map();
  let stagePlan = loadStagePlan();

  function evolveRoomPlaySession(previous = {}, event = {}) {
    const finite = value => {
      if (value === null || value === undefined || value === '') return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    const previousRoomKey = String(previous.roomKey || '');
    const eventRoomKey = String(event.roomKey || previousRoomKey || '');
    const upgradingRuntimeIdentity = Boolean(
      previousRoomKey && eventRoomKey && previousRoomKey !== eventRoomKey &&
      (previousRoomKey.startsWith('runtime:') || previousRoomKey === '__runtime__')
    );
    const roomChanged = Boolean(
      previousRoomKey && eventRoomKey && previousRoomKey !== eventRoomKey && !upgradingRuntimeIdentity
    );
    const balance = finite(event.balance);
    let entryBalance = finite(previous.entryBalance);

    if (roomChanged) {
      entryBalance = balance;
    } else if (entryBalance === null && balance !== null) {
      entryBalance = balance;
    }

    const profit = entryBalance !== null && balance !== null
      ? Math.round((balance - entryBalance) * 100) / 100
      : null;

    return {
      roomKey: eventRoomKey || previousRoomKey,
      roomNumber: event.roomNumber ?? previous.roomNumber ?? null,
      entryBalance,
      profit
    };
  }

  function evolveRoomFreeEntryCounter(previous = {}, event = {}) {
    // ATG 的遊戲結果封包不一定帶 room/table id。
    // 沒有房號時仍必須能計數，因此使用 runtime fallback；真正房號稍後出現時再升級 identity。
    const eventRoomKey = String(event.roomKey || previous.roomKey || '__runtime__');
    const previousRoomKey = String(previous.roomKey || '');
    const roomChanged = Boolean(
      eventRoomKey && previousRoomKey &&
      eventRoomKey !== previousRoomKey &&
      !previousRoomKey.startsWith('runtime:') && previousRoomKey !== '__runtime__'
    );
    const next = {
      roomKey: eventRoomKey || previousRoomKey || '__runtime__',
      roomNumber: event.roomNumber ?? previous.roomNumber ?? null,
      count: roomChanged ? 0 : Math.max(0, Number(previous.count) || 0),
      inProgress: roomChanged ? false : Boolean(previous.inProgress),
      lastEntrySpinId: roomChanged ? '' : String(previous.lastEntrySpinId || '')
    };

    const active = Boolean(event.active);
    const entrySignal = Boolean(event.entrySignal);
    const spinId = String(event.spinId || '');

    // 真正的「開始免遊」訊號優先：同一個 spinId 只計一次。
    // 這樣不需要依賴 ATG 是否會在後續封包持續維持 active=true。
    if (entrySignal && (!spinId || spinId !== next.lastEntrySpinId)) {
      next.count += 1;
      next.inProgress = true;
      next.lastEntrySpinId = spinId;
      return next;
    }

    // 沒有明確 start 訊號時，以 active 的 false -> true 當 fallback。
    if (active) {
      if (!next.inProgress) {
        next.count += 1;
        next.inProgress = true;
        next.lastEntrySpinId = spinId;
      }
    } else if (next.inProgress) {
      next.inProgress = false;
    }
    return next;
  }

  function loadRoomFreeEntrySession() {
    try {
      const raw = sessionStorage.getItem(ROOM_FREE_ENTRY_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        roomKey: String(parsed.roomKey || ''),
        roomNumber: toNumber(parsed.roomNumber),
        entryBalance: toNumber(parsed.entryBalance),
        count: Math.max(0, Math.trunc(toNumber(parsed.count) || 0)),
        inProgress: Boolean(parsed.inProgress),
        lastEntrySpinId: String(parsed.lastEntrySpinId || '')
      };
    } catch (_) {
      return null;
    }
  }

  function saveRoomFreeEntrySession() {
    // runtime fallback 無法證明重新載入後仍是同一房，因此不持久化，避免換房沿用舊次數。
    if (!state.currentRoomKey || state.currentRoomKey.startsWith('runtime:')) return;
    try {
      sessionStorage.setItem(ROOM_FREE_ENTRY_KEY, JSON.stringify({
        roomKey: state.currentRoomKey,
        roomNumber: state.currentRoomNumber,
        entryBalance: state.roomEntryBalance,
        count: state.roomFreeGameEntries,
        inProgress: state.roomFreeGameInProgress,
        lastEntrySpinId: state.roomFreeGameLastEntrySpinId,
        updatedAt: new Date().toISOString()
      }));
    } catch (_) {}
  }

  function fullScanRoomNumberByRoomId(roomId) {
    const id = toNumber(roomId);
    if (id === null) return null;
    try {
      const raw = sessionStorage.getItem(FULL_SCAN_SESSION_KEY_LIVE) || '';
      if (!raw) return null;
      if (raw !== fullScanRoomIndexRaw) {
        const parsed = JSON.parse(raw);
        const next = new Map();
        for (const room of (Array.isArray(parsed?.rooms) ? parsed.rooms : [])) {
          const rid = toNumber(room?.roomId);
          const number = toNumber(room?.number);
          if (rid !== null && number !== null && number >= 1 && number <= 4100) next.set(rid, number);
        }
        fullScanRoomIndexRaw = raw;
        fullScanRoomIndexById = next;
      }
      return fullScanRoomIndexById.get(id) ?? null;
    } catch (_) {
      return null;
    }
  }

  function findNamedNumber(value, names, depth = 0, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || depth > 8 || seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findNamedNumber(item, names, depth + 1, seen);
        if (found !== null) return found;
      }
      return null;
    }
    for (const [key, raw] of Object.entries(value)) {
      const normalized = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (names.has(normalized)) {
        const n = toNumber(raw);
        if (n !== null) return n;
      }
    }
    for (const child of Object.values(value)) {
      if (!child || typeof child !== 'object') continue;
      const found = findNamedNumber(child, names, depth + 1, seen);
      if (found !== null) return found;
    }
    return null;
  }

  function resolveRoomIdentityFromUrl() {
    try {
      const url = new URL(location.href);
      const numberNames = new Set(['roomnumber','roomno','roomnum','tablenumber','tableno','tablenum','machinenumber','machineno']);
      const idNames = new Set(['roomid','tableid']);
      for (const [key, raw] of url.searchParams.entries()) {
        const name = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
        const n = toNumber(raw);
        if (n === null) continue;
        if (numberNames.has(name) && n >= 1 && n <= 4100) return { key: `room:${n}`, roomNumber: n };
        if (idNames.has(name)) {
          const mapped = fullScanRoomNumberByRoomId(n);
          return mapped !== null ? { key: `room:${mapped}`, roomNumber: mapped } : { key: `roomId:${n}`, roomNumber: null };
        }
      }
    } catch (_) {}
    return null;
  }

  function resolveRoomIdentityFromEngine(engine) {
    const numberNames = new Set(['roomnumber','roomno','roomnum','tablenumber','tableno','tablenum','machinenumber','machineno']);
    const directNumber = findNamedNumber(engine, numberNames);
    if (directNumber !== null && directNumber >= 1 && directNumber <= 4100) {
      return { key: `room:${directNumber}`, roomNumber: directNumber };
    }

    const roomId = findNamedNumber(engine, new Set(['roomid','tableid']));
    if (roomId !== null) {
      const mapped = fullScanRoomNumberByRoomId(roomId);
      return mapped !== null
        ? { key: `room:${mapped}`, roomNumber: mapped }
        : { key: `roomId:${roomId}`, roomNumber: null };
    }
    return resolveRoomIdentityFromUrl();
  }


  // ATG 進房/換房時，房號可能走 WebSocket / Socket.IO / fetch / XHR，且 body 不一定是純字串。
  // 所有 outbound 通道統一走這個解析器，避免第一次進房抓到、換房後又變回「—」。
  function resolveRoomIdentityFromOutboundObject(value, eventHint = '') {
    if (!value || typeof value !== 'object') return null;

    const hint = String(eventHint || (Array.isArray(value) && typeof value[0] === 'string' ? value[0] : ''));
    // 實機 Network 已確認：切換目前機台時 Socket.IO 會送
    // 42x["getSlotTableDetail",{"roomId":...}]。這個事件代表「會員真正選中的房」，
    // 可安全拿來建立新房的進房金額，而不是排行榜裡任意 slotTableUpdated 房號。
    const trustedCurrentRoomEvent = /(?:^|:)getSlotTableDetail$/i.test(hint) || /^getSlotTableDetail$/i.test(hint);
    const transportSource = trustedCurrentRoomEvent ? 'socketio:getSlotTableDetail' : 'transport';

    const numberNames = new Set([
      'room','roomnumber','roomno','roomnum','tablenumber','tableno','tablenum',
      'machinenumber','machineno','machinenum'
    ]);
    const directNumber = findNamedNumber(value, numberNames);
    if (directNumber !== null && directNumber >= 1 && directNumber <= 4100) {
      return { key: `room:${directNumber}`, roomNumber: directNumber, source: transportSource };
    }

    const idNames = new Set(['roomid','tableid','slottableid','machineid']);
    let roomId = findNamedNumber(value, idNames);

    // Socket.IO 有些進房事件是 emit('enterRoom', 1003) 或 emit('joinTable', { id: ... })。
    // 只有事件名稱明確像「進/換房」時，才接受裸數字或 generic id，避免把頁碼/下注額誤認成房號。
    const roomActionHint = /(?:(?:enter|join|select|switch|change|open|play).*(?:room|table|slot|machine)|(?:room|table|slot|machine).*(?:enter|join|select|switch|change|open|play))/i.test(hint);

    if (roomActionHint && Array.isArray(value)) {
      for (const item of value.slice(1)) {
        const n = toNumber(item);
        if (n !== null) {
          if (n >= 1 && n <= 4100) return { key: `room:${n}`, roomNumber: n, source: transportSource };
          if (roomId === null) roomId = n;
        }
      }
    }

    if (roomActionHint && roomId === null) {
      const genericId = findNamedNumber(value, new Set(['id']));
      if (genericId !== null) roomId = genericId;
    }

    if (roomId !== null) {
      const mapped = fullScanRoomNumberByRoomId(roomId);
      return mapped !== null
        ? { key: `room:${mapped}`, roomNumber: mapped, roomId, source: transportSource }
        : { key: `roomId:${roomId}`, roomNumber: null, roomId, source: transportSource };
    }

    // room/table 物件常見 { room: { number: 1003 } } / { table: { id: ... } }
    for (const [rawKey, child] of Object.entries(value)) {
      const key = String(rawKey).replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (!['room','table','slottable','machine'].includes(key) || !child || typeof child !== 'object') continue;
      const nestedNumber = findNamedNumber(child, new Set(['number','no','num','roomnumber','tablenumber','machinenumber']));
      if (nestedNumber !== null && nestedNumber >= 1 && nestedNumber <= 4100) {
        return { key: `room:${nestedNumber}`, roomNumber: nestedNumber, source: transportSource };
      }
      const nestedId = findNamedNumber(child, new Set(['id','roomid','tableid','slottableid','machineid']));
      if (nestedId !== null) {
        const mapped = fullScanRoomNumberByRoomId(nestedId);
        return mapped !== null
          ? { key: `room:${mapped}`, roomNumber: mapped, roomId: nestedId, source: transportSource }
          : { key: `roomId:${nestedId}`, roomNumber: null, roomId: nestedId, source: transportSource };
      }
    }

    return null;
  }

  function resolveRoomIdentityFromOutboundText(data) {
    if (typeof data !== 'string') return null;
    const raw = String(data || '').trim();
    if (!raw) return null;

    const positions = [raw.indexOf('['), raw.indexOf('{')].filter(index => index >= 0);
    if (positions.length) {
      const start = Math.min(...positions);
      try {
        const parsed = nativeJSONParse(raw.slice(start));
        const hint = Array.isArray(parsed) && typeof parsed[0] === 'string' ? parsed[0] : '';
        const found = resolveRoomIdentityFromOutboundObject(parsed, hint);
        if (found) return found;
      } catch (_) {}
    }

    // query/form/text 格式。
    const decoded = (() => { try { return decodeURIComponent(raw); } catch (_) { return raw; } })();
    const numberMatch = decoded.match(/(?:roomNumber|roomNo|roomNum|tableNumber|tableNo|tableNum|machineNumber|machineNo|(?:^|[?&\s,{])room|(?:^|[?&\s,{])table)\s*["']?\s*[:=]\s*["']?(\d{1,4})/i);
    if (numberMatch) {
      const n = toNumber(numberMatch[1]);
      if (n !== null && n >= 1 && n <= 4100) return { key: `room:${n}`, roomNumber: n };
    }

    const idMatch = decoded.match(/(?:roomId|tableId|slotTableId|machineId)\s*["']?\s*[:=]\s*["']?(\d+)/i);
    if (idMatch) {
      const roomId = toNumber(idMatch[1]);
      if (roomId !== null) {
        const mapped = fullScanRoomNumberByRoomId(roomId);
        return mapped !== null
          ? { key: `room:${mapped}`, roomNumber: mapped }
          : { key: `roomId:${roomId}`, roomNumber: null };
      }
    }

    return null;
  }

  // ATG 的「選擇機台」彈窗本身也包含大量 slotTableBtn > num。
  // 彈窗開啟期間不可把清單中的任一機台誤認為會員已經進入的房號。
  function isMachineSelectionOpenFromCocos() {
    for (const gameWindow of collectSameOriginLiveWindows()) {
      try {
        const cocos = gameWindow.cc;
        const scene = cocos?.director?.getScene?.();
        const Label = cocos?.Label;
        if (!scene || !Label || typeof scene.getComponentsInChildren !== 'function') continue;

        const labels = scene.getComponentsInChildren(Label) || [];
        if (labels.some((label) => {
          const node = label?.node;
          if (!node || node.activeInHierarchy === false) return false;
          const text = String(label?.string ?? '').replace(/\s+/g, '');
          return text.includes('選擇機台');
        })) return true;
      } catch (_) {}
    }
    return false;
  }

  // Cocos Creator 真正進房後的目前機台房號。
  // 橫式已知結構：buttons > slotTable2Btn > num；直式版可能在 num 與按鈕中間多包一層，
  // 或使用不同的 slotTable*Btn 名稱，因此不能只鎖死「直系父節點」。
  // 選擇機台清單位於 spinContent 底下，任何該路徑的房號一律排除，避免把候選房誤當目前房。
  function resolveRoomIdentityFromCocosLabels(labels = []) {
    const candidates = [];

    for (const label of (Array.isArray(labels) ? labels : [])) {
      const node = label?.node;
      if (!node || node.activeInHierarchy === false) continue;

      const text = String(label?.string ?? '').trim();
      if (!/^\d{1,4}$/.test(text)) continue;
      const roomNumber = Number(text);
      if (!Number.isFinite(roomNumber) || roomNumber < 1 || roomNumber > 9999) continue;

      const names = [];
      let cursor = node;
      for (let depth = 0; cursor && depth < 8; depth += 1) {
        names.push(String(cursor.name || ''));
        cursor = cursor.parent || null;
      }
      const lower = names.map(name => name.toLowerCase());

      // 選機台彈窗的清單只能代表候選房。
      if (lower.some(name => name === 'spincontent' || name.includes('spincontent'))) continue;

      let score = 0;
      const nodeName = lower[0] || '';
      const hasExactCurrentButton = lower.some(name => name === 'slottable2btn');
      const hasSlotTableButton = lower.some(name => /slot.*table.*btn/.test(name));
      const hasCurrentRoomButton = lower.some(name =>
        /(?:current|selected|playing).*(?:room|table|machine)|(?:room|table|machine).*(?:current|selected|playing)/.test(name)
      );
      const hasButtonsGroup = lower.some(name => name === 'buttons' || name.endsWith('buttons'));
      const hasControlBar = lower.some(name => /(?:spin|control|bottom).*bar/.test(name));
      const hasAnyButton = lower.some(name => /(?:btn|button)/.test(name));
      const roomishNode = /^(?:num|roomnum|roomnumber|tablenum|tablenumber|machinenum|machinenumber)$/.test(nodeName);
      const hasNonRoomUi = lower.some(name =>
        /(?:balance|credit|wallet|amount|stake|bet|payout|jackpot|grand|major|minor|mini|prize|score|autoplay|autospin|buyfree|freegame|freespin|linecount|menu|sound|speed)/.test(name)
      );

      if (hasExactCurrentButton) score += 100;
      else if (hasCurrentRoomButton) score += 90;
      else if (hasSlotTableButton) score += 80;
      // 部分直式 ATG 版本會把目前房號 Label 改成一般 value/text 名稱，
      // 不再叫 num。只要它仍位於底部控制按鈕群，且不是餘額/押注/彩金等 UI，
      // 就把 3～4 位純數字當成房號候選。這能涵蓋 0863、1058 等實機版型，
      // 又不會把押注 4、線數 8 這類短數字抓進來。
      else if (!hasNonRoomUi && text.length >= 3 && text.length <= 4 && (hasAnyButton || hasButtonsGroup || hasControlBar)) {
        score += hasButtonsGroup ? 62 : (hasControlBar ? 56 : 50);
        if (hasAnyButton) score += 12;
        if (text.length === 3) score += 4;
      } else if (!hasNonRoomUi && text.length >= 3 && text.length <= 4) {
        // 直式版目前房號可能只剩一顆圓形房號徽章，祖先名稱不含 button/room。
        // 仍只接受純數字 3–4 位，並給低權重，避免壓過任何已知權威結構。
        score += text.length === 4 ? 36 : 32;
        if (roomishNode) score += 8;
      } else continue;

      if (roomishNode) score += 10;
      if (hasButtonsGroup) score += 5;
      if (hasControlBar) score += 3;
      // 越接近 label 的按鈕節點優先，避免畫面其他資訊區剛好有相似名稱。
      const buttonDepth = lower.findIndex(name => /(?:slot.*table|room|machine).*btn/.test(name));
      if (buttonDepth >= 0) score += Math.max(0, 8 - buttonDepth);

      candidates.push({ roomNumber, score });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    return { key: `room:${best.roomNumber}`, roomNumber: best.roomNumber, source: 'cocos' };
  }


  function resolveRoomIdentityFromLooseCocosText(gameWindow) {
    try {
      const cocos = gameWindow?.cc || gameWindow?.legacyCC || gameWindow?._cc;
      const scene = cocos?.director?.getScene?.();
      const Component = cocos?.Component;
      if (!scene || !Component || typeof scene.getComponentsInChildren !== 'function') return null;

      const candidates = [];
      const components = scene.getComponentsInChildren(Component) || [];
      const visibleSize = (() => {
        try {
          const size = cocos?.view?.getVisibleSize?.();
          return {
            width: Number(size?.width) || 0,
            height: Number(size?.height) || 0
          };
        } catch (_) {
          return { width:0, height:0 };
        }
      })();

      for (const component of components) {
        const node = component?.node;
        if (!node || node.activeInHierarchy === false) continue;

        const rawValues = [
          component?.string,
          component?._string,
          component?.text,
          component?._text,
          component?.value
        ];
        let text = '';
        for (const raw of rawValues) {
          const value = String(raw ?? '').trim();
          if (/^\d{3,4}$/.test(value)) {
            text = value;
            break;
          }
        }
        if (!text) continue;

        const roomNumber = Number(text);
        if (!Number.isFinite(roomNumber) || roomNumber < 1 || roomNumber > 4100) continue;

        const names = [];
        let cursor = node;
        for (let depth = 0; cursor && depth < 10; depth += 1) {
          names.push(String(cursor.name || ''));
          cursor = cursor.parent || cursor._parent || null;
        }
        const path = names.join('/').toLowerCase();
        if (/(balance|credit|wallet|amount|stake|bet|payout|jackpot|grand|major|minor|mini|score|win|prize|line|page|spincontent)/i.test(path)) continue;

        let score = text.length === 4 ? 26 : 22;
        if (/(room|table|machine|slot.*table|num|number)/i.test(path)) score += 55;
        if (/(button|btn|buttons|control|bottom)/i.test(path)) score += 16;

        try {
          const pos = node.worldPosition || node.position || node._position;
          const x = Number(pos?.x);
          const y = Number(pos?.y);
          if (Number.isFinite(x) && Number.isFinite(y) && visibleSize.width > 0 && visibleSize.height > 0) {
            // Portrait ATG room badge sits in the lower-left control area.
            if (x <= visibleSize.width * 0.42 && y <= visibleSize.height * 0.38) score += 28;
            else if (x <= visibleSize.width * 0.55 && y <= visibleSize.height * 0.5) score += 10;
          }
        } catch (_) {}

        candidates.push({ roomNumber, score, path });
      }

      if (!candidates.length) return null;
      candidates.sort((a,b) => b.score - a.score);
      const best = candidates[0];
      if (!best || best.score < 40) return null;
      return { key:`room:${best.roomNumber}`, roomNumber:best.roomNumber, source:'cocos-loose-text' };
    } catch (_) {
      return null;
    }
  }

  function collectSameOriginLiveWindows(rootWindow = window) {
    const windows = [];
    const seen = new Set();
    const visit = (win) => {
      if (!win || seen.has(win)) return;
      seen.add(win);
      windows.push(win);
      let frames = [];
      try { frames = [...win.document.querySelectorAll('iframe')]; } catch (_) {}
      for (const frame of frames) {
        try {
          const child = frame.contentWindow;
          if (!child) continue;
          void child.document;
          visit(child);
        } catch (_) {}
      }
    };
    visit(rootWindow);
    return windows;
  }

  function resolveRoomIdentityFromCocos() {
    if (isMachineSelectionOpenFromCocos()) return null;
    const windows = collectSameOriginLiveWindows();

    for (const gameWindow of windows) {
      try {
        const cocos = gameWindow.cc || gameWindow.legacyCC || gameWindow._cc;
        const scene = cocos?.director?.getScene?.();
        const Label = cocos?.Label;
        if (!scene || !Label || typeof scene.getComponentsInChildren !== 'function') continue;
        const identity = resolveRoomIdentityFromCocosLabels(scene.getComponentsInChildren(Label) || []);
        if (identity) return identity;
      } catch (_) {}
    }

    for (const gameWindow of windows) {
      const loose = resolveRoomIdentityFromLooseCocosText(gameWindow);
      if (loose) return loose;
    }

    return null;
  }

  function syncCocosRoomIdentity() {
    const identity = resolveRoomIdentityFromCocos();
    if (!identity) return false;
    const changed = applyRoomIdentity(identity);
    if (changed) sync();
    return changed;
  }

  function applyResolvedOutboundRoomIdentity(identity) {
    if (!identity) return false;

    // Cocos 只是畫面 heuristic；真正的 getSlotTableDetail 是伺服器確認過的目前房。
    // 權威來源不得被 Cocos 的誤判（例如直式版把其他 3~4 位數字當房號）覆蓋。
    if (!isAuthoritativeCurrentRoomIdentity(identity)) {
      const cocosIdentity = resolveRoomIdentityFromCocos();
      if (cocosIdentity?.key) {
        if (String(cocosIdentity.key) !== String(identity.key || '')) {
          const changed = applyRoomIdentity(cocosIdentity);
          if (changed) sync();
          return false;
        }
        identity = cocosIdentity;
      }
    }

    const changed = applyRoomIdentity(identity);
    if (changed) sync();
    return changed;
  }

  function applyOutboundRoomIdentity(data, eventHint = '') {
    if (typeof data === 'string') {
      return applyResolvedOutboundRoomIdentity(resolveRoomIdentityFromOutboundText(data));
    }
    if (data && typeof data === 'object' && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data) && !(typeof Blob !== 'undefined' && data instanceof Blob)) {
      return applyResolvedOutboundRoomIdentity(resolveRoomIdentityFromOutboundObject(data, eventHint));
    }
    return false;
  }

  // 統一處理所有送出資料型別；Blob 需要非同步讀取，其餘同步處理。
  function inspectOutboundRoomData(data, eventHint = '') {
    try {
      if (data === null || data === undefined) return false;
      if (typeof data === 'string') return applyOutboundRoomIdentity(data, eventHint);
      if (typeof URLSearchParams !== 'undefined' && data instanceof URLSearchParams) {
        return applyOutboundRoomIdentity(data.toString(), eventHint);
      }
      if (typeof FormData !== 'undefined' && data instanceof FormData) {
        const obj = {};
        for (const [key, value] of data.entries()) {
          if (typeof value === 'string') obj[key] = value;
        }
        return applyOutboundRoomIdentity(obj, eventHint);
      }
      if (data instanceof ArrayBuffer) {
        return applyOutboundRoomIdentity(new TextDecoder().decode(new Uint8Array(data)), eventHint);
      }
      if (ArrayBuffer.isView(data)) {
        return applyOutboundRoomIdentity(new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)), eventHint);
      }
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        data.text().then(text => applyOutboundRoomIdentity(text, eventHint)).catch(() => {});
        return false;
      }
      return applyOutboundRoomIdentity(data, eventHint);
    } catch (_) {
      return false;
    }
  }

  function findLiveZlibOffset(input) {
    let bytes;
    try {
      if (input instanceof Uint8Array) bytes = input;
      else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
      else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      else return -1;
    } catch (_) {
      return -1;
    }
    const limit = Math.min(Math.max(0, bytes.length - 1), 32);
    for (let i = 0; i < limit; i++) {
      const cmf = bytes[i];
      const flg = bytes[i + 1];
      if ((cmf & 0x0f) !== 8) continue;
      if (((cmf << 8) + flg) % 31 !== 0) continue;
      return i;
    }
    return -1;
  }

  async function decodeLiveBinaryRoomFrame(input) {
    let bytes;
    try {
      if (input instanceof Uint8Array) bytes = input;
      else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
      else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      else if (typeof Blob !== 'undefined' && input instanceof Blob) bytes = new Uint8Array(await input.arrayBuffer());
      else return '';
    } catch (_) {
      return '';
    }
    if (!bytes.length) return '';

    const zlibOffset = findLiveZlibOffset(bytes);
    if (zlibOffset >= 0) {
      const chunk = bytes.subarray(zlibOffset);
      try {
        if (typeof DecompressionStream === 'function') {
          const stream = new Blob([chunk]).stream().pipeThrough(new DecompressionStream('deflate'));
          const text = await new Response(stream).text();
          if (text && text.trim()) return text;
        }
      } catch (_) {}
      try {
        const pako = globalThis?.pako;
        if (pako && typeof pako.inflate === 'function') {
          const out = pako.inflate(chunk);
          const text = new TextDecoder().decode(out);
          if (text && text.trim()) return text;
        }
      } catch (_) {}
    }

    try {
      const direct = new TextDecoder().decode(bytes).replace(/^\u0004+/, '');
      return direct && direct.trim() ? direct : '';
    } catch (_) {
      return '';
    }
  }

  async function inspectOutboundRoomDataAsync(data, eventHint = '') {
    try {
      if (
        data instanceof ArrayBuffer ||
        ArrayBuffer.isView(data) ||
        (typeof Blob !== 'undefined' && data instanceof Blob)
      ) {
        const text = await decodeLiveBinaryRoomFrame(data);
        if (!text) return false;
        return inspectOutboundRoomData(text, eventHint);
      }
      return inspectOutboundRoomData(data, eventHint);
    } catch (_) {
      return false;
    }
  }

  function applyOutboundRoomFromTransport(data, eventHint = '') {
    if (
      data instanceof ArrayBuffer ||
      ArrayBuffer.isView(data) ||
      (typeof Blob !== 'undefined' && data instanceof Blob)
    ) {
      inspectOutboundRoomDataAsync(data, eventHint).catch(() => {});
      return false;
    }
    return inspectOutboundRoomData(data, eventHint);
  }

  function isAuthoritativeCurrentRoomIdentity(identity) {
    const source = String(identity?.source || '');
    return source === 'socketio:getSlotTableDetail' ||
      source === 'scanner:getSlotTableDetail' ||
      source === 'scan-remap';
  }

  function shouldIgnoreIdentityAgainstCocos(identity, cocosIdentity = resolveRoomIdentityFromCocos()) {
    if (!identity?.key || identity?.source === 'cocos') return false;
    // getSlotTableDetail / scanner bridge 是伺服器確認過的目前房號來源，
    // Cocos 只是一層畫面 heuristic，不能反過來否決權威房號。
    if (isAuthoritativeCurrentRoomIdentity(identity)) return false;
    if (!cocosIdentity?.key) return false;
    return String(identity.key) !== String(cocosIdentity.key);
  }

  function currentRoomIdFromState() {
    const direct = toNumber(state.currentRoomId);
    if (direct !== null) return direct;
    const match = String(state.currentRoomKey || '').match(/^roomId:(\d+)$/i);
    return match ? toNumber(match[1]) : null;
  }

  function refreshCurrentRoomMappingFromScan() {
    const roomId = currentRoomIdFromState();
    if (roomId === null) return false;
    const mapped = fullScanRoomNumberByRoomId(roomId);
    if (mapped === null || mapped === state.currentRoomNumber) return false;
    const changed = applyRoomIdentity({
      key: `room:${mapped}`,
      roomNumber: mapped,
      roomId,
      source: 'scan-remap'
    });
    if (changed) sync();
    return changed;
  }

  function applyCurrentRoomSelectionBridge(detail) {
    const roomId = toNumber(detail?.roomId);
    const roomNumber = toNumber(detail?.roomNumber);
    if (roomId === null && roomNumber === null) return false;
    const mapped = roomNumber !== null ? roomNumber : (roomId !== null ? fullScanRoomNumberByRoomId(roomId) : null);
    const identity = mapped !== null
      ? { key: `room:${mapped}`, roomNumber: mapped, roomId, source: 'scanner:getSlotTableDetail' }
      : { key: `roomId:${roomId}`, roomNumber: null, roomId, source: 'scanner:getSlotTableDetail' };
    const changed = applyRoomIdentity(identity);
    if (changed) sync();
    return changed;
  }

  function applyRoomIdentity(identity) {
    if (!identity?.key) return false;

    // getSlotTableDetail 是 ATG 在會員實際選定機台時送出的明確事件。
    // 事件送出當下「選擇機台」視窗可能還沒關閉，因此不能像一般候選房號一樣擋掉，
    // 否則第一次進房與換房都會永遠停在「目前房號：—」。
    const trustedCurrentRoomSource = identity?.source === 'cocos' || identity?.source === 'socketio:getSlotTableDetail' || identity?.source === 'scanner:getSlotTableDetail';

    // 選擇機台視窗開啟時，只阻擋非明確選房來源；
    // getSlotTableDetail 代表已經真的選中房間，必須允許通過。
    if (!trustedCurrentRoomSource && isMachineSelectionOpenFromCocos()) {
      const currentKey = String(state.currentRoomKey || '');
      if (!currentKey || currentKey.startsWith('runtime:') || String(identity.key) !== currentKey) return false;
    }

    if (shouldIgnoreIdentityAgainstCocos(identity)) return false;
    const nextKey = String(identity.key);
    const nextRoomNumber = identity.roomNumber ?? null;
    const nextRoomId = toNumber(identity.roomId) ?? (() => {
      const match = nextKey.match(/^roomId:(\d+)$/i);
      return match ? toNumber(match[1]) : null;
    })();
    const previousRoomId = currentRoomIdFromState();

    const upgradingRuntimeIdentity = Boolean(
      (String(state.currentRoomKey || '').startsWith('runtime:') && state.currentRoomKey !== nextKey) ||
      (state.currentRoomNumber === null && previousRoomId !== null && nextRoomId !== null && previousRoomId === nextRoomId && state.currentRoomKey !== nextKey)
    );
    const genuineRoomChange = Boolean(
      state.currentRoomKey && state.currentRoomKey !== nextKey && !upgradingRuntimeIdentity
    );
    const roomMoney = evolveRoomPlaySession({
      roomKey: state.currentRoomKey,
      roomNumber: state.currentRoomNumber,
      entryBalance: state.roomEntryBalance
    }, {
      roomKey: nextKey,
      roomNumber: nextRoomNumber,
      // Cocos 節點是在目前機台畫面已建立後才讀到；此時目前 wallet 點數就是新房進房點數。
      // 其他較早到達的封包型 roomId 仍維持原本延後抓餘額的策略。
      balance: genuineRoomChange ? (trustedCurrentRoomSource ? state.balance : null) : state.balance
    });

    if (state.currentRoomKey === nextKey) {
      let changed = false;
      if (nextRoomId !== null && state.currentRoomId !== nextRoomId) {
        state.currentRoomId = nextRoomId;
        changed = true;
      }
      if (identity.roomNumber !== null && identity.roomNumber !== undefined && state.currentRoomNumber !== identity.roomNumber) {
        state.currentRoomNumber = identity.roomNumber;
        changed = true;
      }
      if (state.roomEntryBalance !== roomMoney.entryBalance) {
        state.roomEntryBalance = roomMoney.entryBalance;
        changed = true;
      }
      if (state.roomProfit !== roomMoney.profit) {
        state.roomProfit = roomMoney.profit;
        changed = true;
      }
      if (changed) saveRoomFreeEntrySession();
      return changed;
    }

    // runtime fallback 升級成真實房號時，保留已記錄的進房金額與免遊次數；真正換房才重設。
    state.currentRoomKey = nextKey;
    state.currentRoomId = nextRoomId;
    state.currentRoomNumber = nextRoomNumber;
    state.roomEntryBalance = roomMoney.entryBalance;
    state.roomProfit = roomMoney.profit;
    if (!upgradingRuntimeIdentity) {
      state.roomFreeGameEntries = 0;
      state.roomFreeGameInProgress = false;
      state.roomFreeGameLastEntrySpinId = '';
      state.latestPayout = null;
      state.maxPayout = null;
    }
    saveRoomFreeEntrySession();
    return true;
  }

  function updateRoomMoneyFromBalance() {
    const next = evolveRoomPlaySession({
      roomKey: state.currentRoomKey,
      roomNumber: state.currentRoomNumber,
      entryBalance: state.roomEntryBalance
    }, {
      roomKey: state.currentRoomKey || RUNTIME_ROOM_KEY,
      roomNumber: state.currentRoomNumber,
      balance: state.balance
    });

    const changed =
      next.entryBalance !== state.roomEntryBalance ||
      next.profit !== state.roomProfit;
    state.roomEntryBalance = next.entryBalance;
    state.roomProfit = next.profit;
    if (changed) saveRoomFreeEntrySession();
    return changed;
  }

  function restoreRoomFreeEntrySession(expectedRoomKey = '') {
    const saved = loadRoomFreeEntrySession();
    if (!saved?.roomKey || saved.roomKey.startsWith('runtime:')) return false;
    // 只有能從目前 URL 證明仍是同一房時才還原，避免切房後沿用上一房次數。
    if (expectedRoomKey && saved.roomKey !== expectedRoomKey) return false;
    if (!expectedRoomKey) return false;
    state.currentRoomKey = saved.roomKey;
    state.currentRoomNumber = saved.roomNumber;
    state.roomEntryBalance = saved.entryBalance;
    state.roomProfit = null;
    state.roomFreeGameEntries = saved.count;
    state.roomFreeGameInProgress = saved.inProgress;
    state.roomFreeGameLastEntrySpinId = saved.lastEntrySpinId;
    return true;
  }

  function updateRoomFreeEntryCounter(active, spinId, entrySignal = false) {
    // 免遊計數不能依賴 ATG 是否有附房號；沒有 identity 時就用本次遊戲 runtime key。
    const roomKey = state.currentRoomKey || RUNTIME_ROOM_KEY;
    const next = evolveRoomFreeEntryCounter({
      roomKey: state.currentRoomKey,
      roomNumber: state.currentRoomNumber,
      count: state.roomFreeGameEntries,
      inProgress: state.roomFreeGameInProgress,
      lastEntrySpinId: state.roomFreeGameLastEntrySpinId
    }, {
      roomKey,
      roomNumber: state.currentRoomNumber,
      active,
      entrySignal,
      spinId
    });

    const changed =
      next.count !== state.roomFreeGameEntries ||
      next.inProgress !== state.roomFreeGameInProgress ||
      next.lastEntrySpinId !== state.roomFreeGameLastEntrySpinId;
    state.roomFreeGameEntries = next.count;
    state.roomFreeGameInProgress = next.inProgress;
    state.roomFreeGameLastEntrySpinId = next.lastEntrySpinId;
    if (changed) saveRoomFreeEntrySession();
    return changed;
  }

  const initialRoomIdentity = resolveRoomIdentityFromUrl();
  if (initialRoomIdentity) {
    if (!restoreRoomFreeEntrySession(initialRoomIdentity.key)) applyRoomIdentity(initialRoomIdentity);
    else applyRoomIdentity(initialRoomIdentity);
  }

  function toNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return null;
  }

  function money(value) {
    if (value === null || value === undefined) return '—';
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : '—';
  }

  function signedMoney(value) {
    if (value === null || value === undefined) return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}`;
  }

  function roomNumberText(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1 || n > 4100) return '—';
    return String(Math.trunc(n)).padStart(4, '0');
  }


  function nearestAllowedStake(target, allowed = [
    1,2,3,4,5,6,7,8,9,10,12,14,16,18,20,24,28,30,32,36,
    40,42,48,54,56,60,64,72,80,96,100,112,120,128,140,144,
    160,180,200,240,280,300,320,360,400,420,480,500,540,560,
    600,640,700,720,800,840,900,960,980,1000,1080,1120,1200,
    1260,1280,1400,1440,1600,1800,2000
  ]) {
    const n = Number(target);
    const list = (Array.isArray(allowed) ? allowed : [])
      .map(Number).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    if (!list.length || !Number.isFinite(n)) return null;
    let best = list[0];
    let bestDistance = Math.abs(best - n);
    for (const value of list) {
      const distance = Math.abs(value - n);
      if (distance < bestDistance || (distance === bestDistance && value < best)) {
        best = value;
        bestDistance = distance;
      }
    }
    return best;
  }

  function buildStageRecommendation(input = {}) {
    const finite = value => {
      if (value === null || value === undefined || value === '') return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };
    const BETS = [
      1,2,3,4,5,6,7,8,9,10,12,14,16,18,20,24,28,30,32,36,
      40,42,48,54,56,60,64,72,80,96,100,112,120,128,140,144,
      160,180,200,240,280,300,320,360,400,420,480,500,540,560,
      600,640,700,720,800,840,900,960,980,1000,1080,1120,1200,
      1260,1280,1400,1440,1600,1800,2000
    ];
    const TURN_OPTIONS = [10, 50, 100, 200, 500];
    const entryBalance = finite(input.entryBalance);
    const currentBalance = finite(input.currentBalance);
    const previousStake = finite(input.previousStake);
    const previousStageStartBalance = finite(input.previousStageStartBalance);

    if (entryBalance === null || entryBalance <= 0 || currentBalance === null) {
      return { status: 'waiting', stake: null, turns: null, plannedSpend: null, direction: 'waiting' };
    }
    if (currentBalance < 1 || currentBalance <= entryBalance * 0.5) {
      return {
        status: 'paused', stake: null, turns: null, plannedSpend: 0,
        direction: 'paused', balanceRatio: currentBalance / entryBalance,
        reason: '目前點數已低於進房金額 50%，暫停下一階段配置'
      };
    }

    const ratio = currentBalance / entryBalance;
    let desiredTurns = 50;
    let budgetRate = 0.10;
    if (ratio <= 0.60) {
      desiredTurns = 500;
      budgetRate = 0.08;
    } else if (ratio <= 0.80) {
      desiredTurns = 200;
      budgetRate = 0.08;
    } else if (ratio <= 0.95) {
      desiredTurns = 100;
      budgetRate = 0.10;
    } else if (ratio <= 1.05) {
      desiredTurns = 50;
      budgetRate = 0.10;
    } else if (ratio <= 1.30) {
      desiredTurns = 50;
      budgetRate = 0.12;
    } else {
      desiredTurns = 10;
      budgetRate = 0.08;
    }

    const stageBudget = currentBalance * budgetRate;
    const maxSpend = stageBudget * 1.12;
    const orderedTurns = [desiredTurns, ...TURN_OPTIONS.filter(v => v < desiredTurns).sort((a, b) => b - a)];
    let turns = orderedTurns.find(v => v * BETS[0] <= maxSpend && v * BETS[0] <= currentBalance) || 10;
    if (turns * BETS[0] > currentBalance) {
      return {
        status: 'paused', stake: null, turns: null, plannedSpend: 0,
        direction: 'paused', balanceRatio: ratio,
        reason: '目前點數不足以配置下一階段'
      };
    }

    const targetStake = stageBudget / turns;
    let stake = nearestAllowedStake(targetStake, BETS);
    let stakeIndex = Math.max(0, BETS.indexOf(stake));
    while (stakeIndex > 0 && (BETS[stakeIndex] * turns > maxSpend || BETS[stakeIndex] * turns > currentBalance)) {
      stakeIndex -= 1;
    }
    stake = BETS[stakeIndex];

    let direction = previousStake === null ? 'start' : 'hold';
    if (previousStake !== null) {
      const previousIndex = Math.max(0, BETS.indexOf(nearestAllowedStake(previousStake, BETS)));
      const stageWon = previousStageStartBalance !== null && currentBalance > previousStageStartBalance;
      const overallProfit = currentBalance > entryBalance;
      const maxIncreaseIndex = stageWon && overallProfit
        ? Math.min(BETS.length - 1, previousIndex + 2)
        : previousIndex;
      if (stakeIndex > maxIncreaseIndex) {
        stakeIndex = maxIncreaseIndex;
        stake = BETS[stakeIndex];
      }
      if (stake > previousStake) direction = 'up';
      else if (stake < previousStake) direction = 'down';
    }

    return {
      status: 'active',
      stake,
      turns,
      plannedSpend: stake * turns,
      stageBudget,
      balanceRatio: ratio,
      direction
    };
  }

  function advanceResetResilientCounter(previous = {}, observedValue = 0) {
    const observed = Math.max(0, Math.trunc(Number(observedValue) || 0));
    const raw = Math.max(0, Math.trunc(Number(previous.raw) || 0));
    const total = Math.max(0, Math.trunc(Number(previous.total) || 0));
    return observed >= raw
      ? { raw: observed, total: total + (observed - raw) }
      : { raw: observed, total: total + observed };
  }

  function loadStagePlan() {
    try {
      const raw = sessionStorage.getItem(STAGE_PLAN_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function saveStagePlan() {
    try {
      if (!stagePlan) sessionStorage.removeItem(STAGE_PLAN_KEY);
      else sessionStorage.setItem(STAGE_PLAN_KEY, JSON.stringify(stagePlan));
    } catch (_) {}
  }

  function createStagePlan() {
    const recommendation = buildStageRecommendation({
      entryBalance: state.roomEntryBalance,
      currentBalance: state.balance,
      previousStake: null,
      previousStageStartBalance: null
    });
    return {
      roomKey: state.currentRoomKey,
      roomNumber: state.currentRoomNumber,
      entryBalance: state.roomEntryBalance,
      stageNumber: 1,
      stageStartBalance: state.balance,
      stageStartRoomSpin: 0,
      counter: { raw: Math.max(0, Math.trunc(Number(state.completedSpins) || 0)), total: 0 },
      recommendation,
      lastCompleted: null,
      updatedAt: Date.now()
    };
  }

  function syncStagePlanner() {
    // 還在選擇機台時，不建立也不推進任何資金配置。
    if (isMachineSelectionOpenFromCocos()) return false;

    const entryBalance = toNumber(state.roomEntryBalance);
    const currentBalance = toNumber(state.balance);
    const roomKey = String(state.currentRoomKey || '');
    if (!roomKey || roomKey.startsWith('runtime:') || entryBalance === null || entryBalance <= 0 || currentBalance === null) {
      return false;
    }

    const sameRoom = stagePlan && String(stagePlan.roomKey || '') === roomKey;
    const sameEntry = sameRoom && Math.abs((toNumber(stagePlan.entryBalance) ?? entryBalance) - entryBalance) < 0.01;
    if (!sameRoom || !sameEntry) {
      stagePlan = createStagePlan();
      saveStagePlan();
      return true;
    }

    const previousCounterRaw = Math.max(0, Math.trunc(Number(stagePlan.counter?.raw) || 0));
    const previousCounterTotal = Math.max(0, Math.trunc(Number(stagePlan.counter?.total) || 0));
    stagePlan.counter = advanceResetResilientCounter(stagePlan.counter, state.completedSpins);
    const counterChanged =
      previousCounterRaw !== Math.max(0, Math.trunc(Number(stagePlan.counter?.raw) || 0)) ||
      previousCounterTotal !== Math.max(0, Math.trunc(Number(stagePlan.counter?.total) || 0));
    const recommendation = stagePlan.recommendation || {};
    const roomSpinTotal = Math.max(0, Math.trunc(Number(stagePlan.counter?.total) || 0));
    const stageStartRoomSpin = Math.max(0, Math.trunc(Number(stagePlan.stageStartRoomSpin) || 0));
    const progress = Math.max(0, roomSpinTotal - stageStartRoomSpin);

    // 安全線是即時的；一旦低於進房 50%，不必等原階段轉完才停止建議。
    if (currentBalance <= entryBalance * 0.5) {
      const paused = buildStageRecommendation({
        entryBalance,
        currentBalance,
        previousStake: recommendation.stake,
        previousStageStartBalance: stagePlan.stageStartBalance
      });
      if (recommendation.status !== 'paused') stagePlan.recommendation = paused;
      stagePlan.updatedAt = Date.now();
      saveStagePlan();
      return true;
    }

    if (recommendation.status === 'paused') {
      stagePlan.stageStartRoomSpin = roomSpinTotal;
      stagePlan.stageStartBalance = currentBalance;
      stagePlan.recommendation = buildStageRecommendation({
        entryBalance,
        currentBalance,
        previousStake: null,
        previousStageStartBalance: null
      });
      stagePlan.updatedAt = Date.now();
      saveStagePlan();
      return true;
    }

    const requiredTurns = Math.max(0, Math.trunc(Number(recommendation.turns) || 0));
    if (recommendation.status === 'active' && requiredTurns > 0 && progress >= requiredTurns) {
      const previousStake = toNumber(recommendation.stake);
      const previousStartBalance = toNumber(stagePlan.stageStartBalance);
      stagePlan.lastCompleted = {
        stageNumber: Math.max(1, Math.trunc(Number(stagePlan.stageNumber) || 1)),
        stake: previousStake,
        turns: requiredTurns,
        startBalance: previousStartBalance,
        endBalance: currentBalance,
        delta: previousStartBalance === null ? null : currentBalance - previousStartBalance
      };
      stagePlan.stageNumber = Math.max(1, Math.trunc(Number(stagePlan.stageNumber) || 1)) + 1;
      stagePlan.stageStartRoomSpin = roomSpinTotal;
      stagePlan.stageStartBalance = currentBalance;
      stagePlan.recommendation = buildStageRecommendation({
        entryBalance,
        currentBalance,
        previousStake,
        previousStageStartBalance: previousStartBalance
      });
      stagePlan.updatedAt = Date.now();
      saveStagePlan();
      return true;
    }

    if (counterChanged) {
      stagePlan.updatedAt = Date.now();
      saveStagePlan();
    }
    return counterChanged;
  }

  function stagePlannerHtml() {
    // 選房畫面完全隱藏建議，避免會員尚未進房就看到下注 / 轉數。
    if (isMachineSelectionOpenFromCocos()) return '';

    if (!stagePlan || String(stagePlan.roomKey || '') !== String(state.currentRoomKey || '')) {
      return `
        <div class="xinyaoLine"></div>
        <div style="font-size:11px;font-weight:800;margin-bottom:5px;">💰 自動資金配置</div>
        <div style="font-size:10px;opacity:.68;line-height:1.45;">等待進房金額與目前點數…</div>
      `;
    }

    const recommendation = stagePlan.recommendation || {};
    if (recommendation.status === 'paused') {
      return `
        <div class="xinyaoLine"></div>
        <div style="font-size:11px;font-weight:800;margin-bottom:5px;">💰 自動資金配置</div>
        <div style="font-size:11px;font-weight:800;color:#ffd09b;">⏸ 暫停下一階段配置</div>
        <div style="font-size:9px;opacity:.68;margin-top:3px;line-height:1.45;">${recommendation.reason || '目前點數不足，暫停配置'}</div>
      `;
    }

    if (recommendation.status !== 'active') return '';
    const roomSpinTotal = Math.max(0, Math.trunc(Number(stagePlan.counter?.total) || 0));
    const startSpin = Math.max(0, Math.trunc(Number(stagePlan.stageStartRoomSpin) || 0));
    const progress = Math.max(0, Math.min(Number(recommendation.turns) || 0, roomSpinTotal - startSpin));
    const remaining = Math.max(0, (Number(recommendation.turns) || 0) - progress);
    const directionText = recommendation.direction === 'up'
      ? '⬆️ 上一階段有盈利，本階段提高一級'
      : recommendation.direction === 'down'
        ? '⬇️ 依目前本金，本階段降低金額'
        : recommendation.direction === 'hold'
          ? '➡️ 本階段維持目前建議級距'
          : '▶️ 依進房本金建立第一階段配置';
    const last = stagePlan.lastCompleted;
    const lastLine = last ? `
      <div style="margin-top:5px;padding-top:5px;border-top:1px dashed rgba(255,255,255,.12);font-size:9px;opacity:.66;line-height:1.45;">
        上一階段：${money(last.stake)} × ${last.turns}｜${money(last.startBalance)} → ${money(last.endBalance)}｜${signedMoney(last.delta)}
      </div>
    ` : '';

    return `
      <div class="xinyaoLine"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;">
        <div style="font-size:11px;font-weight:800;">💰 自動資金配置</div>
        <div style="font-size:9px;opacity:.65;">第 ${Math.max(1, Math.trunc(Number(stagePlan.stageNumber) || 1))} 階段</div>
      </div>
      <div class="xinyaoRow"><span>建議單轉</span><b>${money(recommendation.stake)}</b></div>
      <div class="xinyaoRow"><span>建議自動轉</span><b>${Math.trunc(Number(recommendation.turns) || 0)} 次</b></div>
      <div class="xinyaoRow"><span>本階段進度</span><b>${progress} / ${Math.trunc(Number(recommendation.turns) || 0)}</b></div>
      <div class="xinyaoRow"><span>剩餘建議</span><b>${remaining} 次</b></div>
      <div class="xinyaoRow"><span>預計階段投注</span><b>${money(recommendation.plannedSpend)}</b></div>
      <div style="font-size:9px;opacity:.72;margin-top:5px;line-height:1.45;">${directionText}</div>
      ${lastLine}
      <div style="font-size:9px;opacity:.5;margin-top:4px;line-height:1.4;">完成本階段後，會依當下點數自動重新分配下一組金額與轉數。</div>
    `;
  }

  function nowText() {
    return new Date().toLocaleTimeString('zh-TW', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function randomId(length = 24) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY) || '';
    if (!id) {
      id = randomId(24);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  function platformName() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
    return 'Browser';
  }

  function deviceName() {
    const ua = navigator.userAgent || '';
    const platform = platformName();
    let browser = 'Browser';
    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/Chrome\//i.test(ua) || /CriOS\//i.test(ua)) browser = 'Chrome';
    else if (/Firefox\//i.test(ua) || /FxiOS\//i.test(ua)) browser = 'Firefox';
    else if (/Safari\//i.test(ua)) browser = 'Safari';
    return `${platform} ${browser}`;
  }

  function sync() {
    if (window.__XIANYAO_MAINTENANCE_STATE__?.enabled) return;
    syncStagePlanner();
    state.lastSync = nowText();
    render();
    schedulePush();
  }

  function safeObject(value) {
    return value && typeof value === 'object';
  }

  function collectEngines(value, out = [], depth = 0, seen = new WeakSet()) {
    if (!safeObject(value) || depth > 18 || seen.has(value)) return out;
    seen.add(value);

    if (typeof value.spinId === 'string' && Array.isArray(value.gameState)) {
      out.push(value);
    }

    if (Array.isArray(value)) {
      for (const item of value) collectEngines(item, out, depth + 1, seen);
    } else {
      for (const child of Object.values(value)) {
        if (safeObject(child)) collectEngines(child, out, depth + 1, seen);
      }
    }

    return out;
  }

  function getFinalGameState(engine) {
    if (!Array.isArray(engine?.gameState) || !engine.gameState.length) return null;

    let best = engine.gameState[engine.gameState.length - 1];
    for (const item of engine.gameState) {
      const current = toNumber(item?.currentView);
      const bestCurrent = toNumber(best?.currentView);
      if (current !== null && (bestCurrent === null || current >= bestCurrent)) best = item;
    }
    return best;
  }

  function isFinalGameState(item) {
    if (!item) return false;
    const current = toNumber(item.currentView);
    const total = toNumber(item.totalViews);
    if (current === null || total === null || total <= 0) return true;
    return current >= total - 1;
  }

  function readFreeGameSignal(engine) {
    const states = Array.isArray(engine?.gameState) ? engine.gameState : [];
    let sawExplicit = false;
    let startSignal = false;
    let activeFlag = null;
    let positiveCount = null;
    let lastCount = null;

    const normalizeKey = key => String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const startKeys = new Set([
      'startfreegame','startfreespin','startfreespins','triggerfreegame','triggerfreespin','triggerfreespins',
      'freegamestart','freespinstart','freespinsstart','freegametriggered','freespintriggered','freespinstriggered'
    ]);
    const activeKeys = new Set([
      'isfreegame','isfreespin','isfreespins','infreegame','infreespin','infreespins',
      'freegameactive','freespinactive','freespinsactive','isfreegameactive','isfreespinactive'
    ]);
    const countKeys = new Set([
      'freegamecount','freegamescount','freespincount','freespinscount',
      'freegamesleft','freegameleft','freespinsleft','freespinleft',
      'remainingfreegame','remainingfreegames','remainingfreespin','remainingfreespins',
      'freegameremaining','freegamesremaining','freespinremaining','freespinsremaining'
    ]);

    const visit = (value, path = '', depth = 0, seen = new WeakSet()) => {
      if (!value || typeof value !== 'object' || depth > 6 || seen.has(value)) return;
      seen.add(value);
      const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
      for (const [rawKey, rawValue] of entries) {
        const key = normalizeKey(rawKey);
        const nextPath = path ? `${path}.${key}` : key;
        const pathLooksFree = /freegame|freespin/.test(nextPath);

        if (startKeys.has(key) && typeof rawValue === 'boolean') {
          sawExplicit = true;
          if (rawValue) startSignal = true;
        }

        if (activeKeys.has(key) && typeof rawValue === 'boolean') {
          sawExplicit = true;
          activeFlag = activeFlag === true ? true : rawValue;
        }

        if (countKeys.has(key)) {
          const n = toNumber(rawValue);
          if (n !== null) {
            sawExplicit = true;
            const c = Math.max(0, n);
            lastCount = c;
            if (c > 0) positiveCount = c;
          }
        }

        // 有些 ATG 遊戲會包成 freeGame/freeSpin 物件，內層只叫 start/active/count/left/remaining。
        if (pathLooksFree) {
          if ((key === 'start' || key === 'trigger' || key === 'triggered') && typeof rawValue === 'boolean') {
            sawExplicit = true;
            if (rawValue) startSignal = true;
          }
          if ((key === 'active' || key === 'isactive' || key === 'running' || key === 'inprogress') && typeof rawValue === 'boolean') {
            sawExplicit = true;
            activeFlag = activeFlag === true ? true : rawValue;
          }
          if (['count','left','remaining','remain','spins','times'].includes(key)) {
            const n = toNumber(rawValue);
            if (n !== null) {
              sawExplicit = true;
              const c = Math.max(0, n);
              lastCount = c;
              if (c > 0) positiveCount = c;
            }
          }
        }

        if (rawValue && typeof rawValue === 'object') visit(rawValue, nextPath, depth + 1, seen);
      }
    };

    for (const item of states) visit(item);

    const count = positiveCount !== null ? positiveCount : lastCount;
    return {
      sawExplicit,
      startSignal,
      count,
      activeSignal: startSignal || activeFlag === true || (count !== null && count > 0)
    };
  }

  function computeFreeGameState(previous, engine, spinId) {
    const prev = previous || {};
    const next = {
      active: Boolean(prev.active),
      count: prev.count ?? null,
      start: prev.start ?? null,
      lastPositiveSpinId: String(prev.lastPositiveSpinId || ''),
      zeroSpinId: String(prev.zeroSpinId || '')
    };

    const signal = readFreeGameSignal(engine);
    if (!signal.sawExplicit) return next;

    if (signal.activeSignal) {
      next.active = true;
      next.start = Boolean(signal.startSignal);
      if (signal.count !== null && signal.count > 0) {
        next.count = signal.count;
      } else if (next.count === null) {
        next.count = 0;
      }
      next.lastPositiveSpinId = String(spinId || '');
      next.zeroSpinId = '';
      return next;
    }

    if (!next.active) {
      next.count = signal.count ?? 0;
      next.start = false;
      next.zeroSpinId = '';
      return next;
    }

    const currentSpinId = String(spinId || '');

    // 觸發免遊的同一個 spin 內，最後一個 view 可能又回報 0 / false。
    // 同一 spin 不可因此把剛偵測到的免遊狀態清掉。
    if (!currentSpinId || currentSpinId === next.lastPositiveSpinId) {
      return next;
    }

    // ATG 偶爾會有一個零值封包夾在免遊流程中。
    // 連續兩個不同 spin 都明確回報 0 / false，才確認免遊已結束。
    if (!next.zeroSpinId) {
      next.zeroSpinId = currentSpinId;
      return next;
    }

    if (next.zeroSpinId !== currentSpinId) {
      next.active = false;
      next.count = 0;
      next.start = false;
      next.lastPositiveSpinId = '';
      next.zeroSpinId = '';
    }

    return next;
  }

  function freeGameTextFor(snapshot) {
    const active = Boolean(snapshot?.active);
    const count = toNumber(snapshot?.count);

    if (active) {
      return count !== null && count > 0 ? `剩 ${count} 次` : '進行中';
    }

    if (count === null && snapshot?.start == null) return '—';
    return '未進行';
  }

  function findBalance(value, path = '', depth = 0, seen = new WeakSet()) {
    if (!safeObject(value) || depth > 18 || seen.has(value)) return null;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findBalance(item, path, depth + 1, seen);
        if (found !== null) return found;
      }
      return null;
    }

    for (const [key, val] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      const lowerPath = nextPath.toLowerCase();
      if (String(key).toLowerCase() === 'amount' && lowerPath.includes('balance')) {
        const n = toNumber(val);
        if (n !== null) return n;
      }
      if (safeObject(val)) {
        const found = findBalance(val, nextPath, depth + 1, seen);
        if (found !== null) return found;
      }
    }
    return null;
  }

  function updateGeneralFromEngine(engine, finalState, spinId) {
    let changed = false;

    if (finalState) {
      const stake = toNumber(finalState.totalStake);
      if (stake !== null && state.stake !== stake) {
        state.stake = stake;
        changed = true;
      }
    }

    const freeGameSignal = readFreeGameSignal(engine);
    const nextFreeGame = computeFreeGameState(
      {
        active: state.freeGameActive,
        count: state.freeGameCount,
        start: state.startFreeGame,
        lastPositiveSpinId: state.freeGameLastPositiveSpinId,
        zeroSpinId: state.freeGameZeroSpinId
      },
      engine,
      spinId
    );

    if (updateRoomFreeEntryCounter(nextFreeGame.active, spinId, freeGameSignal.startSignal)) changed = true;

    if (state.freeGameActive !== nextFreeGame.active) {
      state.freeGameActive = nextFreeGame.active;
      changed = true;
    }
    if (state.freeGameCount !== nextFreeGame.count) {
      state.freeGameCount = nextFreeGame.count;
      changed = true;
    }
    if (state.startFreeGame !== nextFreeGame.start) {
      state.startFreeGame = nextFreeGame.start;
      changed = true;
    }
    if (state.freeGameLastPositiveSpinId !== nextFreeGame.lastPositiveSpinId) {
      state.freeGameLastPositiveSpinId = nextFreeGame.lastPositiveSpinId;
      changed = true;
    }
    if (state.freeGameZeroSpinId !== nextFreeGame.zeroSpinId) {
      state.freeGameZeroSpinId = nextFreeGame.zeroSpinId;
      changed = true;
    }

    return changed;
  }

  const GAME_HINT_TIGER_RE = /(虎小妹|tiger[\s_\-]*(?:girl|sister)|tigergirl|hu[\s_\-]*xiao[\s_\-]*mei|xiaohu|tiger[_\-]?slot)/i;
  const GAME_HINT_SETH_RE = /(戰神賽特|战神赛特|storm[\s_\-]*of[\s_\-]*seth|seth2|seth[\s_\-]*2|awakening|覺醒之力|觉醒之力)/i;

  function inferGameProfileFromPayload(...roots) {
    const seen = new WeakSet();
    let tigerScore = 0;
    let sethScore = 0;

    const testText = (text, keyHint = '') => {
      const s = String(text ?? '');
      if (!s || s.length > 500) return;
      const weighted = /(game|title|name|slug|code|product|theme|resource|url|path|asset)/i.test(String(keyHint || '')) ? 3 : 1;
      if (GAME_HINT_TIGER_RE.test(s)) tigerScore += weighted;
      if (GAME_HINT_SETH_RE.test(s)) sethScore += weighted;
    };

    const visit = (value, depth = 0, keyHint = '') => {
      if (depth > 7 || value == null) return;
      if (typeof value === 'string' || typeof value === 'number') {
        testText(value, keyHint);
        return;
      }
      if (typeof value !== 'object') return;
      if (seen.has(value)) return;
      seen.add(value);

      let entries = [];
      try { entries = Object.entries(value); } catch (_) { return; }
      for (let i = 0; i < entries.length && i < 180; i += 1) {
        const [key, child] = entries[i];
        testText(key, 'key');
        if (
          depth < 3 ||
          /(game|title|name|slug|code|product|theme|resource|url|path|asset|config|meta|type|id)/i.test(key)
        ) {
          visit(child, depth + 1, key);
        }
      }
    };

    for (const root of roots) visit(root, 0, 'root');

    if (tigerScore > sethScore && tigerScore > 0) return 'tiger';
    if (sethScore > tigerScore && sethScore > 0) return 'seth';
    return '';
  }

  function processEngine(engine) {
    if (!engine?.spinId) return false;

    const spinId = String(engine.spinId);
    const finalState = getFinalGameState(engine);

    const gameProfileHint = inferGameProfileFromPayload(engine, finalState);
    // test88：封包裡可能沿用上一款/共用引擎的 Seth 名稱，不能直接污染目前遊戲判斷。
    // 只保留為低權重提示，真正遊戲以目前畫面、最近載入資源、Cocos 文字與儲存狀態優先。
    if (gameProfileHint) {
      try { window.__XIANYAO_ATG_GAME_PROFILE_PAYLOAD_HINT__ = gameProfileHint; } catch (_) {}
    }

    state.lastSeenSpinId = spinId;

    let changed = false;
    const roomIdentity = resolveRoomIdentityFromEngine(engine);
    const cocosIdentity = resolveRoomIdentityFromCocos();
    // 換房後上一房可能還有延遲結果封包；若封包房號與 Cocos 畫面不一致，整包忽略，
    // 避免舊房的轉數 / 派彩 / 免遊污染新房，或再開出一筆假的空紀錄。
    if (shouldIgnoreIdentityAgainstCocos(roomIdentity, cocosIdentity)) return false;
    if (cocosIdentity && applyRoomIdentity(cocosIdentity)) changed = true;
    else if (roomIdentity && applyRoomIdentity(roomIdentity)) changed = true;
    if (updateGeneralFromEngine(engine, finalState, spinId)) changed = true;
    if (!state.waitingResult) return changed;

    if (!state.currentSpinId && state.previousSpinId && spinId === state.previousSpinId) {
      return changed;
    }

    if (!state.currentSpinId) state.currentSpinId = spinId;

    // 自動轉時，ATG 可能不會每一局都送出 closeSpin。
    // 若上一個 spin 已完成，而封包出現新的 final spinId，視為下一局自動轉結果。
    if (spinId !== state.currentSpinId) {
      if (
        finalState &&
        isFinalGameState(finalState) &&
        state.completedSpinIds.has(state.currentSpinId)
      ) {
        state.previousSpinId = state.currentSpinId;
        state.currentSpinId = spinId;
      } else {
        return changed;
      }
    }

    if (!finalState || !isFinalGameState(finalState)) return changed;

    // v4 HUD Lab：只在「本局已完成」時把盤面原始資料交給被動偵測器。
    // 不改遊戲資料、不預測下一局，也不影響下注 / 派彩 / 結算。
    try {
      window.dispatchEvent(new CustomEvent('xinyao:spin-final-observed', {
        detail: {
          spinId,
          roomNumber: state.currentRoomNumber,
          gameProfileHint: gameProfileHint || '',
          finalState,
          engine
        }
      }));
    } catch (_) {}

    let payout = toNumber(finalState.totalWinnings);
    if (payout === null) {
      const candidates = engine.gameState
        .filter(isFinalGameState)
        .map(x => toNumber(x?.totalWinnings))
        .filter(x => x !== null);
      if (candidates.length) payout = Math.max(...candidates);
    }

    if (payout !== null) {
      if (state.latestPayout !== payout) {
        state.latestPayout = payout;
        changed = true;
      }
      if (state.maxPayout === null || payout > state.maxPayout) {
        state.maxPayout = payout;
        changed = true;
      }
    }

    if (!state.completedSpinIds.has(spinId)) {
      state.completedSpinIds.add(spinId);
      state.completedSpins += 1;
      changed = true;
    }

    return changed;
  }

  function inspectObject(obj) {
    try {
      if (!safeObject(obj)) return;

      try {
        window.__XIANYAO_ATG_FREE_RESULT_PROBE__?.observe?.(obj);
      } catch (_) {}

      let changed = false;

      const balance = findBalance(obj);
      if (balance !== null && state.balance !== balance) {
        state.balance = balance;
        changed = true;
      }

      const engines = collectEngines(obj);
      const bySpin = new Map();
      for (const engine of engines) {
        if (engine?.spinId) bySpin.set(String(engine.spinId), engine);
      }
      for (const engine of bySpin.values()) {
        if (processEngine(engine)) changed = true;
      }

      // 房號可能與餘額出現在同一包資料。先完成房號判斷，再用這一包的餘額建立/更新本房盈虧。
      if (balance !== null && updateRoomMoneyFromBalance()) changed = true;

      if (changed) sync();
    } catch (_) {}
  }

  function parseText(text) {
    const raw = String(text || '').trim();
    if (!raw) return;

    try {
      window.__XIANYAO_ATG_FREE_PACKET_TRACE__?.push?.('in', raw);
    } catch (_) {}

    const positions = [raw.indexOf('['), raw.indexOf('{')].filter(index => index >= 0);
    if (!positions.length) return;
    const start = Math.min(...positions);

    try {
      inspectObject(nativeJSONParse(raw.slice(start)));
    } catch (_) {}
  }

  async function inspectMessageData(data) {
    try {
      if (typeof data === 'string') {
        parseText(data);
        return;
      }
      if (data instanceof ArrayBuffer) {
        parseText(new TextDecoder().decode(new Uint8Array(data)));
        return;
      }
      if (ArrayBuffer.isView(data)) {
        parseText(new TextDecoder().decode(data));
        return;
      }
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        parseText(await data.text());
      }
    } catch (_) {}
  }

  function startNewRound(data) {
    if (typeof data !== 'string') return;
    const text = String(data);

    // 手動轉通常會出現 closeSpin；自動轉較常只持續送 spin。
    // 兩種都納入，並避免同一局 spin + closeSpin 被重複當成兩局。
    const isCloseSpin = text.includes('closeSpin');
    const isSpin = /[\[,{]\s*["']spin["']\s*[,}\]]/i.test(text);
    if (!isCloseSpin && !isSpin) return;

    const time = Date.now();
    const signalType = isSpin ? 'spin' : 'closeSpin';

    if (
      signalType === 'closeSpin' &&
      state.lastRoundSignalType === 'spin' &&
      time - state.lastRoundSignalAt < 1200
    ) {
      return;
    }

    if (
      signalType === state.lastRoundSignalType &&
      time - state.lastRoundSignalAt < 250
    ) {
      return;
    }

    state.lastRoundSignalAt = time;
    state.lastRoundSignalType = signalType;
    state.lastCloseText = text;
    state.lastCloseAt = time;
    state.previousSpinId = state.lastSeenSpinId;
    state.currentSpinId = '';
    state.waitingResult = true;

    // test87：只有真正送出新的 spin 才算「下一轉開始」。
    // closeSpin 只是上一局收尾，不可把購買建議提示關掉。
    if (signalType === 'spin') {
      try {
        window.dispatchEvent(new CustomEvent('xinyao:spin-start-observed', {
          detail: { type: 'spin', at: time }
        }));
      } catch (_) {}
    }

    sync();
  }

  function freeGameText() {
    return freeGameTextFor({
      active: state.freeGameActive,
      count: state.freeGameCount,
      start: state.startFreeGame
    });
  }

  function connectionText() {
    return state.connected ? '● 即時連線中' : '● 等待遊戲資料';
  }

  function cloudText() {
    if (state.replaced) return '⚠️ 此裝置已被新裝置取代';
    if (!deviceToken) return '尚未綁定會員帳號';
    return state.cloudStatus || '等待同步';
  }

  function payload() {
    return {
      balance: state.balance,
      stake: state.stake,
      latestPayout: state.latestPayout,
      maxPayout: state.maxPayout,
      freeGameCount: state.freeGameCount,
      freeGameActive: state.freeGameActive,
      completedSpins: state.completedSpins,
      currentRoomNumber: state.currentRoomNumber,
      currentRoomKey: state.currentRoomKey,
      roomEntryBalance: state.roomEntryBalance,
      roomProfit: state.roomProfit,
      roomFreeGameEntries: state.roomFreeGameEntries
    };
  }

  function payloadSignature() {
    return JSON.stringify(payload());
  }

  function schedulePush() {
    if (!deviceToken || pushTimer) return;
    pushTimer = setTimeout(() => {
      pushTimer = null;
      pushCloud(false);
    }, 250);
  }

  async function pushCloud(force = false) {
    if (window.__XIANYAO_MAINTENANCE_STATE__?.enabled) return;
    if (!deviceToken || pushBusy) return;
    const signature = payloadSignature();
    if (!force && signature === lastPushSignature) return;

    pushBusy = true;
    try {
      const response = await cloudFetch(`${WORKER}/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceToken}`
        },
        body: JSON.stringify(payload())
      });
      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        try {
          localStorage.removeItem(TOKEN_KEY);
          sessionStorage.removeItem(TOKEN_SESSION_KEY);
        } catch (_) {}
        deviceToken = '';
        state.replaced = false;
        state.cloudStatus = '需要重新配對';
        render();
        return;
      }

      if (response.status === 409 || result?.error === 'device_replaced') {
        // 直接進房會讓舊頁與新頁短暫重疊；新頁剛啟動時先保留原配對，避免會員被要求重輸配對碼。
        if (Date.now() - TOKEN_BOOT_AT < TOKEN_BOOT_GRACE_MS) {
          try {
            localStorage.setItem(TOKEN_KEY, deviceToken);
            sessionStorage.setItem(TOKEN_SESSION_KEY, deviceToken);
          } catch (_) {}
          state.replaced = false;
          state.cloudStatus = '🔄 進房載入中｜配對已保留';
          render();
          return;
        }
        try {
          localStorage.removeItem(TOKEN_KEY);
          sessionStorage.removeItem(TOKEN_SESSION_KEY);
        } catch (_) {}
        deviceToken = '';
        state.replaced = true;
        state.cloudStatus = '⚠️ 此裝置已被新裝置取代';
        render();
        return;
      }

      if (!response.ok || !result?.ok) throw new Error(result?.error || 'sync_failed');

      lastPushSignature = signature;
      state.cloudStatus = '☁️ 雲端已同步';
      state.cloudTime = nowText();
      render();
    } catch (_) {
      state.cloudStatus = '☁️ 雲端暫時連不上';
      render();
    } finally {
      pushBusy = false;
    }
  }

  async function claimPairCode(code) {
    const pairCode = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (pairCode.length < 4) throw new Error('請輸入配對碼');

    state.cloudStatus = '正在配對…';
    state.pairMessage = '正在驗證配對碼…';
    state.pairBusy = true;
    state.replaced = false;
    render();

    let response;
    let result = {};
    try {
      response = await cloudFetch(`${WORKER}/pair/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairCode,
          deviceId: getDeviceId(),
          deviceName: deviceName(),
          platform: platformName()
        })
      });

      result = await response.json().catch(() => ({}));
    } catch (error) {
      throw new Error(`配對連線失敗：${error?.message || '無法連線'}`);
    }

    if (!response.ok || !result?.ok || !result?.deviceToken) {
      const reason =
        result?.error === 'pair_code_invalid_or_expired'
          ? '配對碼無效或已過期'
          : (result?.message || result?.error || `配對失敗（HTTP ${response.status}）`);
      throw new Error(reason);
    }

    deviceToken = result.deviceToken;
    try {
      localStorage.setItem(TOKEN_KEY, deviceToken);
      sessionStorage.setItem(TOKEN_SESSION_KEY, deviceToken);
    } catch (_) {}
    state.cloudStatus = '✅ 已綁定會員帳號';
    state.pairMessage = '✅ 配對成功';
    state.pairBusy = false;
    state.replaced = false;
    lastPushSignature = '';
    render();
    await pushCloud(true);
    return true;
  }

  function render() {
    if (!panel) return;

    try {
      window.__XIANYAO_ATG_LIVE_SNAPSHOT__ = {
        connected:Boolean(state.connected),
        currentRoomNumber:state.currentRoomNumber,
        roomEntryBalance:state.roomEntryBalance,
        balance:state.balance,
        roomProfit:state.roomProfit,
        stake:state.stake,
        latestPayout:state.latestPayout,
        freeGameCount:state.freeGameCount,
        freeGameActive:Boolean(state.freeGameActive),
        startFreeGame:state.startFreeGame,
        roomFreeGameEntries:state.roomFreeGameEntries,
        completedSpins:state.completedSpins,
        paired:Boolean(deviceToken),
        updatedAt:Date.now()
      };
      window.__XIANYAO_ATG_MOBILE_DETAIL_OPEN__ = Boolean(mobileDetailOpen);
    } catch (_) {}

    panel.classList.toggle('xinyao-mobile-min', Boolean(minimized));
    panel.classList.toggle('xinyao-mobile-detail-visible', !XIANYAO_MOBILE_UI() || mobileDetailOpen);

    if (minimized) {
      panel.innerHTML = `
        <div id="xinyaoHeader" style="font-weight:800;font-size:13px;cursor:pointer;">🌸 芯瑤 ATG</div>
        <div style="font-size:10px;margin-top:2px;opacity:.8;">${connectionText()}</div>
      `;
      bindPanelEvents();
      return;
    }

    const pairBox = !deviceToken ? `
      <div class="xinyaoGroup xinyaoPairGroup">
      <div style="font-size:10px;line-height:1.45;opacity:.84;margin-bottom:6px;">
        第一次使用請輸入芯瑤網站顯示的配對碼
      </div>
      <div style="display:flex;gap:5px;">
        <input id="xinyaoPairInput" maxlength="12" placeholder="配對碼"
          style="width:100px;min-width:0;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:rgba(255,255,255,.09);color:#fff;padding:6px 7px;font-size:11px;outline:none;text-transform:uppercase;">
        <button id="xinyaoPairButton" type="button" ${state.pairBusy ? 'disabled' : ''}
          style="border:0;border-radius:8px;background:#ff5f9e;color:#fff;padding:6px 8px;font-size:11px;font-weight:800;cursor:pointer;opacity:${state.pairBusy ? '.55' : '1'};">${state.pairBusy ? '配對中…' : '綁定'}</button>
      </div>
      <div id="xinyaoPairMessage" style="font-size:9px;margin-top:5px;opacity:.82;color:${state.pairMessage.startsWith('✅') ? '#9ff0be' : '#ffd0df'};">${state.pairMessage || ''}</div>
      </div>
    ` : '';

    panel.innerHTML = `
      <div id="xinyaoHeader" style="display:flex;justify-content:space-between;align-items:center;gap:12px;cursor:pointer;">
        <div style="font-size:14px;font-weight:800;">🌸 芯瑤 ATG 即時助手</div>
        <div style="font-size:12px;opacity:.7;">－</div>
      </div>
      <div class="xinyaoConn">${connectionText()}</div>

      <div class="xinyaoGroup xinyaoStatsGrid">
        <div class="xinyaoRow"><span>進房金額</span><b>${money(state.roomEntryBalance)}</b></div>
        <div class="xinyaoRow"><span>目前點數</span><b>${money(state.balance)}</b></div>
        <div class="xinyaoRow"><span>本房盈虧</span><b style="color:${state.roomProfit > 0 ? '#8ff0ad' : state.roomProfit < 0 ? '#ff8da8' : '#fff'};">${signedMoney(state.roomProfit)}</b></div>
        <div class="xinyaoRow"><span>下輪開獎結果</span><b>${money(state.latestPayout)}</b></div>
        <div class="xinyaoRow"><span>本房免遊次數</span><b>${state.roomFreeGameEntries} 次</b></div>
        <div class="xinyaoRow"><span>本次完成轉數</span><b>${state.completedSpins}</b></div>
      </div>

      <div class="xinyaoGroup xinyaoRiskGroup"><button id="xinyaoRiskOpen" type="button" style="width:100%;min-width:0;white-space:nowrap;word-break:keep-all;border:1px solid rgba(255,174,207,.38);border-radius:9px;background:rgba(255,95,158,.10);color:#ffd3e4;padding:8px 6px;font-size:10px;line-height:1.2;font-weight:900;cursor:pointer;">🛡️ 止盈／止損</button></div>

      ${pairBox}
    `;

    bindPanelEvents();
  }

  function bindPanelEvents() {
    const header = panel?.querySelector('#xinyaoHeader');
    if (header) {
      header.onclick = () => {
        if (XIANYAO_MOBILE_UI()) {
          mobileDetailOpen = false;
          minimized = false;
          try { window.__XIANYAO_ATG_MOBILE_DETAIL_OPEN__ = false; } catch (_) {}
          render();
          return;
        }

        minimized = !minimized;
        render();
      };
    }

    const button = panel?.querySelector('#xinyaoPairButton');
    const input = panel?.querySelector('#xinyaoPairInput');
    const message = panel?.querySelector('#xinyaoPairMessage');

    if (input) {
      input.addEventListener('input', () => {
        input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') button?.click();
      });
    }

    if (button) {
      button.onclick = async event => {
        event.stopPropagation();
        if (state.pairBusy) return;
        try {
          await claimPairCode(input?.value);
        } catch (error) {
          state.pairBusy = false;
          state.pairMessage = error?.message || '配對失敗';
          state.cloudStatus = '配對失敗';
          render();
        }
      };
    }
  }

  try {
    window.addEventListener('xinyao:mobile-live-detail', event => {
      if (!XIANYAO_MOBILE_UI()) return;
      mobileDetailOpen = Boolean(event?.detail?.open);
      minimized = false;
      try { window.__XIANYAO_ATG_MOBILE_DETAIL_OPEN__ = mobileDetailOpen; } catch (_) {}

      if (mobileDetailOpen) {
        try {
          window.dispatchEvent(new CustomEvent('xinyao:mobile-panel-open', {
            detail: { panel:'live' }
          }));
        } catch (_) {}
      }
      render();
    });

    window.addEventListener('xinyao:mobile-panel-open', event => {
      if (!XIANYAO_MOBILE_UI()) return;
      const who = String(event?.detail?.panel || '');

      // test87：資料面板與盤面監測允許同時開啟。
      // 只有全房分析打開時，才收起完整資料面板。
      if (who !== 'rooms') return;

      if (mobileDetailOpen) {
        mobileDetailOpen = false;
        try { window.__XIANYAO_ATG_MOBILE_DETAIL_OPEN__ = false; } catch (_) {}
        render();
      }
    });
  } catch (_) {}

  function mountPanel() {
    if (panel || !document.documentElement) return;

    const style = document.createElement('style');
    style.textContent = `
      #xinyaoATGLiveV200 .xinyaoRow { display:flex;justify-content:space-between;align-items:center;gap:15px;margin:4px 0;font-size:11px; }
      #xinyaoATGLiveV200 .xinyaoRow span { opacity:.78; }
      #xinyaoATGLiveV200 .xinyaoRow b { font-size:12px;font-weight:800; }
      #xinyaoATGLiveV200 .xinyaoLine { height:1px;margin:7px 0;background:rgba(255,255,255,.14); }
      #xinyaoATGLiveV200 .xinyaoConn{margin-top:3px;font-size:10px;opacity:.82;}
      #xinyaoATGLiveV200 .xinyaoGroup{
        margin-top:7px;
        padding:7px 8px;
        border:1px solid rgba(255,255,255,.09);
        border-radius:10px;
        background:rgba(255,255,255,.035);
      }
      #xinyaoATGLiveV200 .xinyaoStatsGrid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:5px;
      }
      #xinyaoATGLiveV200 .xinyaoPairGroup{padding-bottom:8px;}
      #xinyaoATGLiveV200 .xinyaoRiskGroup{
        display:block;
      }
      #xinyaoATGLiveV200 #xinyaoRiskOpen{
        display:block;
        width:100%;
        white-space:nowrap;
        word-break:keep-all;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      #xinyaoATGLiveV200 input::placeholder { color:rgba(255,255,255,.48); }

      /* v3.2.3：全裝置版面板可上下滑動，避免極速模式掉到螢幕下方 */
      #xinyaoATGLiveV200{
        box-sizing:border-box;
        max-height:calc(100vh - 16px);
        max-height:calc(100dvh - 16px);
        overflow-x:hidden;
        overflow-y:auto;
        overscroll-behavior:contain;
        -webkit-overflow-scrolling:touch;
        touch-action:pan-y;
        scrollbar-width:thin;
        padding-bottom:calc(9px + env(safe-area-inset-bottom, 0px)) !important;
      }

      @media (max-width: 760px), (max-height:760px) and (pointer:coarse){
        #xinyaoATGLiveV200{
          display:none !important;
          top:max(6px, env(safe-area-inset-top, 0px)) !important;
          left:6px !important;
          width:min(194px, calc(100vw - 12px)) !important;
          min-width:0 !important;
          max-width:calc(100vw - 12px) !important;
          max-height:calc(100dvh - 12px) !important;
          padding:7px !important;
          border-radius:12px !important;
          overflow-x:hidden !important;
          overflow-y:auto !important;
        }

        #xinyaoATGLiveV200.xinyao-mobile-detail-visible{
          display:block !important;
        }

        #xinyaoATGLiveV200 #xinyaoHeader{
          gap:6px !important;
        }
        #xinyaoATGLiveV200 #xinyaoHeader > div:first-child{
          font-size:11px !important;
          white-space:nowrap;
        }
        #xinyaoATGLiveV200 .xinyaoConn{
          margin-top:2px;
          font-size:8px;
        }

        /* 全裝置常駐模式：資料改成兩欄小卡，避免面板一路延伸到操作按鈕區 */
        #xinyaoATGLiveV200 .xinyaoGroup{
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:4px;
          margin-top:5px;
          padding:4px;
          border-radius:8px;
        }
        #xinyaoATGLiveV200 .xinyaoRiskGroup{
          display:block !important;
          grid-template-columns:none !important;
          width:100%;
          box-sizing:border-box;
        }
        #xinyaoATGLiveV200 #xinyaoRiskOpen{
          width:100% !important;
          min-height:34px;
          padding:7px 4px !important;
          font-size:9px !important;
          white-space:nowrap !important;
          word-break:keep-all !important;
          overflow:hidden;
          text-overflow:clip;
        }
        #xinyaoATGLiveV200 .xinyaoRow{
          display:block;
          min-width:0;
          margin:0;
          padding:4px 4px 5px;
          border-radius:6px;
          background:rgba(255,255,255,.035);
          line-height:1.15;
        }
        #xinyaoATGLiveV200 .xinyaoRow span{
          display:block;
          font-size:7px;
          line-height:1.15;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
          opacity:.68;
        }
        #xinyaoATGLiveV200 .xinyaoRow b{
          display:block;
          margin-top:2px;
          font-size:10px;
          line-height:1.15;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }

        #xinyaoATGLiveV200 .xinyaoPairGroup{
          display:block;
        }

        #xinyaoATGLiveV200.xinyao-mobile-min{
          width:auto !important;
          min-width:0 !important;
          max-width:154px !important;
          padding:6px 8px !important;
          overflow:hidden !important;
        }
        #xinyaoATGLiveV200.xinyao-mobile-min #xinyaoHeader{
          white-space:nowrap;
          font-size:11px !important;
        }
        #xinyaoATGLiveV200.xinyao-mobile-min > div:nth-child(2){
          white-space:nowrap;
          font-size:8px !important;
        }

        #xinyaoATGLiveV200 #xinyaoUnifiedSpeedSection{
          margin-top:5px !important;
          padding-top:5px !important;
        }
        #xinyaoATGLiveV200 .xinyaoSpeedTitle{
          margin-bottom:4px !important;
          font-size:9px !important;
        }
        #xinyaoATGLiveV200 .xinyaoSpeedTitle b{
          font-size:10px !important;
        }
        #xinyaoATGLiveV200 .xinyaoSpeedGrid{
          gap:3px !important;
        }
        #xinyaoATGLiveV200 .xinyaoSpeedBtn{
          min-height:26px !important;
          padding:3px 1px !important;
          font-size:8px !important;
          border-radius:6px !important;
        }
      }
      html.xinyao-phone-ui #xinyaoATGLiveV200{
        display:none !important;
      }
      html.xinyao-phone-ui #xinyaoATGLiveV200.xinyao-mobile-detail-visible{
        display:block !important;
      }
      html.xinyao-phone-ui #xinyaoATGLiveV200{
        top:max(6px, env(safe-area-inset-top, 0px)) !important;
        left:6px !important;
        width:min(194px, calc(100vw - 12px)) !important;
        min-width:0 !important;
        max-width:calc(100vw - 12px) !important;
        max-height:calc(100dvh - 12px) !important;
        padding:7px !important;
        border-radius:12px !important;
        overflow-x:hidden !important;
        overflow-y:auto !important;
      }
      html.xinyao-phone-ui #xinyaoATGLiveV200 #xinyaoHeader{gap:6px !important}
      html.xinyao-phone-ui #xinyaoATGLiveV200 #xinyaoHeader > div:first-child{font-size:11px !important;white-space:nowrap}
      html.xinyao-phone-ui #xinyaoATGLiveV200 .xinyaoConn{margin-top:2px;font-size:8px}
      html.xinyao-phone-ui #xinyaoATGLiveV200 .xinyaoGroup{
        display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;margin-top:5px;padding:4px;border-radius:8px
      }
      html.xinyao-phone-ui #xinyaoATGLiveV200 .xinyaoRiskGroup{
        display:block !important;
        grid-template-columns:none !important;
        width:100% !important;
        box-sizing:border-box !important;
      }
      html.xinyao-phone-ui #xinyaoATGLiveV200 .xinyaoRiskGroup #xinyaoRiskOpen{
        display:block !important;
        width:100% !important;
        min-width:0 !important;
        box-sizing:border-box !important;
        padding:8px 6px !important;
        font-size:10px !important;
        line-height:1.2 !important;
        white-space:nowrap !important;
        word-break:keep-all !important;
        overflow:visible !important;
        text-overflow:unset !important;
      }
      html.xinyao-phone-ui #xinyaoATGLiveV200 .xinyaoRow{
        display:block;min-width:0;margin:0;padding:4px 4px 5px;border-radius:6px;background:rgba(255,255,255,.035);line-height:1.15
      }
      html.xinyao-phone-ui #xinyaoATGLiveV200 .xinyaoRow span{
        display:block;font-size:7px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.68
      }
      html.xinyao-phone-ui #xinyaoATGLiveV200 .xinyaoRow b{
        display:block;margin-top:2px;font-size:10px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis
      }
      html.xinyao-phone-ui #xinyaoATGLiveV200 .xinyaoPairGroup{display:block}
      html.xinyao-phone-ui #xinyaoATGLiveV200 #xinyaoUnifiedSpeedSection{margin-top:5px !important;padding-top:5px !important}
      html.xinyao-phone-ui #xinyaoATGLiveV200 .xinyaoSpeedGrid{gap:3px !important}
      html.xinyao-phone-ui #xinyaoATGLiveV200 .xinyaoSpeedBtn{min-height:26px !important;padding:3px 1px !important;font-size:8px !important;border-radius:6px !important}

      @media (min-width:761px) and (max-height:760px) and (pointer:fine){
        #xinyaoATGLiveV200{
          max-height:calc(100dvh - 12px);
        }
      }
      @media (orientation:landscape) and (max-height:760px) and (pointer:coarse){
        #xinyaoATGLiveV200{
          width:184px !important;
        }
      }
    `;
    document.documentElement.appendChild(style);

    panel = document.createElement('div');
    panel.id = 'xinyaoATGLiveV200';
    Object.assign(panel.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      zIndex: '2147483647',
      minWidth: '190px',
      padding: '9px 11px',
      color: '#fff',
      background: 'rgba(24,20,31,.92)',
      border: '1px solid rgba(255,255,255,.20)',
      borderRadius: '14px',
      boxShadow: '0 5px 20px rgba(0,0,0,.32)',
      fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      boxSizing: 'border-box',
      maxHeight: 'calc(100dvh - 16px)',
      overflowX: 'hidden',
      overflowY: 'auto',
      overscrollBehavior: 'contain',
      WebkitOverflowScrolling: 'touch',
      touchAction: 'pan-y'
    });

    document.documentElement.appendChild(panel);
    if (XIANYAO_MOBILE_UI()) {
      try {
        window.dispatchEvent(new CustomEvent('xinyao:mobile-panel-open', {
          detail: { panel:'live' }
        }));
      } catch (_) {}
    }
    render();
  }

  function patchWebSocketPrototypeSendForWindow(targetWindow) {
    try {
      const WS = targetWindow?.WebSocket;
      const proto = WS?.prototype;
      if (!proto || typeof proto.send !== 'function' || proto.send.__xinyaoRoomOutboundWrapped) return false;

      const nativeSend = proto.send;
      const wrappedSend = function(data) {
        try {
          // 直接包 prototype.send，連「程式啟動前已經建立」的 Socket.IO WebSocket 也抓得到。
          // 實機已確認換房會送 42x["getSlotTableDetail",{"roomId":...}]。
          applyOutboundRoomFromTransport(data, 'ws:send');
          startNewRound(data);

          // test114：保存「真正送到線上」的原始 getSlotTableDetail frame。
          // 不再依賴 Socket.IO prototype 是否能被攔到。
          if (typeof data === 'string' && /getSlotTableDetail/i.test(data)) {
            window.__XIANYAO_ATG_RAW_SELECT_FRAME__ = {
              socket: this,
              data: String(data),
              capturedAt: Date.now()
            };
          }
        } catch (_) {}
        return nativeSend.call(this, data);
      };
      try { Object.defineProperty(wrappedSend, '__xinyaoRoomOutboundWrapped', { value: true }); } catch (_) {}
      proto.send = wrappedSend;
      return true;
    } catch (_) {
      return false;
    }
  }

  function patchWebSocket() {
    // 遊戲可能在同源 iframe 裡，而且 Socket.IO 常比面板更早建立連線。
    // 每次巡檢都先補 prototype.send；這不依賴重新建立 WebSocket，所以換房也能抓。
    for (const gameWindow of collectSameOriginLiveWindows()) {
      patchWebSocketInboundHandlersForWindow(gameWindow);
      patchWebSocketPrototypeSendForWindow(gameWindow);
    }

    const NativeWS = window.WebSocket;
    if (!NativeWS || NativeWS.__xinyaoLiveV200Wrapped) return;

    const WrappedWS = new Proxy(NativeWS, {
      construct(Target, args, NewTarget) {
        const ws = Reflect.construct(Target, args, NewTarget);
        state.connected = true;
        sync();

        try {
          ws.addEventListener('message', event => {
            inspectMessageData(event.data);
          }, true);
        } catch (_) {}

        // send 已統一由 WebSocket.prototype.send 攔截；不要再包 instance send，避免同一換房訊息處理兩次。
        return ws;
      }
    });

    try {
      Object.defineProperties(WrappedWS, {
        CONNECTING: { value: NativeWS.CONNECTING },
        OPEN: { value: NativeWS.OPEN },
        CLOSING: { value: NativeWS.CLOSING },
        CLOSED: { value: NativeWS.CLOSED },
        __xinyaoLiveV200Wrapped: { value: true }
      });
    } catch (_) {
      WrappedWS.__xinyaoLiveV200Wrapped = true;
    }

    window.WebSocket = WrappedWS;
  }

  function patchJSON() {
    if (JSON.parse.__xinyaoLiveV200Wrapped) return;

    const wrapped = function(...args) {
      const result = nativeJSONParse(...args);

      // test181：這一層比 Socket.IO onevent 更早。
      // ATG 把伺服器回包 JSON.parse 完之後、真正建立免遊播放佇列之前，
      // 先把完整預載的 free gameState 折疊成「開始 + 最後結算」。
      try { xinyaoCollapsePreloadedFreeGamePacket(result); } catch (_) {}

      try { inspectObject(result); } catch (_) {}
      return result;
    };

    try {
      Object.defineProperty(wrapped, '__xinyaoLiveV200Wrapped', { value: true });
    } catch (_) {}
    JSON.parse = wrapped;
  }

  function patchTextDecoder() {
    try {
      if (!window.TextDecoder) return;
      const current = TextDecoder.prototype.decode;
      if (current.__xinyaoLiveV200Wrapped) return;
      const nativeDecode = current;

      const wrapped = function(...args) {
        const text = nativeDecode.apply(this, args);
        try { parseText(text); } catch (_) {}
        return text;
      };

      try {
        Object.defineProperty(wrapped, '__xinyaoLiveV200Wrapped', { value: true });
      } catch (_) {}
      TextDecoder.prototype.decode = wrapped;
    } catch (_) {}
  }

  const XIANYAO_NATIVE_ROOM_TEMPLATE_KEY = 'xinyao_atg_native_room_templates_v1';

  function nativeRoomTemplateScope() {
    try {
      const direct = String(window.__XIANYAO_ATG_ACTIVE_GAME_MODULE__ || '').toLowerCase();
      if (direct === 'tiger' || direct === 'seth') return direct;
    } catch (_) {}
    try {
      const stored = String(localStorage.getItem('xinyao_atg_active_game_module_v1') || '').toLowerCase();
      if (stored === 'tiger' || stored === 'seth') return stored;
    } catch (_) {}
    try {
      if (/xinyao-hd-launch:tiger:/i.test(String(window.name || ''))) return 'tiger';
      if (/xinyao-hd-launch:seth:/i.test(String(window.name || ''))) return 'seth';
    } catch (_) {}
    return 'unknown';
  }

  function nativeRoomTemplateStorageKey() {
    return XIANYAO_NATIVE_ROOM_TEMPLATE_KEY + ':' + nativeRoomTemplateScope();
  }

  function serializableRoomTemplateValue(value, depth = 0, seen = new WeakSet()) {
    if (depth > 12) return null;
    if (value == null) return value;

    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') return value;
    if (type === 'function' || type === 'symbol' || type === 'bigint') return undefined;
    if (type !== 'object') return null;

    if (seen.has(value)) return undefined;
    seen.add(value);

    if (Array.isArray(value)) {
      return value
        .map(item => serializableRoomTemplateValue(item, depth + 1, seen))
        .filter(item => item !== undefined);
    }

    const out = {};
    for (const [key, child] of Object.entries(value)) {
      const next = serializableRoomTemplateValue(child, depth + 1, seen);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }

  function loadPersistedNativeRoomTemplates() {
    try {
      const raw = sessionStorage.getItem(nativeRoomTemplateStorageKey());
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function persistNativeRoomTemplate(kind, eventName, args, extra = {}) {
    try {
      const store = loadPersistedNativeRoomTemplates();
      store[kind] = {
        event:String(eventName || ''),
        args:serializableRoomTemplateValue(Array.isArray(args) ? args.slice(1) : []),
        capturedAt:Date.now(),
        ...extra
      };
      sessionStorage.setItem(nativeRoomTemplateStorageKey(), JSON.stringify(store));
      return true;
    } catch (_) {
      return false;
    }
  }

  function xinyaoEventContainsRoomId(args, roomId) {
    const wanted = Number(roomId);
    if (!Number.isFinite(wanted)) return false;

    const seen = new WeakSet();
    const walk = (value, depth = 0) => {
      if (depth > 12 || value == null) return false;

      if (typeof value === 'number') return Number(value) === wanted;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^\d+$/.test(trimmed) && Number(trimmed) === wanted) return true;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object') return walk(parsed, depth + 1);
        } catch (_) {}
        return false;
      }

      if (typeof value !== 'object') return false;
      if (seen.has(value)) return false;
      seen.add(value);

      if (Array.isArray(value)) {
        return value.some(item => walk(item, depth + 1));
      }

      for (const [key, child] of Object.entries(value)) {
        const normalized = String(key).replace(/[^a-z0-9]/gi,'').toLowerCase();
        if (['roomid','tableid','slottableid','machineid'].includes(normalized)) {
          if (Number(child) === wanted) return true;
        }
        if (walk(child, depth + 1)) return true;
      }
      return false;
    };

    return walk(args);
  }

  function xinyaoNativeEnterCandidateScore(candidate, roomId) {
    if (!candidate) return -Infinity;
    const event = String(candidate.event || '').toLowerCase();

    // 只排除明確不可能是進房的高頻事件；不再要求事件名稱符合 enter/join/switch。
    if (/^(?:ping|pong|heartbeat|spin|bet|balance|wallet|keepalive|ack)$/i.test(event)) {
      return -10000;
    }
    if (/^getslottabledetail$/i.test(event)) return -10000;

    let score = 0;
    if (xinyaoEventContainsRoomId(candidate.args, roomId)) score += 1000;
    if (/(room|table|slot|machine)/i.test(event)) score += 80;
    if (/(enter|join|select|switch|change|open|play|confirm)/i.test(event)) score += 60;
    score += Math.max(0, 300 - Math.floor((Date.now() - Number(candidate.at || 0)) / 20));
    return score;
  }

  function finalizeNativeEnterLearning(reason = 'selection-closed') {
    try {
      const learn = window.__XIANYAO_ATG_ENTER_LEARN_WINDOW__;
      if (!learn || !Array.isArray(learn.candidates) || !learn.candidates.length) return false;

      const candidates = learn.candidates
        .filter(item => item && item.socket === learn.socket)
        .map(item => ({
          ...item,
          score:xinyaoNativeEnterCandidateScore(item, learn.roomId)
        }))
        .filter(item => item.score > -1000)
        .sort((a,b) => b.score - a.score || Number(b.at || 0) - Number(a.at || 0));

      const best = candidates[0];
      if (!best) return false;

      window.__XIANYAO_ATG_ENTER_TEMPLATE__ = {
        socket:learn.socket,
        event:best.event,
        args:best.args.slice(),
        capturedAt:Number(best.at || Date.now()),
        sourceRoomId:learn.roomId,
        learnedBy:reason
      };

      persistNativeRoomTemplate(
        'enter',
        best.event,
        best.args,
        {
          sourceRoomId:learn.roomId,
          learnedBy:reason,
          score:best.score
        }
      );

      learn.completed = true;
      learn.completedAt = Date.now();
      learn.selectedEvent = best.event;
      try { sessionStorage.removeItem(nativeRoomTemplateStorageKey() + ':learning'); } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  function monitorNativeEnterLearning() {
    try {
      const learn = window.__XIANYAO_ATG_ENTER_LEARN_WINDOW__;
      if (!learn || learn.completed) return;

      const age = Date.now() - Number(learn.startedAt || 0);
      if (age > 12000) {
        // 超時仍嘗試從已收集候選挑最佳，不讓一次完整手動進房白做。
        finalizeNativeEnterLearning('timeout-best-candidate');
        return;
      }

      // getSlotTableDetail 發生時選機台視窗一定還在；
      // 等它真的消失，代表使用者已完成「選取/確認/切房」。
      const nowOpen = (() => {
        try { return !!isMachineSelectionOpenFromCocos(); }
        catch (_) { return null; }
      })();

      if (learn.wasSelectionOpen === undefined && nowOpen !== null) {
        learn.wasSelectionOpen = nowOpen;
      }

      if (learn.wasSelectionOpen === true && nowOpen === false && age > 150) {
        finalizeNativeEnterLearning('selection-closed');
      }
    } catch (_) {}
  }

  function finalizeNativeEnterLearningOnUnload(reason = 'pagehide') {
    try {
      // 優先使用記憶體中的完整候選（仍保有原始 args）。
      if (finalizeNativeEnterLearning(reason)) return true;

      // 若記憶體剛好來不及保留，退回 sessionStorage 的序列化候選。
      const raw = sessionStorage.getItem(nativeRoomTemplateStorageKey() + ':learning');
      const saved = raw ? JSON.parse(raw) : null;
      if (!saved || !Array.isArray(saved.candidates) || !saved.candidates.length) return false;

      const roomId = saved.roomId;
      const candidates = saved.candidates
        .map(item => ({
          event:String(item?.event || ''),
          args:Array.isArray(item?.args) ? item.args : [],
          at:Number(item?.at || 0),
          score:xinyaoNativeEnterCandidateScore(item, roomId)
        }))
        .filter(item => item.score > -1000)
        .sort((a,b) => b.score - a.score || Number(b.at || 0) - Number(a.at || 0));

      const best = candidates[0];
      if (!best) return false;

      persistNativeRoomTemplate(
        'enter',
        best.event,
        [best.event, ...best.args],
        {
          sourceRoomId:roomId,
          learnedBy:reason + '-persisted-buffer',
          score:best.score
        }
      );

      sessionStorage.removeItem(nativeRoomTemplateStorageKey() + ':learning');
      return true;
    } catch (_) {
      return false;
    }
  }

  try {
    window.addEventListener('pagehide', () => {
      try { finalizeNativeEnterLearningOnUnload('pagehide'); } catch (_) {}
    }, { capture:true });

    window.addEventListener('beforeunload', () => {
      try { finalizeNativeEnterLearningOnUnload('beforeunload'); } catch (_) {}
    }, { capture:true });
  } catch (_) {}


  // ===== test180：免遊「直接結算」核心 =====
  // ATG 戰神賽特2 的 spin 回包已確認會一次帶回整段 free gameState。
  // 這裡不遮畫面、不倍速、也不偽造派彩；只在 Socket.IO 把結果交給遊戲前，
  // 將已預載的中間 freeSpin view 折疊成「開始 view + 最終 view」。
  // 讓 ATG 自己照原生流程收尾並送 closeSpin。
  function xinyaoFreeDirectSettleEnabled() {
    // test183：不再修改 ATG 封包 / gameState / WebSocket 資料。
    return false;
  }

  function xinyaoIsSethDirectSettleTarget() {
    try {
      const active = typeof xinyaoActiveGameModule === 'function'
        ? String(xinyaoActiveGameModule() || '').toLowerCase()
        : String(window.__XIANYAO_ATG_ACTIVE_GAME_MODULE__ || '').toLowerCase();
      if (active) return active === 'seth';
    } catch (_) {}

    try {
      const url = new URL(location.href);
      return String(url.searchParams.get('gn') || '').toLowerCase() === 'golden-seth';
    } catch (_) {
      return /(?:^|[?&])gn=golden-seth(?:&|$)/i.test(String(location.href || ''));
    }
  }

  function xinyaoCollapsePreloadedFreeGamePacket(root) {
    const report = {
      version: 'test189',
      at: Date.now(),
      enabled: false,
      target: false,
      changed: false,
      collapsed: 0,
      rows: []
    };

    try {
      report.enabled = xinyaoFreeDirectSettleEnabled();
      report.target = xinyaoIsSethDirectSettleTarget();
      if (!report.enabled || !report.target || !root || typeof root !== 'object') {
        window.__XIANYAO_ATG_FREE_DIRECT_SETTLE_STATE__ = report;
        return report;
      }

      const seen = new WeakSet();

      const collapseStates = (owner, path) => {
        const states = owner?.gameState;
        if (!Array.isArray(states) || states.length < 3) return;

        const startIndex = states.findIndex(item => item?.startFreeGame === true);
        const hasFreeSpin = states.some(item => String(item?.action || '').toLowerCase() === 'freespin');
        if (startIndex < 0 || !hasFreeSpin) return;

        let finalIndex = states.length - 1;
        let finalView = Number(states[finalIndex]?.currentView);
        for (let i = 0; i < states.length; i += 1) {
          const view = Number(states[i]?.currentView);
          if (Number.isFinite(view) && (!Number.isFinite(finalView) || view >= finalView)) {
            finalView = view;
            finalIndex = i;
          }
        }

        if (finalIndex === startIndex) return;

        const startRaw = states[startIndex];
        const finalRaw = states[finalIndex];
        const finalCount = Number(finalRaw?.freeGameCount);
        const finalTotal = Number(finalRaw?.totalWinnings);

        // 只有「最後 view 已明確 freeGameCount=0」才折疊，避免碰到逐轉伺服器型免遊。
        if (!Number.isFinite(finalCount) || finalCount !== 0) return;
        if (!Number.isFinite(finalTotal)) return;

        const originalLength = states.length;
        const originalTotalViews = Number(startRaw?.totalViews) || Number(finalRaw?.totalViews) || originalLength;

        const first = { ...startRaw };
        const last = { ...finalRaw };

        // 維持原生「進免遊 -> 最後一個 freeSpin -> 結算」狀態機，但不再餵中間十幾個 view。
        // freeGameCount 改成 1 是為了讓 ATG 不再等待不存在的其餘免遊 view。
        first.currentView = 0;
        first.totalViews = 2;
        first.startFreeGame = true;
        if ('freeGameCount' in first) first.freeGameCount = 1;

        last.currentView = 1;
        last.totalViews = 2;
        last.startFreeGame = false;
        if ('freeGameCount' in last) last.freeGameCount = 0;

        // 原地 splice，確保遊戲其他地方若持有同一 gameState 參照也會同步看到折疊後內容。
        states.splice(0, states.length, first, last);

        report.changed = true;
        report.collapsed += 1;
        report.rows.push({
          path,
          originalLength,
          originalTotalViews,
          collapsedLength: states.length,
          finalAmount: Math.round(finalTotal * 100) / 100,
          spinId: String(owner?.spinId || '')
        });
      };

      const visit = (value, path = 'packet', depth = 0) => {
        if (!value || typeof value !== 'object' || depth > 18 || seen.has(value)) return;
        seen.add(value);

        try { collapseStates(value, path); } catch (_) {}

        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i += 1) {
            if (value[i] && typeof value[i] === 'object') visit(value[i], `${path}[${i}]`, depth + 1);
          }
        } else {
          for (const [key, child] of Object.entries(value)) {
            if (child && typeof child === 'object') visit(child, `${path}.${key}`, depth + 1);
          }
        }
      };

      visit(root);
    } catch (error) {
      report.error = String(error?.message || error || 'collapse_failed');
    }

    report.at = Date.now();
    try {
      window.__XIANYAO_ATG_FREE_DIRECT_SETTLE_STATE__ = report;
      sessionStorage.setItem('xinyao_atg_free_direct_settle_test183', JSON.stringify(report));
      if (report.changed) {
        window.dispatchEvent(new CustomEvent('xinyao:free-direct-settle', { detail: report }));
      }
    } catch (_) {}

    return report;
  }


  // ===== test183：Raw WebSocket inbound 前置攔截 =====
  // test180/181 證明：後段 engine / JSON 副本不是 ATG 畫面真正消費的播放資料。
  // test182 改在 WebSocket message handler 邊界：遊戲 callback 看到 data 之前先改寫。
  const XIANYAO_FREE_RAW_WRAP = Symbol('xinyaoFreeRawWrap182');
  const XIANYAO_FREE_RAW_LISTENERS = new WeakMap();
  const XIANYAO_FREE_RAW_ONMESSAGE = new WeakMap();

  function xinyaoRewriteOneInboundTextFrame(rawText) {
    const raw = String(rawText ?? '');
    if (!raw || !xinyaoFreeDirectSettleEnabled() || !xinyaoIsSethDirectSettleTarget()) return raw;

    const positions = [raw.indexOf('['), raw.indexOf('{')].filter(i => i >= 0);
    if (!positions.length) return raw;

    const start = Math.min(...positions);
    const prefix = raw.slice(0, start);
    const body = raw.slice(start);

    let parsed;
    try { parsed = nativeJSONParse(body); }
    catch (_) { return raw; }

    let report;
    try { report = xinyaoCollapsePreloadedFreeGamePacket(parsed); }
    catch (_) { return raw; }

    if (!report?.changed) return raw;

    let rewritten;
    try { rewritten = prefix + JSON.stringify(parsed); }
    catch (_) { return raw; }

    try {
      window.__XIANYAO_ATG_FREE_RAW_SETTLE_STATE__ = {
        version:'test189',
        at:Date.now(),
        changed:true,
        collapsed:Number(report.collapsed || 0),
        rows:Array.isArray(report.rows) ? report.rows.slice(0,8) : [],
        originalBytes:raw.length,
        rewrittenBytes:rewritten.length
      };
      sessionStorage.setItem(
        'xinyao_atg_free_raw_settle_test183',
        JSON.stringify(window.__XIANYAO_ATG_FREE_RAW_SETTLE_STATE__)
      );
      window.dispatchEvent(new CustomEvent('xinyao:free-raw-settle', {
        detail:window.__XIANYAO_ATG_FREE_RAW_SETTLE_STATE__
      }));
    } catch (_) {}

    return rewritten;
  }

  function xinyaoRewriteInboundFrameData(data) {
    try {
      if (typeof data === 'string') {
        // Engine.IO 有機會把多個 packet 以 record-separator 合併。
        if (data.includes('\x1e')) {
          const parts = data.split('\x1e');
          let changed = false;
          const next = parts.map(part => {
            const rewritten = xinyaoRewriteOneInboundTextFrame(part);
            if (rewritten !== part) changed = true;
            return rewritten;
          });
          return changed ? next.join('\x1e') : data;
        }
        return xinyaoRewriteOneInboundTextFrame(data);
      }

      // 少數實作把 UTF-8 text 以 ArrayBuffer / TypedArray 交給 listener。
      // 只處理可直接 UTF-8 解碼且可 JSON.parse 的資料；壓縮 binary 保持原樣。
      if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
        const view = data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const decoded = new TextDecoder().decode(view).replace(/^\u0004+/, '');
        const rewritten = xinyaoRewriteOneInboundTextFrame(decoded);
        if (rewritten === decoded) return data;
        return new TextEncoder().encode(rewritten).buffer;
      }
    } catch (_) {}
    return data;
  }

  function xinyaoProxyMessageEvent(event, nextData) {
    if (!event || nextData === event.data) return event;
    try {
      return new Proxy(event, {
        get(target, prop) {
          if (prop === 'data') return nextData;
          const value = Reflect.get(target, prop, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    } catch (_) {
      try {
        return new MessageEvent('message', {
          data:nextData,
          origin:event.origin || '',
          lastEventId:event.lastEventId || ''
        });
      } catch (_) {
        return event;
      }
    }
  }

  function xinyaoWrapMessageListener(listener) {
    if (!listener) return listener;
    if (listener?.[XIANYAO_FREE_RAW_WRAP]) return listener;

    let wrapped;
    if (typeof listener === 'function') {
      wrapped = function(event) {
        let nextEvent = event;
        try {
          const nextData = xinyaoRewriteInboundFrameData(event?.data);
          if (nextData !== event?.data) nextEvent = xinyaoProxyMessageEvent(event, nextData);
        } catch (_) {}
        return listener.call(this, nextEvent);
      };
    } else if (typeof listener?.handleEvent === 'function') {
      wrapped = {
        handleEvent(event) {
          let nextEvent = event;
          try {
            const nextData = xinyaoRewriteInboundFrameData(event?.data);
            if (nextData !== event?.data) nextEvent = xinyaoProxyMessageEvent(event, nextData);
          } catch (_) {}
          return listener.handleEvent(nextEvent);
        }
      };
    } else {
      return listener;
    }

    try { Object.defineProperty(wrapped, XIANYAO_FREE_RAW_WRAP, { value:true }); } catch (_) {}
    return wrapped;
  }

  function patchWebSocketInboundHandlersForWindow(targetWindow) {
    try {
      const WS = targetWindow?.WebSocket;
      const proto = WS?.prototype;
      if (!proto || proto.__xinyaoFreeRawInbound182) return false;

      const nativeAdd = proto.addEventListener;
      const nativeRemove = proto.removeEventListener;

      if (typeof nativeAdd === 'function' && typeof nativeRemove === 'function') {
        proto.addEventListener = function(type, listener, options) {
          if (String(type).toLowerCase() !== 'message' || !listener) {
            return nativeAdd.call(this, type, listener, options);
          }

          let bySocket = XIANYAO_FREE_RAW_LISTENERS.get(this);
          if (!bySocket) {
            bySocket = new WeakMap();
            XIANYAO_FREE_RAW_LISTENERS.set(this, bySocket);
          }

          let wrapped = bySocket.get(listener);
          if (!wrapped) {
            wrapped = xinyaoWrapMessageListener(listener);
            try { bySocket.set(listener, wrapped); } catch (_) {}
          }
          return nativeAdd.call(this, type, wrapped, options);
        };

        proto.removeEventListener = function(type, listener, options) {
          if (String(type).toLowerCase() === 'message' && listener) {
            const wrapped = XIANYAO_FREE_RAW_LISTENERS.get(this)?.get(listener);
            if (wrapped) return nativeRemove.call(this, type, wrapped, options);
          }
          return nativeRemove.call(this, type, listener, options);
        };
      }

      // engine.io / socket.io-client 常用 ws.onmessage = fn，這條也一起攔。
      try {
        const desc = Object.getOwnPropertyDescriptor(proto, 'onmessage');
        if (desc?.set && desc?.get) {
          Object.defineProperty(proto, 'onmessage', {
            configurable: desc.configurable !== false,
            enumerable: desc.enumerable,
            get() {
              const row = XIANYAO_FREE_RAW_ONMESSAGE.get(this);
              if (row) return row.original;
              try { return desc.get.call(this); } catch (_) { return null; }
            },
            set(listener) {
              if (typeof listener !== 'function') {
                XIANYAO_FREE_RAW_ONMESSAGE.delete(this);
                return desc.set.call(this, listener);
              }
              const wrapped = xinyaoWrapMessageListener(listener);
              XIANYAO_FREE_RAW_ONMESSAGE.set(this, { original:listener, wrapped });
              return desc.set.call(this, wrapped);
            }
          });
        }
      } catch (_) {}

      try { Object.defineProperty(proto, '__xinyaoFreeRawInbound182', { value:true }); }
      catch (_) { proto.__xinyaoFreeRawInbound182 = true; }

      return true;
    } catch (_) {
      return false;
    }
  }

  function patchSocketIO() {
    for (const gameWindow of collectSameOriginLiveWindows()) {
      try {
        const proto = gameWindow.io?.Socket?.prototype;
        if (!proto) continue;

        if (typeof proto.onevent === 'function' && !proto.onevent.__xinyaoLiveV200Wrapped) {
          const nativeOnevent = proto.onevent;
          const wrappedOnevent = function(packet) {
            // 先讓芯瑤讀完整原始回包，保留最終贏分 / 診斷資料；
            // 再於 ATG 自己的 handler 執行前折疊免遊中間 view。
            try { if (packet?.data) inspectObject(packet.data); } catch (_) {}
            try { if (packet?.data) xinyaoCollapsePreloadedFreeGamePacket(packet.data); } catch (_) {}
            return nativeOnevent.call(this, packet);
          };
          try { Object.defineProperty(wrappedOnevent, '__xinyaoLiveV200Wrapped', { value: true }); } catch (_) {}
          proto.onevent = wrappedOnevent;
        }

        if (typeof proto.emit === 'function' && !proto.emit.__xinyaoRoomOutboundWrapped) {
          const nativeEmit = proto.emit;
          const wrappedEmit = function(...args) {
            try {
              try { window.__XIANYAO_ATG_LATEST_SOCKET__ = this; } catch (_) {}
              const eventHint = typeof args[0] === 'string' ? args[0] : '';
              applyOutboundRoomFromTransport(args, eventHint);

              const nowAt = Date.now();

              // 1) 保存 ATG 原生「選房詳情」事件。
              if (/^getSlotTableDetail$/i.test(eventHint)) {
                window.__XIANYAO_ATG_DIRECT_ROOM__ = {
                  socket: this,
                  args: args.slice(),
                  capturedAt: nowAt
                };

                const learnedRoomId = (() => {
                  try { return findNamedNumber(args, new Set(['roomid','tableid','slottableid','machineid'])); }
                  catch (_) { return null; }
                })();

                window.__XIANYAO_ATG_ENTER_LEARN_WINDOW__ = {
                  socket: this,
                  startedAt: nowAt,
                  roomId: learnedRoomId,
                  candidates: [],
                  completed: false,
                  wasSelectionOpen: (() => {
                    try { return !!isMachineSelectionOpenFromCocos(); }
                    catch (_) { return true; }
                  })()
                };

                persistNativeRoomTemplate(
                  'selector',
                  eventHint,
                  args,
                  { sourceRoomId: learnedRoomId }
                );
              }

              // 2) 自動學習「按選取後真正進房」的 Socket 事件。
              // 只在剛發生 getSlotTableDetail 後幾秒內收集，避免把一般遊戲事件誤認成進房。
              const learn = window.__XIANYAO_ATG_ENTER_LEARN_WINDOW__;
              const inLearnWindow =
                !!learn &&
                !learn.completed &&
                learn.socket === this &&
                (nowAt - Number(learn.startedAt || 0) <= 12000);

              if (inLearnWindow && !/^getSlotTableDetail$/i.test(eventHint)) {
                try {
                  learn.candidates.push({
                    socket:this,
                    event:eventHint,
                    args:args.slice(),
                    at:nowAt
                  });
                  if (learn.candidates.length > 40) learn.candidates.shift();

                  // 虎小妹切房會直接 reload，先把「可序列化候選事件」同步保存，
                  // 即使下一毫秒頁面被重載也不會全部遺失。
                  try {
                    const safeCandidates = learn.candidates.map(item => ({
                      event:String(item.event || ''),
                      args:serializableRoomTemplateValue(item.args || []),
                      at:Number(item.at || 0)
                    }));
                    sessionStorage.setItem(
                      nativeRoomTemplateStorageKey() + ':learning',
                      JSON.stringify({
                        roomId:learn.roomId,
                        startedAt:learn.startedAt,
                        candidates:safeCandidates
                      })
                    );
                  } catch (_) {}
                } catch (_) {}
              }
            } catch (_) {}
            return nativeEmit.apply(this, args);
          };
          try { Object.defineProperty(wrappedEmit, '__xinyaoRoomOutboundWrapped', { value: true }); } catch (_) {}
          proto.emit = wrappedEmit;
        }
      } catch (_) {}
    }
  }

  function patchFetchOutboundRoom() {
    try {
      const currentFetch = window.fetch;
      if (!currentFetch || currentFetch.__xinyaoRoomOutboundWrapped) return;
      const wrappedFetch = function(input, init = {}) {
        try {
          const url = typeof input === 'string' ? input : input?.url || '';
          if (url) applyOutboundRoomFromTransport(url, 'fetch:url');
          if (init?.body !== undefined && init?.body !== null) {
            applyOutboundRoomFromTransport(init.body, 'fetch:body');
          } else if (typeof Request !== 'undefined' && input instanceof Request) {
            try {
              input.clone().text().then(text => {
                if (text) applyOutboundRoomFromTransport(text, 'fetch:request');
              }).catch(() => {});
            } catch (_) {}
          }
        } catch (_) {}
        return currentFetch.apply(this, arguments);
      };
      try { Object.defineProperty(wrappedFetch, '__xinyaoRoomOutboundWrapped', { value: true }); } catch (_) {}
      window.fetch = wrappedFetch;
    } catch (_) {}
  }

  function patchXHROutboundRoom() {
    try {
      const XHR = window.XMLHttpRequest;
      if (!XHR?.prototype) return;
      const proto = XHR.prototype;
      if (typeof proto.open === 'function' && !proto.open.__xinyaoRoomOutboundWrapped) {
        const nativeOpen = proto.open;
        const wrappedOpen = function(method, url, ...rest) {
          try { this.__xinyaoRoomOutboundUrl = String(url || ''); } catch (_) {}
          return nativeOpen.call(this, method, url, ...rest);
        };
        try { Object.defineProperty(wrappedOpen, '__xinyaoRoomOutboundWrapped', { value: true }); } catch (_) {}
        proto.open = wrappedOpen;
      }
      if (typeof proto.send === 'function' && !proto.send.__xinyaoRoomOutboundWrapped) {
        const nativeSend = proto.send;
        const wrappedSend = function(body) {
          try {
            if (this.__xinyaoRoomOutboundUrl) applyOutboundRoomFromTransport(this.__xinyaoRoomOutboundUrl, 'xhr:url');
            if (body !== undefined && body !== null) applyOutboundRoomFromTransport(body, 'xhr:body');
          } catch (_) {}
          return nativeSend.call(this, body);
        };
        try { Object.defineProperty(wrappedSend, '__xinyaoRoomOutboundWrapped', { value: true }); } catch (_) {}
        proto.send = wrappedSend;
      }
    } catch (_) {}
  }


  if (window.__XIANYAO_ATG_TEST_MODE__) {
    window.__XIANYAO_ATG_LIVE_TEST__ = {
      readFreeGameSignal,
      computeFreeGameState,
      freeGameTextFor,
      evolveRoomFreeEntryCounter,
      resolveRoomIdentityFromEngine,
      resolveRoomIdentityFromCocosLabels,
      resolveRoomIdentityFromCocos,
      shouldIgnoreIdentityAgainstCocos,
      resolveRoomIdentityFromOutboundText,
      resolveRoomIdentityFromOutboundObject,
      inspectOutboundRoomData,
      inspectOutboundRoomDataAsync,
      decodeLiveBinaryRoomFrame,
      refreshCurrentRoomMappingFromScan,
      applyCurrentRoomSelectionBridge,
      nearestAllowedStake,
      buildStageRecommendation,
      advanceResetResilientCounter
    };
  }

  try {
    window.addEventListener('xinyao:current-room-selected', event => {
      try { applyCurrentRoomSelectionBridge(event?.detail || {}); } catch (_) {}
    });
  } catch (_) {}

  mountPanel();
  syncCocosRoomIdentity();
  setInterval(syncCocosRoomIdentity, 200);
  setInterval(refreshCurrentRoomMappingFromScan, 250);
  setInterval(monitorNativeEnterLearning, 120);
  patchWebSocket();
  patchJSON();
  patchTextDecoder();
  patchSocketIO();
  patchFetchOutboundRoom();
  patchXHROutboundRoom();

  const patchTimer = setInterval(() => {
    mountPanel();
    patchWebSocket();
    patchJSON();
    patchTextDecoder();
    patchSocketIO();
    patchFetchOutboundRoom();
    patchXHROutboundRoom();
  }, 100);
  setTimeout(() => clearInterval(patchTimer), 60000);

  setInterval(() => {
    if (deviceToken) pushCloud(false);
  }, 1200);

  if (deviceToken) {
    state.cloudStatus = '☁️ 已綁定，等待同步';
    setTimeout(() => pushCloud(true), 1200);
  }
})();


/* ===== 芯瑤 ATG 全房分析 v3.1.4｜全裝置自適應＋免彈窗同步＋掃描結果持久化 ===== */
(() => {
  'use strict';

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const finiteNumber = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const safeRate = (win, bet) => {
    const w = finiteNumber(win);
    const b = finiteNumber(bet);
    if (w === null || b === null || b <= 0) return null;
    return (w / b) * 100;
  };

  function normalizeRoom(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const roomId = finiteNumber(obj.roomId);
    const number = finiteNumber(obj.number);
    if (roomId === null) return null;

    return {
      roomId,
      number,
      status: typeof obj.status === 'string' ? obj.status : null,
      bet: finiteNumber(obj.bet),
      win: finiteNumber(obj.win),
      today: {
        bet: finiteNumber(obj.today?.bet),
        win: finiteNumber(obj.today?.win)
      },
      updatedAt: new Date().toISOString()
    };
  }

  function calculateMetrics(room) {
    const todayRate = safeRate(room?.today?.win, room?.today?.bet);
    const totalRate = safeRate(room?.win, room?.bet);

    // 平滑動態分數：不再把高得分率硬截在固定上限。
    // 投注量越少，訊號越靠近中性 50；資料量越充足，才讓得分率差異完整反映。
    const weightedSignal = (rate, bet, volumeScale, rateSpread) => {
      if (rate === null) return null;
      const volume = Math.max(0, finiteNumber(bet) || 0);
      const volumeWeight = clamp(Math.log10(volume + 1) / volumeScale, 0.25, 1);
      return Math.tanh((rate - 100) / rateSpread) * volumeWeight;
    };

    const todaySignal = weightedSignal(todayRate, room?.today?.bet, 6.0, 60);
    const totalSignal = weightedSignal(totalRate, room?.bet, 6.5, 55);

    let observationScore = null;
    if (todaySignal !== null || totalSignal !== null) {
      let combinedSignal;
      if (todaySignal !== null && totalSignal !== null) {
        combinedSignal = todaySignal * 0.65 + totalSignal * 0.35;
      } else {
        combinedSignal = todaySignal ?? totalSignal;
      }
      observationScore = clamp(50 + combinedSignal * 50, 0, 100);
    }

    return {
      todayRate,
      totalRate,
      observationScore,
      todayBet: finiteNumber(room?.today?.bet),
      totalBet: finiteNumber(room?.bet)
    };
  }

  function rankRooms(rooms, options = {}) {
    const {
      onlyEmpty = true,
      mode = 'observation'
    } = options;

    const prepared = (rooms || [])
      .filter(Boolean)
      .filter(r => finiteNumber(r.number) !== null)
      .filter(r => !onlyEmpty || r.status === 'Empty')
      .map(r => ({ ...r, metrics: calculateMetrics(r) }));

    const value = (r) => {
      if (mode === 'today') return r.metrics.todayRate;
      if (mode === 'total') return r.metrics.totalRate;
      if (mode === 'todayBet') return r.metrics.todayBet;
      return r.metrics.observationScore;
    };

    return prepared.sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (av === null && bv === null) return a.number - b.number;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (bv !== av) return bv - av;
      return a.number - b.number;
    });
  }

  function countNumberedRooms(rooms) {
    return (rooms || []).filter(r => finiteNumber(r?.number) !== null).length;
  }

  // 房號才是 4100 房真正穩定的唯一鍵；roomId 在不同批次/頁面不保證適合作為累積鍵。
  function roomStorageKey(room) {
    const number = finiteNumber(room?.number);
    if (number !== null && number >= 1 && number <= 4100) return `n:${number}`;
    const roomId = finiteNumber(room?.roomId);
    return roomId !== null ? `id:${roomId}` : null;
  }

  // ATG Binary frame 常見格式：04 + zlib(78 9C/DA/01/5E...)。
  // 不寫死只跳 1 byte，而是在前 32 bytes 內找合法 zlib header。
  function findZlibOffset(input) {
    let bytes;
    try {
      if (input instanceof Uint8Array) bytes = input;
      else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
      else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      else return -1;
    } catch (_) {
      return -1;
    }

    const limit = Math.min(Math.max(0, bytes.length - 1), 32);
    for (let i = 0; i < limit; i++) {
      const cmf = bytes[i];
      const flg = bytes[i + 1];
      if ((cmf & 0x0f) !== 8) continue; // deflate
      if (((cmf << 8) + flg) % 31 !== 0) continue;
      return i;
    }
    return -1;
  }

  async function inflateZlibText(bytes) {
    const chunk = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

    // 現代 Chrome / Edge / Safari 優先走原生 API，不需額外套件。
    if (typeof DecompressionStream === 'function') {
      const stream = new Blob([chunk]).stream().pipeThrough(new DecompressionStream('deflate'));
      return await new Response(stream).text();
    }

    // 某些 ATG 頁面本身有 pako，舊瀏覽器可直接借用。
    const pako = typeof globalThis !== 'undefined' ? globalThis.pako : null;
    if (pako && typeof pako.inflate === 'function') {
      const out = pako.inflate(chunk);
      return new TextDecoder().decode(out);
    }

    return '';
  }

  async function decodeBinaryFrameToText(input) {
    let bytes;
    try {
      if (input instanceof Uint8Array) bytes = input;
      else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
      else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      else if (typeof Blob !== 'undefined' && input instanceof Blob) bytes = new Uint8Array(await input.arrayBuffer());
      else return '';
    } catch (_) {
      return '';
    }

    if (!bytes.length) return '';

    const zlibOffset = findZlibOffset(bytes);
    if (zlibOffset >= 0) {
      try {
        const text = await inflateZlibText(bytes.subarray(zlibOffset));
        if (text && text.trim()) return text;
      } catch (_) {}
    }

    // 少數 frame 不是壓縮資料；保留直接 UTF-8 解碼 fallback。
    try {
      const direct = new TextDecoder().decode(bytes);
      if (direct && direct.trim()) return direct.replace(/^\u0004+/, '');
    } catch (_) {}

    return '';
  }

  // ===== 全裝置自適應頁碼定位 =====
  // 不再用「某一支全裝置 / 某一種解析度」寫死座標。
  // 先從目前畫面挑出真正的遊戲 surface，再準備多組安全的頁碼列假設；
  // 實際點擊後用 ATG 回來的房號區間判斷落在哪一頁，自動修正 X / Y 並記住。
  function selectAdaptiveGameSurface(viewportWidth, viewportHeight, canvasRects = []) {
    const vw = Math.max(1, finiteNumber(viewportWidth) || 1);
    const vh = Math.max(1, finiteNumber(viewportHeight) || 1);
    const viewportArea = vw * vh;

    const rows = (Array.isArray(canvasRects) ? canvasRects : [])
      .map((r, index) => {
        const left = finiteNumber(r?.left) || 0;
        const top = finiteNumber(r?.top) || 0;
        const width = finiteNumber(r?.width) || 0;
        const height = finiteNumber(r?.height) || 0;
        const area = finiteNumber(r?.area) || width * height;
        const widthRatio = width / vw;
        const heightRatio = height / vh;
        const coverage = area / viewportArea;
        const centerX = left + width / 2;
        const centerY = top + height / 2;
        const centerDistance = Math.hypot((centerX - vw / 2) / vw, (centerY - vh / 2) / vh);
        return { index, left, top, width, height, area, widthRatio, heightRatio, coverage, centerDistance };
      })
      .filter(r => r.width >= Math.min(300, vw * 0.45) && r.height >= Math.min(260, vh * 0.45));

    const ranked = rows
      .filter(r => {
        const aspect = r.width / Math.max(1, r.height);
        const largeGeneralSurface = r.coverage >= 0.34 && r.widthRatio >= 0.45 && r.heightRatio >= 0.45;
        // 桌機瀏覽器可以是橫向寬畫面，但 ATG 遊戲本體仍是置中的直式 Canvas。
        // 這種情況寬度只佔整個瀏覽器約 25～40%，舊門檻會誤把整個 viewport 當成遊戲 surface。
        const centeredPortraitSurface = aspect <= 0.90 &&
          r.heightRatio >= 0.70 && r.widthRatio >= 0.22 && r.coverage >= 0.18 &&
          r.centerDistance <= 0.32;
        return largeGeneralSurface || centeredPortraitSurface;
      })
      .map(r => ({
        ...r,
        score: r.coverage * 6 + Math.min(r.widthRatio, 1) + Math.min(r.heightRatio, 1) - r.centerDistance * 2.5
      }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (best) {
      return {
        source: 'canvas',
        canvasIndex: best.index,
        rect: {
          left: best.left,
          top: best.top,
          width: best.width,
          height: best.height,
          area: best.area
        }
      };
    }

    return {
      source: 'viewport',
      canvasIndex: -1,
      rect: { left: 0, top: 0, width: vw, height: vh, area: viewportArea }
    };
  }

  function buildAdaptivePagerHypotheses(rect, viewportWidth, viewportHeight) {
    if (!rect) return [];
    const width = Math.max(1, finiteNumber(rect.width) || 1);
    const height = Math.max(1, finiteNumber(rect.height) || 1);
    const ratio = width / height;
    const vw = Math.max(1, finiteNumber(viewportWidth) || width);
    const vh = Math.max(1, finiteNumber(viewportHeight) || height);
    const viewportRatio = vw / vh;
    const hypotheses = [];
    const add = (id, x0, step, y, showAllX, showAllY) => {
      const lastX = x0 + step * 8;
      if (x0 <= 0.01 || step <= 0.015 || lastX >= 0.98 || y <= 0.08 || y >= 0.38) return;
      hypotheses.push({ id, x0, step, y, showAllX, showAllY });
    };

    // rect 已經是實際遊戲 surface；桌機外層 viewport 再寬，也不能把置中的直式遊戲誤判成橫式。
    if (ratio >= 1.35) {
      // 已驗證的兩種 ATG landscape 排版 + 中間值。
      // 實際裝置若不是其中任何一種，後續 landing feedback 仍會自動修正。
      add('landscape-compact', 0.1771, 0.0528, 0.1814, 0.2430, 0.1050);
      add('landscape-wide',    0.0755, 0.0732, 0.2270, 0.1000, 0.1300);
      add('landscape-mid',     0.1230, 0.0625, 0.2050, 0.1700, 0.1180);
    } else if (ratio <= 0.90 || viewportRatio <= 0.85) {
      add('portrait-main', 0.0520, 0.0990, 0.1810, 0.4430, 0.1470);
      add('portrait-mid',  0.0700, 0.0910, 0.2050, 0.4300, 0.1500);
      add('portrait-wide', 0.0950, 0.0820, 0.2300, 0.4150, 0.1600);
    } else {
      // 平板、分割畫面、特殊縮放比例。
      add('balanced-a', 0.1050, 0.0740, 0.1900, 0.1900, 0.1250);
      add('balanced-b', 0.1350, 0.0640, 0.2150, 0.2050, 0.1350);
      add('balanced-c', 0.0700, 0.0830, 0.2350, 0.1750, 0.1450);
    }

    return hypotheses;
  }

  // 舊函式名稱保留，避免其他程式碼需要大改；但內部已是全裝置自適應。
  function selectFixedPagerProfile(viewportWidth, viewportHeight, canvasRects = []) {
    const vw = Math.max(1, finiteNumber(viewportWidth) || 1);
    const vh = Math.max(1, finiteNumber(viewportHeight) || 1);
    const surface = selectAdaptiveGameSurface(vw, vh, canvasRects);
    const hypotheses = buildAdaptivePagerHypotheses(surface.rect, vw, vh);
    const primary = hypotheses[0] || {
      id: 'fallback', x0: 0.12, step: 0.07, y: 0.21, showAllX: 0.18, showAllY: 0.13
    };
    const aspect = surface.rect.width / Math.max(1, surface.rect.height);
    // surface 若是 Canvas 就以 Canvas 自身比例判斷；若找不到 Canvas，surface 本身就是 viewport。
    const layout = aspect >= 1.35
      ? '橫版自適應'
      : (aspect <= 0.90 ? '直版自適應' : '平板自適應');
    return {
      key: 'adaptive-surface',
      layout,
      source: surface.source,
      canvasIndex: surface.canvasIndex,
      rect: surface.rect,
      hypotheses,
      ...primary
    };
  }

  function buildDynamicScanPlan(summary = {}) {
    const totalTableCountRaw = finiteNumber(summary.totalTableCount);
    const tablePerPageRaw = finiteNumber(summary.tablePerPage);
    const totalPagesRaw = finiteNumber(summary.totalPages);

    const totalTableCount = totalTableCountRaw !== null && totalTableCountRaw > 0
      ? Math.max(1, Math.trunc(totalTableCountRaw))
      : 0;
    const tablePerPage = tablePerPageRaw !== null && tablePerPageRaw > 0
      ? Math.max(1, Math.trunc(tablePerPageRaw))
      : 500;
    const inferredPages = totalTableCount > 0
      ? Math.ceil(totalTableCount / tablePerPage)
      : 0;
    const totalPages = totalPagesRaw !== null && totalPagesRaw > 0
      ? Math.max(1, Math.trunc(totalPagesRaw))
      : Math.max(1, inferredPages || 1);
    const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

    const rangeForPage = page => {
      const p = Math.trunc(finiteNumber(page) || 0);
      if (p < 1 || p > totalPages) return null;
      const min = (p - 1) * tablePerPage + 1;
      const naturalMax = p * tablePerPage;
      const max = totalTableCount > 0 ? Math.min(totalTableCount, naturalMax) : naturalMax;
      return { min, max };
    };

    const expectedBandCount = page => {
      const range = rangeForPage(page);
      if (!range) return 0;
      return Math.max(0, range.max - range.min + 1);
    };

    return {
      totalTableCount,
      tablePerPage,
      totalPages,
      pages,
      rangeForPage,
      expectedBandCount
    };
  }

  function buildScanInteractionPolicy(summary = {}) {
    const plan = buildDynamicScanPlan(summary);
    const singlePage = plan.totalPages === 1;
    return {
      usePager: !singlePage,
      // 不論單頁或多頁，都保留目前已載入的房號。
      // 這樣目前所在頁不需要靠「再點一次同一頁」才能重新觸發資料載入。
      preserveLoadedRooms: true
    };
  }

  function scanMetaChanged(previous = {}, next = {}) {
    const prevTotal = finiteNumber(previous.totalTableCount);
    const nextTotal = finiteNumber(next.totalTableCount);
    if (prevTotal === null || prevTotal <= 0 || nextTotal === null || nextTotal <= 0) return false;

    const prevPerPage = finiteNumber(previous.tablePerPage);
    const nextPerPage = finiteNumber(next.tablePerPage);
    const prevPages = finiteNumber(previous.totalPages);
    const nextPages = finiteNumber(next.totalPages);

    return prevTotal !== nextTotal ||
      (prevPerPage !== null && prevPerPage > 0 && nextPerPage !== null && nextPerPage > 0 && prevPerPage !== nextPerPage) ||
      (prevPages !== null && prevPages > 0 && nextPages !== null && nextPages > 0 && prevPages !== nextPages);
  }

  function buildScanSequence(startPage, totalPages) {
    const total = Math.max(1, finiteNumber(totalPages) || 1);
    const start = clamp(finiteNumber(startPage) || 1, 1, total);
    return Array.from({ length: total }, (_, i) => ((start + i) % total) + 1);
  }

  function buildMissingScanSequence(startPage, totalPages, seenPages = new Set()) {
    const total = Math.max(1, finiteNumber(totalPages) || 1);
    const start = clamp(finiteNumber(startPage) || 1, 1, total);
    const seen = new Set(
      [...(seenPages instanceof Set ? seenPages : (Array.isArray(seenPages) ? seenPages : []))]
        .map(finiteNumber)
        .filter(p => p !== null && p >= 1 && p <= total)
    );
    const ascending = [];
    for (let page = 1; page <= total; page++) {
      if (!seen.has(page)) ascending.push(page);
    }
    if (!ascending.length) return [];
    const descending = [...ascending].reverse();
    const ascDistance = Math.abs(ascending[0] - start);
    const descDistance = Math.abs(descending[0] - start);
    return descDistance < ascDistance ? descending : ascending;
  }

  function buildPageCalibration(samples) {
    const unique = new Map();
    for (const sample of samples || []) {
      const page = finiteNumber(sample?.page);
      const x = finiteNumber(sample?.x);
      const y = finiteNumber(sample?.y);
      if (page === null || x === null || y === null) continue;
      if (page < 1 || page > 99 || x < 0 || x > 1 || y < 0 || y > 1) continue;
      unique.set(page, { page, x, y });
    }
    const rows = [...unique.values()].sort((a, b) => a.page - b.page);
    if (rows.length < 2) return null;
    const a = rows[0];
    const b = rows[rows.length - 1];
    if (a.page === b.page) return null;
    const stepX = (b.x - a.x) / (b.page - a.page);
    if (!Number.isFinite(stepX) || Math.abs(stepX) < 0.002) return null;
    const startX = a.x - stepX * (a.page - 1);
    const y = (a.y + b.y) / 2;
    return { startX, stepX, y, samplePages: [a.page, b.page] };
  }

  function pagePoint(calibration, page) {
    if (!calibration) return null;
    const p = finiteNumber(page);
    if (p === null) return null;
    const x = finiteNumber(calibration.startX);
    const stepX = finiteNumber(calibration.stepX);
    const y = finiteNumber(calibration.y);
    if (x === null || stepX === null || y === null) return null;
    return { x: x + stepX * (p - 1), y };
  }


  function correctPageClickX(clickedX, targetPage, landedPage, stepX) {
    const x = finiteNumber(clickedX);
    const target = finiteNumber(targetPage);
    const landed = finiteNumber(landedPage);
    const step = finiteNumber(stepX);
    if (x === null || target === null || landed === null || step === null || step === 0) return x;
    return clamp(x + (target - landed) * step, 0.01, 0.99);
  }

  function buildProbeOffsets(stepX) {
    const step = Math.abs(finiteNumber(stepX) || 0.04);
    return [0, -step * 0.4, step * 0.4, -step * 0.8, step * 0.8, -step * 1.2, step * 1.2];
  }

  function pageNumberFromText(text) {
    const value = String(text ?? '').trim();
    return /^[1-9]$/.test(value) ? Number(value) : null;
  }

  function upsertCalibrationSample(samples, page, x, y) {
    const p = pageNumberFromText(page);
    const nx = finiteNumber(x);
    const ny = finiteNumber(y);
    const list = Array.isArray(samples) ? samples.slice() : [];
    if (p === null || nx === null || ny === null) return list;
    const next = list.filter(sample => finiteNumber(sample?.page) !== p);
    next.push({ page: p, x: nx, y: ny });
    return next;
  }

  function resolveTrackedPage(metaPage, intentPage, previousPage, preferClickedPage = false) {
    const intended = finiteNumber(intentPage);
    const previous = finiteNumber(previousPage);
    const meta = finiteNumber(metaPage);
    if (intended !== null) return intended;
    if (preferClickedPage && previous !== null) return previous;
    return meta;
  }

  // ATG 遊戲畫面固定採 9:16 內容區置中。頁碼列在遊戲內容區內的位置穩定，
  // 舊版座標推算保留為內部相容函式；一鍵掃描不使用此路徑。
  function computeGameViewportRect(viewportWidth, viewportHeight) {
    const vw = finiteNumber(viewportWidth);
    const vh = finiteNumber(viewportHeight);
    if (vw === null || vh === null || vw <= 0 || vh <= 0) return null;

    const aspect = 9 / 16;
    if (vw / vh >= aspect) {
      const height = vh;
      const width = height * aspect;
      return {
        left: (vw - width) / 2,
        top: 0,
        width,
        height
      };
    }

    const width = vw;
    const height = width / aspect;
    return {
      left: 0,
      top: (vh - height) / 2,
      width,
      height
    };
  }

  function pagePointFromGameLayout(page, viewportWidth, viewportHeight) {
    const p = finiteNumber(page);
    if (p === null || p < 2 || p > 9) return null;
    const rect = computeGameViewportRect(viewportWidth, viewportHeight);
    if (!rect) return null;

    // 依 ATG v1.1.5.3「選擇機台」頁碼列量測：2 在內容寬 15.1%，每格約 9.9%。
    const relativeX = 0.151 + (p - 2) * 0.099;
    const relativeY = 0.181;
    const absoluteX = rect.left + rect.width * relativeX;
    const absoluteY = rect.top + rect.height * relativeY;

    return {
      x: clamp(absoluteX / viewportWidth, 0.01, 0.99),
      y: clamp(absoluteY / viewportHeight, 0.01, 0.99)
    };
  }

  function buildAutoPagerSequence(totalPages = 9) {
    const total = clamp(finiteNumber(totalPages) || 9, 2, 9);
    const pages = [];
    for (let page = 2; page <= total; page++) pages.push(page);
    return pages;
  }

  function acceptPageTransitionEvidence({
    targetPage,
    currentPage,
    beforeSignature,
    afterSignature,
    beforeSeq,
    afterSeq,
    dataPageSeen
  } = {}) {
    const target = finiteNumber(targetPage);
    const current = finiteNumber(currentPage);
    const oldSeq = finiteNumber(beforeSeq) || 0;
    const newSeq = finiteNumber(afterSeq) || 0;
    if (target === null) return false;

    const stateConfirmed = current === target && Boolean(dataPageSeen);
    const domChanged = Boolean(
      beforeSignature &&
      afterSignature &&
      String(beforeSignature) !== String(afterSignature)
    );
    const dataConfirmed = newSeq > oldSeq && (current === target || Boolean(dataPageSeen));

    return stateConfirmed || domChanged || dataConfirmed;
  }


  function selectPagerRow(records, totalPages = 9) {
    const total = Math.max(1, Math.min(99, Math.trunc(finiteNumber(totalPages) || 1)));
    const requiredPages = Array.from({ length: total }, (_, index) => index + 1);
    const items = (Array.isArray(records) ? records : [])
      .map(item => ({
        ...item,
        page: finiteNumber(item?.page),
        x: finiteNumber(item?.x),
        y: finiteNumber(item?.y),
        width: finiteNumber(item?.width),
        height: finiteNumber(item?.height)
      }))
      .filter(item =>
        item.page !== null &&
        item.page >= 1 &&
        item.page <= total &&
        item.x !== null &&
        item.y !== null &&
        item.width !== null &&
        item.height !== null
      );

    if (!items.length) return [];

    const rows = [];
    for (const item of items) {
      const cy = item.y + item.height / 2;
      let row = rows.find(candidate =>
        Math.abs(candidate.cy - cy) <= Math.max(16, item.height * 0.65)
      );
      if (!row) {
        row = { cy, items: [] };
        rows.push(row);
      }
      row.items.push(item);
      row.cy = row.items.reduce((sum, v) => sum + v.y + v.height / 2, 0) / row.items.length;
    }

    const scored = rows
      .map(row => {
        const unique = new Map();
        for (const item of row.items) {
          const prev = unique.get(item.page);
          if (!prev || item.width * item.height < prev.width * prev.height) unique.set(item.page, item);
        }
        const ordered = [...unique.values()].sort((a, b) => a.x - b.x);
        const pages = ordered.map(item => item.page);
        const hasAllRequired = requiredPages.every(page => unique.has(page));
        const exactSequence = hasAllRequired && pages.length === total && pages.every((page, index) => page === index + 1);
        let increasing = true;
        for (let i = 1; i < pages.length; i++) {
          if (pages[i] <= pages[i - 1]) {
            increasing = false;
            break;
          }
        }
        const span = ordered.length > 1
          ? (ordered[ordered.length - 1].x - ordered[0].x)
          : 0;
        const avgArea = ordered.length
          ? ordered.reduce((sum, item) => sum + item.width * item.height, 0) / ordered.length
          : Infinity;
        const score =
          (hasAllRequired ? 100000 : 0) +
          (exactSequence ? 20000 : 0) +
          ordered.length * 10000 +
          (increasing ? 5000 : 0) +
          Math.min(3000, Math.max(0, span)) -
          Math.min(2000, avgArea / 10);

        return { ordered, increasing, hasAllRequired, exactSequence, score };
      })
      .filter(row => row.hasAllRequired && row.increasing)
      .sort((a, b) => b.score - a.score);

    if (!scored.length) return [];
    const selected = scored[0].ordered;
    const byPage = new Map(selected.map(item => [item.page, item]));
    return requiredPages.map(page => byPage.get(page)).filter(Boolean);
  }


  function selectPagerAncestorGroup(records, totalPages = 9) {
    const total = Math.max(1, Math.min(99, Math.trunc(finiteNumber(totalPages) || 1)));
    const requiredPages = Array.from({ length: total }, (_, index) => index + 1);
    const groups = new Map();

    for (const record of (Array.isArray(records) ? records : [])) {
      const page = finiteNumber(record?.page);
      if (page === null || page < 1 || page > total) continue;
      const ancestors = Array.isArray(record?.ancestors) ? record.ancestors : [];
      ancestors.forEach((ancestor, depth) => {
        if (!ancestor) return;
        if (!groups.has(ancestor)) groups.set(ancestor, { ancestor, pages: new Map(), depthSum: 0, maxDepth: 0 });
        const group = groups.get(ancestor);
        if (!group.pages.has(page) || depth < group.pages.get(page).depth) {
          group.pages.set(page, { record, depth });
        }
      });
    }

    const candidates = [];
    for (const group of groups.values()) {
      if (!requiredPages.every(page => group.pages.has(page))) continue;
      const selected = requiredPages.map(page => group.pages.get(page));
      group.depthSum = selected.reduce((sum, entry) => sum + entry.depth, 0);
      group.maxDepth = Math.max(...selected.map(entry => entry.depth));
      const targets = new Map(selected.map((entry, index) => [index + 1, entry.record.target]));
      candidates.push({
        ancestor: group.ancestor,
        targets,
        depthSum: group.depthSum,
        maxDepth: group.maxDepth
      });
    }

    candidates.sort((a, b) =>
      a.maxDepth - b.maxDepth ||
      a.depthSum - b.depthSum
    );
    return candidates[0] || null;
  }

  const SCRIPT_VERSION = '3.1.7';

  function getVersion() {
    return SCRIPT_VERSION;
  }

  function buildSyncPayload(rooms, summary = {}) {
    const safeRooms = (Array.isArray(rooms) ? rooms : [])
      .map(normalizeRoom)
      .filter(Boolean)
      .map(room => ({
        roomId: room.roomId,
        number: room.number,
        status: room.status,
        today: {
          bet: room.today?.bet ?? null,
          win: room.today?.win ?? null
        },
        bet: room.bet ?? null,
        win: room.win ?? null
      }));

    return {
      type: 'XIANYAO_ATG_ROOM_SNAPSHOT_V1',
      version: SCRIPT_VERSION,
      capturedAt: new Date().toISOString(),
      summary: {
        roomsKnown: safeRooms.length,
        totalTableCount: finiteNumber(summary.totalTableCount) ?? safeRooms.length,
        totalPages: finiteNumber(summary.totalPages),
        pagesSeen: summary.pagesSeen instanceof Set
          ? [...summary.pagesSeen].sort((a, b) => a - b)
          : (Array.isArray(summary.pagesSeen) ? summary.pagesSeen.slice() : [])
      },
      rooms: safeRooms
    };
  }


  const FULL_SCAN_SESSION_TYPE = 'XIANYAO_ATG_FULL_SCAN_SESSION_V1';

  function normalizePageList(value, maxPage = 99) {
    const source = value instanceof Set ? [...value] : (Array.isArray(value) ? value : []);
    const max = Math.max(1, Math.trunc(finiteNumber(maxPage) || 99));
    return [...new Set(source
      .map(finiteNumber)
      .filter(page => page !== null && page >= 1 && page <= max)
      .map(page => Math.trunc(page)))]
      .sort((a, b) => a - b);
  }

  function buildFullScanSessionSnapshot(summary = {}) {
    const roomMap = new Map();
    for (const rawRoom of (Array.isArray(summary.rooms) ? summary.rooms : [])) {
      const room = normalizeRoom(rawRoom);
      if (!room) continue;
      const key = roomStorageKey(room);
      if (!key) continue;
      roomMap.set(key, {
        roomId: room.roomId,
        number: room.number,
        status: room.status,
        today: {
          bet: room.today?.bet ?? null,
          win: room.today?.win ?? null
        },
        bet: room.bet ?? null,
        win: room.win ?? null
      });
    }

    const rooms = [...roomMap.values()]
      .filter(room => finiteNumber(room.number) !== null)
      .sort((a, b) => a.number - b.number);
    const plan = buildDynamicScanPlan({
      totalTableCount: finiteNumber(summary.totalTableCount) ?? rooms.length,
      tablePerPage: finiteNumber(summary.tablePerPage) ?? 500,
      totalPages: finiteNumber(summary.totalPages)
    });
    const pagesSeen = normalizePageList(summary.pagesSeen, plan.totalPages);
    const dataPagesSeen = normalizePageList(summary.dataPagesSeen, plan.totalPages);

    return {
      type: FULL_SCAN_SESSION_TYPE,
      version: SCRIPT_VERSION,
      capturedAt: new Date().toISOString(),
      rankingSnapshotAt: String(summary.rankingSnapshotAt || new Date().toISOString()),
      totalTableCount: plan.totalTableCount || rooms.length,
      tablePerPage: plan.tablePerPage,
      totalPages: plan.totalPages,
      currentPage: finiteNumber(summary.currentPage),
      pagesSeen,
      dataPagesSeen,
      rooms
    };
  }

  function parseFullScanSessionSnapshot(raw) {
    let parsed = raw;
    try {
      if (typeof raw === 'string') parsed = JSON.parse(raw);
    } catch (_) {
      return null;
    }
    if (!parsed || typeof parsed !== 'object' || parsed.type !== FULL_SCAN_SESSION_TYPE) return null;

    const snapshot = buildFullScanSessionSnapshot({
      rooms: parsed.rooms,
      rankingSnapshotAt: parsed.rankingSnapshotAt || parsed.capturedAt,
      totalTableCount: parsed.totalTableCount,
      tablePerPage: parsed.tablePerPage,
      totalPages: parsed.totalPages,
      currentPage: parsed.currentPage,
      pagesSeen: parsed.pagesSeen,
      dataPagesSeen: parsed.dataPagesSeen
    });

    const plan = buildDynamicScanPlan(snapshot);
    const requiredPages = plan.pages;
    const complete = plan.totalTableCount > 0 &&
      snapshot.rooms.length >= plan.totalTableCount &&
      requiredPages.every(page => snapshot.pagesSeen.includes(page)) &&
      requiredPages.every(page => snapshot.dataPagesSeen.includes(page));

    if (!complete) return null;

    return {
      ...snapshot,
      capturedAt: String(parsed.capturedAt || snapshot.capturedAt),
      rankingSnapshotAt: String(parsed.rankingSnapshotAt || parsed.capturedAt || snapshot.rankingSnapshotAt),
      rankingSnapshotRooms: snapshot.rooms
        .filter(room => room.status === 'Empty')
        .map(room => ({ ...room, today: { ...room.today } }))
    };
  }

  function markSharedHook(fn) {
    if (typeof fn !== 'function') return fn;
    try { Object.defineProperty(fn, '__xinyaoLiveV200Wrapped', { value: true, configurable: true }); } catch (_) {
      try { fn.__xinyaoLiveV200Wrapped = true; } catch (_) {}
    }
    try { Object.defineProperty(fn, '__xinyaoRoomScannerWrapped', { value: true, configurable: true }); } catch (_) {
      try { fn.__xinyaoRoomScannerWrapped = true; } catch (_) {}
    }
    return fn;
  }

  function resolvePanelAction(id) {
    const actions = {
      'xinyao-scan-all': 'scan',
      'xinyao-stop': 'stop',
      'xinyao-room-copy': 'copy',
      'xinyao-expand': 'expand',
      'xinyao-room-hide': 'hide',
      'xinyao-prev': 'prev',
      'xinyao-next': 'next',
      'xinyao-sync-site': 'sync'
    };
    return actions[id] || null;
  }

  const core = {
    normalizeRoom,
    calculateMetrics,
    rankRooms,
    countNumberedRooms,
    roomStorageKey,
    findZlibOffset,
    decodeBinaryFrameToText,
    markSharedHook,
    selectAdaptiveGameSurface,
    buildAdaptivePagerHypotheses,
    selectFixedPagerProfile,
    buildPagerYProbeList,
    buildDynamicScanPlan,
    buildScanInteractionPolicy,
    scanMetaChanged,
    buildScanSequence,
    buildMissingScanSequence,
    getVersion,
    resolvePanelAction,
    buildPageCalibration,
    pagePoint,
    correctPageClickX,
    buildProbeOffsets,
    pageNumberFromText,
    upsertCalibrationSample,
    resolveTrackedPage,
    computeGameViewportRect,
    pagePointFromGameLayout,
    buildAutoPagerSequence,
    acceptPageTransitionEvidence,
    selectPagerRow,
    selectPagerAncestorGroup,
    buildSyncPayload,
    buildFullScanSessionSnapshot,
    parseFullScanSessionSnapshot
  };

  if (typeof globalThis !== 'undefined' && globalThis.__XIANYAO_ATG_TEST__) {
    globalThis.__XIANYAO_ATG_CORE__ = core;
    return;
  }

  if (window.__XIANYAO_ATG_ROOM_SCANNER_V200__) return;
  window.__XIANYAO_ATG_ROOM_SCANNER_V200__ = true;

  const VERSION = SCRIPT_VERSION;
  const SITE_URL = 'https://xinyao-ai.github.io/xinyao-ai/?atgRooms=1';
  const SITE_ORIGIN = 'https://xinyao-ai.github.io';
  const SYNC_READY_TYPE = 'XIANYAO_ATG_SYNC_READY_V1';
  const SYNC_ACK_TYPE = 'XIANYAO_ATG_SYNC_ACK_V1';
  const FULL_SCAN_SESSION_KEY = 'xinyao_atg_full_scan_session_v1';
  // 完整掃描結果除了原本 sessionStorage，再留 localStorage 備份；只用於進房重載後還原，不改掃描本身。
  const FULL_SCAN_BACKUP_KEY = 'xinyao_atg_full_scan_backup_v3';
  let pendingSyncPayload = null;
  let syncHandshakeTimer = null;
  let syncLinkArmedUntil = 0;
  const SENSITIVE_KEY = /(token|cookie|authorization|password|passwd|secret|username|userid|user_id|email|phone|login|session|ticket|credential|access[_-]?key|^t$)/i;
  const INTERESTING_TEXT = /(room|table|page|lobby|slotTableUpdated|tableMeta|totalTableCount)/i;
  const nativeJSONParse = JSON.parse.bind(JSON);

  const ui = {
    expanded: false,
    filter: 'All',
    sort: 'number',
    search: '',
    roomListPage: 1,
    perPage: 100,
    rankMode: 'observation',
    topN: 10,
    autoRefreshMins: 0
  };

  const state = {
    enabled: true,
    roomMap: new Map(),
    pagesSeen: new Set(),
    dataPagesSeen: new Set(),
    totalTableCount: 0,
    tablePerPage: 0,
    totalPages: 0,
    currentPage: null,
    pageIntent: null,
    preferClickedPage: false,
    learnedPagerY: null,
    pagerSamples: [],
    adaptivePagerCalibration: null,
    pagerSurfaceSignature: '',
    events: [],
    lastSource: '等待資料',
    pageLoadSeq: 0,
    panel: null,
    scanRunning: false,
    scanAbort: false,
    scanVisited: new Set(),
    scanMessage: '尚未開始全房掃描',
    scanError: '',
    rankingSnapshotRooms: null,
    rankingSnapshotAt: '',
    latestTableNumbers: [],
    latestInferredPage: null,
    currentSelectedRoomId: null,
    liveStatusByRoomId: new Map(),
    autoPagerProfile: null,
    learningPageNav: false,
    learningStartPage: null,
    learningEvents: [],
    learningResult: [],
    pageCalibration: null,
    calibrationActive: false,
    calibrationSamples: [],
    calibrationPendingPointer: null,
    calibrationThenScan: false,
    autoTimer: null,
    renderTimer: null,
    // v3.2.4：全裝置滑動全房分析時暫停重建 DOM，避免手指滑動被即時刷新打斷。
    panelInteractingUntil: 0,
    enterRoomBusy: false,
    enterRoomStatus: ''
  };

  function clearStoredFullScanSession() {
    try { sessionStorage.removeItem(FULL_SCAN_SESSION_KEY); } catch (_) {}
    try { localStorage.removeItem(FULL_SCAN_BACKUP_KEY); } catch (_) {}
  }

  function resetFullScanData({ clearStored = true, preserveMeta = false } = {}) {
    const meta = preserveMeta ? {
      totalTableCount: state.totalTableCount,
      tablePerPage: state.tablePerPage,
      totalPages: state.totalPages,
      currentPage: state.currentPage
    } : null;
    if (clearStored) clearStoredFullScanSession();
    state.roomMap.clear();
    state.pagesSeen = new Set();
    state.dataPagesSeen = new Set();
    state.totalTableCount = meta?.totalTableCount || 0;
    state.tablePerPage = meta?.tablePerPage || 0;
    state.totalPages = meta?.totalPages || 0;
    state.currentPage = meta?.currentPage ?? null;
    state.pageIntent = null;
    state.preferClickedPage = false;
    state.pageLoadSeq = 0;
    state.scanVisited = new Set();
    state.rankingSnapshotRooms = null;
    state.rankingSnapshotAt = '';
    state.latestTableNumbers = [];
    state.latestInferredPage = null;
    state.liveStatusByRoomId = new Map();
  }

  function resetFullScanProgressPreservingRooms({ clearStored = true } = {}) {
    if (clearStored) clearStoredFullScanSession();
    state.pagesSeen = new Set();
    state.dataPagesSeen = new Set();
    state.pageIntent = null;
    state.preferClickedPage = false;
    state.pageLoadSeq = 0;
    state.scanVisited = new Set();
    state.rankingSnapshotRooms = null;
    state.rankingSnapshotAt = '';
  }

  function saveFullScanSession() {
    const snapshot = buildFullScanSessionSnapshot({
      rooms: [...state.roomMap.values()],
      rankingSnapshotAt: state.rankingSnapshotAt,
      totalTableCount: state.totalTableCount,
      tablePerPage: state.tablePerPage,
      totalPages: state.totalPages,
      currentPage: state.currentPage,
      pagesSeen: state.pagesSeen,
      dataPagesSeen: state.dataPagesSeen
    });

    const plan = buildDynamicScanPlan(snapshot);
    const complete = plan.totalTableCount > 0 &&
      snapshot.rooms.length >= plan.totalTableCount &&
      plan.pages.every(page => snapshot.pagesSeen.includes(page)) &&
      plan.pages.every(page => snapshot.dataPagesSeen.includes(page));
    if (!complete) return false;
    try {
      const encoded = JSON.stringify(snapshot);
      sessionStorage.setItem(FULL_SCAN_SESSION_KEY, encoded);
      localStorage.setItem(FULL_SCAN_BACKUP_KEY, encoded);
      return true;
    } catch (_) {
      return false;
    }
  }

  function restoreFullScanSession() {
    let raw = '';
    try {
      raw = sessionStorage.getItem(FULL_SCAN_SESSION_KEY) || localStorage.getItem(FULL_SCAN_BACKUP_KEY) || '';
      // 若是從 localStorage 備份恢復，順便補回本分頁 sessionStorage。
      if (raw && !sessionStorage.getItem(FULL_SCAN_SESSION_KEY)) {
        try { sessionStorage.setItem(FULL_SCAN_SESSION_KEY, raw); } catch (_) {}
      }
    } catch (_) { return false; }
    if (!raw) return false;

    const snapshot = parseFullScanSessionSnapshot(raw);
    if (!snapshot) {
      clearStoredFullScanSession();
      return false;
    }

    state.roomMap.clear();
    for (const rawRoom of snapshot.rooms) {
      const room = normalizeRoom(rawRoom);
      const key = roomStorageKey(room);
      if (!room || !key) continue;
      state.roomMap.set(key, room);
    }

    state.pagesSeen = new Set(snapshot.pagesSeen);
    state.dataPagesSeen = new Set(snapshot.dataPagesSeen);
    state.totalTableCount = snapshot.totalTableCount;
    state.tablePerPage = snapshot.tablePerPage;
    state.totalPages = snapshot.totalPages;
    state.currentPage = snapshot.currentPage ?? snapshot.totalPages;
    state.scanVisited = new Set(snapshot.pagesSeen);
    state.rankingSnapshotRooms = snapshot.rankingSnapshotRooms;
    state.rankingSnapshotAt = snapshot.rankingSnapshotAt;
    state.scanError = '';
    state.scanMessage = `✅ 已還原全房掃描｜${snapshot.rooms.length} / ${snapshot.totalTableCount}｜${snapshot.totalPages} / ${snapshot.totalPages} 頁｜排行榜維持掃描完成時結果`;
    state.lastSource = '完整分析還原';
    return true;
  }

  restoreFullScanSession();

  function setPageIntent(page) {
    const p = finiteNumber(page);
    const maxPage = Math.max(1, Math.trunc(finiteNumber(state.totalPages) || 99));
    if (p === null || p < 1 || p > maxPage) return null;
    state.pageIntent = { page: p, ts: Date.now() };
    state.preferClickedPage = true;
    return p;
  }

  function freshPageIntent(maxAge = 6000) {
    const intent = state.pageIntent;
    if (!intent) return null;
    if (Date.now() - Number(intent.ts || 0) > maxAge) {
      state.pageIntent = null;
      return null;
    }
    return intent;
  }

  function clickedPageFromTarget(target) {
    let el = target && target.nodeType === 1 ? target : target?.parentElement;
    for (let depth = 0; el && depth < 5; depth++, el = el.parentElement) {
      if (el.closest?.('#xinyao-atg-room-scanner,#xinyao-room-mini,#xinyao-copy-modal')) return null;
      const page = pageNumberFromText(el.textContent);
      if (page !== null) return page;
    }
    return null;
  }

  const now = () => new Date().toLocaleTimeString('zh-TW', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const CALIBRATION_KEY = 'xinyao_atg_page_calibration_v2';

  function loadPageCalibration() {
    try {
      const raw = localStorage.getItem(CALIBRATION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const test = pagePoint(parsed, 1);
      return test && test.x >= 0 && test.x <= 1 && test.y >= 0 && test.y <= 1 ? parsed : null;
    } catch {
      return null;
    }
  }

  function savePageCalibration(calibration) {
    state.pageCalibration = calibration || null;
    try {
      if (calibration) localStorage.setItem(CALIBRATION_KEY, JSON.stringify(calibration));
      else localStorage.removeItem(CALIBRATION_KEY);
    } catch {}
  }

  state.pageCalibration = loadPageCalibration();

  function startPageCalibration({ thenScan = false } = {}) {
    state.calibrationActive = true;
    state.calibrationSamples = [];
    state.calibrationPendingPointer = null;
    state.calibrationThenScan = thenScan;
    state.scanError = '';
    state.scanMessage = '🧭 校準中 0/2：請手動點兩個不同頁碼（建議 2 → 9）。';
    scheduleRender();
  }

  function finishPageCalibrationIfReady() {
    const calibration = buildPageCalibration(state.calibrationSamples);
    if (!calibration) return false;
    savePageCalibration(calibration);
    state.calibrationActive = false;
    state.calibrationPendingPointer = null;
    state.scanMessage = state.calibrationThenScan
      ? `✅ 頁碼校準完成（${calibration.samplePages.join('、')}）｜正在掃描尚未抓取的頁面…`
      : `✅ 頁碼校準完成（${calibration.samplePages.join('、')}）｜可按「一鍵掃描全部房間」`;
    scheduleRender();
    if (state.calibrationThenScan) {
      state.calibrationThenScan = false;
      setTimeout(() => scanAllPages(), 500);
    }
    return true;
  }

  function captureCalibrationPointer(event) {
    if (!state.calibrationActive) return;
    const target = event.target;
    if (target?.closest?.('#xinyao-atg-room-scanner,#xinyao-room-mini,#xinyao-copy-modal')) return;
    if (!window.innerWidth || !window.innerHeight) return;

    const pointer = {
      x: event.clientX / window.innerWidth,
      y: event.clientY / window.innerHeight,
      ts: Date.now()
    };
    state.calibrationPendingPointer = pointer;

    // 部分裝置的 tableMeta.currentPage 會停在舊頁。
    // 校準直接採用使用者實際點到的頁碼，不再等待 meta.currentPage 變化。
    const clickedPage = clickedPageFromTarget(target);
    if (clickedPage !== null) {
      setPageIntent(clickedPage);
      state.calibrationSamples = upsertCalibrationSample(
        state.calibrationSamples,
        clickedPage,
        pointer.x,
        pointer.y
      );
      state.calibrationPendingPointer = null;

      const pages = state.calibrationSamples.map(sample => sample.page).sort((a, b) => a - b);
      state.scanMessage = pages.length === 1
        ? `🧭 校準中 1/2：已記錄第 ${pages[0]} 頁，請再點另一個不同頁碼（建議最後一頁）`
        : `🧭 已記錄頁碼 ${pages.join('、')}`;
      finishPageCalibrationIfReady();
      scheduleRender();
    }
  }

  document.addEventListener('pointerdown', captureCalibrationPointer, true);

  setInterval(() => {
    try { verifyTigerPendingActualRoom(); } catch (_) {}
  }, 250);

  function scheduleRender() {
    if (state.renderTimer) return;
    state.renderTimer = setTimeout(() => {
      state.renderTimer = null;
      render();
    }, 80);
  }

  function sanitizeUrl(raw) {
    try {
      const u = new URL(String(raw), location.href);
      for (const [key] of [...u.searchParams.entries()]) {
        if (SENSITIVE_KEY.test(key)) u.searchParams.set(key, '[已隱藏]');
      }
      return u.toString().slice(0, 1800);
    } catch {
      return String(raw || '').slice(0, 1800);
    }
  }

  function sanitizeText(text) {
    let s = String(text ?? '');
    if (s.length > 5000) s = s.slice(0, 5000) + '…';
    s = s.replace(/((?:token|authorization|password|passwd|secret|session|ticket|credential|access[_-]?key)\s*[=:]\s*["']?)[^&\s,"'}]+/gi, '$1[已隱藏]');
    return s;
  }

  function numberedRooms() {
    return [...state.roomMap.values()].filter(r => finiteNumber(r.number) !== null);
  }

  function numberedCount() {
    return countNumberedRooms(numberedRooms());
  }


  // 依目前遊戲回傳的 tablePerPage / totalPages 推算房號所在頁，
  // 不再假設所有遊戲都是 4100 房、固定 9 頁。
  function inferPageFromRoomNumbers(numbers) {
    const plan = buildDynamicScanPlan(state);
    const maxRoom = plan.totalTableCount > 0
      ? plan.totalTableCount
      : plan.tablePerPage * plan.totalPages;
    const clean = (Array.isArray(numbers) ? numbers : [])
      .map(finiteNumber)
      .filter(n => n !== null && n >= 1 && n <= maxRoom)
      .sort((a, b) => a - b);
    if (!clean.length) return null;
    const pivot = clean[Math.floor(clean.length / 2)];
    return clamp(Math.floor((pivot - 1) / plan.tablePerPage) + 1, 1, plan.totalPages);
  }

  function recordEvent(type, payload = {}) {
    if (!state.enabled) return;
    const entry = { ts: Date.now(), time: now(), type, ...payload };
    state.events.push(entry);
    if (state.events.length > 500) state.events.shift();

    if (state.learningPageNav && ['fetch→', 'XHR→', 'WS→'].includes(type)) {
      state.learningEvents.push(entry);
      if (state.learningEvents.length > 40) state.learningEvents.shift();
    }
    scheduleRender();
  }

  function roomNumberByRoomIdFromScanner(roomId) {
    const id = finiteNumber(roomId);
    if (id === null) return null;
    for (const room of state.roomMap.values()) {
      if (finiteNumber(room?.roomId) !== id) continue;
      const number = finiteNumber(room?.number);
      if (number !== null) return number;
    }
    return null;
  }

  function publishCurrentRoomSelection(roomId, source = 'scanner') {
    const id = finiteNumber(roomId);
    if (id === null) return false;
    state.currentSelectedRoomId = id;
    const roomNumber = roomNumberByRoomIdFromScanner(id);
    try {
      window.dispatchEvent(new CustomEvent('xinyao:current-room-selected', {
        detail: { roomId: id, roomNumber, source }
      }));
    } catch (_) {}
    return roomNumber !== null;
  }

  function upsertRoom(obj, source = 'unknown') {
    const room = normalizeRoom(obj);
    if (!room) return false;

    const key = roomStorageKey(room);
    if (!key) return false;

    const idFallbackKey = finiteNumber(room.roomId) !== null ? `id:${room.roomId}` : null;
    const prev = state.roomMap.get(key) || (idFallbackKey ? state.roomMap.get(idFallbackKey) : null) || {};

    const merged = {
      ...prev,
      ...room,
      number: room.number ?? prev.number ?? null,
      status: room.status ?? prev.status ?? null,
      bet: room.bet ?? prev.bet ?? null,
      win: room.win ?? prev.win ?? null,
      today: {
        bet: room.today?.bet ?? prev.today?.bet ?? null,
        win: room.today?.win ?? prev.today?.win ?? null
      }
    };

    if (idFallbackKey && idFallbackKey !== key) state.roomMap.delete(idFallbackKey);
    state.roomMap.set(key, merged);

    const mergedRoomId = finiteNumber(merged?.roomId);
    if (mergedRoomId !== null) {
      const existing = state.liveStatusByRoomId.get(Math.trunc(mergedRoomId));
      // 伺服器 slotTableUpdated 是最新的佔用狀態；舊掃描 tables 不得改回 Empty。
      if (existing?.source === 'slotTableUpdated') {
        merged.status = existing.status;
        state.roomMap.set(key, merged);
      } else if (typeof merged?.status === 'string') {
        state.liveStatusByRoomId.set(Math.trunc(mergedRoomId), {
          status: merged.status, updatedAt: Date.now(), source: 'tables'
        });
      }
    }

    state.lastSource = source;
    if (finiteNumber(state.currentSelectedRoomId) !== null && finiteNumber(merged.roomId) === finiteNumber(state.currentSelectedRoomId) && finiteNumber(merged.number) !== null) {
      publishCurrentRoomSelection(state.currentSelectedRoomId, `${source}:room-map`);
    }
    return finiteNumber(merged.number) !== null;
  }

  function applyStatusUpdates(statusObj, source = 'slotTableUpdated') {
    if (!statusObj || typeof statusObj !== 'object' || Array.isArray(statusObj)) return 0;
    let changed = 0;

    for (const [roomIdRaw, status] of Object.entries(statusObj)) {
      const roomId = Number(roomIdRaw);
      if (!Number.isFinite(roomId) || typeof status !== 'string') continue;

      // 無論能不能立刻對回房號，都先保存 ATG 最新 roomId 狀態。
      // 排行榜會直接讀這份資料，避免舊 Empty 快照殘留。
      state.liveStatusByRoomId.set(Math.trunc(roomId), {
        status,
        updatedAt: Date.now(),
        source: 'slotTableUpdated'
      });

      let matched = false;
      for (const [key, prev] of state.roomMap.entries()) {
        if (finiteNumber(prev?.roomId) !== roomId) continue;
        state.roomMap.set(key, {
          ...prev,
          status,
          updatedAt: new Date().toISOString()
        });
        matched = true;
        changed++;
      }

      if (!matched) {
        state.roomMap.set(`id:${roomId}`, {
          roomId,
          number: null,
          status,
          today: { bet: null, win: null },
          updatedAt: new Date().toISOString()
        });
        changed++;
      }
    }

    if (changed) state.lastSource = source;
    return changed;
  }

  function ingestMeta(meta, source = 'tableMeta') {
    if (!meta || typeof meta !== 'object') return false;

    const previousPage = finiteNumber(state.currentPage);
    const totalTableCount = finiteNumber(meta.totalTableCount);
    const metaCurrentPage = finiteNumber(meta.currentPage);
    const intent = freshPageIntent();
    const currentPage = resolveTrackedPage(
      metaCurrentPage,
      intent?.page ?? null,
      previousPage,
      state.preferClickedPage
    );
    const tablePerPage = finiteNumber(meta.tablePerPage);
    const totalPages = finiteNumber(meta.totalPages);

    if ([totalTableCount, metaCurrentPage, tablePerPage, totalPages].every(v => v === null)) return false;

    const previousMeta = {
      totalTableCount: finiteNumber(state.totalTableCount),
      tablePerPage: finiteNumber(state.tablePerPage),
      totalPages: finiteNumber(state.totalPages)
    };
    const nextMeta = {
      totalTableCount: totalTableCount ?? previousMeta.totalTableCount,
      tablePerPage: tablePerPage ?? previousMeta.tablePerPage,
      totalPages: totalPages ?? previousMeta.totalPages
    };
    const metaChanged = scanMetaChanged(previousMeta, nextMeta);

    if (metaChanged && (state.roomMap.size || state.pagesSeen.size || state.rankingSnapshotRooms)) {
      resetFullScanData({ clearStored: true, preserveMeta: false });
      state.scanMessage = '🔄 已偵測切換遊戲，舊房號分析已清除';
      state.scanError = '';
    }

    if (totalTableCount !== null) state.totalTableCount = totalTableCount;
    if (tablePerPage !== null) state.tablePerPage = tablePerPage;
    if (totalPages !== null) state.totalPages = totalPages;
    if (currentPage !== null) {
      state.currentPage = currentPage;
      state.pagesSeen.add(currentPage);

      if (state.calibrationActive && previousPage !== null && currentPage !== previousPage) {
        const pointer = state.calibrationPendingPointer;
        if (pointer && Date.now() - pointer.ts < 3000) {
          state.calibrationSamples = state.calibrationSamples.filter(s => s.page !== currentPage);
          state.calibrationSamples.push({ page: currentPage, x: pointer.x, y: pointer.y });
          state.calibrationPendingPointer = null;
          const pages = state.calibrationSamples.map(s => s.page).sort((a, b) => a - b);
          state.scanMessage = pages.length === 1
            ? `🧭 校準中 1/2：已記錄第 ${pages[0]} 頁，請再點另一個不同頁碼（建議最後一頁）`
            : `🧭 已記錄頁碼 ${pages.join('、')}`;
          finishPageCalibrationIfReady();
        }
      }

      if (state.learningPageNav && previousPage !== null && currentPage !== previousPage) {
        state.learningPageNav = false;
        state.learningResult = state.learningEvents.slice(-20);
        state.scanError = '';
        state.scanMessage = `✅ 已捕捉翻頁 ${previousPage} → ${currentPage}｜通訊 ${state.learningResult.length} 筆`;
      }
    }

    state.lastSource = source;
    return true;
  }

  function ingestObject(value, source = 'object', depth = 0) {
    if (!state.enabled || value == null || depth > 8) return;

    if (Array.isArray(value)) {
      for (const item of value) ingestObject(item, source, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;

    if (value.tableMeta) ingestMeta(value.tableMeta, `${source}:tableMeta`);
    if (value.data?.tableMeta) ingestMeta(value.data.tableMeta, `${source}:data.tableMeta`);

    const tables = Array.isArray(value.tables)
      ? value.tables
      : (Array.isArray(value.data?.tables) ? value.data.tables : null);

    if (tables) {
      let count = 0;
      const tableNumbers = [];
      for (const room of tables) {
        const n = finiteNumber(room?.number);
        if (n !== null) tableNumbers.push(n);
        if (upsertRoom(room, `${source}:tables`)) count++;
      }

      if (count || tableNumbers.length) {
        const intent = freshPageIntent();
        const inferredPage = inferPageFromRoomNumbers(tableNumbers);

        state.latestTableNumbers = tableNumbers.slice();
        state.latestInferredPage = inferredPage;

        // 真實房號優先；它比 ATG 偶爾卡住的 tableMeta.currentPage 更可靠。
        if (inferredPage !== null) {
          state.currentPage = inferredPage;
          state.pagesSeen.add(inferredPage);
          state.dataPagesSeen.add(inferredPage);
        } else if (intent) {
          state.currentPage = intent.page;
          state.pagesSeen.add(intent.page);
        }

        state.pageLoadSeq++;
        if (finiteNumber(state.currentPage) !== null) state.dataPagesSeen.add(state.currentPage);

        recordEvent('tableList', {
          count,
          currentPage: state.currentPage,
          inferredPage,
          firstRoom: tableNumbers.length ? Math.min(...tableNumbers) : null,
          roomsKnown: numberedCount()
        });

        if (intent) state.pageIntent = null;
      }
    }

    upsertRoom(value, source);

    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) continue;
      if (key === 'tables' || key === 'tableMeta') continue;
      ingestObject(child, source, depth + 1);
    }
  }

  function parseSocketIoEventPacket(text) {
    const s = String(text || '').trim();
    if (!s.startsWith('42')) return null;
    const arrayStart = s.indexOf('[');
    if (arrayStart < 2) return null;
    try {
      const packet = JSON.parse(s.slice(arrayStart));
      if (!Array.isArray(packet) || packet.length < 2 || typeof packet[0] !== 'string') return null;
      return { eventName: packet[0], payload: packet[1], packet };
    } catch (_) {
      return null;
    }
  }

  function processSocketIoText(text, source) {
    const parsed = parseSocketIoEventPacket(text);
    if (!parsed) return false;
    const { eventName, payload } = parsed;

    if (eventName === 'getSlotTableDetail') {
      const roomId = finiteNumber(payload?.roomId ?? payload?.tableId ?? payload?.slotTableId);
      if (roomId !== null) {
        publishCurrentRoomSelection(roomId, `${source}:getSlotTableDetail`);
        recordEvent('currentRoom', { roomId, roomNumber: roomNumberByRoomIdFromScanner(roomId) });
      }
    }

    if (eventName === 'slotTableUpdated') {
      const changed = applyStatusUpdates(payload, source);
      recordEvent('slotTableUpdated', { changed });
    } else if (INTERESTING_TEXT.test(String(eventName))) {
      recordEvent('socketEvent', {
        eventName: String(eventName),
        preview: sanitizeText(JSON.stringify(payload)).slice(0, 1800)
      });
    }

    ingestObject(payload, `${source}:${eventName}`);
    return true;
  }

  function processText(text, source) {
    if (!state.enabled || typeof text !== 'string' || !text.trim()) return;

    if (processSocketIoText(text, source)) {
      scheduleRender();
      return;
    }

    const trimmed = text.trim();
    try {
      const parsed = nativeJSONParse(trimmed);
      ingestObject(parsed, source);
      scheduleRender();
      return;
    } catch {}

    if (INTERESTING_TEXT.test(trimmed)) {
      recordEvent('textMatch', {
        source,
        preview: sanitizeText(trimmed).slice(0, 1800)
      });
    }
  }

  const scannerJSONParse = markSharedHook(function (...args) {
    const result = nativeJSONParse(...args);
    try {
      ingestObject(result, 'JSON.parse');
      scheduleRender();
    } catch {}
    return result;
  });
  JSON.parse = scannerJSONParse;

  // ATG 某些翻頁資料會直接走 Response.json()，不一定經過全域 JSON.parse。
  // 直接攔截已解析完成的 Response 物件，避免畫面已換頁但掃描器收不到 data.tables。
  try {
    if (window.Response?.prototype?.json) {
      const nativeResponseJson = Response.prototype.json;
      if (!nativeResponseJson.__xinyaoRoomScannerWrapped) {
        Response.prototype.json = markSharedHook(async function (...args) {
          const result = await nativeResponseJson.apply(this, args);
          try {
            ingestObject(result, `Response.json:${sanitizeUrl(this?.url || '')}`);
            scheduleRender();
          } catch {}
          return result;
        });
      }
    }
  } catch {}

  const nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = async function (...args) {
      const input = args[0];
      const init = args[1] || {};
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = init.method || input?.method || 'GET';
      const body = typeof init.body === 'string' ? sanitizeText(init.body) : null;

      recordEvent('fetch→', { method, url: sanitizeUrl(url), body });
      const response = await nativeFetch.apply(this, args);

      try {
        const clone = response.clone();
        const type = clone.headers.get('content-type') || '';
        recordEvent('fetch←', {
          status: response.status,
          url: sanitizeUrl(response.url || url),
          contentType: type
        });
        // 不再只相信 Content-Type；ATG 某些資料回應標頭不是 json，但 body 仍是 JSON/text。
        clone.text().then(t => {
          if (t && t.trim()) processText(t, `fetch:${sanitizeUrl(response.url || url)}`);
        }).catch(() => {});
      } catch {}
      return response;
    };
  }

  const NativeXHR = window.XMLHttpRequest;
  if (NativeXHR) {
    const nativeOpen = NativeXHR.prototype.open;
    const nativeSend = NativeXHR.prototype.send;

    NativeXHR.prototype.open = function (method, url, ...rest) {
      this.__xinyaoMethod = method;
      this.__xinyaoUrl = url;
      return nativeOpen.call(this, method, url, ...rest);
    };

    NativeXHR.prototype.send = function (body) {
      recordEvent('XHR→', {
        method: this.__xinyaoMethod || '',
        url: sanitizeUrl(this.__xinyaoUrl || ''),
        body: typeof body === 'string' ? sanitizeText(body) : null
      });

      this.addEventListener('load', () => {
        try {
          const source = `XHR:${sanitizeUrl(this.__xinyaoUrl || '')}`;
          recordEvent('XHR←', { status: this.status, url: sanitizeUrl(this.__xinyaoUrl || '') });
          if (this.responseType === 'json') {
            ingestObject(this.response, source);
          } else if (this.responseType === '' || this.responseType === 'text') {
            processText(this.responseText, source);
          } else if (this.responseType === 'arraybuffer' && this.response) {
            try {
              const text = new TextDecoder().decode(new Uint8Array(this.response));
              processText(text, `${source}:arraybuffer`);
            } catch {}
          } else if (this.responseType === 'blob' && this.response?.text) {
            this.response.text().then(t => processText(t, `${source}:blob`)).catch(() => {});
          }
          scheduleRender();
        } catch {}
      }, { once: true });

      return nativeSend.call(this, body);
    };
  }

  async function processBinarySocketData(data, source) {
    try {
      const text = await decodeBinaryFrameToText(data);
      if (!text || !text.trim()) return false;

      recordEvent('WS←binary', {
        source,
        preview: sanitizeText(text).slice(0, 280)
      });

      processText(text, `${source}:binary`);
      return true;
    } catch (error) {
      recordEvent('WS←binary-error', {
        source,
        error: String(error?.message || error).slice(0, 240)
      });
      return false;
    }
  }

  const NativeWebSocket = window.WebSocket;
  if (NativeWebSocket) {
    function XinyaoWebSocket(url, protocols) {
      const ws = protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
      const safeUrl = sanitizeUrl(url);
      const nativeSend = ws.send.bind(ws);

      ws.send = function (data) {
        if (typeof data === 'string') {
          if (state.learningPageNav || INTERESTING_TEXT.test(data) || data.startsWith('42')) {
            recordEvent('WS→', { url: safeUrl, preview: sanitizeText(data).slice(0, 1800) });
          }
          // 重要：目前房 getSlotTableDetail 是送往伺服器的 Socket.IO event，
          // 不能只記錄 WS→；要直接解析並橋接給左側即時助手。
          processText(data, `WebSocket→:${safeUrl}`);
        }
        return nativeSend(data);
      };

      ws.addEventListener('message', event => {
        try {
          if (typeof event.data === 'string') {
            processText(event.data, `WebSocket:${safeUrl}`);
          } else {
            processBinarySocketData(event.data, `WebSocket:${safeUrl}`).catch(() => {});
          }
        } catch {}
      });
      return ws;
    }

    XinyaoWebSocket.prototype = NativeWebSocket.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(key => {
      try { Object.defineProperty(XinyaoWebSocket, key, { value: NativeWebSocket[key] }); } catch {}
    });
    markSharedHook(XinyaoWebSocket);
    window.WebSocket = XinyaoWebSocket;
  }

  if (window.TextDecoder) {
    const nativeDecode = TextDecoder.prototype.decode;
    const scannerDecode = markSharedHook(function (...args) {
      const text = nativeDecode.apply(this, args);
      try {
        if (typeof text === 'string' && INTERESTING_TEXT.test(text)) processText(text, 'TextDecoder');
      } catch {}
      return text;
    });
    TextDecoder.prototype.decode = scannerDecode;
  }

  // 部分前端框架 / worker 會把已解析資料用 postMessage 傳回主執行緒。
  try {
    window.addEventListener('message', event => {
      try {
        const value = event?.data;
        if (value && typeof value === 'object') {
          ingestObject(value, 'window.message');
          scheduleRender();
        } else if (typeof value === 'string' && INTERESTING_TEXT.test(value)) {
          processText(value, 'window.message');
        }
      } catch {}
    }, true);
  } catch {}

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    const view = el.ownerDocument?.defaultView || window;
    const cs = view.getComputedStyle(el);
    return r.width > 12 && r.height > 12 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0;
  }

  function collectDeepRoots() {
    const roots = [];
    const seen = new Set();

    function visit(root) {
      if (!root || seen.has(root)) return;
      seen.add(root);
      roots.push(root);

      let all = [];
      try { all = [...root.querySelectorAll('*')]; } catch (_) {}
      for (const el of all) {
        try { if (el.shadowRoot) visit(el.shadowRoot); } catch (_) {}
        if (String(el.tagName || '').toLowerCase() === 'iframe') {
          try { if (el.contentDocument) visit(el.contentDocument); } catch (_) {}
        }
      }
    }

    visit(document);
    return roots;
  }

  function collectSameOriginWindows() {
    const windows = [];
    const seen = new Set();
    const visit = (win) => {
      if (!win || seen.has(win)) return;
      seen.add(win);
      windows.push(win);
      let frames = [];
      try { frames = [...win.document.querySelectorAll('iframe')]; } catch (_) {}
      for (const frame of frames) {
        try {
          const child = frame.contentWindow;
          if (!child) continue;
          // 讀 document 會在跨來源 iframe 直接丟錯；只有同源才納入。
          void child.document;
          visit(child);
        } catch (_) {}
      }
    };
    visit(window);
    return windows;
  }

  function findPagerButtons(totalPages = buildDynamicScanPlan(state).totalPages) {
    // 完全依「實際頁碼文字 + 真實可點元素」辨識，不使用螢幕尺寸或固定座標。
    const total = Math.max(2, Math.min(99, Math.trunc(finiteNumber(totalPages) || 2)));
    const selector = 'button,[role="button"],a,li,div,span';

    for (const root of collectDeepRoots()) {
      let nodes = [];
      try { nodes = [...root.querySelectorAll(selector)]; } catch (_) {}
      const records = [];
      for (const el of nodes) {
        try {
          if (el.closest?.('#xinyao-atg-room-scanner,#xinyao-room-mini,#xinyao-atg-live-panel,#xinyao-copy-modal')) continue;
          if (!isVisible(el)) continue;
          const text = String(el.textContent || '').trim();
          if (!/^\d{1,2}$/.test(text)) continue;
          const page = Number(text);
          if (!Number.isFinite(page) || page < 1 || page > total) continue;
          const rect = el.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          records.push({ page, x: rect.left, y: rect.top, width: rect.width, height: rect.height, el });
        } catch (_) {}
      }

      const row = selectPagerRow(records, total);
      if (row.length !== total) continue;
      const out = new Map();
      for (const record of row) {
        const clickable = record.el?.closest?.('button,[role="button"],a') || record.el;
        if (clickable) out.set(record.page, clickable);
      }
      if (out.size === total) return out;
    }
    return null;
  }

  function cocosPagerRecords(totalPages) {
    const total = Math.max(2, Math.min(99, Math.trunc(finiteNumber(totalPages) || 2)));
    const records = [];
    for (const gameWindow of collectSameOriginWindows()) {
      try {
        const cocos = gameWindow.cc;
        const scene = cocos?.director?.getScene?.();
        const Label = cocos?.Label;
        if (!scene || !Label || typeof scene.getComponentsInChildren !== 'function') continue;
        const labels = scene.getComponentsInChildren(Label) || [];
        for (const label of labels) {
          const node = label?.node;
          if (!node || node.activeInHierarchy === false) continue;
          const text = String(label?.string ?? '').trim();
          if (!/^\d{1,2}$/.test(text)) continue;
          const page = Number(text);
          if (!Number.isFinite(page) || page < 1 || page > total) continue;

          const ancestors = [];
          let cursor = node.parent || node;
          for (let depth = 0; cursor && depth < 10; depth += 1) {
            ancestors.push(cursor);
            cursor = cursor.parent || null;
          }
          records.push({ page, target: { label, cocos, gameWindow }, ancestors });
        }
      } catch (_) {}
    }
    return records;
  }

  function cocosClickableForLabel(targetRecord, commonAncestor = null) {
    try {
      const label = targetRecord?.label || targetRecord;
      const cocos = targetRecord?.cocos || window.cc;
      const gameWindow = targetRecord?.gameWindow || window;
      const Button = cocos?.Button;
      let node = label?.node || null;
      for (let depth = 0; node && depth < 10; depth += 1) {
        let button = null;
        try { if (Button && typeof node.getComponent === 'function') button = node.getComponent(Button); } catch (_) {}
        const components = Array.isArray(node.components)
          ? node.components
          : (Array.isArray(node._components) ? node._components : []);
        if (!button) {
          button = components.find(component =>
            component && (
              (Array.isArray(component.clickEvents) && component.clickEvents.length) ||
              /button/i.test(String(component.constructor?.name || ''))
            )
          ) || null;
        }
        if (button) return { node, button, label, cocos, gameWindow };
        if (node === commonAncestor) break;
        node = node.parent || null;
      }
      return { node: label?.node?.parent || label?.node || null, button: null, label, cocos, gameWindow };
    } catch (_) {
      return null;
    }
  }

  function findCocosPagerButtons(totalPages = buildDynamicScanPlan(state).totalPages) {
    const total = Math.max(2, Math.min(99, Math.trunc(finiteNumber(totalPages) || 2)));
    const group = selectPagerAncestorGroup(cocosPagerRecords(total), total);
    if (!group || group.targets.size !== total) return null;
    const out = new Map();
    for (let page = 1; page <= total; page += 1) {
      const label = group.targets.get(page);
      const target = cocosClickableForLabel(label, group.ancestor);
      if (!target?.node) return null;
      out.set(page, target);
    }
    return out;
  }

  function emitCocosClick(target) {
    if (!target?.node) return false;
    try {
      const cocos = target.cocos || window.cc;
      const button = target.button;
      const clickEvents = Array.isArray(button?.clickEvents) ? button.clickEvents : [];
      const EventHandler = cocos?.Component?.EventHandler || cocos?.EventHandler;

      if (clickEvents.length && typeof EventHandler?.emitEvents === 'function') {
        try {
          EventHandler.emitEvents(clickEvents, button);
          return true;
        } catch (_) {}
      }

      let emitted = false;
      for (const handler of clickEvents) {
        try {
          if (typeof handler?.emit === 'function') {
            handler.emit([button]);
            emitted = true;
            continue;
          }
          const targetNode = handler?.target;
          const componentName = handler?.component;
          const methodName = handler?.handler;
          if (!targetNode || !methodName) continue;
          let component = null;
          try {
            if (componentName && typeof targetNode.getComponent === 'function') component = targetNode.getComponent(componentName);
          } catch (_) {}
          const receiver = component || targetNode;
          const fn = receiver?.[methodName];
          if (typeof fn === 'function') {
            fn.call(receiver, button, handler?.customEventData);
            emitted = true;
          }
        } catch (_) {}
      }
      if (emitted) return true;

      // 自訂頁碼控制 fallback：直接發送語意 click，不換算任何螢幕座標。
      if (typeof target.node.emit === 'function') {
        try { target.node.emit('click', button || target.node); return true; } catch (_) {}
        try { target.node.emit('touch-end', { target: target.node, currentTarget: target.node }); return true; } catch (_) {}
      }
    } catch (_) {}
    return false;
  }

  function findSemanticPagerTargets(totalPages = buildDynamicScanPlan(state).totalPages) {
    const dom = findPagerButtons(totalPages);
    if (dom?.size) return { kind: 'dom', targets: dom };
    const cocos = findCocosPagerButtons(totalPages);
    if (cocos?.size) return { kind: 'cocos', targets: cocos };
    return null;
  }

  function activateSemanticPagerTarget(targetSet, page) {
    const target = targetSet?.targets?.get?.(page);
    if (!target) return false;
    if (targetSet.kind === 'dom') return clickPagerElement(target);
    if (targetSet.kind === 'cocos') return emitCocosClick(target);
    return false;
  }

  async function clickSemanticPage(page, totalPages) {
    const targetCount = expectedBandCount(page);
    const beforeBand = roomBandCount(page);
    if (beforeBand >= targetCount && targetCount > 0) {
      state.scanVisited.add(page);
      state.pagesSeen.add(page);
      state.dataPagesSeen.add(page);
      return { ok: true, count: beforeBand, target: targetCount, cached: true, semantic: true };
    }

    const targetSet = findSemanticPagerTargets(totalPages);
    if (!targetSet) {
      return { ok: false, reason: 'semantic-pager-not-found', count: beforeBand, target: targetCount };
    }

    const beforeSeq = state.pageLoadSeq;
    const beforePage = state.latestInferredPage;
    setPageIntent(page);
    const sent = activateSemanticPagerTarget(targetSet, page);
    if (!sent) {
      state.pageIntent = null;
      return { ok: false, reason: 'semantic-pager-click-failed', count: beforeBand, target: targetCount };
    }

    state.scanMessage = `🤖 語意翻頁｜第 ${page} / ${totalPages} 頁｜${beforeBand}/${targetCount}`;
    scheduleRender();

    const landing = await waitForPagerLanding(beforeSeq, beforePage, page, 2500);
    const landed = finiteNumber(landing.landedPage);
    if (landed !== null && landed !== page && roomBandCount(page) <= beforeBand) {
      state.pageIntent = null;
      return { ok: false, reason: 'semantic-pager-wrong-page', landedPage: landed, count: roomBandCount(page), target: targetCount };
    }

    const settled = await waitForPageBand(page, 10000);
    state.pageIntent = null;
    if (!settled.ok) {
      return { ok: false, reason: 'semantic-page-data-timeout', count: settled.count, target: settled.target };
    }

    state.scanVisited.add(page);
    state.pagesSeen.add(page);
    state.dataPagesSeen.add(page);
    return { ok: true, ...settled, pagerKind: targetSet.kind, semantic: true };
  }

  function dispatchNormalizedPoint(xNorm, yNorm) {
    const x = Math.round(clamp(xNorm, 0.01, 0.99) * window.innerWidth);
    const y = Math.round(clamp(yNorm, 0.01, 0.99) * window.innerHeight);
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
    const target = document.elementFromPoint(x, y);
    if (!target) return false;

    const pointerInit = {
      bubbles: true, cancelable: true, composed: true,
      clientX: x, clientY: y, screenX: x, screenY: y,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0
    };
    try { target.dispatchEvent(new PointerEvent('pointermove', { ...pointerInit, buttons: 0 })); } catch {}
    try { target.dispatchEvent(new PointerEvent('pointerdown', { ...pointerInit, buttons: 1 })); } catch {}
    try { target.dispatchEvent(new MouseEvent('mousedown', { ...pointerInit, buttons: 1 })); } catch {}
    try { target.dispatchEvent(new PointerEvent('pointerup', { ...pointerInit, buttons: 0 })); } catch {}
    try { target.dispatchEvent(new MouseEvent('mouseup', { ...pointerInit, buttons: 0 })); } catch {}
    try { target.dispatchEvent(new MouseEvent('click', { ...pointerInit, buttons: 0 })); } catch {}
    return true;
  }

  function clickPagerElement(el) {
    if (!el || !el.isConnected) return false;

    // 先走 ATG 元素自己的 click handler；昨天可用版本就是這條路。
    try {
      el.click();
      return true;
    } catch (_) {}

    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    const ownerDocument = el.ownerDocument || document;
    const ownerWindow = ownerDocument.defaultView || window;
    const target = ownerDocument.elementFromPoint?.(x, y) || el;

    const pointerInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0
    };

    try { target.dispatchEvent(new (ownerWindow.PointerEvent || PointerEvent)('pointermove', { ...pointerInit, buttons: 0 })); } catch {}
    try { target.dispatchEvent(new (ownerWindow.PointerEvent || PointerEvent)('pointerdown', { ...pointerInit, buttons: 1 })); } catch {}
    try { target.dispatchEvent(new (ownerWindow.MouseEvent || MouseEvent)('mousedown', { ...pointerInit, buttons: 1 })); } catch {}
    try { target.dispatchEvent(new (ownerWindow.PointerEvent || PointerEvent)('pointerup', { ...pointerInit, buttons: 0 })); } catch {}
    try { target.dispatchEvent(new (ownerWindow.MouseEvent || MouseEvent)('mouseup', { ...pointerInit, buttons: 0 })); } catch {}
    try { target.dispatchEvent(new (ownerWindow.MouseEvent || MouseEvent)('click', { ...pointerInit, buttons: 0 })); } catch {}

    return true;
  }

  function dispatchPagePoint(page, xOverride = null) {
    const point = pagePoint(state.pageCalibration, page);
    if (!point) return false;
    setPageIntent(page);
    return dispatchNormalizedPoint(xOverride ?? point.x, point.y);
  }

  function visibleCanvasRects() {
    const out = [];
    for (const canvas of document.querySelectorAll('canvas')) {
      try {
        const r = canvas.getBoundingClientRect();
        const cs = getComputedStyle(canvas);
        if (r.width < 260 || r.height < 260 || cs.display === 'none' || cs.visibility === 'hidden') continue;
        out.push({ el: canvas, left: r.left, top: r.top, width: r.width, height: r.height, area: r.width * r.height });
      } catch (_) {}
    }
    return out.sort((a, b) => b.area - a.area).slice(0, 4);
  }

  function profileSurfaceSignature(profile) {
    const r = profile?.rect;
    if (!r) return '';
    return [
      profile.source || 'unknown',
      Math.round(r.left), Math.round(r.top),
      Math.round(r.width), Math.round(r.height),
      Math.round(window.devicePixelRatio * 100) / 100
    ].join(':');
  }

  function resetAdaptivePagerLearning() {
    state.learnedPagerY = null;
    state.pagerSamples = [];
    state.adaptivePagerCalibration = null;
  }

  function fixedPagerProfile() {
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    const canvases = visibleCanvasRects();
    const selected = selectFixedPagerProfile(vw, vh, canvases);
    const source = selected.canvasIndex >= 0 ? canvases[selected.canvasIndex] : null;
    const profile = {
      ...selected,
      target: source?.el || null,
      rect: source || selected.rect
    };

    const signature = profileSurfaceSignature(profile);
    if (state.pagerSurfaceSignature && state.pagerSurfaceSignature !== signature) {
      resetAdaptivePagerLearning();
    }
    state.pagerSurfaceSignature = signature;
    return profile;
  }

  function activePagerCalibration(profile) {
    if (!profile) return null;
    if (state.adaptivePagerCalibration && state.pagerSurfaceSignature === profileSurfaceSignature(profile)) {
      return state.adaptivePagerCalibration;
    }
    return null;
  }

  function pointForFixedProfile(profile, page, hypothesis = null, xOverrideRatio = null, yOverrideRatio = null) {
    const p = finiteNumber(page);
    const maxPage = Math.max(1, Math.trunc(finiteNumber(state.totalPages) || 9));
    if (!profile || p === null || p < 1 || p > maxPage) return null;
    const r = profile.rect;
    const calibration = activePagerCalibration(profile);
    let ratioPoint = calibration ? pagePoint(calibration, p) : null;
    const h = hypothesis || profile.hypotheses?.[0] || profile;
    if (!ratioPoint) {
      ratioPoint = {
        x: h.x0 + (p - 1) * h.step,
        y: h.y
      };
    }
    const xr = finiteNumber(xOverrideRatio) ?? ratioPoint.x;
    const yr = finiteNumber(yOverrideRatio) ?? ratioPoint.y;
    return {
      x: r.left + r.width * xr,
      y: r.top + r.height * yr,
      xRatio: xr,
      yRatio: yr
    };
  }

  function filterPointForFixedProfile(profile) {
    if (!profile) return null;
    const r = profile.rect;
    const calibration = activePagerCalibration(profile);
    const h = profile.hypotheses?.[0] || profile;
    // show-all 不需要精準到單一像素；用目前版型主假設，並限制在遊戲 surface 內。
    const xRatio = h.showAllX ?? 0.18;
    const yRatio = calibration?.y ? Math.max(0.08, calibration.y - 0.075) : (h.showAllY ?? 0.13);
    return {
      x: r.left + r.width * xRatio,
      y: r.top + r.height * yRatio
    };
  }

  function buildPagerYProbeList(profile, learnedY = null) {
    if (!profile) return [];
    const values = [];
    const push = value => {
      const n = finiteNumber(value);
      if (n === null || n < 0.10 || n > 0.34) return;
      if (!values.some(v => Math.abs(v - n) < 0.0005)) values.push(n);
    };

    push(activePagerCalibration(profile)?.y);
    push(learnedY);
    for (const h of profile.hypotheses || []) {
      push(h.y);
      push(h.y - 0.012);
      push(h.y + 0.012);
    }
    // 最後才走通用安全帶，涵蓋瀏覽器縮放 / 平板分割畫面。
    [0.165, 0.185, 0.205, 0.225, 0.245, 0.265].forEach(push);
    return values;
  }

  function rememberPagerSample(profile, page, xRatio, yRatio) {
    const p = finiteNumber(page);
    const xr = finiteNumber(xRatio);
    const yr = finiteNumber(yRatio);
    if (!profile || p === null || xr === null || yr === null) return;
    state.pagerSamples = upsertCalibrationSample(state.pagerSamples, String(p), xr, yr);
    const calibration = buildPageCalibration(state.pagerSamples);
    if (calibration) state.adaptivePagerCalibration = calibration;
    state.learnedPagerY = yr;
  }

  function waitForPagerLanding(beforeSeq, beforePage, targetPage, timeout = 1800) {
    const target = finiteNumber(targetPage);
    return new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        const inferred = finiteNumber(state.latestInferredPage);
        const seqChanged = state.pageLoadSeq > beforeSeq;
        const targetCount = target !== null ? roomBandCount(target) : 0;
        if (target !== null && targetCount > 0 && inferred === target) {
          clearInterval(timer);
          resolve({ landedPage: inferred, seqChanged, targetCount });
          return;
        }
        if (seqChanged && inferred !== null && inferred !== finiteNumber(beforePage)) {
          clearInterval(timer);
          resolve({ landedPage: inferred, seqChanged, targetCount });
          return;
        }
        if (state.scanAbort || Date.now() - started >= timeout) {
          clearInterval(timer);
          resolve({ landedPage: inferred, seqChanged, targetCount });
        }
      }, 80);
    });
  }

  function dispatchClientPoint(x, y, targetOverride = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
    const target = targetOverride || document.elementFromPoint(Math.round(x), Math.round(y));
    if (!target) return false;

    const init = {
      bubbles: true, cancelable: true, composed: true,
      clientX: Math.round(x), clientY: Math.round(y),
      screenX: Math.round(x), screenY: Math.round(y),
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0
    };

    try { target.dispatchEvent(new PointerEvent('pointermove', { ...init, buttons: 0 })); } catch (_) {}
    try { target.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 })); } catch (_) {}
    try { target.dispatchEvent(new MouseEvent('mousedown', { ...init, buttons: 1 })); } catch (_) {}
    try { target.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 })); } catch (_) {}
    try { target.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 })); } catch (_) {}
    try { target.dispatchEvent(new MouseEvent('click', { ...init, buttons: 0 })); } catch (_) {}
    return true;
  }

  function roomBandCount(page) {
    const plan = buildDynamicScanPlan(state);
    const range = plan.rangeForPage(page);
    if (!range) return 0;
    let count = 0;
    for (const room of state.roomMap.values()) {
      const n = finiteNumber(room?.number);
      if (n !== null && n >= range.min && n <= range.max) count++;
    }
    return count;
  }

  function expectedBandCount(page) {
    return buildDynamicScanPlan(state).expectedBandCount(page);
  }

  function waitForPageBand(page, timeout = 8000) {
    const target = expectedBandCount(page);
    return new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        const count = roomBandCount(page);
        if (count >= target) {
          clearInterval(timer);
          resolve({ ok: true, count, target });
          return;
        }
        if (state.scanAbort || Date.now() - started >= timeout) {
          clearInterval(timer);
          resolve({ ok: false, count, target });
        }
      }, 100);
    });
  }

  async function collectSinglePageWithoutPager(page = 1) {
    const target = expectedBandCount(page);
    const current = roomBandCount(page);

    if (current >= target && target > 0) {
      state.scanVisited.add(page);
      state.pagesSeen.add(page);
      state.dataPagesSeen.add(page);
      return { ok: true, count: current, target, cached: true, singlePage: true };
    }

    const settled = await waitForPageBand(page, 8000);
    if (settled.ok) {
      state.scanVisited.add(page);
      state.pagesSeen.add(page);
      state.dataPagesSeen.add(page);
      return { ok: true, ...settled, singlePage: true };
    }

    return {
      ok: false,
      reason: 'single-page-data-timeout',
      count: settled.count,
      target: settled.target
    };
  }

  function deepClickableByText(text) {
    for (const root of collectDeepRoots()) {
      let nodes = [];
      try { nodes = [...root.querySelectorAll('button,[role="button"],a,div,span')]; } catch (_) {}
      for (const el of nodes) {
        try {
          if (!isVisible(el)) continue;
          if (String(el.textContent || '').trim() !== text) continue;
          return el.closest?.('button,[role="button"],a') || el;
        } catch (_) {}
      }
    }
    return null;
  }

  async function ensureShowAll(profile) {
    // 能抓到 DOM 時直接點文字；抓不到（Canvas）就用該版型「顯示全部」固定位置。
    const dom = deepClickableByText('顯示全部');
    if (dom) {
      try { dom.click(); } catch (_) { clickPagerElement(dom); }
      await delay(700);
      return true;
    }

    const point = filterPointForFixedProfile(profile);
    if (!point) return false;
    dispatchClientPoint(point.x, point.y, profile.target || null);
    await delay(800);
    return true;
  }

  async function clickFixedPage(profile, page) {
    const targetCount = expectedBandCount(page);

    if (roomBandCount(page) >= targetCount) {
      state.scanVisited.add(page);
      state.pagesSeen.add(page);
      state.dataPagesSeen.add(page);
      return { ok: true, count: roomBandCount(page), target: targetCount, cached: true };
    }

    const calibration = activePagerCalibration(profile);
    const baseHypotheses = calibration
      ? [{ id: 'learned', x0: calibration.startX, step: calibration.stepX, y: calibration.y }]
      : (profile.hypotheses || []);
    const hypotheses = baseHypotheses.length ? baseHypotheses : [profile];
    const yCandidates = buildPagerYProbeList(profile, state.learnedPagerY);
    if (!yCandidates.length) {
      return { ok: false, reason: 'no-y-candidate', count: roomBandCount(page), target: targetCount };
    }

    for (const hypothesis of hypotheses) {
      const step = Math.abs(finiteNumber(hypothesis.step) || 0.06);
      for (const yRatio of yCandidates) {
        if (state.scanAbort) {
          return { ok: false, reason: 'aborted', count: roomBandCount(page), target: targetCount };
        }

        let xRatio = activePagerCalibration(profile)
          ? pagePoint(activePagerCalibration(profile), page)?.x
          : (hypothesis.x0 + (page - 1) * hypothesis.step);
        if (!Number.isFinite(xRatio)) continue;

        // 同一組 X/Y 最多用實際「落在哪一頁」回饋修正 3 次。
        for (let correction = 0; correction < 3; correction++) {
          xRatio = clamp(xRatio, 0.025, 0.965);
          const point = pointForFixedProfile(profile, page, hypothesis, xRatio, yRatio);
          if (!point) break;

          const beforeSeq = state.pageLoadSeq;
          const beforePage = state.latestInferredPage;
          const beforeBand = roomBandCount(page);
          setPageIntent(page);
          const sent = dispatchClientPoint(point.x, point.y, profile.target || null);
          if (!sent) {
            state.pageIntent = null;
            break;
          }

          state.scanMessage = `🤖 全裝置自動定位｜第 ${page} 頁｜${beforeBand}/${targetCount}`;
          scheduleRender();

          const landing = await waitForPagerLanding(beforeSeq, beforePage, page, 1700);
          const afterBand = roomBandCount(page);
          const landed = finiteNumber(landing.landedPage);

          if (afterBand > beforeBand || landed === page) {
            rememberPagerSample(profile, page, xRatio, yRatio);
            const settled = await waitForPageBand(page, 10000);
            state.pageIntent = null;
            if (settled.ok) {
              state.scanVisited.add(page);
              state.pagesSeen.add(page);
              state.dataPagesSeen.add(page);
              return {
                ok: true,
                ...settled,
                hypothesis: hypothesis.id || 'adaptive',
                xRatio,
                yRatio,
                corrected: correction
              };
            }
            if (settled.count > beforeBand) {
              return { ok: false, reason: 'partial-data-timeout', count: settled.count, target: settled.target };
            }
          }

          if (landed !== null && landed >= 1 && landed <= buildDynamicScanPlan(state).totalPages && landed !== page) {
            // 點到鄰近頁時，不換裝置模板；直接依真實落頁修正 X。
            xRatio = clamp(xRatio + (page - landed) * step, 0.025, 0.965);
            state.pageIntent = null;
            await roomWait(100);
            continue;
          }

          state.pageIntent = null;
          break;
        }
      }
    }

    return {
      ok: false,
      reason: 'pager-auto-locate-failed',
      count: roomBandCount(page),
      target: targetCount
    };
  }

  function visibleRoomSignature() {
    const values = [];
    const seen = new Set();
    const nodes = document.querySelectorAll('div,span,button,p');

    for (const el of nodes) {
      if (values.length >= 80) break;
      if (el.closest?.('#xinyao-atg-room-scanner,#xinyao-room-mini,#xinyao-atg-live-panel,#xinyao-copy-modal')) continue;
      if (!isVisible(el)) continue;
      const text = String(el.textContent || '').trim();
      if (!/^\d{3,4}$/.test(text) || seen.has(text)) continue;
      seen.add(text);
      values.push(text);
    }

    return values.join('|');
  }

  function waitForNewPageData(beforeCount, beforeSeq, beforeSignature, timeout = 4200) {
    return new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        const count = numberedCount();
        const seqChanged = state.pageLoadSeq > beforeSeq;
        const signature = visibleRoomSignature();
        const domChanged = Boolean(
          beforeSignature &&
          signature &&
          String(beforeSignature) !== String(signature)
        );

        if (count > beforeCount || (seqChanged && domChanged)) {
          clearInterval(timer);
          resolve({
            changed: true,
            count,
            seqChanged,
            domChanged
          });
          return;
        }

        if (state.scanAbort || Date.now() - started > timeout) {
          clearInterval(timer);
          resolve({
            changed: false,
            count,
            seqChanged,
            domChanged
          });
        }
      }, 100);
    });
  }

  async function clickAndCollectPage(page, { allowNoChange = false } = {}) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (state.scanAbort) return { ok: false, changed: false };

      const pager = findPagerButtons();
      const btn = pager?.get(page);
      if (!btn) return { ok: false, changed: false, missing: true };

      const beforeCount = numberedCount();
      const beforeSeq = state.pageLoadSeq;
      const beforeSignature = visibleRoomSignature();

      setPageIntent(page);
      clickPagerElement(btn);

      const result = await waitForNewPageData(
        beforeCount,
        beforeSeq,
        beforeSignature,
        attempt === 1 ? 3600 : 5000
      );

      if (result.changed) {
        state.currentPage = page;
        state.pagesSeen.add(page);
        state.dataPagesSeen.add(page);
        state.pageIntent = null;
        return { ok: true, changed: true };
      }

      // 某一頁可能正好就是目前頁；沒有變化不代表整批掃描要失敗。
      if (allowNoChange) {
        state.pageIntent = null;
        return { ok: true, changed: false };
      }

      await roomWait(180);
    }

    state.pageIntent = null;
    return { ok: false, changed: false };
  }

  async function scanAllPages({ auto = false } = {}) {
    if (state.scanRunning) return;

    // 單頁遊戲沒有可點的頁碼列；若先清空 roomMap，就沒有任何翻頁動作能把資料重新載回來。
    // 因此單頁手動掃描保留目前已載入的房號，只重設掃描進度／排行榜。
    const preScanPolicy = buildScanInteractionPolicy(state);
    if (!auto) {
      if (preScanPolicy.preserveLoadedRooms) resetFullScanProgressPreservingRooms({ clearStored: true });
      else resetFullScanData({ clearStored: true, preserveMeta: true });
    }

    state.scanRunning = true;
    state.scanAbort = false;
    state.scanVisited = new Set();
    state.scanError = '';
    state.scanMessage = auto ? '自動刷新掃描中…' : '🤖 一鍵掃描中｜正在讀取此遊戲房數…';
    scheduleRender();

    const plan = buildDynamicScanPlan(state);
    if (!plan.totalTableCount || !plan.totalPages) {
      state.scanRunning = false;
      state.scanError = '尚未取得此遊戲的房數／頁數，請停留在「選擇機台」畫面 1～2 秒後再按一次。';
      state.scanMessage = '等待 ATG 回傳房號資料…';
      scheduleRender();
      return;
    }
    const expected = plan.totalTableCount;
    const pages = plan.pages;
    const totalPages = plan.totalPages;
    const interactionPolicy = buildScanInteractionPolicy(plan);

    // 多頁遊戲直接找「真正的頁碼控制」並觸發，不再依螢幕尺寸、Canvas 比例或固定座標猜位置。
    state.scanMessage = interactionPolicy.usePager
      ? `🤖 全裝置語意掃描｜正在辨識此遊戲的 ${totalPages} 個頁碼…`
      : `🤖 單頁遊戲｜直接讀取目前房號資料…`;
    scheduleRender();

    for (const page of pages) {
      if (state.scanAbort) break;

      const target = expectedBandCount(page);
      state.scanMessage = `🤖 第 ${page} / ${totalPages} 頁｜等待房號資料 ${roomBandCount(page)} / ${target}｜總計 ${numberedCount()} / ${expected}`;
      scheduleRender();

      const result = interactionPolicy.usePager
        ? await clickSemanticPage(page, totalPages)
        : await collectSinglePageWithoutPager(page);
      if (!result.ok) {
        state.scanError = ['semantic-pager-not-found','semantic-pager-click-failed','semantic-pager-wrong-page'].includes(result.reason)
          ? `第 ${page} 頁未能辨識或觸發真正的頁碼控制；本次不使用固定座標，掃描已停止。`
          : result.reason === 'single-page-data-timeout'
            ? `單頁遊戲資料尚未收完整：目前 ${result.count ?? roomBandCount(page)} / ${result.target ?? target}。請停留在選擇機台畫面數秒後再掃描。`
            : `第 ${page} 頁資料收取失敗：目前 ${result.count ?? roomBandCount(page)} / ${result.target ?? target}。掃描已停在此頁，不會跳過。`;
        state.scanMessage = `掃描暫停｜總計 ${numberedCount()} / ${expected}`;
        state.scanRunning = false;
        scheduleRender();
        return;
      }

      state.scanMessage = `✅ 第 ${page} 頁已收完整 ${result.count}/${result.target}｜總計 ${numberedCount()} / ${expected}`;
      scheduleRender();
      await delay(250);
    }

    state.scanRunning = false;
    const count = numberedCount();
    const completePages = pages.filter(page => roomBandCount(page) >= expectedBandCount(page));

    if (state.scanAbort) {
      state.scanMessage = `已停止｜目前 ${count} / ${expected}`;
    } else if (completePages.length === pages.length && count >= expected) {
      const snapshotCount = captureRankingSnapshot();
      const persisted = saveFullScanSession();
      state.scanError = persisted ? '' : '掃描已完成，但瀏覽器未能保存本次全房資料；進房或重新整理後可能需要重新掃描。';
      state.scanMessage = `✅ 1～${totalPages} 頁資料全部完成｜${count} / ${expected}｜排行榜已固定 ${snapshotCount} 個空房${persisted ? '｜已保存進房後可還原' : ''}`;
    } else {
      const missing = pages.filter(page => roomBandCount(page) < expectedBandCount(page));
      state.scanError = `資料仍未完整：第 ${missing.join('、')} 頁。`;
      state.scanMessage = `掃描結束｜目前 ${count} / ${expected}`;
    }
    scheduleRender();
  }

  function stopScan() {
    if (!state.scanRunning) return;
    state.scanAbort = true;
    state.scanMessage = '正在停止…';
    scheduleRender();
  }

  function setAutoRefresh(minutes) {
    ui.autoRefreshMins = minutes;
    if (state.autoTimer) {
      clearInterval(state.autoTimer);
      state.autoTimer = null;
    }
    if (minutes > 0) {
      state.autoTimer = setInterval(() => {
        if (!state.scanRunning && !state.enterRoomBusy) scanAllPages({ auto: true });
      }, minutes * 60 * 1000);
    }
    scheduleRender();
  }

  function formatPct(v) {
    return v === null || !Number.isFinite(v) ? '—' : `${v.toFixed(2)}%`;
  }

  function formatNum(v) {
    return v === null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString('zh-TW', { maximumFractionDigits: 2 });
  }

  function statusLabel(status) {
    if (status === 'Empty') return '空房';
    if (status === 'Full') return '使用中';
    if (status === 'Locked') return '鎖定';
    return status || '未知';
  }

  function statusBadge(status) {
    const bg = status === 'Empty' ? '#1f9d64' : status === 'Locked' ? '#8b5cf6' : status === 'Full' ? '#64748b' : '#475569';
    return `<span style="background:${bg};padding:2px 7px;border-radius:999px;font-size:10px;white-space:nowrap;">${statusLabel(status)}</span>`;
  }

  function filteredSortedRooms() {
    let rooms = numberedRooms().map(r => ({ ...r, metrics: calculateMetrics(r) }));
    const q = ui.search.trim();
    if (q) rooms = rooms.filter(r => String(r.number).includes(q) || String(r.roomId).includes(q));
    if (ui.filter !== 'All') rooms = rooms.filter(r => r.status === ui.filter);

    const score = (r) => {
      if (ui.sort === 'today') return r.metrics.todayRate;
      if (ui.sort === 'total') return r.metrics.totalRate;
      if (ui.sort === 'todayBet') return r.metrics.todayBet;
      if (ui.sort === 'score') return r.metrics.observationScore;
      return r.number;
    };

    rooms.sort((a, b) => {
      if (ui.sort === 'number') return a.number - b.number;
      const av = score(a), bv = score(b);
      if (av === null && bv === null) return a.number - b.number;
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av || a.number - b.number;
    });
    return rooms;
  }

  function captureRankingSnapshot() {
    const snapshot = numberedRooms()
      .filter(r => r?.status === 'Empty')
      .map(r => normalizeRoom(r))
      .filter(Boolean);

    state.rankingSnapshotRooms = snapshot;
    state.rankingSnapshotAt = new Date().toISOString();
    return snapshot.length;
  }

  function topRooms() {
    const snapshotSource = Array.isArray(state.rankingSnapshotRooms)
      ? state.rankingSnapshotRooms
      : numberedRooms();

    // 排行分數仍以「完整掃描完成當下」的快照為基準，
    // 但空房狀態必須跟 ATG 即時 slotTableUpdated 同步。
    // 否則房間已被會員進入後，舊快照仍會把它顯示成空房。
    const liveByRoomId = new Map();
    const liveByNumber = new Map();

    for (const room of numberedRooms()) {
      const rid = finiteNumber(room?.roomId);
      const rnum = finiteNumber(room?.number);
      if (rid !== null) liveByRoomId.set(Math.trunc(rid), room);
      if (rnum !== null) liveByNumber.set(Math.trunc(rnum), room);
    }

    const source = snapshotSource
      .map(snapshotRoom => {
        const rid = finiteNumber(snapshotRoom?.roomId);
        const rnum = finiteNumber(snapshotRoom?.number);

        const directLiveStatus =
          rid !== null
            ? state.liveStatusByRoomId.get(Math.trunc(rid))
            : null;

        const live =
          (rid !== null ? liveByRoomId.get(Math.trunc(rid)) : null) ||
          (rnum !== null ? liveByNumber.get(Math.trunc(rnum)) : null) ||
          null;

        return {
          ...snapshotRoom,
          // 優先順序：
          // 1. slotTableUpdated / 最新 tables 對該 roomId 的即時狀態
          // 2. roomMap 目前狀態
          // 3. 掃描完成當下快照
          // 必須有當前掃描 / 即時更新狀態，不能只信舊快照的 Empty。
          status: directLiveStatus?.status ?? live?.status ?? 'Unknown',
          updatedAt:
            directLiveStatus?.updatedAt ??
            live?.updatedAt ??
            snapshotRoom.updatedAt
        };
      })
      .filter(room => room?.status === 'Empty');

    return rankRooms(source, { onlyEmpty: true, mode: ui.rankMode }).slice(0, ui.topN);
  }

  function exportData() {
    const rooms = numberedRooms()
      .map(r => ({ ...r, metrics: calculateMetrics(r) }))
      .sort((a, b) => a.number - b.number);
    return {
      version: VERSION,
      capturedAt: new Date().toISOString(),
      page: sanitizeUrl(location.href),
      summary: {
        roomsKnown: rooms.length,
        totalTableCount: state.totalTableCount,
        pagesSeen: [...state.pagesSeen].sort((a, b) => a - b),
        currentPage: state.currentPage,
        tablePerPage: state.tablePerPage,
        totalPages: state.totalPages,
        scanMessage: state.scanMessage,
        learningPageNav: state.learningPageNav,
        pageCalibrationReady: !!state.pageCalibration,
        calibrationActive: state.calibrationActive,
        learningStartPage: state.learningStartPage
      },
      note: '觀察分數僅依目前已取得的歷史統計排序，不代表未來結果或獲利保證。',
      topEmptyRooms: topRooms(),
      rooms,
      pageNavigationDiagnostics: state.learningResult,
      recentEvents: state.events.slice(-250)
    };
  }

  function prepareSyncToXinyaoSite() {
    const rooms = numberedRooms();
    if (!rooms.length) {
      state.scanError = '目前沒有可同步的房號資料，請先完成全房掃描。';
      scheduleRender();
      return false;
    }

    pendingSyncPayload = buildSyncPayload(rooms, state);
    state.scanError = '';
    state.scanMessage = `準備同步 ${pendingSyncPayload.rooms.length} 房｜正在開啟芯瑤…`;
    scheduleRender();

    if (syncHandshakeTimer) clearTimeout(syncHandshakeTimer);
    syncHandshakeTimer = setTimeout(() => {
      syncHandshakeTimer = null;
      if (!pendingSyncPayload) return;
      state.scanError = '芯瑤頁面尚未回應同步要求；請回到此頁再按一次「同步到芯瑤」。';
      state.scanMessage = `同步等待中｜資料仍保留 ${pendingSyncPayload.rooms.length} 房`;
      scheduleRender();
    }, 20000);

    return true;
  }

  window.addEventListener('message', event => {
    if (event.origin !== SITE_ORIGIN) return;

    if (event.data?.type === SYNC_READY_TYPE) {
      if (!pendingSyncPayload) return;
      try {
        event.source?.postMessage(pendingSyncPayload, SITE_ORIGIN);
        state.scanError = '';
        state.scanMessage = `正在同步 ${pendingSyncPayload.rooms.length} 房到芯瑤…`;
        scheduleRender();
      } catch (_) {}
      return;
    }

    if (event.data?.type === SYNC_ACK_TYPE) {
      const rooms = Number(event.data?.rooms) || pendingSyncPayload?.rooms?.length || 0;
      pendingSyncPayload = null;
      if (syncHandshakeTimer) {
        clearTimeout(syncHandshakeTimer);
        syncHandshakeTimer = null;
      }
      state.scanError = '';
      state.scanMessage = `✅ 已同步 ${rooms} 房｜芯瑤「全房推薦」已更新`;
      scheduleRender();
    }
  }, true);

  function closeCopyDialog() {
    document.getElementById('xinyao-copy-modal')?.remove();
  }

  function openCopyDialog(text) {
    closeCopyDialog();

    const overlay = document.createElement('div');
    overlay.id = 'xinyao-copy-modal';
    overlay.style.cssText = `
      position:fixed;
      inset:0;
      z-index:2147483647;
      background:rgba(0,0,0,.72);
      display:flex;
      align-items:center;
      justify-content:center;
      padding:18px;
      font-family:Arial,"Microsoft JhengHei",sans-serif;
    `;

    overlay.innerHTML = `
      <div style="
        width:min(760px,94vw);
        height:min(680px,86vh);
        background:#17131d;
        color:#fff;
        border:1px solid rgba(255,255,255,.15);
        border-radius:16px;
        padding:16px;
        box-shadow:0 18px 60px rgba(0,0,0,.5);
        display:flex;
        flex-direction:column;
        gap:10px;
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div>
            <div style="font-size:16px;font-weight:800;">📋 ATG 偵測結果</div>
            <div style="font-size:11px;opacity:.7;margin-top:3px;">
              如果自動複製失敗，按「全選文字」後再按 Ctrl + C
            </div>
          </div>
          <button id="xinyao-copy-close" style="
            border:0;border-radius:8px;background:rgba(255,255,255,.1);
            color:#fff;padding:7px 11px;cursor:pointer;
          ">✕</button>
        </div>

        <textarea id="xinyao-copy-text" readonly style="
          flex:1;width:100%;min-height:0;resize:none;box-sizing:border-box;
          border:1px solid rgba(255,255,255,.15);border-radius:10px;
          background:#0d0b11;color:#fff;padding:12px;font-size:11px;
          line-height:1.5;outline:none;white-space:pre;
        "></textarea>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button id="xinyao-copy-select" style="
            border:0;border-radius:10px;padding:10px;cursor:pointer;
            background:#ff5a9d;color:#fff;font-weight:800;
          ">全選文字</button>

          <button id="xinyao-copy-direct" style="
            border:1px solid rgba(255,255,255,.18);border-radius:10px;
            padding:10px;cursor:pointer;background:rgba(255,255,255,.08);
            color:#fff;font-weight:800;
          ">複製文字</button>
        </div>

        <div id="xinyao-copy-status" style="
          min-height:18px;font-size:11px;text-align:center;opacity:.8;
        "></div>
      </div>
    `;

    document.body.appendChild(overlay);

    const textarea = document.getElementById('xinyao-copy-text');
    const status = document.getElementById('xinyao-copy-status');
    textarea.value = text;

    function selectText() {
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
    }

    document.getElementById('xinyao-copy-select')?.addEventListener('click', () => {
      selectText();
      status.textContent = '✅ 已全選，現在按 Ctrl + C';
    });

    document.getElementById('xinyao-copy-direct')?.addEventListener('click', () => {
      selectText();

      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }

      status.textContent = copied
        ? '✅ 已複製，可以直接貼到 ChatGPT'
        : '⚠️ 瀏覽器未允許自動複製，請直接按 Ctrl + C';
    });

    document.getElementById('xinyao-copy-close')?.addEventListener('click', closeCopyDialog);

    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeCopyDialog();
    });

    setTimeout(() => {
      selectText();
      status.textContent = '文字已全選，可直接按 Ctrl + C';
    }, 50);
  }

  function copyResults() {
    try {
      const text = JSON.stringify(exportData(), null, 2);
      openCopyDialog(text);
    } catch (error) {
      openCopyDialog(JSON.stringify({
        version: VERSION,
        error: '建立匯出資料失敗',
        message: String(error?.message || error)
      }, null, 2));
    }
  }

  function clearResults() {
    if (state.scanRunning) return;
    state.roomMap.clear();
    state.pagesSeen.clear();
    state.dataPagesSeen.clear();
    state.totalTableCount = 0;
    state.tablePerPage = 0;
    state.totalPages = 0;
    state.currentPage = null;
    state.events = [];
    state.lastSource = '等待資料';
    state.scanVisited.clear();
    state.scanMessage = '已清空，等待新資料';
    state.scanError = '';
    state.learningPageNav = false;
    state.learningStartPage = null;
    state.learningEvents = [];
    state.learningResult = [];
    ui.roomListPage = 1;
    scheduleRender();
  }

  function buttonStyle(extra = '') {
    return `border:0;border-radius:9px;padding:6px;cursor:pointer;background:#ff5a9d;color:#fff;font-weight:700;font-size:12px;${extra}`;
  }

  function secondaryButtonStyle(extra = '') {
    return `border:1px solid rgba(255,255,255,.18);border-radius:9px;padding:6px;cursor:pointer;background:rgba(255,255,255,.08);color:#fff;font-weight:700;font-size:12px;${extra}`;
  }

  function escapeHtml(text) {
    return String(text ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  const mini = document.createElement('button');

  function flash(text) {
    const el = document.getElementById('xinyao-room-copy');
    if (!el) return;
    const old = el.textContent;
    el.textContent = text;
    setTimeout(() => { if (el) el.textContent = old; }, 1500);
  }

  const roomWait = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

  function sameOriginRoomWindows() {
    const out = [];
    const seen = new Set();
    const visit = w => {
      if (!w || seen.has(w)) return;
      seen.add(w);
      try {
        void w.location.href;
        out.push(w);
        for (let i = 0; i < w.frames.length; i += 1) visit(w.frames[i]);
      } catch (_) {}
    };
    visit(window);
    return out;
  }

  function cocosButtonText(button, cocos) {
    try {
      const node = button?.node;
      const Label = cocos?.Label;
      if (!node || !Label || typeof node.getComponentsInChildren !== 'function') return '';
      return (node.getComponentsInChildren(Label) || [])
        .map(label => String(label?.string ?? label?._string ?? '').trim())
        .filter(Boolean)
        .join(' | ');
    } catch (_) {
      return '';
    }
  }

  function cocosNodePath(node) {
    const parts = [];
    let cur = node;
    for (let i = 0; cur && i < 10; i += 1) {
      const name = String(cur?.name || '').trim();
      if (name) parts.push(name);
      cur = cur.parent || cur._parent || null;
    }
    return parts.reverse().join('/');
  }

  function emitRoomCocosButton(button, cocos) {
    if (!button?.node) return false;
    try {
      if (button.interactable === false || button.enabledInHierarchy === false) return false;
    } catch (_) {}

    try {
      if (typeof button._emitButtonEvent === 'function') {
        button._emitButtonEvent();
        return true;
      }
    } catch (_) {}
    try {
      if (typeof button._emitClickEvent === 'function') {
        button._emitClickEvent();
        return true;
      }
    } catch (_) {}
    try {
      const events = Array.isArray(button.clickEvents) ? button.clickEvents : [];
      const EventHandler = cocos?.Component?.EventHandler || cocos?.EventHandler;
      if (events.length && typeof EventHandler?.emitEvents === 'function') {
        EventHandler.emitEvents(events, button);
        return true;
      }
    } catch (_) {}
    try {
      const type = cocos?.Button?.EventType?.CLICK || 'click';
      button.node.emit?.(type, button);
      return true;
    } catch (_) {}
    return false;
  }

  function findRoomCocosButton(matchFn) {
    for (const w of sameOriginRoomWindows()) {
      try {
        const cocos = w.cc || w.legacyCC || w._cc;
        const scene = cocos?.director?.getScene?.();
        const Button = cocos?.Button;
        if (!scene || !Button || typeof scene.getComponentsInChildren !== 'function') continue;
        const buttons = scene.getComponentsInChildren(Button) || [];
        for (const button of buttons) {
          const node = button?.node;
          if (!node || node.activeInHierarchy === false) continue;
          const text = cocosButtonText(button, cocos);
          const path = cocosNodePath(node);
          if (matchFn({ button, cocos, text, path, window:w })) {
            return { button, cocos, text, path, window:w };
          }
        }
      } catch (_) {}
    }
    return null;
  }

  function currentRoomNumberForOpenButton() {
    const id = finiteNumber(state.currentSelectedRoomId);
    if (id !== null) {
      const mapped = roomNumberByRoomIdFromScanner(id);
      if (mapped !== null) return mapped;
    }
    try {
      const n = finiteNumber(window.__XIANYAO_ATG_LIVE_SNAPSHOT__?.roomNumber);
      if (n !== null) return n;
    } catch (_) {}
    return null;
  }

  function machineSelectionLooksOpen() {
    // ATG 不同版型文字不一致：有些顯示「顯示全部/顯示空桌」，
    // 有些只有頁碼列 + 房號格 +「選取」。
    // 因此改成多證據判斷，不再只靠標題文字。
    for (const w of sameOriginRoomWindows()) {
      try {
        const cocos = w.cc || w.legacyCC || w._cc;
        const scene = cocos?.director?.getScene?.();
        const Button = cocos?.Button;
        if (!scene || !Button || typeof scene.getComponentsInChildren !== 'function') continue;

        const buttons = scene.getComponentsInChildren(Button) || [];
        let pageButtonCount = 0;
        let roomNumberButtonCount = 0;
        let hasSelectionControl = false;

        for (const button of buttons) {
          const node = button?.node;
          if (!node || node.activeInHierarchy === false) continue;
          const text = cocosButtonText(button, cocos);
          const labels = String(text || '').split('|').map(v => v.trim()).filter(Boolean);
          const path = cocosNodePath(node);

          if (labels.some(v => /^(?:[1-9])$/.test(v))) pageButtonCount += 1;
          if (labels.some(v => /^\d{3,4}$/.test(v))) roomNumberButtonCount += 1;
          if (
            labels.some(v => /^(?:選取|选择|選擇|確定|确认|確認)$/.test(v)) ||
            /(顯示全部|顯示空桌|選擇機台|选择机台)/.test(text) ||
            /(?:Select|Choose).*(?:Table|Room|Machine)/i.test(path)
          ) {
            hasSelectionControl = true;
          }
        }

        if (hasSelectionControl && (pageButtonCount >= 2 || roomNumberButtonCount >= 4)) return true;
        if (pageButtonCount >= 4 && roomNumberButtonCount >= 6) return true;
      } catch (_) {}
    }
    return false;
  }

  async function openMachineSelectionForAutoEnter() {
    if (machineSelectionLooksOpen()) return true;

    const currentRoom = currentRoomNumberForOpenButton();
    let found = null;

    if (currentRoom !== null) {
      const exact = String(Math.trunc(currentRoom));
      found = findRoomCocosButton(({text,path}) => {
        const labels = String(text || '').split('|').map(v => v.trim());
        const hasExact = labels.some(v => v === exact);
        return hasExact && /(table|room|machine|select|change|switch|button|spinbar)/i.test(path);
      });
    }

    if (!found) {
      found = findRoomCocosButton(({text,path}) =>
        /(選擇機台|換房|換桌|機台)/.test(text) ||
        /(?:table|room|machine).*(?:select|switch|change)/i.test(path)
      );
    }

    if (found && emitRoomCocosButton(found.button, found.cocos)) {
      // 已經送出開啟事件，下面統一等待。
    } else {
      // ATG 實機已知目前房按鈕常為 slotTable2Btn > num。
      let semanticCurrent = null;
      const currentRoom = currentRoomNumberForOpenButton();
      if (currentRoom !== null) {
        const exact = String(Math.trunc(currentRoom));
        for (const gameWindow of collectSameOriginWindows()) {
          try {
            const cocos = gameWindow.cc || gameWindow.legacyCC || gameWindow._cc;
            const scene = cocos?.director?.getScene?.();
            const Label = cocos?.Label;
            if (!scene || !Label || typeof scene.getComponentsInChildren !== 'function') continue;
            for (const label of (scene.getComponentsInChildren(Label) || [])) {
              const text = String(label?.string ?? label?._string ?? '').trim();
              if (text !== exact) continue;
              const path = roomLabelPath(label);
              if (/spincontent/.test(path)) continue;
              if (!/(slottable.*btn|buttons|control|bottom|spinbar)/i.test(path)) continue;
              const target = cocosClickableForLabel({ label, cocos, gameWindow });
              if (target?.node) {
                semanticCurrent = target;
                break;
              }
            }
          } catch (_) {}
          if (semanticCurrent) break;
        }
      }
      if (!semanticCurrent || !emitCocosClick(semanticCurrent)) return false;
    }

    const started = Date.now();
    while (Date.now() - started < 2600) {
      if (machineSelectionLooksOpen()) return true;
      await roomWait(100);
    }
    return machineSelectionLooksOpen();
  }

  function roomLabelPath(label) {
    const names = [];
    let node = label?.node || null;
    for (let depth = 0; node && depth < 12; depth += 1) {
      names.push(String(node.name || '').toLowerCase());
      node = node.parent || node._parent || null;
    }
    return names.join('/');
  }

  function scannerNodeWorldPoint(node, cocos) {
    try {
      const p = node?.worldPosition || node?._worldPosition;
      if (Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y))) {
        return { x:Number(p.x), y:Number(p.y) };
      }
    } catch (_) {}
    try {
      if (typeof node?.convertToWorldSpaceAR === 'function') {
        const zero = typeof cocos?.v2 === 'function' ? cocos.v2(0,0) : { x:0, y:0 };
        const p = node.convertToWorldSpaceAR(zero);
        if (Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y))) {
          return { x:Number(p.x), y:Number(p.y) };
        }
      }
    } catch (_) {}
    return null;
  }

  function findSelectionSpinContent() {
    for (const gameWindow of collectSameOriginWindows()) {
      try {
        const cocos = gameWindow.cc || gameWindow.legacyCC || gameWindow._cc;
        const scene = cocos?.director?.getScene?.();
        if (!scene) continue;

        const stack = [scene];
        const candidates = [];
        while (stack.length) {
          const node = stack.pop();
          if (!node) continue;
          const children = node.children || node._children || [];
          for (const child of children) stack.push(child);

          if (node.activeInHierarchy === false) continue;
          const name = String(node.name || '').toLowerCase();
          if (!name.includes('spincontent')) continue;

          const childCount = Array.isArray(children) ? children.filter(Boolean).length : 0;
          candidates.push({ node, cocos, gameWindow, childCount });
        }

        if (candidates.length) {
          candidates.sort((a,b) => b.childCount - a.childCount);
          return candidates[0];
        }
      } catch (_) {}
    }
    return null;
  }

  function findButtonInsideNode(root, cocos) {
    if (!root) return null;
    const Button = cocos?.Button;
    if (!Button) return null;

    try {
      const direct = root.getComponent?.(Button);
      if (direct) return direct;
    } catch (_) {}

    try {
      const list = root.getComponentsInChildren?.(Button) || [];
      const usable = list.filter(button => {
        const node = button?.node;
        if (!node || node.activeInHierarchy === false) return false;
        try {
          if (button.enabledInHierarchy === false || button.interactable === false) return false;
        } catch (_) {}
        return true;
      });
      if (!usable.length) return null;

      usable.sort((a,b) => {
        const ap = cocosNodePath(a?.node).toLowerCase();
        const bp = cocosNodePath(b?.node).toLowerCase();
        const score = path => {
          let s = 0;
          if (/slot.*table.*btn/.test(path) && !/slot.*table.*2.*btn/.test(path)) s += 100;
          if (/(button|btn)$/.test(path)) s += 20;
          return s;
        };
        return score(bp) - score(ap);
      });
      return usable[0] || null;
    } catch (_) {}

    return null;
  }

  function indexedRoomCardTarget(index, expectedCount = 0) {
    const wantedIndex = Math.trunc(finiteNumber(index) ?? -1);
    if (wantedIndex < 0) return null;

    const spin = findSelectionSpinContent();
    if (!spin?.node) return null;

    const rawChildren = (spin.node.children || spin.node._children || [])
      .filter(node => node && node.activeInHierarchy !== false);

    const cards = [];
    for (const child of rawChildren) {
      const button = findButtonInsideNode(child, spin.cocos);
      if (!button?.node) continue;

      const path = cocosNodePath(button.node).toLowerCase();
      // 排除頁碼、篩選、底部選取等控制；spinContent 內通常只剩機台卡，
      // 但保留這層防呆避免版型更新後混入其他控制。
      const text = cocosButtonText(button, spin.cocos).replace(/\s+/g,'').trim();
      if (/^(?:[1-9]|選取|选择|選擇|確定|确认|確認|顯示全部|顯示空桌)$/.test(text)) continue;
      if (/slot.*table.*2.*btn/.test(path)) continue;

      const point = scannerNodeWorldPoint(child, spin.cocos) || scannerNodeWorldPoint(button.node, spin.cocos);
      cards.push({
        root:child,
        button,
        node:button.node,
        cocos:spin.cocos,
        gameWindow:spin.gameWindow,
        point,
        path,
        text
      });
    }

    // 正常 direct children 順序就與 tables 一致；若引擎重排 children，
    // 則用畫面位置恢復「由上到下、由左到右」的格子順序。
    if (cards.length && cards.every(card => card.point && Number.isFinite(card.point.x) && Number.isFinite(card.point.y))) {
      cards.sort((a,b) => {
        const dy = b.point.y - a.point.y;
        if (Math.abs(dy) > 8) return dy;
        return a.point.x - b.point.x;
      });
    }

    if (expectedCount > 0 && cards.length < expectedCount) {
      return {
        error:'not-enough-card-targets',
        count:cards.length,
        expected:expectedCount,
        all:cards
      };
    }

    return cards[wantedIndex] || {
      error:'card-index-out-of-range',
      count:cards.length,
      expected:expectedCount,
      index:wantedIndex,
      all:cards
    };
  }

  function xinyaoNodeComponents(node, cocos) {
    const out = [];
    const add = value => { if (value && !out.includes(value)) out.push(value); };
    try {
      const Component = cocos?.Component;
      if (Component && typeof node?.getComponents === 'function') {
        for (const c of (node.getComponents(Component) || [])) add(c);
      }
    } catch (_) {}
    try { for (const c of (Array.isArray(node?.components) ? node.components : [])) add(c); } catch (_) {}
    try { for (const c of (Array.isArray(node?._components) ? node._components : [])) add(c); } catch (_) {}
    return out;
  }

  function looksLikeScrollViewComponent(component) {
    if (!component) return false;
    const name = String(component?.constructor?.name || component?.__classname__ || '').toLowerCase();
    return name.includes('scrollview') ||
      typeof component.scrollToPercentVertical === 'function' ||
      typeof component.scrollToOffset === 'function' ||
      typeof component.getMaxScrollOffset === 'function' ||
      (typeof component.stopAutoScroll === 'function' && component.content);
  }

  function findSelectionScrollView() {
    const spin = findSelectionSpinContent();
    if (!spin?.node) return null;

    let node = spin.node;
    for (let depth = 0; node && depth < 20; depth += 1) {
      try {
        const namespaces = [spin.cocos, spin.gameWindow?.cc, spin.gameWindow?.legacyCC, spin.gameWindow?._cc].filter(Boolean);
        let scrollView = null;

        for (const ns of namespaces) {
          const ScrollView = ns?.ScrollView;
          if (ScrollView && typeof node.getComponent === 'function') {
            try { scrollView = node.getComponent(ScrollView); } catch (_) {}
          }
          if (scrollView) break;
        }

        if (!scrollView) {
          const components = xinyaoNodeComponents(node, spin.cocos);
          scrollView = components.find(looksLikeScrollViewComponent) || null;
        }

        if (scrollView) {
          return {
            scrollView,
            node,
            content:scrollView.content || scrollView._content || spin.node,
            cocos:spin.cocos,
            gameWindow:spin.gameWindow
          };
        }
      } catch (_) {}
      node = node.parent || node._parent || null;
    }

    return null;
  }

  function selectionViewportNode() {
    const spin = findSelectionSpinContent();
    if (!spin?.node) return null;

    const scroll = findSelectionScrollView();
    if (scroll?.scrollView) {
      try {
        const view = scroll.scrollView.view || scroll.scrollView._view;
        if (view) return { node:view, cocos:scroll.cocos, source:'scrollview-view' };
      } catch (_) {}
      try {
        if (scroll.node && scroll.node !== spin.node) return { node:scroll.node, cocos:scroll.cocos, source:'scrollview-node' };
      } catch (_) {}
    }

    // 抓不到 ScrollView 類別時，用 spinContent 祖先的 Mask / View / Viewport 當裁切框。
    const candidates = [];
    let node = spin.node.parent || spin.node._parent || null;
    for (let depth = 0; node && depth < 16; depth += 1) {
      try {
        const name = String(node.name || '').toLowerCase();
        const components = xinyaoNodeComponents(node, spin.cocos);
        const hasMask = components.some(c => /mask|rectmask|clipping/i.test(String(c?.constructor?.name || c?.__classname__ || '')));
        let score = 0;
        if (hasMask) score += 100;
        if (/viewport|view|mask|clip|scroll/.test(name)) score += 60;
        if (/content/.test(name)) score -= 20;
        if (score > 0) candidates.push({ node, cocos:spin.cocos, source:'ancestor-viewport', score, depth });
      } catch (_) {}
      node = node.parent || node._parent || null;
    }
    candidates.sort((a,b) => b.score - a.score || a.depth - b.depth);
    return candidates[0] || null;
  }

  function visibleRoomNumbersFromCocos() {
    const out = [];
    const seen = new Set();

    for (const gameWindow of collectSameOriginWindows()) {
      try {
        const cocos = gameWindow.cc || gameWindow.legacyCC || gameWindow._cc;
        const scene = cocos?.director?.getScene?.();
        const Label = cocos?.Label;
        if (!scene || !Label || typeof scene.getComponentsInChildren !== 'function') continue;

        for (const label of (scene.getComponentsInChildren(Label) || [])) {
          const node = label?.node;
          if (!node || node.activeInHierarchy === false) continue;
          const text = String(label?.string ?? label?._string ?? '').trim();
          if (!/^\d{3,4}$/.test(text)) continue;

          const path = roomLabelPath(label);
          if (/slottable2btn|spinbar|bottom|footer|jackpot|grand|major|minor|mini|balance|wallet|bet|stake/.test(path)) continue;

          const number = Number(text);
          if (!Number.isFinite(number) || seen.has(number)) continue;
          seen.add(number);
          out.push(number);
        }
      } catch (_) {}
    }

    return out;
  }

  function dispatchSelectionWheel(deltaY = 850) {
    let sent = false;
    for (const gameWindow of collectSameOriginWindows()) {
      try {
        const doc = gameWindow.document;
        const canvas = doc.querySelector('canvas#GameCanvas') || doc.querySelector('canvas');
        if (!canvas || typeof canvas.getBoundingClientRect !== 'function') continue;

        const rect = canvas.getBoundingClientRect();
        if (!(rect.width > 0) || !(rect.height > 0)) continue;

        const clientX = rect.left + rect.width * 0.5;
        const clientY = rect.top + rect.height * 0.50;
        const WheelCtor = gameWindow.WheelEvent || WheelEvent;

        const evt = new WheelCtor('wheel', {
          bubbles:true,
          cancelable:true,
          clientX,
          clientY,
          deltaX:0,
          deltaY:Number(deltaY) || 850,
          deltaMode:0
        });
        canvas.dispatchEvent(evt);
        sent = true;

        try {
          const mouseEvt = new gameWindow.MouseEvent('mousewheel', {
            bubbles:true,
            cancelable:true,
            clientX,
            clientY
          });
          Object.defineProperty(mouseEvt, 'wheelDelta', { value: -(Number(deltaY) || 850) });
          canvas.dispatchEvent(mouseEvt);
        } catch (_) {}
      } catch (_) {}
    }
    return sent;
  }

  function xinyaoVec2(cocos, x, y) {
    try {
      if (typeof cocos?.v2 === 'function') return cocos.v2(x,y);
      if (typeof cocos?.Vec2 === 'function') return new cocos.Vec2(x,y);
    } catch (_) {}
    return { x, y };
  }

  async function scrollViewToSelectionPercent(info, percent) {
    const sv = info?.scrollView;
    if (!sv) return false;
    const p = Math.max(0, Math.min(1, Number(percent)));
    if (!Number.isFinite(p)) return false;
    try { sv.stopAutoScroll?.(); } catch (_) {}

    // 最可靠：先拿最大 offset，直接指定實際 Y 位移。
    try {
      if (typeof sv.getMaxScrollOffset === 'function' && typeof sv.scrollToOffset === 'function') {
        const max = sv.getMaxScrollOffset();
        const maxY = Math.abs(Number(max?.y) || 0);
        const maxX = Math.abs(Number(max?.x) || 0);
        if (maxY > 1 || maxX > 1) {
          const point = xinyaoVec2(info.cocos, maxX * p, maxY * p);
          sv.scrollToOffset(point, 0, true);
          return true;
        }
      }
    } catch (_) {}

    try {
      if (typeof sv.scrollToPercentVertical === 'function') {
        sv.scrollToPercentVertical(p, 0, true);
        return true;
      }
    } catch (_) {}

    try {
      if (typeof sv.scrollTo === 'function') {
        sv.scrollTo(xinyaoVec2(info.cocos, 0, p), 0, true);
        return true;
      }
    } catch (_) {}

    return false;
  }

  function findRoomSemanticTargetAny(roomNumber) {
    const wanted = Math.trunc(finiteNumber(roomNumber) || 0);
    if (!wanted) return null;
    for (const gameWindow of collectSameOriginWindows()) {
      try {
        const cocos = gameWindow.cc || gameWindow.legacyCC || gameWindow._cc;
        const scene = cocos?.director?.getScene?.();
        const Label = cocos?.Label;
        if (!scene || !Label || typeof scene.getComponentsInChildren !== 'function') continue;
        for (const label of (scene.getComponentsInChildren(Label) || [])) {
          const node = label?.node;
          if (!node || node.activeInHierarchy === false) continue;
          const text = String(label?.string ?? label?._string ?? '').trim();
          if (!/^\d{3,4}$/.test(text) || Number(text) !== wanted) continue;
          const path = roomLabelPath(label);
          if (/slottable2btn|spinbar|bottom|footer|jackpot|grand|major|minor|mini|balance|wallet|bet|stake/.test(path)) continue;
          const target = cocosClickableForLabel({ label, cocos, gameWindow });
          if (!target?.node) continue;
          return { ...target, roomNumber:wanted, visibleText:text, path };
        }
      } catch (_) {}
    }
    return null;
  }

  function directlyAlignSpinContentToRoom(roomNumber) {
    const spin = findSelectionSpinContent();
    const viewport = selectionViewportNode();
    const target = findRoomSemanticTargetAny(roomNumber);
    if (!spin?.node || !viewport?.node || !target?.node) return false;

    const targetRect = cocosWorldRect(target.node, spin.cocos);
    const viewRect = cocosWorldRect(viewport.node, spin.cocos);
    if (!targetRect || !viewRect) return false;

    const deltaWorldY = viewRect.cy - targetRect.cy;
    if (!Number.isFinite(deltaWorldY) || Math.abs(deltaWorldY) < 1) return true;

    const content = spin.node;
    try {
      const pos = content.position || content._position || {x:0,y:0,z:0};
      const x = Number(pos.x) || 0;
      const y = Number(pos.y) || 0;
      const z = Number(pos.z) || 0;
      // 多數 ATG 選房列表沒有旋轉，world/local Y 比例相同；若父層有縮放則補 scale。
      let scaleY = 1;
      try {
        const parent = content.parent || content._parent;
        const scale = parent?.worldScale || parent?._worldScale || parent?.scale || parent?._scale;
        const sy = Math.abs(Number(scale?.y));
        if (Number.isFinite(sy) && sy > 0.001) scaleY = sy;
      } catch (_) {}
      const nextY = y + deltaWorldY / scaleY;
      if (typeof content.setPosition === 'function') {
        try { content.setPosition(x, nextY, z); }
        catch (_) { content.setPosition(xinyaoVec2(spin.cocos, x, nextY)); }
      } else if (content.position) {
        content.position.y = nextY;
      } else if (content._position) {
        content._position.y = nextY;
      } else return false;
      try { content.emit?.('position-changed'); } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  function selectionVisibleRange() {
    const nums = visibleRoomNumbersFromCocos()
      .map(v => Math.trunc(finiteNumber(v) || 0))
      .filter(v => v > 0);
    if (!nums.length) return { min:null, max:null, values:[] };
    return { min:Math.min(...nums), max:Math.max(...nums), values:[...new Set(nums)].sort((a,b)=>a-b) };
  }

  function dispatchSelectionDrag(direction = 'down', strength = 1) {
    let sent = false;
    const dir = direction === 'up' ? 'up' : 'down';

    // test123：改成「短距離拖曳」。test122 一次拖太遠，會直接從 2001 飛到 2500，
    // 中途經過目標房卻來不及停。strength 只控制 5%～14% 畫面高度的小步幅。
    const power = Math.max(0.25, Math.min(1.40, Number(strength) || 0.7));

    for (const gameWindow of collectSameOriginWindows()) {
      try {
        const doc = gameWindow.document;
        const canvas = doc.querySelector('canvas#GameCanvas') || doc.querySelector('canvas');
        if (!canvas || typeof canvas.getBoundingClientRect !== 'function') continue;
        const rect = canvas.getBoundingClientRect();
        if (!(rect.width > 0) || !(rect.height > 0)) continue;

        const x = rect.left + rect.width * 0.50;
        const centerY = rect.top + rect.height * 0.49;
        const distance = rect.height * Math.max(0.05, Math.min(0.14, 0.045 + power * 0.055));
        const startY = dir === 'down' ? centerY + distance / 2 : centerY - distance / 2;
        const endY   = dir === 'down' ? centerY - distance / 2 : centerY + distance / 2;

        const MouseCtor = gameWindow.MouseEvent || MouseEvent;
        const fireMouse = (type, cy, buttons) => {
          const ev = new MouseCtor(type, {
            bubbles:true, cancelable:true, view:gameWindow,
            clientX:x, clientY:cy, screenX:x, screenY:cy,
            button:0, buttons
          });
          canvas.dispatchEvent(ev);
        };

        fireMouse('mousedown', startY, 1);
        const steps = 6;
        for (let i = 1; i <= steps; i += 1) {
          const y = startY + (endY - startY) * (i / steps);
          fireMouse('mousemove', y, 1);
        }
        fireMouse('mouseup', endY, 0);
        sent = true;
      } catch (_) {}
    }
    return sent;
  }

  async function dragSelectionUntilRoom(roomNumber, maxAttempts = 140) {
    const wanted = Math.trunc(finiteNumber(roomNumber) || 0);
    if (!wanted) return { ok:false, reason:'invalid-room' };

    let previousSignature = '';
    let stagnant = 0;
    let previousCenter = null;
    let previousDirection = '';
    let reversals = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const exact = findVisibleRoomSemanticTarget(wanted);
      if (exact) return { ok:true, target:exact, via:'canvas-drag-fine', attempt, reversals };

      const range = selectionVisibleRange();
      const signature = range.values.join(',');
      if (signature && signature === previousSignature) stagnant += 1;
      else stagnant = 0;
      previousSignature = signature;

      const center = range.min !== null && range.max !== null
        ? (range.min + range.max) / 2
        : null;

      let direction = 'down';
      if (range.min !== null && range.max !== null) {
        if (wanted < range.min) direction = 'up';
        else if (wanted > range.max) direction = 'down';
        else {
          // 目標已落在目前可見數字區間，表示只差虛擬卡片刷新；用極小幅度來回抖動。
          direction = previousDirection === 'down' ? 'up' : 'down';
        }
      }

      if (previousDirection && direction !== previousDirection) reversals += 1;
      previousDirection = direction;

      // 距離目標越近，拖得越小；已經反向過代表剛剛跨過目標，更要縮小步幅。
      let gap = 120;
      if (range.min !== null && range.max !== null) {
        gap = direction === 'down'
          ? Math.max(0, wanted - range.max)
          : Math.max(0, range.min - wanted);
      }

      let strength;
      if (gap <= 12) strength = 0.28;
      else if (gap <= 35) strength = 0.40;
      else if (gap <= 80) strength = 0.58;
      else if (gap <= 160) strength = 0.78;
      else strength = 1.05;

      if (reversals >= 1) strength = Math.min(strength, 0.42);
      if (reversals >= 3) strength = 0.28;
      if (stagnant >= 3) strength = Math.min(1.15, strength + 0.20);

      dispatchSelectionDrag(direction, strength);
      await roomWait(stagnant >= 2 ? 180 : 110);

      // 每一小步之後立刻重新看一次，避免「經過目標但下一步又拖走」。
      const afterExact = findVisibleRoomSemanticTarget(wanted);
      if (afterExact) return { ok:true, target:afterExact, via:'canvas-drag-fine', attempt:attempt + 1, reversals };

      const afterRange = selectionVisibleRange();
      if (afterRange.min !== null && afterRange.max !== null && afterRange.min <= wanted && wanted <= afterRange.max) {
        // 目標號碼已進可視區間，但語意節點可能晚一拍；稍等兩次刷新。
        await roomWait(120);
        const delayed = findVisibleRoomSemanticTarget(wanted);
        if (delayed) return { ok:true, target:delayed, via:'canvas-drag-fine-delayed', attempt:attempt + 1, reversals };
      }

      // 若中心點跨過目標，下一輪會自動反向；保留資料只是為了診斷。
      if (center !== null) previousCenter = center;
    }

    const range = selectionVisibleRange();
    return {
      ok:false,
      reason:`canvas-drag-fine-target-not-rendered-visible-${range.values.slice(0,20).join('_') || 'none'}-reversals-${reversals}`,
      visible:range.values
    };
  }

  async function scrollSelectionTowardIndex(targetIndex, totalCount, roomNumber) {
    const wantedIndex = Math.max(0, Math.trunc(finiteNumber(targetIndex) || 0));
    const count = Math.max(1, Math.trunc(finiteNumber(totalCount) || 1));
    const wantedRoom = Math.trunc(finiteNumber(roomNumber) || 0);
    const base = count <= 1 ? 0 : wantedIndex / (count - 1);

    // test121：先走真正 Cocos ScrollView，不再先丟 DOM wheel。
    const info = findSelectionScrollView();
    if (info?.scrollView) {
      const candidates = [];
      const add = value => {
        const v = Math.max(0, Math.min(1, Number(value)));
        if (!Number.isFinite(v)) return;
        if (!candidates.some(existing => Math.abs(existing - v) < 0.012)) candidates.push(v);
      };
      add(base); add(1-base);
      for (const d of [-0.10,-0.06,-0.03,0.03,0.06,0.10]) { add(base+d); add(1-base+d); }

      for (const percent of candidates) {
        const sent = await scrollViewToSelectionPercent(info, percent);
        if (!sent) continue;
        await roomWait(180);
        const target = findVisibleRoomSemanticTarget(wantedRoom);
        if (target) return { ok:true, target, via:'scrollview', percent };
      }
    }

    // 抓不到 ScrollView / API 不吃時，直接把 spinContent 移到目標房卡。
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (!directlyAlignSpinContentToRoom(wantedRoom)) break;
      await roomWait(180);
      const target = findVisibleRoomSemanticTarget(wantedRoom);
      if (target) return { ok:true, target, via:'content-align', attempt };
    }

    // test122：ATG 有些版本不是 ScrollView，也沒有可辨識 viewport。
    // 這時直接模擬使用者在 Canvas 選房格裡上下拖曳，並用「目前可見房號」判斷下一步方向。
    const dragged = await dragSelectionUntilRoom(wantedRoom, 90);
    if (dragged?.ok && dragged.target) return dragged;

    // 最後才保留 wheel 當舊版 fallback。
    for (let i = 0; i < 24; i += 1) {
      const target = findVisibleRoomSemanticTarget(wantedRoom);
      if (target) return { ok:true, target, via:'wheel-fallback', pulse:i };
      dispatchSelectionWheel(1000);
      await roomWait(90);
    }

    return {
      ok:false,
      reason:`${dragged?.reason || 'canvas-drag-failed'}-scrollview-${info?.scrollView ? 'found' : 'missing'}-viewport-${selectionViewportNode()?.source || 'missing'}`,
      visible:visibleRoomNumbersFromCocos()
    };
  }

  function cocosWorldRect(node, cocos) {
    if (!node) return null;
    try {
      const UITransform = cocos?.UITransform;
      const ui = UITransform && typeof node.getComponent === 'function' ? node.getComponent(UITransform) : null;
      const box = ui?.getBoundingBoxToWorld?.();
      if (box) {
        const x = Number(box.x ?? box.xMin);
        const y = Number(box.y ?? box.yMin);
        const width = Number(box.width ?? ((box.xMax ?? 0) - (box.xMin ?? 0)));
        const height = Number(box.height ?? ((box.yMax ?? 0) - (box.yMin ?? 0)));
        if ([x,y,width,height].every(Number.isFinite) && width > 0 && height > 0) {
          return { x, y, width, height, cx:x + width/2, cy:y + height/2 };
        }
      }
    } catch (_) {}

    const p = scannerNodeWorldPoint(node, cocos);
    if (!p) return null;
    return { x:p.x, y:p.y, width:1, height:1, cx:p.x, cy:p.y };
  }

  function roomTargetActuallyVisible(target) {
    if (!target?.node) return false;
    try {
      if (target.node.activeInHierarchy === false) return false;
      if (target.button?.enabledInHierarchy === false || target.button?.interactable === false) return false;
    } catch (_) {}

    const info = findSelectionScrollView();
    const viewport = selectionViewportNode();
    const cocos = target.cocos || info?.cocos || viewport?.cocos;
    const targetRect = cocosWorldRect(target.node, cocos);
    if (!targetRect) return false;

    let viewNode = viewport?.node || null;
    if (!viewNode && info?.scrollView) {
      try { viewNode = info.scrollView.view || info.scrollView._view || info.scrollView.node || info.node || null; } catch (_) {}
    }

    // test121：沒有可視框證據就一律視為不可點，避免離屏節點再次被當成已顯示。
    if (!viewNode) return false;
    const viewRect = cocosWorldRect(viewNode, cocos);
    if (!viewRect) return false;

    // 要求房卡中心落在 ScrollView 可視框內，並留一點邊界容差。
    const marginX = Math.max(2, viewRect.width * 0.015);
    const marginY = Math.max(2, viewRect.height * 0.015);
    return targetRect.cx >= viewRect.x + marginX &&
      targetRect.cx <= viewRect.x + viewRect.width - marginX &&
      targetRect.cy >= viewRect.y + marginY &&
      targetRect.cy <= viewRect.y + viewRect.height - marginY;
  }

  function findVisibleRoomSemanticTarget(roomNumber) {
    const wanted = Math.trunc(finiteNumber(roomNumber) || 0);
    if (!wanted) return null;

    for (const gameWindow of collectSameOriginWindows()) {
      try {
        const cocos = gameWindow.cc || gameWindow.legacyCC || gameWindow._cc;
        const scene = cocos?.director?.getScene?.();
        const Label = cocos?.Label;
        if (!scene || !Label || typeof scene.getComponentsInChildren !== 'function') continue;

        const labels = scene.getComponentsInChildren(Label) || [];
        for (const label of labels) {
          const node = label?.node;
          if (!node || node.activeInHierarchy === false) continue;

          const text = String(label?.string ?? label?._string ?? '').trim();
          if (!/^\d{3,4}$/.test(text)) continue;
          const visibleNumber = Number(text);
          if (!Number.isFinite(visibleNumber) || visibleNumber !== wanted) continue;

          const names = [];
          let cursor = node;
          let rejected = false;
          for (let depth = 0; cursor && depth < 20; depth += 1) {
            const name = String(cursor.name || '').toLowerCase();
            names.push(name);
            if (/slottable2btn|spinbar|bottom|footer|jackpot|grand|major|minor|mini|balance|wallet|bet|stake/.test(name)) {
              rejected = true;
              break;
            }
            cursor = cursor.parent || cursor._parent || null;
          }
          if (rejected) continue;

          const target = cocosClickableForLabel({ label, cocos, gameWindow });
          if (!target?.node) continue;

          const path = cocosNodePath(target.node).toLowerCase();
          if (/slottable2btn|spinbar|bottom|footer/.test(path)) continue;

          const candidate = {
            ...target,
            roomNumber:wanted,
            visibleText:text,
            path:names.join('/')
          };
          if (!roomTargetActuallyVisible(candidate)) continue;
          return candidate;
        }
      } catch (_) {}
    }
    return null;
  }

  function currentPageDataHasRoom(roomNumber) {
    const wanted = Math.trunc(finiteNumber(roomNumber) || 0);
    if (!wanted) return false;
    return (Array.isArray(state.latestTableNumbers) ? state.latestTableNumbers : [])
      .some(value => Math.trunc(finiteNumber(value) || 0) === wanted);
  }

  async function waitForCurrentPageDataRoom(roomNumber, timeout = 1800) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (currentPageDataHasRoom(roomNumber)) return true;
      await roomWait(80);
    }
    return currentPageDataHasRoom(roomNumber);
  }

  async function waitForVisibleRoomTarget(roomNumber, timeout = 1400) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const target = findVisibleRoomSemanticTarget(roomNumber);
      if (target) return target;
      await roomWait(80);
    }
    return null;
  }

  async function forceSemanticPageForEnter(page, totalPages) {
    const targetSet = findSemanticPagerTargets(totalPages);
    if (!targetSet) return false;

    const beforeSeq = state.pageLoadSeq;
    const beforeSignature = JSON.stringify(
      (Array.isArray(state.latestTableNumbers) ? state.latestTableNumbers : []).slice(0, 40)
    );

    setPageIntent(page);
    const sent = activateSemanticPagerTarget(targetSet, page);
    if (!sent) {
      state.pageIntent = null;
      return false;
    }

    // 進房模式不能只相信 currentPage，必須等 ATG 真正回傳一批新的 tables。
    const started = Date.now();
    while (Date.now() - started < 2600) {
      const afterSignature = JSON.stringify(
        (Array.isArray(state.latestTableNumbers) ? state.latestTableNumbers : []).slice(0, 40)
      );
      if (state.pageLoadSeq > beforeSeq || afterSignature !== beforeSignature) {
        state.pageIntent = null;
        return true;
      }
      await roomWait(80);
    }

    state.pageIntent = null;
    return false;
  }

  function locateRoomPositionFromFullScan(roomNumber) {
    const wanted = Math.trunc(finiteNumber(roomNumber) || 0);
    if (!wanted) return null;

    const rooms = [...state.roomMap.values()]
      .map(room => ({
        number: Math.trunc(finiteNumber(room?.number) || 0),
        roomId: finiteNumber(room?.roomId)
      }))
      .filter(room => room.number > 0)
      .sort((a,b) => a.number - b.number);

    if (!rooms.length) return null;
    const globalIndex = rooms.findIndex(room => room.number === wanted);
    if (globalIndex < 0) return null;

    const totalPages = Math.max(1, Math.trunc(finiteNumber(state.totalPages) || 1));
    let perPage = Math.trunc(finiteNumber(state.tablePerPage) || 0);
    if (perPage <= 0) perPage = Math.max(1, Math.ceil(rooms.length / totalPages));

    const page = Math.min(totalPages, Math.floor(globalIndex / perPage) + 1);
    const pageStart = (page - 1) * perPage;
    const pageRooms = rooms.slice(pageStart, pageStart + perPage);
    const targetIndex = pageRooms.findIndex(room => room.number === wanted);

    return {
      page,
      targetIndex: targetIndex >= 0 ? targetIndex : (globalIndex - pageStart),
      pageCount: pageRooms.length || perPage,
      globalIndex,
      perPage,
      totalPages
    };
  }

  async function waitForSelectionPageBand(position, timeout = 2600) {
    const page = Math.trunc(finiteNumber(position?.page) || 0);
    const perPage = Math.max(1, Math.trunc(finiteNumber(position?.perPage) || 1));
    if (!page) return false;

    const bandMin = (page - 1) * perPage + 1;
    const bandMax = page * perPage;
    const started = Date.now();

    while (Date.now() - started < timeout) {
      const range = selectionVisibleRange();
      if (range.values.some(value => value >= bandMin && value <= bandMax)) return true;
      await roomWait(80);
    }
    return false;
  }

  async function locateAndSelectRoomByVisibleNumber(roomNumber) {
    const number = Math.trunc(finiteNumber(roomNumber) || 0);
    if (!number) return { ok:false, reason:'invalid-room-number' };

    // test124：全房掃描已完成時，roomMap 本身就是最可靠的房號索引。
    // 不再 1→9 頁逐頁找，也不再要求 latestTableNumbers 當下剛好回傳目標房。
    const position = locateRoomPositionFromFullScan(number);
    if (!position) return { ok:false, reason:'room-number-not-found-in-full-scan' };

    const { page, targetIndex, pageCount, totalPages, perPage } = position;
    state.enterRoomStatus =
      `🎯 ${String(number).padStart(4,'0')} 房定位完成｜第 ${page}/${totalPages} 頁｜第 ${targetIndex + 1}/${pageCount} 筆`;
    scheduleRender();

    // 先直接切正確頁；不再從第 1 頁一路掃到最後。
    let moved = await forceSemanticPageForEnter(page, totalPages);
    if (!moved) moved = await navigateToPageForEnter(page);

    // 有些 ATG 點同一頁時不會重新送 tables，不能因此判定失敗。
    // 改看畫面目前可見房號是否已進入該頁的數字帶。
    const bandReady = await waitForSelectionPageBand(position, moved ? 1800 : 2800);
    if (!bandReady) {
      return {
        ok:false,
        reason:`target-page-not-visible-page-${page}-visible-${visibleRoomNumbersFromCocos().slice(0,20).join('_') || 'none'}`
      };
    }

    state.enterRoomStatus =
      `✅ 已到第 ${page} 頁｜${String(number).padStart(4,'0')} 為第 ${targetIndex + 1} 筆｜正在捲到房卡…`;
    scheduleRender();

    let target = findVisibleRoomSemanticTarget(number);
    if (!target) {
      const scrolled = await scrollSelectionTowardIndex(targetIndex, pageCount || perPage, number);
      if (!scrolled?.ok || !scrolled.target) {
        return {
          ok:false,
          reason:`virtual-scroll-failed-page-${page}-index-${targetIndex + 1}-${scrolled?.reason || 'unknown'}-visible-${(scrolled?.visible || visibleRoomNumbersFromCocos()).slice(0,20).join('_') || 'none'}`
        };
      }
      target = scrolled.target;
    }

    state.enterRoomStatus = `🎯 已看到 ${String(number).padStart(4,'0')} 房卡｜正在點擊…`;
    scheduleRender();

    if (!roomTargetActuallyVisible(target)) {
      return { ok:false, reason:`target-left-viewport-before-click-page-${page}-index-${targetIndex + 1}` };
    }

    const beforeCapture = Number(window.__XIANYAO_ATG_DIRECT_ROOM__?.capturedAt || 0);
    const clicked = target.button
      ? (emitRoomCocosButton(target.button, target.cocos) || emitCocosClick(target))
      : emitCocosClick(target);
    if (!clicked) {
      return { ok:false, reason:`virtual-card-click-failed-page-${page}-index-${targetIndex + 1}` };
    }

    const started = Date.now();
    while (Date.now() - started < 3200) {
      const cap = window.__XIANYAO_ATG_DIRECT_ROOM__;
      if (Number(cap?.capturedAt || 0) > beforeCapture) {
        return { ok:true, page, capture:cap };
      }
      await roomWait(80);
    }

    return {
      ok:false,
      reason:`card-click-no-getSlotTableDetail-page-${page}-index-${targetIndex + 1}-visible-${visibleRoomNumbersFromCocos().slice(0,20).join('_') || 'none'}`
    };
  }

  function cloneWithTargetRoomId(value, targetRoomId, depth = 0, seen = new WeakMap()) {
    if (depth > 12 || value == null) return value;
    if (typeof value !== 'object') return value;
    if (typeof value === 'function') return value;
    if (seen.has(value)) return seen.get(value);

    if (Array.isArray(value)) {
      const out = [];
      seen.set(value, out);
      for (const item of value) out.push(cloneWithTargetRoomId(item, targetRoomId, depth + 1, seen));
      return out;
    }

    const out = {};
    seen.set(value, out);
    for (const [key, raw] of Object.entries(value)) {
      const normalized = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (normalized === 'roomid') out[key] = targetRoomId;
      else out[key] = cloneWithTargetRoomId(raw, targetRoomId, depth + 1, seen);
    }
    return out;
  }

  function cloneWithTargetIdentifiers(value, targetRoomId, targetRoomNumber, depth = 0, seen = new WeakMap()) {
    if (depth > 14 || value == null) return value;
    if (typeof value !== 'object') return value;
    if (typeof value === 'function') return value;
    if (seen.has(value)) return seen.get(value);

    if (Array.isArray(value)) {
      const out = [];
      seen.set(value, out);
      for (const item of value) out.push(cloneWithTargetIdentifiers(item, targetRoomId, targetRoomNumber, depth + 1, seen));
      return out;
    }

    const out = {};
    seen.set(value, out);

    for (const [key, raw] of Object.entries(value)) {
      const normalized = String(key).replace(/[^a-z0-9]/gi,'').toLowerCase();

      if (['roomid','tableid','slottableid','machineid'].includes(normalized)) {
        out[key] = targetRoomId;
        continue;
      }

      if (['room','roomnumber','roomno','roomnum','tablenumber','tableno','tablenum','machinenumber','machineno','machinenum'].includes(normalized)) {
        out[key] = targetRoomNumber;
        continue;
      }

      out[key] = cloneWithTargetIdentifiers(raw, targetRoomId, targetRoomNumber, depth + 1, seen);
    }

    return out;
  }

  function rawSelectFrameSnapshot() {
    const info = window.__XIANYAO_ATG_RAW_SELECT_FRAME__;
    if (!info?.socket || typeof info.data !== 'string' || !/getSlotTableDetail/i.test(info.data)) return null;
    try {
      if (info.socket.readyState !== undefined && info.socket.readyState !== 1) return null;
    } catch (_) {}
    return info;
  }

  function replaceRoomIdInRawSelectFrame(rawFrame, targetRoomId) {
    const raw = String(rawFrame || '');
    const id = Math.trunc(finiteNumber(targetRoomId) || 0);
    if (!raw || !id) return null;

    const starts = [raw.indexOf('['), raw.indexOf('{')].filter(index => index >= 0);
    if (starts.length) {
      const start = Math.min(...starts);
      const prefix = raw.slice(0, start);
      const payloadText = raw.slice(start);

      try {
        const payload = JSON.parse(payloadText);

        const replace = (value, depth = 0, seen = new WeakSet()) => {
          if (depth > 14 || !value || typeof value !== 'object' || seen.has(value)) return;
          seen.add(value);

          if (Array.isArray(value)) {
            value.forEach(child => replace(child, depth + 1, seen));
            return;
          }

          for (const key of Object.keys(value)) {
            const normalized = String(key).replace(/[^a-z0-9]/gi,'').toLowerCase();
            if (['roomid','tableid','slottableid','machineid'].includes(normalized)) {
              value[key] = id;
            } else {
              replace(value[key], depth + 1, seen);
            }
          }
        };

        replace(payload);
        return prefix + JSON.stringify(payload);
      } catch (_) {}
    }

    // 最後備援：只替換 roomId 數值，不碰 token 或其他內容。
    const replaced = raw.replace(
      /(["']?roomId["']?\s*[:=]\s*["']?)\d+(["']?)/i,
      (_, a, b) => `${a}${id}${b}`
    );
    return replaced !== raw ? replaced : null;
  }

  function replayRawSelectFrame(roomId) {
    const info = rawSelectFrameSnapshot();
    if (!info) return { ok:false, reason:'raw-select-not-learned' };

    const nextFrame = replaceRoomIdInRawSelectFrame(info.data, roomId);
    if (!nextFrame) return { ok:false, reason:'raw-select-roomId-replace-failed' };

    try {
      info.socket.send(nextFrame);
      return { ok:true, frame:nextFrame, capturedAt:info.capturedAt };
    } catch (error) {
      return { ok:false, reason:String(error?.message || error) };
    }
  }

  function directEnterTemplateSnapshot() {
    const info = window.__XIANYAO_ATG_ENTER_TEMPLATE__;
    if (!info?.socket || !Array.isArray(info.args) || !String(info.event || '')) return null;
    try {
      if (info.socket.disconnected === true || info.socket.connected === false) return null;
    } catch (_) {}
    return info;
  }

  function replayNativeEnterTemplate(roomId, roomNumber) {
    const id = finiteNumber(roomId);
    const number = finiteNumber(roomNumber);
    if (id === null || number === null) return { ok:false, reason:'missing-room-identity' };

    const selectInfo = directRoomSelectorSnapshot();
    const enterInfo = directEnterTemplateSnapshot();

    if (!selectInfo) return { ok:false, reason:'select-template-not-learned' };
    if (!enterInfo) return { ok:false, reason:'enter-template-not-learned' };

    try {
      const selectArgs = selectInfo.args.map((arg,index) => {
        if (index === 0 || typeof arg === 'function') return arg;
        return cloneWithTargetIdentifiers(arg, id, number);
      });

      const enterArgs = enterInfo.args.map((arg,index) => {
        if (index === 0 || typeof arg === 'function') return arg;
        return cloneWithTargetIdentifiers(arg, id, number);
      });

      // 先走 ATG 自己原本的「選中機台」事件，再送真正進房事件。
      selectInfo.socket.emit(...selectArgs);

      setTimeout(() => {
        try {
          enterInfo.socket.emit(...enterArgs);
        } catch (_) {}
      }, 180);

      return {
        ok:true,
        selectEvent:String(selectArgs[0] || ''),
        enterEvent:String(enterArgs[0] || ''),
        learnedAt:enterInfo.capturedAt
      };
    } catch (error) {
      return { ok:false, reason:String(error?.message || error) };
    }
  }

  function directRoomSelectorSnapshot() {
    const info = window.__XIANYAO_ATG_DIRECT_ROOM__;
    if (!info?.socket || !Array.isArray(info.args) || !/^getSlotTableDetail$/i.test(String(info.args[0] || ''))) {
      return null;
    }
    try {
      if (info.socket.disconnected === true || info.socket.connected === false) return null;
    } catch (_) {}
    return info;
  }

  function emitDirectRoomSelection(roomId) {
    const id = finiteNumber(roomId);
    if (id === null) return { ok:false, reason:'invalid-room-id' };

    const info = directRoomSelectorSnapshot();
    if (!info) return { ok:false, reason:'selector-not-captured' };

    const nextArgs = info.args.map((arg, index) => {
      if (index === 0) return arg;
      if (typeof arg === 'function') return arg;
      return cloneWithTargetRoomId(arg, id);
    });

    // 防呆：如果模板中完全沒有 roomId，就不要亂送。
    let hasRoomId = false;
    const inspect = (value, depth = 0, seen = new WeakSet()) => {
      if (hasRoomId || depth > 12 || !value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      for (const [key, raw] of Object.entries(value)) {
        if (String(key).replace(/[^a-z0-9]/gi,'').toLowerCase() === 'roomid' && finiteNumber(raw) === id) {
          hasRoomId = true;
          return;
        }
        if (raw && typeof raw === 'object') inspect(raw, depth + 1, seen);
      }
    };
    nextArgs.slice(1).forEach(arg => inspect(arg));
    if (!hasRoomId) return { ok:false, reason:'template-has-no-roomId' };

    try {
      info.socket.emit(...nextArgs);
      return { ok:true, capturedAt:info.capturedAt };
    } catch (error) {
      return { ok:false, reason:String(error?.message || error) };
    }
  }

  function findTargetRoomButton(roomNumber) {
    const exact = String(Math.trunc(roomNumber));

    // 先鎖定「房號文字本身」，再往父層找最近的 cc.Button。
    // 這可避免 Button 的子孫文字包含其他房號，誤點到目前已選中的舊房。
    for (const w of sameOriginRoomWindows()) {
      try {
        const cocos = w.cc || w.legacyCC || w._cc;
        const scene = cocos?.director?.getScene?.();
        const Button = cocos?.Button;
        const Label = cocos?.Label;
        if (!scene || !Button || !Label || typeof scene.getComponentsInChildren !== 'function') continue;

        const labels = scene.getComponentsInChildren(Label) || [];
        for (const label of labels) {
          const value = String(label?.string ?? label?._string ?? '').trim();
          if (value !== exact) continue;

          let node = label?.node || null;
          for (let depth = 0; node && depth < 8; depth += 1) {
            let button = null;
            try { button = node.getComponent?.(Button) || null; } catch (_) {}
            if (!button) {
              try {
                const list = node.getComponents?.(Button) || [];
                button = list[0] || null;
              } catch (_) {}
            }

            if (button?.node && button.node.activeInHierarchy !== false) {
              const path = cocosNodePath(button.node);

              // 排除底部目前房號/HUD，只接受選機台視窗內的卡片/項目。
              if (!/(spinbar|hud|bottom|footer|current)/i.test(path)) {
                return {
                  button,
                  cocos,
                  text: cocosButtonText(button, cocos),
                  path,
                  window: w,
                  labelNode: label.node
                };
              }
            }

            node = node.parent || node._parent || null;
          }
        }
      } catch (_) {}
    }

    // Label→父層 Button 找不到時才退回舊方法。
    return findRoomCocosButton(({text,path}) => {
      const labels = String(text || '').split('|').map(v => v.trim());
      if (!labels.some(v => v === exact)) return false;
      return /(table|room|machine|item|cell|card|grid|list|choose|select)/i.test(path) &&
        !/(spinbar|hud|bottom|footer|current)/i.test(path);
    });
  }

  function findConfirmRoomButton() {
    // ATG 實機已確認按鈕節點叫 confirmBtn / selectBtn；
    // 文字在不同狀態可能不渲染，因此優先用節點名稱，不再依賴 Label。
    for (const w of sameOriginRoomWindows()) {
      try {
        const cocos = w.cc || w.legacyCC || w._cc;
        const scene = cocos?.director?.getScene?.();
        if (!scene) continue;

        const Button = cocos?.Button;
        const stack = [scene];
        while (stack.length) {
          const node = stack.pop();
          if (!node) continue;
          const children = node.children || node._children || [];
          for (const child of children) stack.push(child);

          if (node.activeInHierarchy === false) continue;
          const name = String(node.name || '').toLowerCase();
          if (!/^(?:confirmbtn|selectbtn)$/.test(name)) continue;

          const path = cocosNodePath(node);
          if (!/slottableview/i.test(path) || !/buttons/i.test(path)) continue;

          let button = null;
          try {
            if (Button && typeof node.getComponent === 'function') button = node.getComponent(Button);
          } catch (_) {}

          if (!button) {
            try {
              const components = Array.isArray(node.components)
                ? node.components
                : (Array.isArray(node._components) ? node._components : []);
              button = components.find(component =>
                component && (
                  typeof component._emitButtonEvent === 'function' ||
                  typeof component._emitClickEvent === 'function' ||
                  Array.isArray(component.clickEvents)
                )
              ) || null;
            } catch (_) {}
          }

          return {
            node,
            button,
            cocos,
            text:button ? cocosButtonText(button, cocos) : '',
            path,
            window:w
          };
        }
      } catch (_) {}
    }

    return findRoomCocosButton(({text,path}) => {
      const t = String(text || '').replace(/\s+/g,'').trim();
      if (['確定','确认','確認','選取','选择','選擇','進入','进入'].includes(t)) return true;
      return /(?:confirmbtn|selectbtn)/i.test(path) ||
        /(?:confirm|select|choose|enter).*(?:table|room|machine)/i.test(path);
    });
  }

  function roomSwitchDialogState(expectedRoomNumber = null) {
    const expected = finiteNumber(expectedRoomNumber);
    const expectedText = expected !== null ? String(Math.trunc(expected)) : '';

    for (const w of sameOriginRoomWindows()) {
      try {
        const cocos = w.cc || w.legacyCC || w._cc;
        const scene = cocos?.director?.getScene?.();
        const Label = cocos?.Label;
        if (!scene || !Label || typeof scene.getComponentsInChildren !== 'function') continue;

        const labels = scene.getComponentsInChildren(Label) || [];
        for (const label of labels) {
          const node = label?.node;
          if (!node || node.activeInHierarchy === false) continue;
          const text = String(label?.string ?? label?._string ?? '').replace(/\s+/g,'').trim();
          if (!text) continue;
          const looksSwitchDialog = /(切換到|切换到).*(號桌|号桌)|(重新載入遊戲|重新载入游戏)/.test(text);
          if (!looksSwitchDialog) continue;
          if (expectedText && !text.includes(expectedText) && /(切換到|切换到)/.test(text)) continue;
          return { visible:true, label, node, text, cocos, window:w, scene };
        }
      } catch (_) {}
    }
    return { visible:false };
  }

  function nodeAncestors(node, limit = 12) {
    const out = [];
    let cur = node || null;
    for (let i = 0; cur && i < limit; i += 1) {
      out.push(cur);
      cur = cur.parent || cur._parent || null;
    }
    return out;
  }

  function nodeWorldPointForRoomDialog(node, cocos) {
    try {
      const p = node?.worldPosition || node?._worldPosition;
      if (Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y))) {
        return { x:Number(p.x), y:Number(p.y) };
      }
    } catch (_) {}
    try {
      if (typeof node?.convertToWorldSpaceAR === 'function') {
        const zero = typeof cocos?.v2 === 'function' ? cocos.v2(0,0) : { x:0, y:0 };
        const p = node.convertToWorldSpaceAR(zero);
        if (Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y))) {
          return { x:Number(p.x), y:Number(p.y) };
        }
      }
    } catch (_) {}
    return null;
  }

  function dispatchRoomDialogCanvasTap(gameWindow, cocos, node) {
    try {
      const point = nodeWorldPointForRoomDialog(node, cocos);
      if (!point) return false;
      const doc = gameWindow?.document;
      if (!doc) return false;
      const canvas = doc.querySelector('canvas#GameCanvas') || doc.querySelector('canvas') || cocos?.game?.canvas || cocos?.game?._canvas;
      if (!canvas || typeof canvas.getBoundingClientRect !== 'function') return false;

      const rect = canvas.getBoundingClientRect();
      let visibleWidth = 0;
      let visibleHeight = 0;
      try {
        const size = cocos?.view?.getVisibleSize?.();
        visibleWidth = Number(size?.width) || Number(canvas.width) || 0;
        visibleHeight = Number(size?.height) || Number(canvas.height) || 0;
      } catch (_) {}
      if (!(visibleWidth > 0) || !(visibleHeight > 0) || !(rect.width > 0) || !(rect.height > 0)) return false;

      const clientX = rect.left + (point.x / visibleWidth) * rect.width;
      const clientY = rect.top + (1 - (point.y / visibleHeight)) * rect.height;
      const common = {
        bubbles:true, cancelable:true, composed:true,
        clientX, clientY, screenX:clientX, screenY:clientY,
        button:0, buttons:1
      };

      try { canvas.focus?.(); } catch (_) {}
      let sent = false;
      try {
        if (typeof gameWindow.PointerEvent === 'function') {
          canvas.dispatchEvent(new gameWindow.PointerEvent('pointermove', { ...common, pointerId:1, pointerType:'mouse', isPrimary:true, buttons:0 }));
          canvas.dispatchEvent(new gameWindow.PointerEvent('pointerdown', { ...common, pointerId:1, pointerType:'mouse', isPrimary:true }));
          canvas.dispatchEvent(new gameWindow.PointerEvent('pointerup', { ...common, pointerId:1, pointerType:'mouse', isPrimary:true, buttons:0 }));
          sent = true;
        }
      } catch (_) {}
      try {
        canvas.dispatchEvent(new gameWindow.MouseEvent('mousemove', { ...common, buttons:0 }));
        canvas.dispatchEvent(new gameWindow.MouseEvent('mousedown', common));
        canvas.dispatchEvent(new gameWindow.MouseEvent('mouseup', { ...common, buttons:0 }));
        canvas.dispatchEvent(new gameWindow.MouseEvent('click', { ...common, buttons:0 }));
        sent = true;
      } catch (_) {}
      return sent;
    } catch (_) {
      return false;
    }
  }

  function findRoomSwitchDialogConfirmButton(expectedRoomNumber = null) {
    const dialog = roomSwitchDialogState(expectedRoomNumber);
    if (!dialog.visible) return null;

    const confirmTexts = new Set(['確定','确认','確認','确定']);
    const cancelTexts = new Set(['取消','取消確認','取消确认']);
    const { cocos, window:w, scene, node:messageNode } = dialog;
    const Label = cocos?.Label;
    const Button = cocos?.Button;
    const candidates = [];

    try {
      const buttons = Button && typeof scene.getComponentsInChildren === 'function'
        ? (scene.getComponentsInChildren(Button) || [])
        : [];
      const messageAncestors = new Set(nodeAncestors(messageNode, 14));

      for (const button of buttons) {
        const node = button?.node;
        if (!node || node.activeInHierarchy === false) continue;
        const path = cocosNodePath(node);
        if (/slottableview.*inforow.*buttons.*selectbtn/i.test(path)) continue;

        const text = cocosButtonText(button, cocos).replace(/\s+/g,'').trim();
        if (cancelTexts.has(text)) continue;

        let score = 0;
        if (confirmTexts.has(text)) score += 1000;
        const name = String(node.name || '').toLowerCase();
        if (/(confirm|sure|ok|yes|enter)/i.test(name)) score += 300;
        if (/(dialog|popup|message|tip|alert|confirm)/i.test(path)) score += 120;

        const ancestors = nodeAncestors(node, 14);
        const sharedIndex = ancestors.findIndex(ancestor => messageAncestors.has(ancestor));
        if (sharedIndex >= 0) score += Math.max(40, 220 - sharedIndex * 20);

        const point = nodeWorldPointForRoomDialog(node, cocos);
        candidates.push({ node, button, cocos, window:w, text, path, point, score });
      }
    } catch (_) {}

    // 若 Button 元件抓不到，從「確定」Label 往父層找可點節點。
    try {
      const labels = Label && typeof scene.getComponentsInChildren === 'function'
        ? (scene.getComponentsInChildren(Label) || [])
        : [];
      for (const label of labels) {
        const labelNode = label?.node;
        if (!labelNode || labelNode.activeInHierarchy === false) continue;
        const text = String(label?.string ?? label?._string ?? '').replace(/\s+/g,'').trim();
        if (!confirmTexts.has(text)) continue;

        let node = labelNode;
        for (let depth = 0; node && depth < 9; depth += 1) {
          if (node.activeInHierarchy === false) break;
          const path = cocosNodePath(node);
          if (/slottableview.*inforow.*buttons.*selectbtn/i.test(path)) break;

          let button = null;
          try { if (Button) button = node.getComponent?.(Button) || null; } catch (_) {}
          const point = nodeWorldPointForRoomDialog(node, cocos);
          candidates.push({ node, button, cocos, window:w, text, path, point, score:900 - depth * 20 });
          node = node.parent || node._parent || null;
        }
      }
    } catch (_) {}

    if (!candidates.length) return null;

    // 同分時優先右側按鈕；目前 ATG 彈窗「確定」固定在取消右側。
    candidates.sort((a,b) =>
      b.score - a.score ||
      (Number(b.point?.x) || -Infinity) - (Number(a.point?.x) || -Infinity)
    );
    return { ...candidates[0], dialogText:dialog.text };
  }

  function fireRoomDialogConfirmCandidate(confirm) {
    if (!confirm?.node) return [];
    const methods = [];
    const { node, button, cocos, window:w } = confirm;

    // 不再「第一個函式有回傳就算成功」；所有可能的原生路徑都送一次。
    if (button) {
      try { if (typeof button._emitButtonEvent === 'function') { button._emitButtonEvent(); methods.push('_emitButtonEvent'); } } catch (_) {}
      try { if (typeof button._emitClickEvent === 'function') { button._emitClickEvent(); methods.push('_emitClickEvent'); } } catch (_) {}
      try {
        const events = Array.isArray(button.clickEvents) ? button.clickEvents : [];
        const EventHandler = cocos?.Component?.EventHandler || cocos?.EventHandler;
        if (events.length && typeof EventHandler?.emitEvents === 'function') {
          EventHandler.emitEvents(events, button);
          methods.push('clickEvents');
        }
      } catch (_) {}
      try {
        const clickType = cocos?.Button?.EventType?.CLICK || 'click';
        node.emit?.(clickType, button);
        methods.push('button-click');
      } catch (_) {}
    }

    // 真正使用者點擊會經過 touch-end；對按鈕本身及近兩層父節點一起送。
    let cur = node;
    for (let depth = 0; cur && depth < 3; depth += 1) {
      try {
        cur.emit?.('touch-end', { type:'touch-end', target:node, currentTarget:cur, bubbles:true });
        methods.push(`touch-end-${depth}`);
      } catch (_) {}
      try {
        cur.emit?.('__touch-end', { type:'__touch-end', target:node, currentTarget:cur, bubbles:true });
        methods.push(`__touch-end-${depth}`);
      } catch (_) {}
      cur = cur.parent || cur._parent || null;
    }

    // 最後再從 Canvas 真實座標模擬一次滑鼠/Pointer 點擊，最接近會員親手按黃色確定。
    try {
      if (dispatchRoomDialogCanvasTap(w, cocos, node)) methods.push('canvas-tap');
    } catch (_) {}

    return methods;
  }

  async function autoConfirmRoomSwitchDialog(roomNumber, timeout = 4200) {
    const started = Date.now();
    let lastPath = '';
    let lastMethods = [];
    let attempts = 0;

    while (Date.now() - started < timeout) {
      const dialogBefore = roomSwitchDialogState(roomNumber);
      if (!dialogBefore.visible) {
        // 還沒跳出彈窗就繼續等；若已經點過，彈窗消失就代表真正成功。
        if (attempts > 0) return { ok:true, via:lastMethods.join('+') || 'dialog-closed', path:lastPath, attempts };
        await roomWait(60);
        continue;
      }

      const confirm = findRoomSwitchDialogConfirmButton(roomNumber);
      if (!confirm?.node) {
        await roomWait(70);
        continue;
      }

      lastPath = confirm.path || '';
      attempts += 1;
      lastMethods = fireRoomDialogConfirmCandidate(confirm);

      // 關鍵：不能再因為「有呼叫事件」就宣告成功；一定要看到確認視窗真的消失。
      const verifyStarted = Date.now();
      while (Date.now() - verifyStarted < 550) {
        await roomWait(55);
        if (!roomSwitchDialogState(roomNumber).visible) {
          return { ok:true, via:lastMethods.join('+') || 'triggered', path:lastPath, attempts };
        }
      }

      // 彈窗仍在，下一輪重新抓節點再按；Cocos 彈窗動畫期間節點可能會重建。
      await roomWait(80);
    }

    const stillVisible = roomSwitchDialogState(roomNumber).visible;
    return {
      ok:false,
      reason: stillVisible
        ? `dialog-still-visible-after-${attempts}-attempts-${lastMethods.join('+') || 'no-method'}`
        : (attempts ? 'dialog-closed-late' : 'dialog-confirm-not-found')
    };
  }

  function triggerConfirmRoomControl(confirm) {
    if (!confirm?.node) return false;

    if (confirm.button) {
      try {
        if (emitRoomCocosButton(confirm.button, confirm.cocos)) return true;
      } catch (_) {}
    }

    // 非標準 Button 版本：直接觸發節點本身 touch-end。
    try {
      const event = {
        type:'touch-end',
        target:confirm.node,
        currentTarget:confirm.node,
        bubbles:true
      };
      confirm.node.emit?.('touch-end', event);
      return true;
    } catch (_) {}

    try {
      confirm.node.emit?.('__touch-end', {
        target:confirm.node,
        currentTarget:confirm.node
      });
      return true;
    } catch (_) {}

    return emitCocosClick({
      node:confirm.node,
      button:confirm.button || null,
      cocos:confirm.cocos,
      gameWindow:confirm.window
    });
  }

  function confirmHandlerDiagnostics() {
    const confirm = findConfirmRoomButton();
    if (!confirm?.node) {
      return {
        found:false,
        path:'',
        text:'',
        handlers:[],
        components:[]
      };
    }

    const button = confirm.button || null;
    const node = confirm.node;
    const cocos = confirm.cocos;
    const handlers = [];
    const clickEvents = Array.isArray(button?.clickEvents) ? button.clickEvents : [];

    for (const handler of clickEvents) {
      try {
        handlers.push({
          component:String(handler?.component || ''),
          handler:String(handler?.handler || ''),
          customEventData:String(handler?.customEventData ?? ''),
          targetName:String(handler?.target?.name || '')
        });
      } catch (_) {}
    }

    const components = [];
    const list = Array.isArray(node.components)
      ? node.components
      : (Array.isArray(node._components) ? node._components : []);

    for (const component of list) {
      try {
        const names = Object.getOwnPropertyNames(Object.getPrototypeOf(component) || {})
          .filter(name => name !== 'constructor' && typeof component?.[name] === 'function')
          .slice(0, 24);
        components.push({
          name:String(component?.constructor?.name || ''),
          methods:names
        });
      } catch (_) {}
    }

    return {
      found:true,
      path:cocosNodePath(node),
      text:button ? cocosButtonText(button, cocos) : '',
      handlers,
      components
    };
  }

  function confirmHandlerDiagnosticsText() {
    const d = confirmHandlerDiagnostics();
    if (!d.found) return '尚未偵測到「選取」按鈕｜請先打開選擇機台';

    const handlerText = d.handlers.length
      ? d.handlers.map((h,i) =>
          `#${i + 1} ${h.component || '—'}.${h.handler || '—'}${h.customEventData ? ` [data=${h.customEventData}]` : ''}`
        ).join('｜')
      : 'clickEvents：空';

    const componentText = d.components.length
      ? d.components.map(item => {
          const interesting = item.methods
            .filter(name => /(room|table|slot|machine|select|choose|enter|confirm|join|play)/i.test(name))
            .slice(0, 8);
          return interesting.length ? `${item.name}:{${interesting.join(',')}}` : '';
        }).filter(Boolean).join('｜')
      : '';

    return `選取節點：${d.path || '—'}｜${handlerText}${componentText ? `｜候選方法：${componentText}` : ''}`;
  }

  function safeDiagValue(value) {
    try {
      if (value == null) return String(value);
      if (typeof value === 'string') return value.length > 90 ? value.slice(0,87) + '…' : value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (typeof value === 'function') return `fn:${value.name || 'anonymous'}`;
      if (Array.isArray(value)) return `Array(${value.length})`;
      const name = value?.constructor?.name || 'Object';
      const keys = Object.keys(value || {}).slice(0,8);
      return `${name}{${keys.join(',')}}`;
    } catch (_) {
      return '?';
    }
  }

  function deepSelectDiagnostics() {
    const confirm = findConfirmRoomButton();
    if (!confirm?.node) return { found:false, lines:['尚未偵測到 confirmBtn/selectBtn'] };

    const lines = [];
    let node = confirm.node;
    for (let depth = 0; node && depth < 8; depth += 1) {
      const path = cocosNodePath(node);
      lines.push(`L${depth} node=${path}`);

      // node 自身可疑欄位
      try {
        const ownKeys = Object.getOwnPropertyNames(node);
        const interestingKeys = ownKeys.filter(key =>
          /(event|listener|callback|touch|select|room|table|slot|machine|current|chosen|data|info)/i.test(key)
        ).slice(0,24);

        for (const key of interestingKeys) {
          let value;
          try { value = node[key]; } catch (_) { continue; }
          lines.push(`  node.${key}=${safeDiagValue(value)}`);
        }
      } catch (_) {}

      // component + 方法 + 可疑狀態欄位
      try {
        const components = Array.isArray(node.components)
          ? node.components
          : (Array.isArray(node._components) ? node._components : []);

        for (const component of components) {
          const cname = String(component?.constructor?.name || 'Component');
          const proto = Object.getPrototypeOf(component) || {};
          const methods = Object.getOwnPropertyNames(proto)
            .filter(name => name !== 'constructor' && typeof component?.[name] === 'function')
            .filter(name => /(room|table|slot|machine|select|choose|enter|confirm|join|play|click|touch|open|switch|change)/i.test(name))
            .slice(0,18);

          if (methods.length) {
            lines.push(`  comp ${cname} methods={${methods.join(',')}}`);
          }

          const stateKeys = Object.getOwnPropertyNames(component || {})
            .filter(key => /(room|table|slot|machine|select|choose|current|chosen|data|info|index|id)/i.test(key))
            .slice(0,24);

          for (const key of stateKeys) {
            let value;
            try { value = component[key]; } catch (_) { continue; }
            if (typeof value === 'function') continue;
            lines.push(`  comp ${cname}.${key}=${safeDiagValue(value)}`);
          }
        }
      } catch (_) {}

      // 常見 Cocos 事件處理器內部結構
      for (const holderKey of ['_eventProcessor','_eventTarget','_callbackTable','_bubblingListeners','_capturingListeners','_listeners']) {
        try {
          const holder = node?.[holderKey];
          if (!holder) continue;
          const keys = Object.getOwnPropertyNames(holder).slice(0,16);
          lines.push(`  ${holderKey} keys={${keys.join(',')}}`);
          for (const key of keys) {
            if (!/(touch|click|end|callback|listener|event)/i.test(key)) continue;
            let value;
            try { value = holder[key]; } catch (_) { continue; }
            lines.push(`    ${holderKey}.${key}=${safeDiagValue(value)}`);
          }
        } catch (_) {}
      }

      node = node.parent || node._parent || null;
    }

    // 原始 clickEvent 物件完整欄位
    try {
      const clickEvents = Array.isArray(confirm.button.clickEvents) ? confirm.button.clickEvents : [];
      clickEvents.forEach((eventObj, index) => {
        const keys = Object.getOwnPropertyNames(eventObj || {}).slice(0,30);
        lines.push(`clickEvent#${index+1} keys={${keys.join(',')}}`);
        for (const key of keys) {
          let value;
          try { value = eventObj[key]; } catch (_) { continue; }
          lines.push(`  ce.${key}=${safeDiagValue(value)}`);
        }
      });
    } catch (_) {}

    return { found:true, lines:lines.slice(0,120) };
  }

  function deepSelectDiagnosticsText() {
    const d = deepSelectDiagnostics();
    return d.lines.join('\n');
  }

  function findSlotTableController() {
    const confirm = findConfirmRoomButton();
    const roots = [];

    if (confirm?.button?.node) {
      let node = confirm.button.node;
      for (let depth = 0; node && depth < 10; depth += 1) {
        roots.push(node);
        node = node.parent || node._parent || null;
      }
    }

    for (const gameWindow of collectSameOriginWindows()) {
      try {
        const cocos = gameWindow.cc || gameWindow.legacyCC || gameWindow._cc;
        const scene = cocos?.director?.getScene?.();
        if (scene) roots.push(scene);

        const stack = scene ? [scene] : [];
        while (stack.length) {
          const node = stack.pop();
          if (!node) continue;
          const name = String(node.name || '').toLowerCase();
          if (/slottableview/.test(name)) roots.unshift(node);
          const children = node.children || node._children || [];
          for (const child of children) stack.push(child);
        }

        for (const root of roots) {
          const nodes = [root];
          while (nodes.length) {
            const node = nodes.shift();
            if (!node) continue;

            const components = Array.isArray(node.components)
              ? node.components
              : (Array.isArray(node._components) ? node._components : []);

            for (const component of components) {
              if (!component || typeof component !== 'object') continue;

              let currentRoomId = null;
              let selectRoomId = null;
              let hasSlotMap = false;
              let hasSetTableInfo = false;

              try { currentRoomId = finiteNumber(component.currentRoomId); } catch (_) {}
              try { selectRoomId = finiteNumber(component.selectRoomId); } catch (_) {}
              try { hasSlotMap = component.slotTableMap instanceof Map || !!component.slotTableMap; } catch (_) {}
              try { hasSetTableInfo = typeof component.setTableInfo === 'function'; } catch (_) {}

              const strong =
                currentRoomId !== null &&
                selectRoomId !== null &&
                (hasSlotMap || hasSetTableInfo);

              if (strong) {
                return { component, node, cocos, gameWindow };
              }
            }

            const children = node.children || node._children || [];
            for (const child of children) nodes.push(child);
          }
        }
      } catch (_) {}
    }

    return null;
  }

  function scannerRoomInfo(roomId, roomNumber) {
    const id = finiteNumber(roomId);
    const number = finiteNumber(roomNumber);

    const pools = [];
    try {
      if (Array.isArray(state.rankingSnapshotRooms)) pools.push(state.rankingSnapshotRooms);
    } catch (_) {}
    try {
      pools.push(numberedRooms());
    } catch (_) {}

    for (const pool of pools) {
      for (const room of (Array.isArray(pool) ? pool : [])) {
        const rid = finiteNumber(room?.roomId);
        const rnum = finiteNumber(room?.number);
        if ((id !== null && rid === id) || (number !== null && rnum === number)) {
          return {
            roomId:rid,
            number:rnum,
            status:room?.status ?? null,
            bet:finiteNumber(room?.bet),
            win:finiteNumber(room?.win),
            today:{
              bet:finiteNumber(room?.today?.bet),
              win:finiteNumber(room?.today?.win)
            }
          };
        }
      }
    }
    return null;
  }

  function findRoomInfoInSlotTableMap(controller, roomId) {
    const id = Math.trunc(finiteNumber(roomId) || 0);
    if (!controller?.component || !id) return null;

    const map = controller.component.slotTableMap;
    if (!(map instanceof Map)) return null;

    try {
      if (map.has(id)) return map.get(id);
      if (map.has(String(id))) return map.get(String(id));
    } catch (_) {}

    try {
      for (const [key, value] of map.entries()) {
        const keyNum = finiteNumber(key);
        if (keyNum === id) return value;

        const foundId = findNamedNumber(value, new Set([
          'roomid','tableid','slottableid','machineid','id'
        ]));
        if (foundId === id) return value;
      }
    } catch (_) {}

    return null;
  }

  function slotTableControllerSnapshot(controller) {
    if (!controller?.component) return null;
    const comp = controller.component;

    let mapSize = null;
    try { mapSize = comp.slotTableMap instanceof Map ? comp.slotTableMap.size : null; } catch (_) {}

    return {
      currentRoomId:finiteNumber(comp.currentRoomId),
      selectRoomId:finiteNumber(comp.selectRoomId),
      selectPage:finiteNumber(comp.selectPage),
      isUpdateSelectFlag:Boolean(comp.isUpdateSelectFlag),
      mapSize,
      hasSetTableInfo:typeof comp.setTableInfo === 'function'
    };
  }

  function forceControllerSelectRoom(controller, roomId, roomNumber = null) {
    if (!controller?.component) return { ok:false, reason:'controller-not-found' };

    const id = Math.trunc(finiteNumber(roomId) || 0);
    if (!id) return { ok:false, reason:'invalid-room-id' };

    const comp = controller.component;
    const before = slotTableControllerSnapshot(controller);
    let tableInfo = findRoomInfoInSlotTableMap(controller, id);
    const tableInfoSource = tableInfo ? 'slotTableMap' : 'scanner';

    // 目標房不在目前這一頁 500 筆時，直接用全房掃描已保存的同格式資料。
    if (!tableInfo) {
      tableInfo = scannerRoomInfo(id, roomNumber);
      if (tableInfo && comp.slotTableMap instanceof Map) {
        try { comp.slotTableMap.set(id, tableInfo); } catch (_) {}
      }
    }

    try { comp.selectRoomId = id; } catch (_) {}

    // 選到不同房時，ATG 會把這個旗標視為需要更新選取狀態。
    try {
      if ('isUpdateSelectFlag' in comp) comp.isUpdateSelectFlag = true;
    } catch (_) {}

    let setTableInfoCalled = false;
    let setTableInfoError = '';

    if (tableInfo && typeof comp.setTableInfo === 'function') {
      try {
        comp.setTableInfo(tableInfo);
        setTableInfoCalled = true;
      } catch (error) {
        setTableInfoError = String(error?.message || error);
      }
    }

    // 有些版本 setTableInfo 會自己重寫 selectRoomId，再補一次目標值。
    try { comp.selectRoomId = id; } catch (_) {}
    try {
      if ('isUpdateSelectFlag' in comp) comp.isUpdateSelectFlag = true;
    } catch (_) {}

    const after = slotTableControllerSnapshot(controller);

    return {
      ok:after?.selectRoomId === id,
      before,
      after,
      tableInfoFound:Boolean(tableInfo),
      tableInfoSource,
      setTableInfoCalled,
      setTableInfoError
    };
  }

  function selectedRoomNumberFromState() {
    const id = finiteNumber(state.currentSelectedRoomId);
    if (id !== null) {
      const mapped = roomNumberByRoomIdFromScanner(id);
      if (mapped !== null) return mapped;
    }
    return null;
  }

  async function navigateToPageForEnter(targetPage) {
    const page = Math.trunc(finiteNumber(targetPage) || 0);
    if (page < 1 || page > Math.max(1, Math.trunc(finiteNumber(state.totalPages) || 9))) return false;

    const current = finiteNumber(state.latestInferredPage) ?? finiteNumber(state.currentPage);
    if (current === page) return true;

    // 1) 優先直接點 Cocos「選擇機台」上方頁碼，避免掃描資料已快取時被誤判成不用翻頁。
    const pageText = String(page);
    const direct = findRoomCocosButton(({text,path}) => {
      const labels = String(text || '').split('|').map(v => v.trim());
      const exact = labels.some(v => v === pageText);
      if (!exact) return false;
      return /(page|pager|pagination|tab|button|table|machine|select)/i.test(path);
    });

    if (direct) {
      const beforeSeq = state.pageLoadSeq;
      const beforePage = finiteNumber(state.latestInferredPage) ?? finiteNumber(state.currentPage);
      setPageIntent(page);
      if (emitRoomCocosButton(direct.button, direct.cocos)) {
        const landed = await waitForPagerLanding(beforeSeq, beforePage, page, 2200);
        const after = finiteNumber(landed?.landedPage) ?? finiteNumber(state.latestInferredPage) ?? finiteNumber(state.currentPage);
        if (after === page) {
          state.pageIntent = null;
          return true;
        }
      }
      state.pageIntent = null;
    }

    // 2) Cocos 節點抓不到時，使用全房掃描已驗證的自適應頁碼座標。
    const profile = fixedPagerProfile();
    if (!profile) return false;

    const calibration = activePagerCalibration(profile);
    const hypotheses = calibration
      ? [{ id:'learned', x0:calibration.startX, step:calibration.stepX, y:calibration.y }]
      : (profile.hypotheses?.length ? profile.hypotheses : [profile]);

    const yCandidates = buildPagerYProbeList(profile, state.learnedPagerY);
    for (const hypothesis of hypotheses) {
      const xRatio = calibration
        ? pagePoint(calibration, page)?.x
        : finiteNumber(hypothesis.x0) + (page - 1) * finiteNumber(hypothesis.step);
      if (!Number.isFinite(xRatio)) continue;

      for (const yRatio of yCandidates) {
        const point = pointForFixedProfile(profile, page, hypothesis, xRatio, yRatio);
        if (!point) continue;

        const beforeSeq = state.pageLoadSeq;
        const beforePage = finiteNumber(state.latestInferredPage) ?? finiteNumber(state.currentPage);
        setPageIntent(page);

        const sent = dispatchClientPoint(point.x, point.y, profile.target || null);
        if (!sent) {
          state.pageIntent = null;
          continue;
        }

        const landed = await waitForPagerLanding(beforeSeq, beforePage, page, 1800);
        const after = finiteNumber(landed?.landedPage) ?? finiteNumber(state.latestInferredPage) ?? finiteNumber(state.currentPage);
        state.pageIntent = null;

        if (after === page) {
          rememberPagerSample(profile, page, point.xRatio, point.yRatio);
          return true;
        }
      }
    }

    return false;
  }

  function directCaptureRoomId(capture) {
    const target = capture?.args;
    if (!target) return null;

    const idKeys = new Set(['roomid','tableid','slottableid','machineid']);
    const seen = new WeakSet();

    const visit = (value, depth = 0) => {
      if (value == null || depth > 10) return null;

      if (typeof value === 'number') return null;
      if (typeof value !== 'object') return null;
      if (seen.has(value)) return null;
      seen.add(value);

      if (Array.isArray(value)) {
        for (const item of value) {
          const found = visit(item, depth + 1);
          if (found !== null) return found;
        }
        return null;
      }

      for (const [key, raw] of Object.entries(value)) {
        const normalized = String(key).replace(/[^a-z0-9]/gi,'').toLowerCase();
        if (idKeys.has(normalized)) {
          const n = finiteNumber(raw);
          if (n !== null) return Math.trunc(n);
        }
      }

      for (const raw of Object.values(value)) {
        const found = visit(raw, depth + 1);
        if (found !== null) return found;
      }

      return null;
    };

    return visit(target);
  }

  async function waitForNativeRoomSelection(roomId, capture, timeout = 1800) {
    const wantedId = Math.trunc(finiteNumber(roomId) || 0);
    if (!wantedId) return { ok:false, selectedId:null, controller:null, snapshot:null };

    const started = Date.now();
    let controller = null;
    let snapshot = null;
    let capturedId = directCaptureRoomId(capture);

    while (Date.now() - started < timeout) {
      controller = findSlotTableController();
      snapshot = controller ? slotTableControllerSnapshot(controller) : null;

      const selectedId =
        finiteNumber(snapshot?.selectRoomId) ??
        finiteNumber(state.currentSelectedRoomId) ??
        capturedId;

      if (finiteNumber(selectedId) === wantedId) {
        return {
          ok:true,
          selectedId:wantedId,
          controller,
          snapshot,
          capturedId
        };
      }

      const latestCapture = window.__XIANYAO_ATG_DIRECT_ROOM__;
      const latestId = directCaptureRoomId(latestCapture);
      if (latestId !== null) capturedId = latestId;

      await roomWait(80);
    }

    return {
      ok:false,
      selectedId:
        finiteNumber(snapshot?.selectRoomId) ??
        finiteNumber(state.currentSelectedRoomId) ??
        capturedId,
      controller,
      snapshot,
      capturedId
    };
  }

  const XIANYAO_OCCUPIED_MODAL_ID = 'xinyao-atg-room-occupied-choice-v1';

  function roomStatusForFinalEntry(roomId, roomNumber, nativeInfo = null) {
    const rid = finiteNumber(roomId);
    const rnum = finiteNumber(roomNumber);

    if (rid !== null) {
      try {
        const live = state.liveStatusByRoomId.get(Math.trunc(rid));
        if (typeof live?.status === 'string' && live.status) return live.status;
      } catch (_) {}
    }

    try {
      if (typeof nativeInfo?.status === 'string' && nativeInfo.status) return nativeInfo.status;
    } catch (_) {}

    try {
      for (const room of numberedRooms()) {
        const roomRid = finiteNumber(room?.roomId);
        const roomNum = finiteNumber(room?.number);
        if ((rid !== null && roomRid === rid) || (rnum !== null && roomNum === rnum)) {
          if (typeof room?.status === 'string' && room.status) return room.status;
        }
      }
    } catch (_) {}

    return null;
  }

  function sameGameObservationCandidates(moduleId, excludeRoomNumber = null) {
    const active = xinyaoActiveGameModule();
    if (!moduleId || active !== moduleId) return [];

    const snapshotSource = Array.isArray(state.rankingSnapshotRooms)
      ? state.rankingSnapshotRooms
      : numberedRooms();

    const liveByRoomId = new Map();
    const liveByNumber = new Map();
    for (const room of numberedRooms()) {
      const rid = finiteNumber(room?.roomId);
      const rnum = finiteNumber(room?.number);
      if (rid !== null) liveByRoomId.set(Math.trunc(rid), room);
      if (rnum !== null) liveByNumber.set(Math.trunc(rnum), room);
    }

    const rows = snapshotSource.map(snapshotRoom => {
      const rid = finiteNumber(snapshotRoom?.roomId);
      const rnum = finiteNumber(snapshotRoom?.number);
      const direct = rid !== null ? state.liveStatusByRoomId.get(Math.trunc(rid)) : null;
      const live =
        (rid !== null ? liveByRoomId.get(Math.trunc(rid)) : null) ||
        (rnum !== null ? liveByNumber.get(Math.trunc(rnum)) : null) ||
        null;
      return {
        ...snapshotRoom,
        status: direct?.status ?? live?.status ?? 'Unknown',
        updatedAt: direct?.updatedAt ?? live?.updatedAt ?? snapshotRoom?.updatedAt
      };
    }).filter(room => {
      const n = finiteNumber(room?.number);
      if (n === null) return false;
      if (excludeRoomNumber !== null && Math.trunc(n) === Math.trunc(excludeRoomNumber)) return false;
      return room?.status === 'Empty';
    });

    return rankRooms(rows, { onlyEmpty:true, mode:'observation' });
  }

  function closeOccupiedRoomChoice() {
    try { document.getElementById(XIANYAO_OCCUPIED_MODAL_ID)?.remove(); } catch (_) {}
  }

  function showOccupiedRoomChoice(roomNumber, roomId, status, moduleId) {
    closeOccupiedRoomChoice();

    const currentModule = xinyaoActiveGameModule();
    if (currentModule !== moduleId) return false;

    const roomNo = Math.trunc(finiteNumber(roomNumber) || 0);
    const roomText = String(roomNo).padStart(4,'0');
    const game = XIANYAO_GAME_MODULES[moduleId] || XIANYAO_GAME_MODULES.seth;
    const candidates = sameGameObservationCandidates(moduleId, roomNo);
    const best = candidates[0] || null;
    const statusText = status === 'Locked' ? '已鎖定' : status === 'Full' ? '目前有人使用' : '目前無法進入';

    const overlay = document.createElement('div');
    overlay.id = XIANYAO_OCCUPIED_MODAL_ID;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.72);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;';

    const bestText = best
      ? String(best.number).padStart(4,'0') + '｜觀察分數 ' + (best.metrics?.observationScore?.toFixed?.(1) ?? '—')
      : '目前沒有可用空房';

    overlay.innerHTML =
      '<div style="width:min(430px,calc(100vw - 28px));box-sizing:border-box;padding:22px 20px;border:1px solid rgba(255,184,212,.58);border-radius:20px;background:rgba(21,17,26,.98);color:#fff;box-shadow:0 20px 60px rgba(0,0,0,.55);text-align:center;">'+
        '<div style="font-size:13px;font-weight:900;color:#ffb9d4;">'+game.icon+' '+game.label+'</div>'+
        '<div style="margin-top:8px;font-size:21px;font-weight:1000;color:#fff;">你挑的 #'+roomText+' 這房'+statusText+'</div>'+
        '<div style="margin-top:7px;font-size:12px;opacity:.7;">要怎麼處理？</div>'+
        '<button type="button" data-room-choice="auto" '+(best?'':'disabled')+' style="width:100%;margin-top:18px;border:0;border-radius:12px;background:'+(best?'linear-gradient(135deg,#ff87b5,#ff5f9e)':'rgba(255,255,255,.09)')+';color:#fff;padding:13px 12px;font-size:13px;font-weight:950;cursor:'+(best?'pointer':'default')+';opacity:'+(best?'1':'.5')+';">⚡ 自動挑同遊戲「觀察分數」最高空房</button>'+
        '<div style="margin-top:6px;font-size:10px;color:#ffd0e0;opacity:.78;">'+bestText+'</div>'+
        '<button type="button" data-room-choice="back" style="width:100%;margin-top:12px;border:1px solid rgba(255,184,212,.46);border-radius:12px;background:rgba(255,255,255,.04);color:#fff;padding:12px;font-size:13px;font-weight:900;cursor:pointer;">↩️ 回到選房頁</button>'+
      '</div>';

    (document.body || document.documentElement).appendChild(overlay);

    overlay.querySelector('[data-room-choice="back"]')?.addEventListener('click', () => {
      closeOccupiedRoomChoice();
      state.enterRoomStatus = '↩️ 已取消進房｜請重新選擇空房';
      scheduleRender();
    });

    const autoButton = overlay.querySelector('[data-room-choice="auto"]');
    let autoChosen = false;
    async function chooseNextEmpty(event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      event?.stopImmediatePropagation?.();
      if (autoChosen || !best) return;
      autoChosen = true;
      if (autoButton) { autoButton.disabled = true; autoButton.textContent = '⏳ 正在重新檢查空房…'; }
      if (xinyaoActiveGameModule() !== moduleId) {
        closeOccupiedRoomChoice();
        state.enterRoomStatus = '⚠️ 遊戲已切換，請重新掃描';
        scheduleRender();
        return;
      }
      const waitStarted = Date.now();
      while (state.enterRoomBusy && Date.now() - waitStarted < 8000) await roomWait(80);
      if (state.enterRoomBusy) {
        closeOccupiedRoomChoice();
        state.enterRoomStatus = '⚠️ 上一次選房還在執行，請稍後重新點選';
        scheduleRender();
        return;
      }
      const fresh = sameGameObservationCandidates(moduleId, roomNo)[0] || null;
      if (!fresh) {
        closeOccupiedRoomChoice();
        state.enterRoomStatus = '⚠️ 沒有最新可用空房，請重新掃描';
        scheduleRender();
        return;
      }
      const latestStatus = roomStatusForFinalEntry(fresh.roomId, fresh.number, fresh);
      if (latestStatus && latestStatus !== 'Empty') {
        closeOccupiedRoomChoice();
        showOccupiedRoomChoice(fresh.number, fresh.roomId, latestStatus, moduleId);
        return;
      }
      closeOccupiedRoomChoice();
      state.enterRoomStatus = '⚡ 自動改挑 ' + String(fresh.number).padStart(4,'0') + '｜'+game.label+' 專屬空房';
      scheduleRender();
      routeEnterRoomFromRanking(fresh.number, fresh.roomId);
    }
    autoButton?.addEventListener('pointerdown', chooseNextEmpty, { capture:true });
    autoButton?.addEventListener('click', chooseNextEmpty, { capture:true });;

    return true;
  }

  function blockOccupiedRoomBeforeConfirm(roomNumber, roomId, nativeInfo, moduleId) {
    const status = roomStatusForFinalEntry(roomId, roomNumber, nativeInfo);
    if (!status || status === 'Empty') return false;
    showOccupiedRoomChoice(roomNumber, roomId, status, moduleId);
    state.enterRoomStatus = '⚠️ ' + String(Math.trunc(roomNumber)).padStart(4,'0') + ' 已不是空房｜等待選擇處理方式';
    scheduleRender();
    return true;
  }
  async function enterRoomFromRanking(roomNumber, roomId) {
    const number = finiteNumber(roomNumber);
    const id = finiteNumber(roomId);
    if (number === null || id === null || state.enterRoomBusy) return;

    const roomNo = Math.trunc(number);
    const wantedId = Math.trunc(id);
    const roomText = String(roomNo).padStart(4,'0');

    state.enterRoomBusy = true;
    state.enterRoomStatus = `⚡ 直達 ${roomText}｜準備原生頁面資料…`;
    scheduleRender();

    try {
      if (state.scanRunning) {
        state.scanAbort = true;
        const stopStarted = Date.now();
        while (state.scanRunning && Date.now() - stopStarted < 6000) {
          await roomWait(100);
        }
      }

      const opened = await openMachineSelectionForAutoEnter();
      if (!opened) throw new Error('無法打開選擇機台');
      await roomWait(160);

      // test125：只使用「頁碼」導航，不再捲動虛擬房卡。
      // 全房掃描已知道每頁數量；先把 ATG 原生該頁 tables / slotTableMap 載完整。
      const perPage = Math.max(1, Math.trunc(finiteNumber(state.tablePerPage) || 500));
      const totalPages = Math.max(1, Math.trunc(finiteNumber(state.totalPages) || Math.ceil(Math.max(roomNo, 1) / perPage)));
      const targetPage = Math.max(1, Math.min(totalPages, Math.ceil(roomNo / perPage)));

      state.enterRoomStatus = `📄 ${roomText} = 第 ${targetPage} 頁｜載入 ATG 原生房間資料…`;
      scheduleRender();

      const beforeSeq = state.pageLoadSeq;
      let pageReady = false;

      // 若目前資料本來就是目標頁，直接使用；否則只點頁碼。
      if (currentPageDataHasRoom(roomNo)) {
        pageReady = true;
      } else {
        pageReady = await forceSemanticPageForEnter(targetPage, totalPages);
        if (!pageReady) {
          // 第二條已驗證頁碼導航路徑；仍然只翻頁，不碰房卡清單。
          pageReady = await navigateToPageForEnter(targetPage);
        }
      }

      const loadStarted = Date.now();
      while (Date.now() - loadStarted < 3200) {
        if (currentPageDataHasRoom(roomNo)) {
          pageReady = true;
          break;
        }
        await roomWait(80);
      }

      if (!pageReady || !currentPageDataHasRoom(roomNo)) {
        const first = (state.latestTableNumbers || []).slice(0, 3).join(',');
        const last = (state.latestTableNumbers || []).slice(-3).join(',');
        throw new Error(`第 ${targetPage} 頁資料未對上 ${roomText}｜目前 ${first || '—'}…${last || '—'}｜seq ${beforeSeq}→${state.pageLoadSeq}`);
      }

      // 目標頁資料到位後，直接讀 ATG 自己的 SlotTableView 控制器。
      // 關鍵：只能使用 ATG 原生 slotTableMap 裡的 tableInfo，禁止再把 scanner 精簡物件塞進去。
      const controllerStarted = Date.now();
      let controller = null;
      let nativeInfo = null;

      while (Date.now() - controllerStarted < 2200) {
        controller = findSlotTableController();
        nativeInfo = controller ? findRoomInfoInSlotTableMap(controller, wantedId) : null;
        if (controller && nativeInfo) break;
        await roomWait(80);
      }

      if (!controller) throw new Error('找不到 SlotTableView 選房控制器');
      if (!nativeInfo) {
        const snap = slotTableControllerSnapshot(controller);
        throw new Error(`目標頁已載入，但 ATG slotTableMap 找不到 ${roomText}｜roomId=${wantedId} map=${snap?.mapSize ?? '—'}`);
      }

      state.enterRoomStatus = `✅ ${roomText} 原生 tableInfo 已取得｜roomId=${wantedId}｜寫入選房控制器…`;
      scheduleRender();

      const comp = controller.component;
      const before = slotTableControllerSnapshot(controller);
      let setError = '';

      try { comp.selectRoomId = wantedId; } catch (_) {}
      try {
        if ('isUpdateSelectFlag' in comp) comp.isUpdateSelectFlag = true;
      } catch (_) {}

      if (typeof comp.setTableInfo === 'function') {
        try {
          // 這裡傳的是 ATG 自己 slotTableMap 裡的完整原生物件，不是掃描器重建的資料。
          comp.setTableInfo(nativeInfo);
        } catch (error) {
          setError = String(error?.message || error);
        }
      }

      // setTableInfo 有些版型會覆蓋 selectRoomId；最後再鎖一次。
      try { comp.selectRoomId = wantedId; } catch (_) {}
      try {
        if ('isUpdateSelectFlag' in comp) comp.isUpdateSelectFlag = true;
      } catch (_) {}

      const after = slotTableControllerSnapshot(controller);
      if (finiteNumber(after?.selectRoomId) !== wantedId) {
        throw new Error(`控制器未鎖定目標房｜before=${before?.selectRoomId ?? '—'} after=${after?.selectRoomId ?? '—'}${setError ? `｜setTableInfo=${setError}` : ''}`);
      }

      // 原生房卡被點時會送 getSlotTableDetail；我們直接重播同一個 ATG 原生事件模板，
      // 只替換 roomId。這一步不需要房卡出現在畫面上。
      state.enterRoomStatus = `📡 ${roomText} 控制器已鎖定｜送出原生 getSlotTableDetail…`;
      scheduleRender();

      let direct = emitDirectRoomSelection(wantedId);
      if (!direct?.ok) {
        // 若 Socket.IO wrapper 沒留下模板，退回已擷取的原始 WebSocket frame。
        direct = replayRawSelectFrame(wantedId);
      }

      if (!direct?.ok) {
        // 不因偵測器模板缺失而亂點其他房；控制器已是正確房號，仍可走原生確認鍵。
        state.enterRoomStatus = `⚠️ 未擷取 getSlotTableDetail 模板（${direct?.reason || 'unknown'}）｜改由原生控制器確認 ${roomText}…`;
        scheduleRender();
      } else {
        await roomWait(220);
      }

      // 送出前做最後一次硬驗證。任何不一致就停，不准進錯房。
      const finalSnap = slotTableControllerSnapshot(controller);
      const finalId = finiteNumber(finalSnap?.selectRoomId);
      if (finalId !== wantedId) {
        throw new Error(`送出前驗證失敗｜目標=${wantedId} selectRoomId=${finalId ?? '—'}`);
      }

      const finalInfo = findRoomInfoInSlotTableMap(controller, wantedId);
      if (!finalInfo) {
        throw new Error(`送出前原生 tableInfo 消失｜roomId=${wantedId}`);
      }

      if (blockOccupiedRoomBeforeConfirm(roomNo, wantedId, finalInfo, 'seth')) {
        return;
      }

      const confirm = findConfirmRoomButton();
      if (!confirm?.node) throw new Error('找不到 confirmBtn/selectBtn');

      state.enterRoomStatus = `🚪 ${roomText} 已三重驗證｜觸發 ${String(confirm.node?.name || 'selectBtn')}…`;
      scheduleRender();

      if (!triggerConfirmRoomControl(confirm)) {
        throw new Error(`${String(confirm.node?.name || 'selectBtn')} 無法觸發 touch-end`);
      }

      // test126：selectBtn 只會先打開「將切換到 XXXX 號桌」確認視窗。
      // 等確認視窗真正出現後，再自動按黃色「確定」，才算真正進房。
      state.enterRoomStatus = `🟡 ${roomText} 已選定｜等待切換確認視窗…`;
      scheduleRender();

      const dialogConfirm = await autoConfirmRoomSwitchDialog(roomNo, 3000);
      if (!dialogConfirm?.ok) {
        throw new Error(`已選到 ${roomText}，但自動按確定失敗｜${dialogConfirm?.reason || 'unknown'}`);
      }

      state.enterRoomStatus = `✅ 已自動確認並進入 ${roomText} 房｜roomId=${wantedId}`;
      scheduleRender();

    } catch (error) {
      state.enterRoomStatus = `⚠️ 進房失敗：${String(error?.message || error)}`;
      scheduleRender();
    } finally {
      state.enterRoomBusy = false;
    }
  }

  const TIGER_PENDING_VERIFY_KEY = 'xinyao_tiger_pending_room_verify_v1';

  function tigerSavePendingVerify(roomNumber, roomId) {
    try {
      sessionStorage.setItem(TIGER_PENDING_VERIFY_KEY, JSON.stringify({
        roomNumber:Math.trunc(Number(roomNumber)),
        roomId:Math.trunc(Number(roomId)),
        startedAt:Date.now()
      }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function tigerLoadPendingVerify() {
    try {
      const raw = sessionStorage.getItem(TIGER_PENDING_VERIFY_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') return null;
      const roomNumber = finiteNumber(parsed.roomNumber);
      const roomId = finiteNumber(parsed.roomId);
      const startedAt = finiteNumber(parsed.startedAt);
      if (roomNumber === null || roomId === null || startedAt === null) return null;
      return {
        roomNumber:Math.trunc(roomNumber),
        roomId:Math.trunc(roomId),
        startedAt
      };
    } catch (_) {
      return null;
    }
  }

  function tigerClearPendingVerify() {
    try { sessionStorage.removeItem(TIGER_PENDING_VERIFY_KEY); } catch (_) {}
  }

  function tigerActualCurrentRoomNumber() {
    // 只讀「轉輪畫面上的目前機台徽章」，不讀 scanner selectRoomId、
    // getSlotTableDetail 或 LIVE_SNAPSHOT，避免只是選中房卡就被誤判成已進房。
    for (const w of sameOriginRoomWindows()) {
      try {
        const cocos = w.cc || w.legacyCC || w._cc;
        const scene = cocos?.director?.getScene?.();
        const Label = cocos?.Label;
        if (!scene || !Label || typeof scene.getComponentsInChildren !== 'function') continue;

        const candidates = [];
        for (const label of (scene.getComponentsInChildren(Label) || [])) {
          const node = label?.node;
          if (!node || node.activeInHierarchy === false) continue;

          const text = String(label?.string ?? label?._string ?? '').trim();
          if (!/^\d{1,4}$/.test(text)) continue;

          const path = roomLabelPath(label);
          if (/spincontent/i.test(path)) continue;

          let score = 0;
          if (/slottable2btn/i.test(path)) score += 120;
          if (/(?:current|selected|playing).*(?:room|table|machine)/i.test(path)) score += 100;
          if (/(?:buttons|control|bottom|spinbar)/i.test(path)) score += 30;
          if (/(?:room|table|machine|slot.*table)/i.test(path)) score += 20;

          // 只有強證據才接受，避免把押注、彩金、轉數等其他數字當房號。
          if (score < 80) continue;

          candidates.push({
            roomNumber:Number(text),
            score,
            path
          });
        }

        if (candidates.length) {
          candidates.sort((a,b) => b.score - a.score);
          return Math.trunc(candidates[0].roomNumber);
        }
      } catch (_) {}
    }
    return null;
  }

  function verifyTigerPendingActualRoom() {
    const pending = tigerLoadPendingVerify();
    if (!pending) return false;

    const age = Date.now() - pending.startedAt;
    const targetText = String(pending.roomNumber).padStart(4,'0');

    // 選機台畫面開著時不判定，因為此時只能看到候選房，還不是真正進房。
    if (machineSelectionLooksOpen()) {
      if (age > 20000) {
        state.enterRoomStatus =
          `⚠️ 🐯 切房逾時：仍停在選擇機台｜目標 ${targetText}`;
        tigerClearPendingVerify();
        scheduleRender();
      }
      return false;
    }

    const actual = tigerActualCurrentRoomNumber();

    if (actual === pending.roomNumber) {
      state.enterRoomStatus =
        `✅ 🐯 已驗證真正進入 ${targetText} 房｜實際目前房號=${String(actual).padStart(4,'0')}`;
      tigerClearPendingVerify();
      scheduleRender();
      return true;
    }

    // 讓 reload / Cocos 重建有足夠時間。只有真的讀到另一個目前房號，或超時，才判失敗。
    if (age > 12000 && actual !== null) {
      state.enterRoomStatus =
        `❌ 🐯 切房失敗｜目標 ${targetText}｜實際目前房號=${String(actual).padStart(4,'0')}`;
      tigerClearPendingVerify();
      scheduleRender();
      return false;
    }

    if (age > 18000 && actual === null) {
      state.enterRoomStatus =
        `❌ 🐯 無法驗證切房結果｜目標 ${targetText}｜未讀到實際目前房號`;
      tigerClearPendingVerify();
      scheduleRender();
      return false;
    }

    state.enterRoomStatus =
      actual === null
        ? `⏳ 🐯 已送出 ${targetText}｜等待轉輪目前房號出現…`
        : `⏳ 🐯 已送出 ${targetText}｜目前仍是 ${String(actual).padStart(4,'0')}，等待切房完成…`;
    scheduleRender();
    return false;
  }

  function tigerNativeTemplateStorageKey() {
    return 'xinyao_atg_native_room_templates_v1:tiger';
  }

  function tigerPersistedNativeTemplates() {
    try {
      const raw = sessionStorage.getItem(tigerNativeTemplateStorageKey());
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function tigerLatestLiveSocket() {
    try {
      const socket = window.__XIANYAO_ATG_LATEST_SOCKET__;
      if (!socket) return null;
      if (socket.disconnected === true || socket.connected === false) return null;
      return socket;
    } catch (_) {
      return null;
    }
  }

  async function waitForTigerLiveSocket(timeout = 2600) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const socket = tigerLatestLiveSocket();
      if (socket) return socket;
      await roomWait(80);
    }
    return tigerLatestLiveSocket();
  }

  async function replayTigerPersistedNativeEnter(roomId, roomNumber) {
    const id = finiteNumber(roomId);
    const number = finiteNumber(roomNumber);
    if (id === null || number === null) {
      return { ok:false, reason:'missing-room-identity' };
    }

    const templates = tigerPersistedNativeTemplates();
    const selector = templates?.selector;
    const enter = templates?.enter;

    if (!selector?.event || !Array.isArray(selector?.args)) {
      return { ok:false, reason:'persisted-selector-not-learned' };
    }
    if (!enter?.event || !Array.isArray(enter?.args)) {
      return { ok:false, reason:'persisted-enter-not-learned' };
    }

    const socket = await waitForTigerLiveSocket(2600);
    if (!socket) return { ok:false, reason:'live-socket-not-ready' };

    try {
      const selectorArgs = selector.args.map(arg =>
        cloneWithTargetIdentifiers(arg, id, number)
      );
      const enterArgs = enter.args.map(arg =>
        cloneWithTargetIdentifiers(arg, id, number)
      );

      socket.emit(selector.event, ...selectorArgs);

      await roomWait(180);

      socket.emit(enter.event, ...enterArgs);

      return {
        ok:true,
        selectEvent:String(selector.event || ''),
        enterEvent:String(enter.event || ''),
        persisted:true
      };
    } catch (error) {
      return { ok:false, reason:String(error?.message || error) };
    }
  }

  function tigerStoredScanPage(roomNumber, roomId) {
    const wantedRoom = Math.trunc(finiteNumber(roomNumber) || 0);
    const wantedId = Math.trunc(finiteNumber(roomId) || 0);

    let byNumber = null;
    let byId = null;

    for (const room of state.roomMap.values()) {
      const n = Math.trunc(finiteNumber(room?.number) || 0);
      const id = Math.trunc(finiteNumber(room?.roomId) || 0);
      const page = Math.trunc(finiteNumber(room?.scanPage) || 0);
      if (!page) continue;

      if (wantedRoom && n === wantedRoom) byNumber = page;
      if (wantedId && id === wantedId) byId = page;
    }

    return byNumber || byId || null;
  }

  function tigerVisibleRoomLabelTargets(roomNumber) {
    const wanted = Math.trunc(finiteNumber(roomNumber) || 0);
    if (!wanted) return [];

    const out = [];
    for (const gameWindow of collectSameOriginWindows()) {
      try {
        const cocos = gameWindow.cc || gameWindow.legacyCC || gameWindow._cc;
        const scene = cocos?.director?.getScene?.();
        const Label = cocos?.Label;
        if (!scene || !Label || typeof scene.getComponentsInChildren !== 'function') continue;

        for (const label of (scene.getComponentsInChildren(Label) || [])) {
          const node = label?.node;
          if (!node || node.activeInHierarchy === false) continue;

          const text = String(label?.string ?? label?._string ?? '').trim();
          if (text !== String(wanted)) continue;

          const path = roomLabelPath(label);
          if (/slottable2btn|spinbar|bottom|footer|jackpot|grand|major|minor|mini|balance|wallet|bet|stake/.test(path)) {
            continue;
          }

          const point = scannerNodeWorldPoint(node, cocos);
          if (!point) continue;

          out.push({ label, node, point, cocos, gameWindow, path });
        }
      } catch (_) {}
    }
    return out;
  }

  function tigerCanvasTapWorldTarget(target) {
    try {
      const point = target?.point;
      const gameWindow = target?.gameWindow;
      const cocos = target?.cocos;
      if (!point || !gameWindow) return { ok:false, reason:'missing-world-target' };

      const doc = gameWindow.document;
      const canvas =
        doc?.querySelector?.('canvas#GameCanvas') ||
        doc?.querySelector?.('canvas') ||
        cocos?.game?.canvas ||
        cocos?.game?._canvas;
      if (!canvas || typeof canvas.getBoundingClientRect !== 'function') {
        return { ok:false, reason:'game-canvas-not-found' };
      }

      const rect = canvas.getBoundingClientRect();
      if (!(rect.width > 0) || !(rect.height > 0)) {
        return { ok:false, reason:'game-canvas-no-size' };
      }

      let visibleWidth = 0;
      let visibleHeight = 0;
      try {
        const size = cocos?.view?.getVisibleSize?.();
        visibleWidth = Number(size?.width) || Number(canvas.width) || 0;
        visibleHeight = Number(size?.height) || Number(canvas.height) || 0;
      } catch (_) {}

      if (!(visibleWidth > 0) || !(visibleHeight > 0)) {
        return { ok:false, reason:'cocos-visible-size-missing' };
      }

      const clientX = rect.left + (point.x / visibleWidth) * rect.width;
      const clientY = rect.top + (1 - (point.y / visibleHeight)) * rect.height;

      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return { ok:false, reason:'invalid-client-point' };
      }

      try { canvas.focus?.(); } catch (_) {}

      const common = {
        bubbles:true,
        cancelable:true,
        composed:true,
        clientX,
        clientY,
        screenX:clientX,
        screenY:clientY,
        button:0
      };

      let sent = false;

      try {
        if (typeof gameWindow.PointerEvent === 'function') {
          canvas.dispatchEvent(new gameWindow.PointerEvent('pointermove', {
            ...common, pointerId:1, pointerType:'mouse', isPrimary:true, buttons:0
          }));
          canvas.dispatchEvent(new gameWindow.PointerEvent('pointerdown', {
            ...common, pointerId:1, pointerType:'mouse', isPrimary:true, buttons:1
          }));
          canvas.dispatchEvent(new gameWindow.PointerEvent('pointerup', {
            ...common, pointerId:1, pointerType:'mouse', isPrimary:true, buttons:0
          }));
          sent = true;
        }
      } catch (_) {}

      try {
        canvas.dispatchEvent(new gameWindow.MouseEvent('mousemove', { ...common, buttons:0 }));
        canvas.dispatchEvent(new gameWindow.MouseEvent('mousedown', { ...common, buttons:1 }));
        canvas.dispatchEvent(new gameWindow.MouseEvent('mouseup', { ...common, buttons:0 }));
        canvas.dispatchEvent(new gameWindow.MouseEvent('click', { ...common, buttons:0 }));
        sent = true;
      } catch (_) {}

      return {
        ok:sent,
        clientX:Math.round(clientX),
        clientY:Math.round(clientY),
        worldX:Math.round(point.x),
        worldY:Math.round(point.y),
        path:target.path || ''
      };
    } catch (error) {
      return { ok:false, reason:String(error?.message || error) };
    }
  }

  function tigerClientPointForTarget(target) {
    try {
      const point = target?.point || scannerNodeWorldPoint(target?.node, target?.cocos);
      const gameWindow = target?.gameWindow;
      const cocos = target?.cocos;
      if (!point || !gameWindow) return null;

      const doc = gameWindow.document;
      const canvas =
        doc?.querySelector?.('canvas#GameCanvas') ||
        doc?.querySelector?.('canvas') ||
        cocos?.game?.canvas ||
        cocos?.game?._canvas;
      if (!canvas || typeof canvas.getBoundingClientRect !== 'function') return null;

      const rect = canvas.getBoundingClientRect();
      let visibleWidth = 0;
      let visibleHeight = 0;
      try {
        const size = cocos?.view?.getVisibleSize?.();
        visibleWidth = Number(size?.width) || Number(canvas.width) || 0;
        visibleHeight = Number(size?.height) || Number(canvas.height) || 0;
      } catch (_) {}

      if (!(visibleWidth > 0) || !(visibleHeight > 0) || !(rect.width > 0) || !(rect.height > 0)) {
        return null;
      }

      const clientX = rect.left + (Number(point.x) / visibleWidth) * rect.width;
      const clientY = rect.top + (1 - (Number(point.y) / visibleHeight)) * rect.height;

      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;

      return { clientX, clientY, rect, canvas };
    } catch (_) {
      return null;
    }
  }

  function tigerSelectionBandForTarget(target) {
    const mapped = tigerClientPointForTarget(target);
    if (!mapped) return null;

    const { rect } = mapped;

    // 虎小妹的選房格位於頁碼列下方、底部機台資訊列上方。
    // 不依賴 Cocos ScrollView/Mask 類別（不同版本抓不到），
    // 直接用目前遊戲 Canvas 的比例建立可點選房區。
    return {
      left: rect.left + rect.width * 0.14,
      right: rect.left + rect.width * 0.92,
      top: rect.top + rect.height * 0.18,
      bottom: rect.top + rect.height * 0.75,
      centerY: rect.top + rect.height * 0.465
    };
  }

  function tigerTargetReallyVisible(target) {
    const mapped = tigerClientPointForTarget(target);
    const band = tigerSelectionBandForTarget(target);
    if (!mapped || !band) return false;

    return mapped.clientX >= band.left &&
      mapped.clientX <= band.right &&
      mapped.clientY >= band.top &&
      mapped.clientY <= band.bottom;
  }

  async function tigerBringRoomIntoVisibleGrid(roomNumber, maxAttempts = 110) {
    const wanted = Math.trunc(finiteNumber(roomNumber) || 0);
    if (!wanted) return { ok:false, reason:'invalid-room' };

    let lastPoint = null;
    let stagnant = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const targets = tigerVisibleRoomLabelTargets(wanted);

      // 目標節點存在時，直接依它「實際畫面座標」決定往哪裡捲；
      // 不再用 visibleRoomNumbersFromCocos，因為那會把裁切區外節點也當可見。
      if (targets.length) {
        const ranked = targets
          .map(target => ({ target, mapped:tigerClientPointForTarget(target) }))
          .filter(item => item.mapped)
          .sort((a,b) => {
            const ba = tigerSelectionBandForTarget(a.target);
            const bb = tigerSelectionBandForTarget(b.target);
            const da = ba ? Math.abs(a.mapped.clientY - ba.centerY) : 999999;
            const db = bb ? Math.abs(b.mapped.clientY - bb.centerY) : 999999;
            return da - db;
          });

        for (const item of ranked) {
          if (tigerTargetReallyVisible(item.target)) {
            return {
              ok:true,
              target:item.target,
              attempt,
              mapped:item.mapped,
              via:'client-viewport'
            };
          }
        }

        const best = ranked[0];
        if (best?.mapped) {
          const band = tigerSelectionBandForTarget(best.target);
          const y = best.mapped.clientY;
          lastPoint = { x:Math.round(best.mapped.clientX), y:Math.round(y) };

          let direction = null;
          let gap = 0;

          if (y > band.bottom) {
            // 目標在可視區下方：像手指往上拖，顯示更後面的房卡。
            direction = 'down';
            gap = y - band.bottom;
          } else if (y < band.top) {
            // 目標在可視區上方：往下拖回去。
            direction = 'up';
            gap = band.top - y;
          } else {
            // Y 已進可視帶但 X 落在外面，先小幅抖動讓虛擬列表重新布局。
            direction = attempt % 2 ? 'up' : 'down';
            gap = 12;
          }

          let strength = 0.30;
          const h = Math.max(1, best.mapped.rect.height);
          const ratio = gap / h;
          if (ratio > 0.45) strength = 1.05;
          else if (ratio > 0.25) strength = 0.80;
          else if (ratio > 0.12) strength = 0.58;
          else if (ratio > 0.05) strength = 0.40;

          const sent = dispatchSelectionDrag(direction, strength);
          if (!sent) {
            return {
              ok:false,
              reason:`canvas-drag-not-sent-${direction}-point-${lastPoint.x}_${lastPoint.y}`
            };
          }

          await roomWait(110);
          continue;
        }
      }

      // 虛擬列表偶爾會暫時卸載目標節點；這時以小步往後找，
      // 每一步都重新查 exact room label，找到即停。
      const signature = visibleRoomNumbersFromCocos().slice(0,40).join('_');
      if (!signature) stagnant += 1;
      else stagnant = 0;

      dispatchSelectionDrag('down', stagnant >= 3 ? 0.70 : 0.42);
      await roomWait(stagnant >= 3 ? 160 : 110);
    }

    return {
      ok:false,
      reason:`target-never-entered-client-viewport-${wanted}-last-${lastPoint ? lastPoint.x + '_' + lastPoint.y : 'none'}`
    };
  }

  async function tigerSelectRoomByCanvasHitTest(roomNumber, roomId) {
    const wantedRoom = Math.trunc(finiteNumber(roomNumber) || 0);
    const wantedId = Math.trunc(finiteNumber(roomId) || 0);
    if (!wantedRoom || !wantedId) return { ok:false, reason:'invalid-target' };

    const labels = tigerVisibleRoomLabelTargets(wantedRoom)
      .filter(target => tigerTargetReallyVisible(target));

    if (!labels.length) {
      return {
        ok:false,
        reason:`no-client-visible-label-for-${wantedRoom}`
      };
    }

    // 同一個房號若存在多個 Label，優先點路徑最像選房內容的。
    labels.sort((a,b) => {
      const score = item => {
        const p = String(item.path || '').toLowerCase();
        let s = 0;
        if (/spincontent|infocontent|content|item|cell|card|table|room|machine/.test(p)) s += 30;
        if (/slottableview/.test(p)) s += 20;
        return s;
      };
      return score(b) - score(a);
    });

    for (const target of labels.slice(0,4)) {
      const beforeCaptureAt = Number(window.__XIANYAO_ATG_DIRECT_ROOM__?.capturedAt || 0);
      const tapped = tigerCanvasTapWorldTarget(target);
      if (!tapped?.ok) continue;

      const started = Date.now();
      while (Date.now() - started < 1200) {
        const ctrl = findSlotTableController();
        const snap = ctrl ? slotTableControllerSnapshot(ctrl) : null;
        const selectedId = finiteNumber(snap?.selectRoomId);

        const cap = window.__XIANYAO_ATG_DIRECT_ROOM__;
        const capAt = Number(cap?.capturedAt || 0);
        const capturedId = capAt > beforeCaptureAt ? directCaptureRoomId(cap) : null;

        if (selectedId === wantedId || capturedId === wantedId) {
          return {
            ok:true,
            selectedId:selectedId ?? capturedId,
            capture:capAt > beforeCaptureAt ? cap : null,
            tap:tapped,
            path:target.path || ''
          };
        }

        await roomWait(60);
      }
    }

    const ctrl = findSlotTableController();
    const snap = ctrl ? slotTableControllerSnapshot(ctrl) : null;
    return {
      ok:false,
      reason:`canvas-hit-test-did-not-select-${wantedRoom}-wanted-${wantedId}-selected-${finiteNumber(snap?.selectRoomId) ?? '—'}`
    };
  }

  async function enterTigerRoomFromRanking(roomNumber, roomId) {
    const number = finiteNumber(roomNumber);
    const id = finiteNumber(roomId);
    if (number === null || id === null || state.enterRoomBusy) return;

    const roomNo = Math.trunc(number);
    const wantedId = Math.trunc(id);
    const roomText = String(roomNo).padStart(4,'0');

    state.enterRoomBusy = true;
    state.enterRoomStatus = `🐯 直達 ${roomText}｜準備原生頁面資料…`;
    scheduleRender();

    try {
      if (state.scanRunning) {
        state.scanAbort = true;
        const stopStarted = Date.now();
        while (state.scanRunning && Date.now() - stopStarted < 6000) {
          await roomWait(100);
        }
      }

      const opened = await openMachineSelectionForAutoEnter();
      if (!opened) throw new Error('虎小妹：無法打開選擇機台');
      await roomWait(160);

      // test157：正常情況直接比照賽特2，用 500 房/頁快速定位。
      // 只有該頁找不到目標 roomId 時，才啟動保險逐頁搜尋。
      const perPage = Math.max(1, Math.trunc(finiteNumber(state.tablePerPage) || 500));
      const totalPages = Math.max(
        1,
        Math.trunc(
          finiteNumber(state.totalPages) ||
          Math.ceil(Math.max(roomNo, 1) / perPage)
        )
      );
      const likelyPage = Math.max(
        1,
        Math.min(totalPages, Math.ceil(roomNo / perPage))
      );

      let targetPage = null;
      let controller = null;
      let nativeInfo = null;

      const tryTigerPage = async (page, timeout = 1100) => {
        state.enterRoomStatus =
          `🐯 ${roomText}｜快速定位第 ${page}/${totalPages} 頁…`;
        scheduleRender();

        // 如果目前 slotTableMap 已經有目標，連翻頁都省掉。
        let ctrl = findSlotTableController();
        let info = ctrl ? findRoomInfoInSlotTableMap(ctrl, wantedId) : null;
        if (ctrl && info) {
          return { page, controller:ctrl, nativeInfo:info };
        }

        let pageReady = await forceSemanticPageForEnter(page, totalPages);
        if (!pageReady) pageReady = await navigateToPageForEnter(page);

        const started = Date.now();
        while (Date.now() - started < timeout) {
          ctrl = findSlotTableController();
          info = ctrl ? findRoomInfoInSlotTableMap(ctrl, wantedId) : null;
          if (ctrl && info) {
            return { page, controller:ctrl, nativeInfo:info };
          }

          // slotTableMap 一旦已刷新成完整頁資料但沒有目標，就不再傻等。
          const snap = ctrl ? slotTableControllerSnapshot(ctrl) : null;
          const mapSize = Math.trunc(finiteNumber(snap?.mapSize) || 0);
          if (pageReady && mapSize >= Math.min(100, perPage)) {
            await roomWait(120);
            ctrl = findSlotTableController();
            info = ctrl ? findRoomInfoInSlotTableMap(ctrl, wantedId) : null;
            if (ctrl && info) {
              return { page, controller:ctrl, nativeInfo:info };
            }
            break;
          }

          await roomWait(60);
        }

        return null;
      };

      // 第一優先：和賽特2一樣直接跳房號對應頁。
      let found = await tryTigerPage(likelyPage, 1200);

      // 保險：只有快速頁沒找到才查其他頁，且每頁縮短等待時間。
      if (!found) {
        const fallbackPages = [];
        for (let page = 1; page <= totalPages; page += 1) {
          if (page !== likelyPage) fallbackPages.push(page);
        }

        for (const page of fallbackPages) {
          found = await tryTigerPage(page, 700);
          if (found) break;
        }
      }

      if (found) {
        targetPage = found.page;
        controller = found.controller;
        nativeInfo = found.nativeInfo;
      }

      if (!controller) throw new Error('虎小妹：找不到 SlotTableView 選房控制器');
      if (!nativeInfo || targetPage === null) {
        const snap = slotTableControllerSnapshot(controller);
        throw new Error(
          `虎小妹：ATG 1～${totalPages} 頁 slotTableMap 都找不到 ${roomText}｜roomId=${wantedId} map=${snap?.mapSize ?? '—'}`
        );
      }

      // ===== 以下完全照賽特2成功版流程 =====
      state.enterRoomStatus = `✅ 🐯 ${roomText} 原生 tableInfo 已取得｜第 ${targetPage} 頁｜roomId=${wantedId}｜寫入選房控制器…`;
      scheduleRender();

      const comp = controller.component;
      const before = slotTableControllerSnapshot(controller);
      let setError = '';

      try { comp.selectRoomId = wantedId; } catch (_) {}
      try {
        if ('isUpdateSelectFlag' in comp) comp.isUpdateSelectFlag = true;
      } catch (_) {}

      if (typeof comp.setTableInfo === 'function') {
        try {
          comp.setTableInfo(nativeInfo);
        } catch (error) {
          setError = String(error?.message || error);
        }
      }

      try { comp.selectRoomId = wantedId; } catch (_) {}
      try {
        if ('isUpdateSelectFlag' in comp) comp.isUpdateSelectFlag = true;
      } catch (_) {}

      const after = slotTableControllerSnapshot(controller);
      if (finiteNumber(after?.selectRoomId) !== wantedId) {
        throw new Error(
          `虎小妹控制器未鎖定目標房｜before=${before?.selectRoomId ?? '—'} after=${after?.selectRoomId ?? '—'}${setError ? `｜setTableInfo=${setError}` : ''}`
        );
      }

      state.enterRoomStatus = `📡 🐯 ${roomText} 控制器已鎖定｜送出原生 getSlotTableDetail…`;
      scheduleRender();

      let direct = emitDirectRoomSelection(wantedId);
      if (!direct?.ok) {
        direct = replayRawSelectFrame(wantedId);
      }

      if (!direct?.ok) {
        state.enterRoomStatus =
          `⚠️ 🐯 未擷取 getSlotTableDetail 模板（${direct?.reason || 'unknown'}）｜改由原生控制器確認 ${roomText}…`;
        scheduleRender();
      } else {
        await roomWait(220);
      }

      const finalSnap = slotTableControllerSnapshot(controller);
      const finalId = finiteNumber(finalSnap?.selectRoomId);
      if (finalId !== wantedId) {
        throw new Error(
          `虎小妹送出前驗證失敗｜目標=${wantedId} selectRoomId=${finalId ?? '—'}`
        );
      }

      const finalInfo = findRoomInfoInSlotTableMap(controller, wantedId);
      if (!finalInfo) {
        throw new Error(`虎小妹送出前原生 tableInfo 消失｜roomId=${wantedId}`);
      }

      if (blockOccupiedRoomBeforeConfirm(roomNo, wantedId, finalInfo, 'tiger')) {
        return;
      }

      const confirm = findConfirmRoomButton();
      if (!confirm?.node) throw new Error('虎小妹：找不到 confirmBtn/selectBtn');

      state.enterRoomStatus =
        `🚪 🐯 ${roomText} 已三重驗證｜觸發 ${String(confirm.node?.name || 'selectBtn')}…`;
      scheduleRender();

      if (!triggerConfirmRoomControl(confirm)) {
        throw new Error(
          `虎小妹：${String(confirm.node?.name || 'selectBtn')} 無法觸發 touch-end`
        );
      }

      state.enterRoomStatus = `🟡 🐯 ${roomText} 已選定｜等待切換確認視窗…`;
      scheduleRender();

      const dialogConfirm = await autoConfirmRoomSwitchDialog(roomNo, 3000);
      if (!dialogConfirm?.ok) {
        throw new Error(
          `虎小妹已選到 ${roomText}，但自動按確定失敗｜${dialogConfirm?.reason || 'unknown'}`
        );
      }

      state.enterRoomStatus =
        `✅ 🐯 已自動確認並進入 ${roomText} 房｜roomId=${wantedId}`;
      scheduleRender();

    } catch (error) {
      state.enterRoomStatus =
        `⚠️ 🐯 虎小妹進房失敗：${String(error?.message || error)}｜賽特2流程未執行`;
      scheduleRender();
    } finally {
      state.enterRoomBusy = false;
    }
  }

  function routeEnterRoomFromRanking(roomNumber, roomId) {
    const moduleId = xinyaoActiveGameModule();
    if (moduleId === 'wuxia') {
      // 武俠入口初期，原生進房後續實機核對；不影響其他遊戲。
      enterRoomFromRanking(roomNumber, roomId);
      return;
    }
    if (moduleId === 'vampire') {
      // 新款遊戲只接 ATG 原生進房與核對機制，其他四款維持原樣。
      enterRoomFromRanking(roomNumber, roomId);
      return;
    }
    if (moduleId === 'baphomet') {
      // 巴風特共用已完成掃描的 ATG 原生機台表，不變更賽特2/虎小妹邏輯。
      // 原生進房會再次核對 roomNumber + roomId，失敗時顯示錯誤而非跳到其他房。
      enterRoomFromRanking(roomNumber, roomId);
      return;
    }
    if (moduleId === 'tiger') {
      enterTigerRoomFromRanking(roomNumber, roomId);
      return;
    }
    // 賽特2完全沿用 test137 已驗證的原函式。
    enterRoomFromRanking(roomNumber, roomId);
  }

  function gameModuleSelectorHtml() {
    const current = xinyaoActiveGameModule();
    const option = XIANYAO_GAME_MODULES[current] || XIANYAO_GAME_MODULES.seth;
    return `
      <div style="margin-top:7px;padding:8px 9px;border:1px solid rgba(255,190,215,.18);border-radius:10px;background:rgba(255,255,255,.04);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <b style="font-size:10.5px;color:#ffd3e4;">🔒 已固定：${option.icon} ${option.label}</b>
          <span style="font-size:9px;opacity:.68;">由會員頁入口決定</span>
        </div>
      </div>`;
  }

  function topRowsHtml() {
    const rows = topRooms();
    if (!rows.length) return `<div style="opacity:.65;padding:8px 0;">尚無可排行的空房資料。</div>`;
    return rows.map((r, i) => {
      const m = r.metrics;
      return `<div style="display:grid;grid-template-columns:30px 52px 1fr 1fr 48px 72px;gap:5px;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:11px;">
        <b>#${i + 1}</b>
        <b>${String(r.number).padStart(4, '0')}</b>
        <span>今日 ${formatPct(m.todayRate)}</span>
        <span>累計 ${formatPct(m.totalRate)}</span>
        <span style="text-align:right;">${m.observationScore === null ? '—' : m.observationScore.toFixed(1)}</span>
        <button type="button"
          class="xinyao-enter-room"
          data-room-number="${Math.trunc(r.number)}"
          data-room-id="${Math.trunc(r.roomId)}"
          style="border:1px solid rgba(255,190,215,.5);border-radius:7px;background:rgba(255,95,158,.14);color:#ffd3e4;padding:5px 4px;font-size:9px;font-weight:900;cursor:pointer;">
          進入此房
        </button>
      </div>`;
    }).join('');
  }

  function roomTableHtml() {
    const rooms = filteredSortedRooms();
    const totalPages = Math.max(1, Math.ceil(rooms.length / ui.perPage));
    ui.roomListPage = clamp(ui.roomListPage, 1, totalPages);
    const start = (ui.roomListPage - 1) * ui.perPage;
    const pageRooms = rooms.slice(start, start + ui.perPage);

    const rows = pageRooms.map(r => {
      const m = r.metrics;
      return `<div style="display:grid;grid-template-columns:52px 62px 76px 76px 76px;gap:5px;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:10.5px;">
        <b>${String(r.number).padStart(4, '0')}</b>
        ${statusBadge(r.status)}
        <span>${formatPct(m.todayRate)}</span>
        <span>${formatPct(m.totalRate)}</span>
        <span>${formatNum(m.todayBet)}</span>
      </div>`;
    }).join('') || `<div style="padding:10px 0;opacity:.65;">沒有符合條件的房號。</div>`;

    return {
      html: `<div style="display:grid;grid-template-columns:52px 62px 76px 76px 76px;gap:5px;font-size:10px;opacity:.7;padding:4px 0;"><span>房號</span><span>狀態</span><span>今日率</span><span>累計率</span><span>今日投注</span></div>${rows}`,
      count: rooms.length,
      totalPages
    };
  }

  function render() {
    if (!state.panel) return;

    // 全裝置上 ATG 資料更新很頻繁。使用者正在按按鈕或上下滑動面板時，
    // 暫停重建 DOM，避免 pointer / touch 手勢被即時刷新打斷。
    const renderHoldUntil = Math.max(syncLinkArmedUntil, state.panelInteractingUntil || 0);
    if (Date.now() < renderHoldUntil) {
      const wait = Math.max(30, renderHoldUntil - Date.now() + 20);
      if (!state.renderTimer) {
        state.renderTimer = setTimeout(() => {
          state.renderTimer = null;
          render();
        }, wait);
      }
      return;
    }

    // 重新整理內容後保留使用者目前的捲動位置。
    const previousPanelScrollTop = state.panel.scrollTop || 0;

    const count = numberedCount();
    const expected = state.totalTableCount || '?';
    const pageKnown = state.pagesSeen.size;
    const pages = state.totalPages || '?';
    const pageList = [...state.pagesSeen].sort((a, b) => a - b).join(', ') || '—';
    const top = topRooms();
    const best = top[0];
    const bestText = best
      ? `目前資料排行：${String(best.number).padStart(4, '0')} 房｜觀察分數 ${best.metrics.observationScore?.toFixed(1) ?? '—'}`
      : '目前尚無空房排行資料';

    let expanded = '';
    if (ui.expanded) {
      const table = roomTableHtml();
      expanded = `
        <div style="margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.12);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
            <b style="font-size:13px;">📊 空房資料排行</b>
            <select id="xinyao-rank-mode" style="${selectStyle()}">
              <option value="observation" ${ui.rankMode === 'observation' ? 'selected' : ''}>觀察分數</option>
              <option value="today" ${ui.rankMode === 'today' ? 'selected' : ''}>今日得分率</option>
              <option value="total" ${ui.rankMode === 'total' ? 'selected' : ''}>累計得分率</option>
              <option value="todayBet" ${ui.rankMode === 'todayBet' ? 'selected' : ''}>今日投注量</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:30px 52px 1fr 1fr 48px 72px;gap:5px;font-size:10px;opacity:.7;padding-bottom:3px;"><span>名次</span><span>房號</span><span>今日率</span><span>累計率</span><span>分數</span><span>操作</span></div>
          ${topRowsHtml()}
          ${state.enterRoomStatus ? `<div style="margin-top:6px;padding:6px 7px;border:1px solid rgba(255,184,212,.18);border-radius:7px;background:rgba(255,255,255,.04);font-size:9.5px;color:#ffd2e4;">${escapeHtml(state.enterRoomStatus)}</div>` : ''}
        </div>

        <div style="margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.12);">
          <b style="font-size:13px;">🔍 全房查詢</b>
          <div style="display:grid;grid-template-columns:1fr 92px 105px;gap:5px;margin-top:7px;">
            <input id="xinyao-search" value="${escapeHtml(ui.search)}" placeholder="搜尋房號 / roomId" style="${inputStyle()}" />
            <select id="xinyao-filter" style="${selectStyle()}">
              <option value="All" ${ui.filter === 'All' ? 'selected' : ''}>全部</option>
              <option value="Empty" ${ui.filter === 'Empty' ? 'selected' : ''}>空房</option>
              <option value="Full" ${ui.filter === 'Full' ? 'selected' : ''}>使用中</option>
              <option value="Locked" ${ui.filter === 'Locked' ? 'selected' : ''}>鎖定</option>
            </select>
            <select id="xinyao-sort" style="${selectStyle()}">
              <option value="number" ${ui.sort === 'number' ? 'selected' : ''}>房號</option>
              <option value="score" ${ui.sort === 'score' ? 'selected' : ''}>觀察分數</option>
              <option value="today" ${ui.sort === 'today' ? 'selected' : ''}>今日率</option>
              <option value="total" ${ui.sort === 'total' ? 'selected' : ''}>累計率</option>
              <option value="todayBet" ${ui.sort === 'todayBet' ? 'selected' : ''}>今日投注</option>
            </select>
          </div>
          <div style="margin-top:7px;max-height:260px;overflow:auto;padding-right:2px;">${table.html}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px;font-size:10.5px;">
            <span>符合 ${table.count} 房｜第 ${ui.roomListPage} / ${table.totalPages} 頁</span>
            <div style="display:flex;gap:5px;">
              <button id="xinyao-prev" style="${secondaryButtonStyle('padding:5px 9px;')}">上一頁</button>
              <button id="xinyao-next" style="${secondaryButtonStyle('padding:5px 9px;')}">下一頁</button>
            </div>
          </div>
        </div>

        ${(state.learningPageNav || state.learningResult.length) ? `
        <div style="margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.12);">
          <b style="font-size:13px;">🧪 翻頁診斷</b>
          <div style="margin-top:6px;font-size:10px;line-height:1.55;opacity:.8;">
            ${state.learningPageNav
              ? '正在等待妳手動切換到另一頁，只需要點一次。'
              : `已捕捉 ${state.learningResult.length} 筆翻頁前送出的通訊。`}
          </div>
          ${state.learningResult.length ? `<pre style="margin-top:6px;max-height:170px;overflow:auto;white-space:pre-wrap;word-break:break-all;background:#0d0b11;border-radius:8px;padding:6px;font-size:9.5px;line-height:1.4;">${escapeHtml(JSON.stringify(state.learningResult.slice(-8), null, 2))}</pre>` : ''}
        </div>` : ''}`;
    }

    // v3.2.5：完整分析在全裝置版直接固定於「可視畫面」上下邊界，
    // 不再只依賴 100vh / 100dvh；Safari / Firefox 橫向工具列出現時也不會把底部內容裁掉。
    const visualHeight = Math.max(220, Math.floor(
      window.visualViewport?.height ||
      window.innerHeight ||
      document.documentElement?.clientHeight ||
      600
    ));
    state.panel.style.width = ui.expanded
      ? 'min(520px, calc(100vw - 16px))'
      : 'min(330px, calc(100vw - 16px))';
    state.panel.style.maxWidth = 'calc(100vw - 16px)';
    state.panel.style.top = '8px';
    if (ui.expanded) {
      // top + bottom 同時指定，讓完整分析永遠只佔目前可見畫面；內容超出就由 panel 自己捲動。
      state.panel.style.bottom = '8px';
      state.panel.style.height = 'auto';
      state.panel.style.maxHeight = 'none';
    } else {
      state.panel.style.bottom = 'auto';
      state.panel.style.height = 'auto';
      state.panel.style.maxHeight = `${Math.max(180, visualHeight - 16)}px`;
    }
    state.panel.style.overflowX = 'hidden';
    state.panel.style.overflowY = 'scroll';
    state.panel.style.webkitOverflowScrolling = 'touch';
    state.panel.style.overscrollBehavior = 'contain';
    state.panel.style.overscrollBehaviorY = 'contain';
    state.panel.style.touchAction = 'pan-y';

    state.panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:7px;">
        <div style="font-weight:800;font-size:14px;">🌸 芯瑤 ATG 全房分析</div>
        <button id="xinyao-room-hide" style="${secondaryButtonStyle('padding:4px 8px;')}">縮小</button>
      </div>

      <div style="font-size:11px;line-height:1.65;">
        <span>${state.enabled ? '🟢 偵測中' : '⚪ 已暫停'}</span><br>
        已抓房號：<b>${count}</b> / ${expected}　頁數：<b>${pageKnown}</b> / ${pages}<br>
        目前頁：${state.currentPage ?? '—'}　已看頁：${escapeHtml(pageList)}<br>
        <span style="${state.scanError ? 'color:#ff9a9a;' : 'color:#a7f3d0;'}">${escapeHtml(state.scanError || state.scanMessage)}</span>
      </div>

      ${gameModuleSelectorHtml()}

      <div style="margin-top:7px;background:rgba(255,255,255,.06);padding:7px 8px;border-radius:9px;font-size:10.5px;">${escapeHtml(bestText)}</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">
        <button id="xinyao-scan-all" style="${buttonStyle()}">${state.scanRunning ? '掃描中…' : '一鍵掃描全部房間'}</button>
        <button id="xinyao-stop" style="${secondaryButtonStyle()}">停止掃描</button>
        <button id="xinyao-expand" style="${secondaryButtonStyle()}">${ui.expanded ? '收合分析' : '完整分析'}</button>
        <a id="xinyao-sync-site" href="https://xinyao-ai.github.io/xinyao-ai/?atgRooms=1" target="xinyao-atg-ai" style="${buttonStyle('grid-column:1 / -1;display:block;text-decoration:none;text-align:center;box-sizing:border-box;')}">🌸 同步到芯瑤</a>
      </div>

      <div style="display:grid;grid-template-columns:1fr 120px;gap:6px;margin-top:6px;align-items:center;">
        <span style="font-size:10px;opacity:.7;">自動刷新（只在選房頁執行）</span>
        <select id="xinyao-auto" style="${selectStyle()}">
          <option value="0" ${ui.autoRefreshMins === 0 ? 'selected' : ''}>關閉</option>
          <option value="3" ${ui.autoRefreshMins === 3 ? 'selected' : ''}>每 3 分鐘</option>
          <option value="5" ${ui.autoRefreshMins === 5 ? 'selected' : ''}>每 5 分鐘</option>
          <option value="10" ${ui.autoRefreshMins === 10 ? 'selected' : ''}>每 10 分鐘</option>
        </select>
      </div>

      ${expanded}

    `;

    bindUiEvents();

    // innerHTML 會被即時資料更新重建；還原位置避免畫面每次更新跳回最上方。
    if (previousPanelScrollTop > 0) {
      state.panel.scrollTop = previousPanelScrollTop;
    }
  }

  function inputStyle() {
    return 'box-sizing:border-box;width:100%;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:rgba(255,255,255,.08);color:#fff;padding:7px;font-size:11px;outline:none;';
  }

  function selectStyle() {
    return 'box-sizing:border-box;width:100%;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:#2b2535;color:#fff;padding:6px;font-size:10.5px;outline:none;';
  }

  function bindUiEvents() {
    document.getElementById('xinyao-game-seth')?.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      xinyaoSetActiveGameModule('seth', 'room-scanner');
      state.enterRoomStatus = '👁️ 已固定「戰神賽特2」｜掃描共用｜盤面與進房使用賽特2專屬機制';
      scheduleRender();
    });
    document.getElementById('xinyao-game-tiger')?.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      xinyaoSetActiveGameModule('tiger', 'room-scanner');
      state.enterRoomStatus = '🐯 已固定「虎小妹」｜掃描共用｜盤面切虎小妹；進房專屬模組尚未接線';
      scheduleRender();
    });
    document.getElementById('xinyao-auto')?.addEventListener('change', e => setAutoRefresh(Number(e.target.value) || 0));
    document.getElementById('xinyao-rank-mode')?.addEventListener('change', e => { ui.rankMode = e.target.value; scheduleRender(); });
    document.getElementById('xinyao-filter')?.addEventListener('change', e => { ui.filter = e.target.value; ui.roomListPage = 1; scheduleRender(); });
    document.getElementById('xinyao-sort')?.addEventListener('change', e => { ui.sort = e.target.value; ui.roomListPage = 1; scheduleRender(); });
    document.getElementById('xinyao-search')?.addEventListener('input', e => {
      ui.search = e.target.value;
      ui.roomListPage = 1;
      clearTimeout(e.target.__xinyaoTimer);
      e.target.__xinyaoTimer = setTimeout(scheduleRender, 180);
    });
  }

  function createPanel() {
    if (state.panel || !document.body) return;
    const panel = document.createElement('div');
    panel.id = 'xinyao-atg-room-scanner';
    panel.style.cssText = 'position:fixed;top:12px;right:12px;width:min(330px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;z-index:2147483647;background:rgba(22,18,28,.97);color:#fff;padding:12px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.38);font-family:Arial,"Microsoft JhengHei",sans-serif;box-sizing:border-box;';
    document.body.appendChild(panel);
    state.panel = panel;

    // 全裝置手指正在滑動時先不要重建 panel，否則頻繁的掃描資料更新會中斷捲動。
    const holdPanelInteraction = (ms = 700) => {
      state.panelInteractingUntil = Date.now() + ms;
    };

    // v3.2.5：ATG/Cocos 在部分全裝置瀏覽器會攔截 touchmove，
    // 導致 CSS 明明有 overflow-y:auto 仍完全滑不動。
    // 這裡直接把手指的垂直位移轉成 panel.scrollTop，讓 iOS / Android 都能真正捲動。
    let touchStartY = null;
    let touchStartScrollTop = 0;

    panel.addEventListener('touchstart', event => {
      const touch = event.touches?.[0];
      if (!touch) return;
      touchStartY = touch.clientY;
      touchStartScrollTop = panel.scrollTop || 0;
      holdPanelInteraction(1200);
    }, { passive: true, capture: true });

    panel.addEventListener('touchmove', event => {
      const touch = event.touches?.[0];
      if (!touch || touchStartY === null) return;

      const deltaY = touchStartY - touch.clientY;
      if (Math.abs(deltaY) < 2) return;

      const maxScroll = Math.max(0, panel.scrollHeight - panel.clientHeight);
      if (maxScroll <= 0) return;

      panel.scrollTop = Math.max(0, Math.min(maxScroll, touchStartScrollTop + deltaY));
      holdPanelInteraction(1200);

      // 阻止底下 Cocos 遊戲把同一個滑動手勢吃掉。
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    }, { passive: false, capture: true });

    const finishTouchScroll = () => {
      touchStartY = null;
      touchStartScrollTop = panel.scrollTop || 0;
      holdPanelInteraction(500);
    };

    panel.addEventListener('touchend', finishTouchScroll, { passive: true, capture: true });
    panel.addEventListener('touchcancel', finishTouchScroll, { passive: true, capture: true });
    panel.addEventListener('scroll', () => holdPanelInteraction(700), { passive: true });
    panel.addEventListener('wheel', () => holdPanelInteraction(700), { passive: true, capture: true });

    // 使用固定在 panel 本體上的 pointerdown 事件代理。
    // ATG 即時資料很頻繁，render() 會重建 panel 內容；若把 click 綁在每顆
    // 臨時按鈕上，按下與放開之間節點可能已被替換，造成看起來「沒反應」。
    panel.addEventListener('pointerdown', event => {
      const link = event.target?.closest?.('a#xinyao-sync-site');
      if (link && panel.contains(link)) {
        syncLinkArmedUntil = Date.now() + 700;
        if (!prepareSyncToXinyaoSite()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      const enterRoomButton = event.target?.closest?.('.xinyao-enter-room[data-room-number][data-room-id]');
      if (enterRoomButton && panel.contains(enterRoomButton)) {
        event.preventDefault();
        event.stopPropagation();
        holdPanelInteraction(120);
        const roomNumber = Number(enterRoomButton.dataset.roomNumber);
        const roomId = Number(enterRoomButton.dataset.roomId);
        state.enterRoomStatus = `🖱️ 已點擊 ${Number.isFinite(roomNumber) ? Math.trunc(roomNumber) : '—'} 房，準備執行…`;
        render();
        routeEnterRoomFromRanking(roomNumber, roomId);
        return;
      }

      const handlerRefresh = event.target?.closest?.('#xinyao-handler-refresh');
      if (handlerRefresh && panel.contains(handlerRefresh)) {
        event.preventDefault();
        event.stopPropagation();
        holdPanelInteraction(80);
        render();
        return;
      }

      const button = event.target?.closest?.('button[id]');
      if (!button || !panel.contains(button)) return;
      const action = resolvePanelAction(button.id);
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();

      if (action === 'scan') {
        scanAllPages();
      } else if (action === 'stop') {
        stopScan();
      } else if (action === 'copy') {
        copyResults();
      } else if (action === 'expand') {
        ui.expanded = !ui.expanded;
        scheduleRender();
      } else if (action === 'hide') {
        panel.style.display = 'none';
        mini.style.display = 'block';
      } else if (action === 'prev') {
        ui.roomListPage = Math.max(1, ui.roomListPage - 1);
        scheduleRender();
      } else if (action === 'next') {
        ui.roomListPage += 1;
        scheduleRender();
      } else if (action === 'sync') {
        // 同步按鈕已改為真正連結；由 click 事件準備握手資料，不在此攔截。
      }
    }, true);

    // 部分 ATG/Cocos 裝置會吃掉 pointerdown 的後續流程；再加 click capture 當備援。
    panel.addEventListener('click', event => {
      const enterRoomButton = event.target?.closest?.('.xinyao-enter-room[data-room-number][data-room-id]');
      if (!enterRoomButton || !panel.contains(enterRoomButton)) return;
      event.preventDefault();
      event.stopPropagation();

      const roomNumber = Number(enterRoomButton.dataset.roomNumber);
      const roomId = Number(enterRoomButton.dataset.roomId);

      // pointerdown 已經啟動時不要重複執行；只有沒有 busy 才由 click 補上。
      if (!state.enterRoomBusy) {
        state.enterRoomStatus = `🖱️ 已點擊 ${Number.isFinite(roomNumber) ? Math.trunc(roomNumber) : '—'} 房，準備執行…`;
        render();
        routeEnterRoomFromRanking(roomNumber, roomId);
      }
    }, true);

    mini.id = 'xinyao-room-mini';
    mini.textContent = '🔎 全房分析';
    mini.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;border:0;border-radius:999px;padding:9px 12px;background:#ff5a9d;color:#fff;font-weight:800;display:none;cursor:pointer;';
    if (xinyaoIsPhoneUi()) {
      mini.style.top = '50px';
      mini.style.right = '6px';
      mini.style.padding = '7px 10px';
      mini.style.fontSize = '10px';
      mini.style.zIndex = '2147483645';
    }
    mini.addEventListener('click', () => {
      if (xinyaoIsPhoneUi()) {
        try {
          window.dispatchEvent(new CustomEvent('xinyao:mobile-panel-open', {
            detail: { panel:'rooms' }
          }));
        } catch (_) {}
      }
      mini.style.display = 'none';
      panel.style.display = 'block';
    });

    try {
      window.addEventListener('xinyao:mobile-panel-open', event => {
        if (!xinyaoIsPhoneUi()) return;
        const who = String(event?.detail?.panel || '');
        if (who === 'rooms') return;
        if (panel.style.display !== 'none') {
          panel.style.display = 'none';
          mini.style.display = 'block';
        }
      });
    } catch (_) {}
    document.body.appendChild(mini);
    render();
  }

  function waitForPairThenCreatePanel() {
    const PAIR_TOKEN_KEY = 'xinyao_atg_device_token_v2';

    function checkPair() {
      const paired = !!localStorage.getItem(PAIR_TOKEN_KEY);
      if (paired) {
        createPanel();
        return true;
      }
      return false;
    }

    if (checkPair()) return;

    const pairTimer = setInterval(() => {
      if (checkPair()) {
        clearInterval(pairTimer);
      }
    }, 500);
  }

  window.addEventListener('xinyao:maintenance', (event) => {
    if (!event.detail?.enabled) return;
    try {
      state.scanAbort = true;
      if (state.scanRunning) stopScan();
      setAutoRefresh(0);
    } catch (_) {}
  });

  window.addEventListener('resize', () => {
    resetAdaptivePagerLearning();
    state.pagerSurfaceSignature = '';
  }, { passive: true });

  window.addEventListener('orientationchange', () => {
    resetAdaptivePagerLearning();
    state.pagerSurfaceSignature = '';
  }, { passive: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForPairThenCreatePanel, { once: true });
  } else {
    waitForPairThenCreatePanel();
  }
})();

/* ===== 芯瑤 ATG Unified Speed v1.0｜整合至即時助手 ===== */
(() => {
  'use strict';

  if (window.__XIANYAO_ATG_UNIFIED_SPEED_INTEGRATED__) return;
  window.__XIANYAO_ATG_UNIFIED_SPEED_INTEGRATED__ = true;

  const SPEED_VERSION = '1.1.0-test176';
  const SPEED_KEY = 'xinyao_atg_unified_speed_v1';
  const FREE_SKIP_SPEED = 180;
  const FREE_SKIP_MAX_MS = 5000;
  const SPEEDS = [1, 3, 5, 8, 10, 12, 16];
  const DEFAULT_SPEED = 10;
  const CLEAR_MAX_DURATION = 0.06;
  const GAP_MAX_DELAY = 0.05;
  const MIN_DURATION = 0.006;
  const MIN_DELAY = 0.01;
  const MAX_VISUAL_WAIT = 2.5;
  const PATCH_MARK = '__xinyaoUnifiedSpeedIntegratedV100';
  const BASE_DURATION = new WeakMap();

  const speedState = {
    speed: DEFAULT_SPEED,
    tweenPatched: 0,
    schedulePatched: 0,
    tweenStarts: 0,
    waitsScaled: 0,
    lastPatchedAt: 0,
    freeSkipActive: false,
    freeSkipUntil: 0,
    schedulerBoosted: 0
  };

  function safe(fn, fallback = null) {
    try {
      const value = fn();
      return value === undefined ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function loadSpeed() {
    try {
      const saved = finite(localStorage.getItem(SPEED_KEY));
      if (saved !== null && SPEEDS.includes(saved)) return saved;
    } catch (_) {}
    return DEFAULT_SPEED;
  }

  function freeSkipActive() {
    if (!speedState.freeSkipActive) return false;
    if (Date.now() <= Number(speedState.freeSkipUntil || 0)) return true;
    speedState.freeSkipActive = false;
    speedState.freeSkipUntil = 0;
    return false;
  }

  function effectiveSpeed() {
    if (window.__XIANYAO_MAINTENANCE_STATE__?.enabled) return 1;
    if (freeSkipActive()) return FREE_SKIP_SPEED;
    return SPEEDS.includes(speedState.speed) ? speedState.speed : DEFAULT_SPEED;
  }

  function saveSpeed(value) {
    try { localStorage.setItem(SPEED_KEY, String(value)); } catch (_) {}
  }

  function setSpeed(value, persist = true) {
    const next = finite(value);
    if (next === null || !SPEEDS.includes(next)) return false;
    speedState.speed = next;
    if (persist) saveSpeed(next);
    updateSpeedUi();
    try {
      window.dispatchEvent(new CustomEvent('xinyao:speed-changed', {
        detail: { speed: next, effectiveSpeed: effectiveSpeed(), version: SPEED_VERSION }
      }));
    } catch (_) {}
    return true;
  }

  speedState.speed = loadSpeed();

  function nodePath(node) {
    const parts = [];
    let current = node;
    for (let i = 0; current && i < 12; i += 1) {
      const name = safe(() => current.name, '') || '';
      if (name) parts.unshift(String(name));
      current = safe(() => current.parent, null) || safe(() => current._parent, null);
    }
    return parts.join('/');
  }

  function componentName(component) {
    return String(
      safe(() => component?.__classname__, '') ||
      safe(() => component?.constructor?.__classname__, '') ||
      safe(() => component?.constructor?.name, '') ||
      ''
    );
  }

  function relatedTarget(target) {
    if (!target) return false;
    const node = safe(() => target.node, null) || (safe(() => target.name, null) ? target : null);
    const text = `${componentName(target)} ${safe(() => target.name, '') || ''} ${nodePath(node)}`;
    return /(Symbol|Reel|Slot|Cascade|Spin|GameView|WinView|BigwinView|InfoBar|CurrentTimesView|Pay|Clear|Combo)/i.test(text);
  }

  function relatedComponent(component) {
    if (!component) return false;
    const text = `${componentName(component)} ${nodePath(safe(() => component.node, null))}`;
    return /(Symbol|Reel|Slot|Cascade|SpinButton|GameView|WinView|BigwinView|InfoBar|CurrentTimesView|Pay|Clear|Combo)/i.test(text);
  }

  function actionTag(action) {
    const viaMethod = finite(safe(() => action?.getTag?.(), null));
    if (viaMethod !== null) return viaMethod;
    return finite(safe(() => action?._tag, null));
  }

  function scaleDuration(base, speed, tag) {
    if (!(base > 0) || speed <= 1) return base;
    let next = base / speed;
    if (tag === 1234) next = Math.min(next, CLEAR_MAX_DURATION);
    return Math.max(MIN_DURATION, next);
  }

  function tuneActionTree(root, targetIsRelated) {
    if (!root || (typeof root !== 'object' && typeof root !== 'function')) return;
    const seen = new WeakSet();

    function visit(value, depth, inheritedTagged = false) {
      if (!value || (typeof value !== 'object' && typeof value !== 'function')) return;
      if (depth > 10 || seen.has(value)) return;
      seen.add(value);

      const tag = actionTag(value);
      const tagged = inheritedTagged || tag === 1234 || tag === 5678;
      const shouldScale = targetIsRelated || tagged;

      const duration = finite(safe(() => value._duration, null));
      if (shouldScale && duration !== null && duration > 0) {
        if (!BASE_DURATION.has(value)) BASE_DURATION.set(value, duration);
        const base = BASE_DURATION.get(value);
        const next = scaleDuration(base, effectiveSpeed(), tag);
        try { value._duration = next; } catch (_) {}
      }

      let entries = [];
      try { entries = Object.entries(value); } catch (_) { return; }
      for (const [key, child] of entries) {
        if (
          key === '_target' || key === 'target' || key === '_owner' || key === 'owner' ||
          key === '_node' || key === 'node' || key === '_eventTargets' || key === '_listeners'
        ) continue;

        if (Array.isArray(child)) {
          for (const item of child) visit(item, depth + 1, tagged);
        } else if (child && (typeof child === 'object' || typeof child === 'function')) {
          visit(child, depth + 1, tagged);
        }
      }
    }

    visit(root, 0, false);
  }

  function patchTweenForWindow(win) {
    const cc = safe(() => win.cc, null) || safe(() => win.legacyCC, null) || safe(() => win._cc, null);
    const proto = safe(() => cc?.Tween?.prototype, null);
    if (!proto || typeof proto.start !== 'function' || proto.start[PATCH_MARK]) return false;

    const nativeStart = proto.start;
    const wrappedStart = function (...args) {
      try {
        const target = safe(() => this._target, null) || safe(() => this.target, null);
        const related = relatedTarget(target);
        tuneActionTree(this, related);
        speedState.tweenStarts += 1;
      } catch (_) {}
      return nativeStart.apply(this, args);
    };

    try { Object.defineProperty(wrappedStart, PATCH_MARK, { value: true }); } catch (_) { wrappedStart[PATCH_MARK] = true; }
    try {
      proto.start = wrappedStart;
      speedState.tweenPatched += 1;
      speedState.lastPatchedAt = Date.now();
      return true;
    } catch (_) {
      return false;
    }
  }

  function patchScheduleForWindow(win) {
    const cc = safe(() => win.cc, null) || safe(() => win.legacyCC, null) || safe(() => win._cc, null);
    const proto = safe(() => cc?.Component?.prototype, null);
    if (!proto || typeof proto.scheduleOnce !== 'function' || proto.scheduleOnce[PATCH_MARK]) return false;

    const nativeScheduleOnce = proto.scheduleOnce;
    const wrappedScheduleOnce = function (callback, delay = 0, ...rest) {
      let nextDelay = delay;
      try {
        const raw = finite(delay);
        const speed = effectiveSpeed();
        if (raw !== null && raw > 0 && raw <= MAX_VISUAL_WAIT && speed > 1 && relatedComponent(this)) {
          nextDelay = Math.max(MIN_DELAY, Math.min(raw / speed, GAP_MAX_DELAY));
          speedState.waitsScaled += 1;
        }
      } catch (_) {}
      return nativeScheduleOnce.call(this, callback, nextDelay, ...rest);
    };

    try { Object.defineProperty(wrappedScheduleOnce, PATCH_MARK, { value: true }); } catch (_) { wrappedScheduleOnce[PATCH_MARK] = true; }
    try {
      proto.scheduleOnce = wrappedScheduleOnce;
      speedState.schedulePatched += 1;
      speedState.lastPatchedAt = Date.now();
      return true;
    } catch (_) {
      return false;
    }
  }

  function collectSameOriginWindows(root = window) {
    const out = [];
    const seen = new Set();
    const visit = win => {
      if (!win || seen.has(win)) return;
      seen.add(win);
      out.push(win);
      let frames = [];
      try { frames = [...win.document.querySelectorAll('iframe')]; } catch (_) {}
      for (const frame of frames) {
        try {
          const child = frame.contentWindow;
          if (!child) continue;
          void child.document;
          visit(child);
        } catch (_) {}
      }
    };
    visit(root);
    return out;
  }

  function setSchedulerScaleForWindow(win, scale) {
    try {
      const cc = safe(() => win.cc, null) || safe(() => win.legacyCC, null) || safe(() => win._cc, null);
      const director =
        safe(() => cc?.director, null) ||
        safe(() => cc?.Director?.instance, null) ||
        safe(() => cc?.Director?._instance, null);
      const scheduler = safe(() => director?.getScheduler?.(), null);
      if (!scheduler || typeof scheduler.setTimeScale !== 'function') return false;
      scheduler.setTimeScale(scale);
      return true;
    } catch (_) {
      return false;
    }
  }

  function syncSchedulerBoost() {
    const boost = freeSkipActive();
    let count = 0;
    for (const win of collectSameOriginWindows()) {
      if (setSchedulerScaleForWindow(win, boost ? FREE_SKIP_SPEED : 1)) count += 1;
    }
    speedState.schedulerBoosted = boost ? count : 0;
  }

  function startFreeSkipBoost(durationMs = FREE_SKIP_MAX_MS) {
    const ms = Math.max(400, Math.min(8000, Number(durationMs) || FREE_SKIP_MAX_MS));
    speedState.freeSkipActive = true;
    speedState.freeSkipUntil = Date.now() + ms;
    syncSchedulerBoost();
    try {
      window.dispatchEvent(new CustomEvent('xinyao:free-native-skip-boost', {
        detail:{active:true,speed:FREE_SKIP_SPEED,until:speedState.freeSkipUntil}
      }));
    } catch (_) {}
    return true;
  }

  function stopFreeSkipBoost() {
    speedState.freeSkipActive = false;
    speedState.freeSkipUntil = 0;
    syncSchedulerBoost();
    try {
      window.dispatchEvent(new CustomEvent('xinyao:free-native-skip-boost', {
        detail:{active:false,speed:1}
      }));
    } catch (_) {}
    return true;
  }

  function patchAll() {
    for (const win of collectSameOriginWindows()) {
      patchTweenForWindow(win);
      patchScheduleForWindow(win);
    }
    syncSchedulerBoost();
    updateSpeedUi();
  }

  function ensureSpeedStyle() {
    if (document.getElementById('xinyao-atg-unified-speed-style')) return;
    const style = document.createElement('style');
    style.id = 'xinyao-atg-unified-speed-style';
    style.textContent = `
      #xinyaoATGLiveV200 #xinyaoUnifiedSpeedSection{margin-top:7px;padding-top:7px;border-top:1px solid rgba(255,255,255,.14)}
      #xinyaoATGLiveV200 .xinyaoSpeedTitle{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px;font-size:11px;font-weight:800}
      #xinyaoATGLiveV200 .xinyaoSpeedTitle b{color:#ffb8d4;font-size:12px}
      #xinyaoATGLiveV200 .xinyaoSpeedGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}
      #xinyaoATGLiveV200 .xinyaoSpeedBtn{border:1px solid rgba(255,255,255,.18);border-radius:7px;background:rgba(255,255,255,.08);color:#fff;padding:5px 2px;font-size:9px;font-weight:800;cursor:pointer;touch-action:manipulation}
      #xinyaoATGLiveV200 .xinyaoSpeedBtn.active{background:#ff5f9e;border-color:#ff8fba}
      @media (max-width:760px), (max-height:760px) and (pointer:coarse){
        #xinyaoATGLiveV200 #xinyaoUnifiedSpeedSection{
          padding-bottom:0;
        }
        #xinyaoATGLiveV200 .xinyaoSpeedGrid{gap:3px}
        #xinyaoATGLiveV200 .xinyaoSpeedBtn{min-height:26px;font-size:8px;padding:3px 1px}
      }
      @media (min-width:761px) and (max-height:760px) and (pointer:fine){
        #xinyaoATGLiveV200 #xinyaoUnifiedSpeedSection{
          padding-bottom:max(2px, env(safe-area-inset-bottom, 0px));
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function speedSectionHtml() {
    const current = speedState.speed;
    const effective = effectiveSpeed();
    const maintenance = Boolean(window.__XIANYAO_MAINTENANCE_STATE__?.enabled);
    const buttons = SPEEDS.map(value =>
      `<button type="button" class="xinyaoSpeedBtn${value === current ? ' active' : ''}" data-xinyao-speed="${value}">${value}×</button>`
    ).join('');

    return `
      <div id="xinyaoUnifiedSpeedSection">
        <div class="xinyaoSpeedTitle">
          <span>⚡ 芯瑤 ATG 極速模式</span>
          <b id="xinyaoSpeedCurrent">${maintenance ? '維護中' : `${effective}×`}</b>
        </div>
        <div class="xinyaoSpeedGrid">${buttons}</div>
      </div>
    `;
  }

  function bindSpeedButtons(section) {
    for (const button of section.querySelectorAll('[data-xinyao-speed]')) {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        setSpeed(Number(button.dataset.xinyaoSpeed));
      });
    }
  }

  function ensureSpeedUi() {
    // test87：完整資料面板不再顯示重複的極速控制列。
    // 極速引擎與 window.__XIANYAO_ATG_UNIFIED_SPEED__ API 保留，
    // 只由迷你 HUD 的「極速」按鈕操作。
    const section = document.getElementById('xinyaoUnifiedSpeedSection');
    if (section) section.remove();
  }

  function updateSpeedUi() {
    const section = document.getElementById('xinyaoUnifiedSpeedSection');
    if (!section) return;

    const maintenance = Boolean(window.__XIANYAO_MAINTENANCE_STATE__?.enabled);
    const currentEl = section.querySelector('#xinyaoSpeedCurrent');
    if (currentEl) currentEl.textContent = maintenance ? '維護中' : `${effectiveSpeed()}×`;

    for (const button of section.querySelectorAll('[data-xinyao-speed]')) {
      button.classList.toggle('active', Number(button.dataset.xinyaoSpeed) === speedState.speed);
    }

  }

  window.__XIANYAO_ATG_UNIFIED_SPEED__ = {
    version: SPEED_VERSION,
    get speed() { return speedState.speed; },
    get effectiveSpeed() { return effectiveSpeed(); },
    setSpeed,
    startFreeSkipBoost,
    stopFreeSkipBoost,
    getState() {
      return {
        version: SPEED_VERSION,
        speed: speedState.speed,
        effectiveSpeed: effectiveSpeed(),
        freeSkipActive: freeSkipActive(),
        freeSkipUntil: speedState.freeSkipUntil,
        schedulerBoosted: speedState.schedulerBoosted,
        tweenPatched: speedState.tweenPatched,
        schedulePatched: speedState.schedulePatched,
        tweenStarts: speedState.tweenStarts,
        waitsScaled: speedState.waitsScaled
      };
    }
  };

  try {
    window.addEventListener('xinyao:maintenance', () => updateSpeedUi());
  } catch (_) {}

  patchAll();
  ensureSpeedUi();
  setInterval(patchAll, 500);
  setInterval(ensureSpeedUi, 250);
})();


/* ===== 芯瑤 ATG HUD Lab｜盤面圖案偵測測試 v0.1 ===== */
(() => {
  'use strict';

  if (window.__XIANYAO_ATG_BOARD_PROBE_V01__) return;
  window.__XIANYAO_ATG_BOARD_PROBE_V01__ = true;

  const PANEL_ID = 'xinyao-atg-board-probe-v01';
  const EVENT_NAME = 'xinyao:spin-final-observed';

  const probe = {
    lastSpinId: '',
    roomNumber: null,
    updatedAt: 0,
    candidate: null,
    candidateCount: 0,
    status: '等待第一局完成資料…',
    minimized: (() => {
      try { return xinyaoIsPhoneUi(); } catch (_) { return false; }
    })(),
    signalScore: 0,
    signalReason: '等待盤面資料',
    signalTriggered: false,
    signalArmed: true,
    lastSignalSpinId: '',
    autoStopEnabled: true,
    autoStopStatus: '',
    autoStopRetryToken: 0,
    autoStopRetryUntil: 0,
    autoStopAttempts: 0,
    autoStopLastVia: '',
    stopLearnMode: false,
    stopLearned: false,
    stopLearnInfo: null,
    learnedStopButtonRef: null,
    stopLearnHooksInstalled: false,
    stopReplayRefs: null,
    stopReplayParams: null,
    stopReplayEmitter: null,
    stopReplayNodeRef: null,
    stopReplayNodeEvent: null,
    stopReplayNodeArgs: null,
    stopReplayInfo: null,
    stopCaptureAt: 0,
    multiplierValues: [],
    signalHistory: [],
    gameProfile: 'tiger'
  };

  // test100：遊戲類別集中在同一份清單。
  // 之後新增遊戲，只要新增一筆選項＋對應圖示辨識資料，不需要再改版面。
  const MANUAL_GAME_PROFILE_KEY = 'xinyao_atg_board_manual_profile_v1';
  const GAME_PROFILE_OPTIONS = Object.freeze([
    { id:'scarlet', label:'赤三國', shortLabel:'赤三國', icon:'🔥' },
    { id:'wuxia', label:'武俠', shortLabel:'武俠', icon:'⚔️' },
    { id:'vampire', label:'惡魔血域', shortLabel:'血域', icon:'🦇' },
    { id:'baphomet', label:'古神巴風特', shortLabel:'巴風特', icon:'🔥' },
    { id:'seth1', label:'戰神賽特1', shortLabel:'賽特1', icon:'👁️' },
    { id:'seth', label:'戰神賽特2', shortLabel:'賽特2', icon:'👁️' },
    { id:'tiger', label:'虎小妹', shortLabel:'虎小妹', icon:'🐯' }
  ]);

  function validManualGameProfile(profile) {
    return GAME_PROFILE_OPTIONS.some(item => item.id === String(profile || ''));
  }

  function gameProfileOption(profile = probe.gameProfile) {
    return GAME_PROFILE_OPTIONS.find(item => item.id === String(profile || ''))
      || GAME_PROFILE_OPTIONS[0];
  }

  function loadManualGameProfile() {
    if (new URL(location.href).searchParams.get('gn') === 'scarlet-three-kingdoms') return 'scarlet';
  if (new URL(location.href).searchParams.get('gn') === 'wuxia-caishen') return 'wuxia';
  if (new URL(location.href).searchParams.get('gn') === 'new-vampire-hunter') return 'vampire';
  if (new URL(location.href).searchParams.get('gn') === 'hades') return 'baphomet';
    if (new URL(location.href).searchParams.get('gn') === 'egyptian-mythology') return 'seth1';
    // test140：盤面監測跟隨全域遊戲模式；不再自己猜目前是哪款。
    try {
      const active = xinyaoNormalizeGameModule(window.__XIANYAO_ATG_ACTIVE_GAME_MODULE__ || xinyaoLoadActiveGameModule());
      if (validManualGameProfile(active)) return active;
    } catch (_) {}
    try {
      const saved = String(localStorage.getItem(MANUAL_GAME_PROFILE_KEY) || '').toLowerCase();
      if (validManualGameProfile(saved)) return saved;
    } catch (_) {}
    return 'seth';
  }

  function setManualGameProfile(profile) {
    profile = String(profile || '');
    if (!validManualGameProfile(profile)) return;
    try { xinyaoSetActiveGameModule(profile, 'board-panel'); } catch (_) {}
    if (probe.gameProfile === profile) return;

    probe.gameProfile = profile;
    try { localStorage.setItem(MANUAL_GAME_PROFILE_KEY, profile); } catch (_) {}

    // 換遊戲組時清掉上一款的盤面自適應暫存狀態，避免名稱/權重混用。
    probe.signalHistory = [];
    probe.signalArmed = true;
    probe.signalTriggered = false;
    probe.signalScore = 0;
    probe.signalReason = '已切換圖示組，下一局重新分析';
    probe.autoStopStatus = '';
    probe.autoStopRetryToken += 1;
    probe.autoStopRetryUntil = 0;
    probe.autoStopAttempts = 0;
    probe.learnedStopButtonRef = null;

    try {
      window.__XIANYAO_ATG_GAME_PROFILE_HINT__ = profile;
      window.__XIANYAO_ATG_GAME_PROFILE_PAYLOAD_HINT__ = '';
      window.__XIANYAO_ATG_MANUAL_GAME_PROFILE__ = profile;
    } catch (_) {}

    render();
  }

  probe.gameProfile = loadManualGameProfile();

  // test140：全房分析選擇遊戲後，盤面監測立即切到同一款；只切圖示/分析資料，不碰掃描。
  try {
    window.addEventListener('xinyao:game-module-changed', event => {
      const profile = String(event?.detail?.profile || '');
      if (!validManualGameProfile(profile)) return;
      if (probe.gameProfile !== profile) setManualGameProfile(profile);
    });
  } catch (_) {}

  const SIGNAL_THRESHOLD = 80;
  const SIGNAL_REARM_THRESHOLD = 60;
  const SIGNAL_AUTOSTOP_KEY = 'xinyao_atg_signal_autostop_v1';
  probe.autoStopEnabled = true;
  try { localStorage.setItem(SIGNAL_AUTOSTOP_KEY, '1'); } catch (_) {}

  // test87：每個房間各自保留最近 50 局盤面；累積滿 30 局後開始自適應。
  // 這不是 ATG 官方機率，而是讓同一套盤面評分會依「該房近期實際分布」自動校正。
  const ADAPTIVE_BOARD_KEY = 'xinyao_atg_board_adaptive_v1';
  const ADAPTIVE_MIN_SAMPLES = 60;
  const ADAPTIVE_MAX_SAMPLES = 200;

  function loadAdaptiveBoardStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(ADAPTIVE_BOARD_KEY) || 'null');
      if (raw && typeof raw === 'object' && raw.rooms && typeof raw.rooms === 'object') {
        return raw;
      }
    } catch (_) {}
    return { version:1, rooms:{}, updatedAt:0 };
  }

  const adaptiveBoardStore = loadAdaptiveBoardStore();

  function adaptiveRoomKey(roomNumber = probe.roomNumber) {
    const n = Number(roomNumber);
    if (!Number.isFinite(n) || n <= 0) return '';
    const game = String(probe.gameProfile || 'seth');
    return `${game}:room:${Math.trunc(n)}`;
  }

  function adaptiveRoomHistory(roomNumber = probe.roomNumber) {
    const key = adaptiveRoomKey(roomNumber);
    if (!key) return [];
    const list = adaptiveBoardStore.rooms?.[key];
    return Array.isArray(list) ? list.slice(-ADAPTIVE_MAX_SAMPLES) : [];
  }

  function saveAdaptiveBoardStore() {
    try {
      const keys = Object.keys(adaptiveBoardStore.rooms || {});
      // 控制 localStorage 大小：最多保留最近有更新的 24 個房間。
      if (keys.length > 24) {
        keys
          .sort((a,b) => {
            const aa = adaptiveBoardStore.rooms[a] || [];
            const bb = adaptiveBoardStore.rooms[b] || [];
            return Number(bb.at?.(-1)?.at || 0) - Number(aa.at?.(-1)?.at || 0);
          })
          .slice(24)
          .forEach(key => delete adaptiveBoardStore.rooms[key]);
      }
      adaptiveBoardStore.updatedAt = Date.now();
      localStorage.setItem(ADAPTIVE_BOARD_KEY, JSON.stringify(adaptiveBoardStore));
    } catch (_) {}
  }

  function boardFeatureSnapshot(candidate) {
    const eye = candidateCount(candidate, '1');
    const snake = candidateCount(candidate, '2');
    const bow = candidateCount(candidate, '3');
    const axe = candidateCount(candidate, '4');
    const yellow = candidateCount(candidate, '5');
    const red = candidateCount(candidate, '6');
    const purple = candidateCount(candidate, '7');
    const blue = candidateCount(candidate, '8');
    const green = candidateCount(candidate, '9');
    const scatter = candidateCount(candidate, '15') + candidateCount(candidate, '16');
    const premium = eye + snake + bow + axe;
    const gemCounts = [yellow, red, purple, blue, green];
    const gemTotal = gemCounts.reduce((a,b) => a+b, 0);
    const maxGem = Math.max(0, ...gemCounts);
    const strongGemKinds = gemCounts.filter(v => v >= 3).length;
    return {
      eye, snake, bow, axe,
      yellow, red, purple, blue, green,
      scatter, premium, gemTotal, maxGem, strongGemKinds
    };
  }

  function boardPatternProfile(candidate) {
    const features = boardFeatureSnapshot(candidate);
    const {
      eye, snake, bow, axe, scatter, premium,
      gemTotal, maxGem, strongGemKinds
    } = features;

    const kindCounts = [
      { key:'eye', label:symbolLabel('1'), value:eye },
      { key:'snake', label:symbolLabel('2'), value:snake },
      { key:'bow', label:symbolLabel('3'), value:bow },
      { key:'axe', label:symbolLabel('4'), value:axe }
    ];

    const activeKinds = kindCounts.filter(item => item.value >= 2);
    const strongKinds = kindCounts.filter(item => item.value >= 4);
    const dominant = [...kindCounts].sort((a,b) => b.value - a.value)[0] || { key:'none', value:0 };

    const distinctKinds = activeKinds.length;
    const strongKindCount = strongKinds.length;

    let patternTag = '普通型';
    let patternKey = 'normal';

    if (scatter >= 3 && strongKindCount >= 2) {
      patternTag = 'SCATTER混合型';
      patternKey = 'scatter-mix';
    } else if (strongKindCount >= 3 && scatter === 0) {
      patternTag = '無SCATTER強勢混合型';
      patternKey = 'no-scatter-mix';
    } else if (strongKindCount >= 3) {
      patternTag = '混合多樣型';
      patternKey = 'mixed-strong';
    } else if (gemTotal >= 13 && (maxGem >= 4 || strongGemKinds >= 3)) {
      patternTag = '寶石集中型';
      patternKey = 'gem-heavy';
    } else if (distinctKinds >= 4) {
      patternTag = '平均分散型';
      patternKey = 'balanced';
    } else if (dominant.value >= 6 && distinctKinds <= 2) {
      patternTag = '單一集中型';
      patternKey = `single-${dominant.key}`;
    } else if (scatter >= 3) {
      patternTag = 'SCATTER型';
      patternKey = 'scatter';
    } else if (premium >= 10) {
      patternTag = '高階堆疊型';
      patternKey = 'premium-stack';
    }

    return {
      ...features,
      dominantKey: dominant.key,
      dominantValue: dominant.value,
      distinctKinds,
      strongKindCount,
      patternTag,
      patternKey
    };
  }

  function repeatedPatternPenalty(history, patternKey) {
    const recent = (Array.isArray(history) ? history : []).slice(-12);
    const sameCount = recent.filter(item => String(item?.patternKey || '') === String(patternKey || '')).length;

    if (sameCount >= 6) return 10;
    if (sameCount >= 4) return 6;
    if (sameCount >= 3) return 3;
    return 0;
  }

  function empiricalPercentile(history, field, current) {
    const values = history
      .map(item => Number(item?.[field]))
      .filter(Number.isFinite)
      .sort((a,b) => a-b);
    if (!values.length) return 0.5;

    let below = 0;
    let equal = 0;
    for (const value of values) {
      if (value < current) below += 1;
      else if (value === current) equal += 1;
    }
    return (below + equal * 0.5) / values.length;
  }

  function adaptiveSignalAdjustment(features, history) {
    if (!Array.isArray(history) || history.length < ADAPTIVE_MIN_SAMPLES) {
      return { adjustment:0, samples:history?.length || 0, adaptiveScore:null, trend:0 };
    }

    const pScatter = empiricalPercentile(history, 'scatter', features.scatter);
    const pPremium = empiricalPercentile(history, 'premium', features.premium);
    const pGemTotal = empiricalPercentile(history, 'gemTotal', features.gemTotal);
    const symbolPcts = [
      empiricalPercentile(history, 'eye', features.eye),
      empiricalPercentile(history, 'snake', features.snake),
      empiricalPercentile(history, 'bow', features.bow),
      empiricalPercentile(history, 'axe', features.axe)
    ];

    const maxSymbolPct = Math.max(...symbolPcts);
    const avgSymbolPct = symbolPcts.reduce((a,b) => a+b, 0) / symbolPcts.length;

    // test87：SCATTER 只佔少部分；高階圖案、寶石分布與該房近期相對稀有度一起決定。
    const adaptivePercentile =
      pScatter * 0.15 +
      pPremium * 0.30 +
      pGemTotal * 0.20 +
      maxSymbolPct * 0.20 +
      avgSymbolPct * 0.15;

    const adaptiveScore = Math.round(adaptivePercentile * 100);

    // 以 50 分為中性，最多約 ±12 分，不讓自適應把原本盤面結構完全蓋掉。
    let adjustment = Math.round((adaptiveScore - 50) * 0.24);

    // 最近 10 局若明顯比該房整個 30～50 局基準偏強/偏弱，再做小幅趨勢修正。
    const strengthOf = item =>
      Number(item?.scatter || 0) * 4 +
      Number(item?.premium || 0) * 2 +
      Number(item?.gemTotal || 0) * 1.2 +
      Math.max(
        Number(item?.eye || 0),
        Number(item?.snake || 0),
        Number(item?.bow || 0),
        Number(item?.axe || 0)
      );

    const allStrength = history.map(strengthOf);
    const recentStrength = history.slice(-10).map(strengthOf);
    const mean = arr => arr.length ? arr.reduce((a,b) => a+b,0) / arr.length : 0;
    const fullMean = mean(allStrength);
    const recentMean = mean(recentStrength);
    let trend = 0;
    if (recentStrength.length >= 8) {
      if (recentMean >= fullMean + 3) trend = 3;
      else if (recentMean <= fullMean - 3) trend = -3;
    }

    adjustment += trend;
    adjustment = Math.max(-8, Math.min(8, adjustment));

    return {
      adjustment,
      samples:history.length,
      adaptiveScore,
      trend
    };
  }

  function recordAdaptiveBoard(candidate, signal) {
    const key = adaptiveRoomKey();
    if (!key || !candidate) return;

    const profile = boardPatternProfile(candidate);
    const list = Array.isArray(adaptiveBoardStore.rooms[key])
      ? adaptiveBoardStore.rooms[key]
      : [];

    list.push({
      eye:profile.eye,
      snake:profile.snake,
      bow:profile.bow,
      axe:profile.axe,
      scatter:profile.scatter,
      premium:profile.premium,
      gemTotal:profile.gemTotal,
      maxGem:profile.maxGem,
      strongGemKinds:profile.strongGemKinds,
      patternKey:profile.patternKey,
      patternTag:profile.patternTag,
      score:Number(signal?.score) || 0,
      rawBase:Number(signal?.rawBase) || 0,
      at:Date.now()
    });

    adaptiveBoardStore.rooms[key] = list.slice(-ADAPTIVE_MAX_SAMPLES);
    saveAdaptiveBoardStore();
  }

  const STOP_LEARN_KEY = 'xinyao_atg_stop_learn_v2';
  try {
    const saved = JSON.parse(localStorage.getItem(STOP_LEARN_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      probe.stopLearnInfo = saved;
      probe.stopLearned = true;
    }
  } catch (_) {}

  const POSITIVE_PATH_RE = /(symbol|symbols|reel|reels|grid|matrix|board|screen|layout|cell|cells|tile|tiles|icon|icons|strip|view|result)/i;
  const STRONG_PATH_RE = /(symbol|symbols|reel|reels|grid|matrix|board|screen|layout|cell|cells|tile|tiles)/i;
  const NEGATIVE_PATH_RE = /(win|winning|pay|payout|stake|balance|amount|credit|bet|multiplier|award|reward|line|ways|cluster|position|coordinate)/i;
  const SYMBOL_FIELD_RE = /^(symbolid|symbol_id|symbol|iconid|icon_id|icon|code|name|type|tileid|tile_id|tile)$/i;
  const IGNORE_STRING_RE = /^(true|false|null|undefined|normal|base|default|main)$/i;

  const TIGER_GAME_RE = /(虎小妹|tiger[\s_\-]*(?:girl|sister)|tigergirl|hu[\s_\-]*xiao[\s_\-]*mei|xiaohu|tiger[_\-]?slot)/i;
  const SETH_GAME_RE = /(戰神賽特|战神赛特|storm[\s_\-]*of[\s_\-]*seth|seth2|seth[\s_\-]*2|seth|awaken|覺醒之力|觉醒之力)/i;

  const SELECTED_GAME_PROFILE_KEY = 'xinyao_atg_selected_game_profile_v2';
  const SELECTED_GAME_PROFILE_TTL = 6 * 60 * 60 * 1000;
  const GAME_SELECTION_TRACKED_WINDOWS = new WeakSet();

  function profileFromSelectionText(value) {
    const s = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (/(虎小妹|tigergirl|tiger\s*(?:girl|sister)|tiger[_-]?slot)/i.test(s)) return 'tiger';
    if (/(戰神賽特|战神赛特|賽特2|赛特2|seth\s*2|seth2|storm\s*of\s*seth|覺醒之力|觉醒之力)/i.test(s)) return 'seth';
    return '';
  }

  function rememberSelectedGameProfile(profile, source = 'selection') {
    if (profile !== 'tiger' && profile !== 'seth') return '';
    const payload = { profile, source:String(source || ''), at:Date.now() };
    try { localStorage.setItem(SELECTED_GAME_PROFILE_KEY, JSON.stringify(payload)); } catch (_) {}
    try {
      window.__XIANYAO_ATG_SELECTED_GAME_PROFILE__ = payload;
      window.__XIANYAO_ATG_GAME_PROFILE_HINT__ = profile;
      window.__XIANYAO_ATG_GAME_PROFILE_PAYLOAD_HINT__ = '';
    } catch (_) {}
    return profile;
  }

  function recentSelectedGameProfile() {
    let payload = null;
    try { payload = window.__XIANYAO_ATG_SELECTED_GAME_PROFILE__ || null; } catch (_) {}
    if (!payload) {
      try { payload = JSON.parse(localStorage.getItem(SELECTED_GAME_PROFILE_KEY) || 'null'); } catch (_) {}
    }
    if (!payload || (payload.profile !== 'tiger' && payload.profile !== 'seth')) return '';
    const age = Date.now() - Number(payload.at || 0);
    if (!Number.isFinite(age) || age < 0 || age > SELECTED_GAME_PROFILE_TTL) return '';
    return payload.profile;
  }

  function selectionTextFromEvent(event) {
    const chunks = [];
    try {
      const path = typeof event?.composedPath === 'function'
        ? event.composedPath()
        : [event?.target].filter(Boolean);

      for (const node of path.slice(0,10)) {
        if (!node || typeof node !== 'object') continue;
        const values = [
          node.textContent,
          node.innerText,
          node.getAttribute?.('aria-label'),
          node.getAttribute?.('title'),
          node.getAttribute?.('alt'),
          node.getAttribute?.('href'),
          node.getAttribute?.('src'),
          node.id,
          typeof node.className === 'string' ? node.className : ''
        ];
        for (const value of values) {
          if (typeof value === 'string' && value.length <= 1200) chunks.push(value);
        }
        try {
          if (node.dataset) {
            for (const [k,v] of Object.entries(node.dataset)) {
              if (typeof v === 'string' && v.length <= 600) chunks.push(k + ':' + v);
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
    return chunks.join(' | ');
  }

  function handleGameSelectionEvent(event) {
    const profile = profileFromSelectionText(selectionTextFromEvent(event));
    if (profile) rememberSelectedGameProfile(profile, 'ui-click');
  }

  function installGameSelectionTracking() {
    for (const gameWindow of sameOriginSignalWindows()) {
      try {
        if (GAME_SELECTION_TRACKED_WINDOWS.has(gameWindow)) continue;
        GAME_SELECTION_TRACKED_WINDOWS.add(gameWindow);
        gameWindow.document?.addEventListener?.('pointerdown', handleGameSelectionEvent, true);
        gameWindow.document?.addEventListener?.('click', handleGameSelectionEvent, true);

        const direct = profileFromSelectionText([
          gameWindow.location?.href || '',
          gameWindow.document?.title || ''
        ].join(' | '));
        if (direct) rememberSelectedGameProfile(direct, 'url-title');
      } catch (_) {}
    }
  }

  function detectCanvasThemeProfile() {
    // test97：直接讀目前正在顯示的遊戲 Canvas。
    // 虎小妹左側角色區域偏粉紅/橘色；賽特2左側埃及場景偏深藍/靛藍。
    // 這個判斷不讀舊封包、resource cache 或上一款遊戲名稱。
    try {
      for (const gameWindow of sameOriginSignalWindows()) {
        const canvases = [...(gameWindow.document?.querySelectorAll?.('canvas') || [])]
          .filter(canvas => {
            try {
              const rect = canvas.getBoundingClientRect();
              return rect.width >= 260 && rect.height >= 300;
            } catch (_) {
              return false;
            }
          })
          .sort((a,b) => {
            const aa=(a.width||0)*(a.height||0);
            const bb=(b.width||0)*(b.height||0);
            return bb-aa;
          });

        for (const canvas of canvases.slice(0,3)) {
          try {
            const sw = canvas.width || 0;
            const sh = canvas.height || 0;
            if (sw < 260 || sh < 300) continue;

            // 避開正中央盤面，主要取左側角色/主題區。
            const sx = Math.floor(sw * 0.04);
            const sy = Math.floor(sh * 0.12);
            const sWidth = Math.max(32, Math.floor(sw * 0.28));
            const sHeight = Math.max(64, Math.floor(sh * 0.62));

            const sample = gameWindow.document.createElement('canvas');
            sample.width = 48;
            sample.height = 72;
            const ctx = sample.getContext('2d', { willReadFrequently:true });
            if (!ctx) continue;

            ctx.clearRect(0,0,sample.width,sample.height);
            ctx.drawImage(
              canvas,
              sx, sy, Math.min(sWidth, sw-sx), Math.min(sHeight, sh-sy),
              0, 0, sample.width, sample.height
            );

            const data = ctx.getImageData(0,0,sample.width,sample.height).data;
            let usable=0, pink=0, orange=0, darkBlue=0, cyan=0;

            for (let i=0; i<data.length; i+=4) {
              const r=data[i], g=data[i+1], b=data[i+2], a=data[i+3];
              if (a < 40) continue;
              // 忽略近黑和近白 UI 線條。
              if (r+g+b < 70 || (r>235 && g>235 && b>235)) continue;
              usable += 1;

              if (r>145 && r>g*1.28 && b>55 && r>b*1.03) pink += 1;
              if (r>145 && g>65 && g<185 && b<105 && r>g*1.12) orange += 1;
              if (b>65 && b>r*1.23 && g>r*0.68 && r<135) darkBlue += 1;
              if (b>105 && g>75 && b>r*1.12) cyan += 1;
            }

            if (usable < 500) continue;

            const warmRatio = (pink + orange) / usable;
            const darkBlueRatio = darkBlue / usable;
            const cyanRatio = cyan / usable;

            // 以使用者實測畫面校正：
            // 賽特2左側深藍明顯高；虎小妹粉紅/橘色角色區明顯高。
            let chosen='';
            if (
              darkBlueRatio >= 0.125 &&
              darkBlueRatio >= warmRatio * 1.18
            ) {
              chosen='seth';
            } else if (
              warmRatio >= 0.115 &&
              warmRatio >= darkBlueRatio * 1.18
            ) {
              chosen='tiger';
            } else if (
              warmRatio >= 0.095 &&
              cyanRatio >= 0.075 &&
              darkBlueRatio < 0.11
            ) {
              chosen='tiger';
            }

            try {
              window.__XIANYAO_ATG_CANVAS_PROFILE_DEBUG__ = {
                chosen,
                warmRatio:Math.round(warmRatio*1000)/1000,
                darkBlueRatio:Math.round(darkBlueRatio*1000)/1000,
                cyanRatio:Math.round(cyanRatio*1000)/1000,
                usable,
                at:Date.now()
              };
            } catch (_) {}

            if (chosen) return chosen;
          } catch (_) {
            // WebGL/cross-origin canvas may be unreadable; fall through to text/resource detection.
          }
        }
      }
    } catch (_) {}
    return '';
  }

  function detectLiveSceneProfile() {
    let tiger = 0;
    let seth = 0;

    const TIGER_LIVE_RE = /(虎小妹|虎盾|啤酒|錢袋|钱袋|tiger.?girl|tiger.?sister|tigergirl|tiger.?shield|beer.?mug|beer|money.?bag|coin.?bag|paw.?shield|paw.?mug)/i;
    const SETH_LIVE_RE = /(戰神賽特|战神赛特|seth.?2|storm.?of.?seth|eye.?of.?horus|horus|cobra|snake|serpent|bow|arrow|archer|pharaoh|egypt|ankh|scarab|弓箭|眼睛|蛇)/i;

    const score = (value, weight = 1) => {
      const s = String(value ?? '');
      if (!s || s.length > 16000) return;
      if (TIGER_LIVE_RE.test(s)) tiger += weight;
      if (SETH_LIVE_RE.test(s)) seth += weight;
    };

    for (const gameWindow of sameOriginSignalWindows()) {
      // Current URL/title/body are stronger than payload/engine hints.
      try { score(gameWindow.location?.href || '', 10); } catch (_) {}
      try { score(gameWindow.document?.title || '', 10); } catch (_) {}
      try { score(String(gameWindow.document?.body?.innerText || '').slice(0,12000), 8); } catch (_) {}

      // Only recent resources: old game resources can remain cached after switching.
      try {
        const resources = gameWindow.performance?.getEntriesByType?.('resource') || [];
        for (const entry of resources.slice(Math.max(0, resources.length - 180))) {
          score(entry?.name || '', 2);
        }
      } catch (_) {}

      // Cocos node/sprite names are the strongest current-game signature.
      try {
        const cocos = gameWindow?.cc || gameWindow?.legacyCC || gameWindow?._cc;
        const scene = cocos?.director?.getScene?.();
        const Component = cocos?.Component;
        if (scene && Component && typeof scene.getComponentsInChildren === 'function') {
          const components = scene.getComponentsInChildren(Component) || [];
          for (let i = 0; i < components.length && i < 3200; i += 1) {
            const component = components[i];
            const node = component?.node;
            const bits = [
              node?.name,
              component?.constructor?.name,
              component?.__classname__,
              component?.string,
              component?._string,
              component?.text,
              component?._text,
              component?.label?.string,
              component?.spriteFrame?.name,
              component?.spriteFrame?._name,
              component?._spriteFrame?.name,
              component?._spriteFrame?._name
            ].filter(Boolean).join(' ');
            score(bits, 3);
          }
        }
      } catch (_) {}
    }

    if (tiger >= 6 && tiger >= seth + 3) return 'tiger';
    if (seth >= 6 && seth >= tiger + 3) return 'seth';
    return '';
  }

  function resolveGameProfileForSpin(detail = {}) {
    // test98：最優先採用使用者「實際點選遊戲」的結果。
    // 這個來源不受上一款遊戲共用引擎/快取污染。
    const selected = recentSelectedGameProfile();
    if (selected) return selected;

    const canvasProfile = detectCanvasThemeProfile();
    if (canvasProfile) return canvasProfile;

    const live = detectLiveSceneProfile();
    if (live) return live;

    const detected = detectBoardGameProfile(detail?.gameProfileHint || '');
    if (detected === 'tiger' || detected === 'seth') return detected;

    return probe.gameProfile || 'tiger';
  }

  function detectBoardGameProfile(explicitHint = '') {
    const direct = String(explicitHint || '').toLowerCase();

    // 手動覆寫仍保留最高優先，方便之後除錯；正常會員不需要操作。
    try {
      const forced = String(window.__XIANYAO_ATG_GAME_PROFILE_OVERRIDE__ || '').toLowerCase();
      if (forced === 'tiger' || forced === 'seth') return forced;
    } catch (_) {}

    let tigerScore = 0;
    let sethScore = 0;
    let tigerStrong = 0;
    let sethStrong = 0;

    const TIGER_THEME_RE = /(虎盾|虎小妹|虎妹|啤酒|錢袋|钱袋|tiger|tigergirl|tiger.?girl|tiger.?sister|beer|ale|money.?bag|coin.?bag|tiger.?shield|cat.?girl)/i;
    const SETH_THEME_RE = /(戰神賽特|战神赛特|賽特|赛特|seth|storm.?of.?seth|覺醒之力|觉醒之力|pharaoh|egypt|ankh|cobra|弓箭|眼睛|蛇)/i;

    const addText = (value, weight = 1, strong = false, allowTheme = false) => {
      const s = String(value ?? '');
      if (!s || s.length > 12000) return;

      const tigerExact = TIGER_GAME_RE.test(s);
      const sethExact = SETH_GAME_RE.test(s);

      if (tigerExact) {
        tigerScore += weight;
        if (strong) tigerStrong += weight;
      }
      if (sethExact) {
        sethScore += weight;
        if (strong) sethStrong += weight;
      }

      if (allowTheme) {
        if (!tigerExact && TIGER_THEME_RE.test(s)) tigerScore += Math.max(1, weight * 0.45);
        if (!sethExact && SETH_THEME_RE.test(s)) sethScore += Math.max(1, weight * 0.35);
      }
    };

    // test88：封包提示只算低權重，避免虎小妹沿用 Seth 共用引擎名稱時被直接判成賽特。
    if (direct === 'tiger') tigerScore += 4;
    else if (direct === 'seth') sethScore += 4;

    try {
      const payloadHint = String(window.__XIANYAO_ATG_GAME_PROFILE_PAYLOAD_HINT__ || '').toLowerCase();
      if (payloadHint === 'tiger') tigerScore += 2;
      else if (payloadHint === 'seth') sethScore += 2;
    } catch (_) {}

    let sharedHint = '';
    try {
      sharedHint = String(window.__XIANYAO_ATG_GAME_PROFILE_HINT__ || '').toLowerCase();
      if (sharedHint === 'tiger') tigerScore += 1;
      else if (sharedHint === 'seth') sethScore += 1;
    } catch (_) {}

    for (const gameWindow of sameOriginSignalWindows()) {
      try { addText(gameWindow.location?.href || '', 28, true, true); } catch (_) {}
      try { addText(gameWindow.document?.title || '', 24, true, true); } catch (_) {}

      // 目前遊戲選擇常被平台放在 local/sessionStorage，這比舊 bundle 名稱可靠。
      for (const storage of [safe(() => gameWindow.localStorage, null), safe(() => gameWindow.sessionStorage, null)]) {
        if (!storage) continue;
        try {
          const limit = Math.min(storage.length, 240);
          for (let i = 0; i < limit; i += 1) {
            const key = String(storage.key(i) || '');
            const value = String(storage.getItem(key) || '');
            const important = /(game|current|selected|select|product|title|name|slug|theme|vendor|provider|slot|machine|hall)/i.test(key);
            addText(key + ' ' + value, important ? 18 : 3, important, true);
          }
        } catch (_) {}
      }

      // 只看最近載入的資源，避免上一款遊戲留在 performance cache 裡把判斷拉回賽特。
      try {
        const resources = gameWindow.performance?.getEntriesByType?.('resource') || [];
        const recent = resources.slice(Math.max(0, resources.length - 360));
        for (const entry of recent) {
          const name = String(entry?.name || '');
          if (name) addText(name, 5, false, true);
        }
      } catch (_) {}

      try {
        const attrs = [...gameWindow.document.querySelectorAll(
          'iframe[src],script[src],img[src],link[href],source[src],video[src],audio[src]'
        )].slice(-500);
        for (const el of attrs) {
          const value = String(el.src || el.href || el.getAttribute?.('src') || el.getAttribute?.('href') || '');
          if (value) addText(value, 4, false, true);
        }
      } catch (_) {}

      // DOM 若有遊戲名稱/選單標記，優先級很高。
      try {
        const bodyText = String(gameWindow.document?.body?.innerText || '');
        if (bodyText) addText(bodyText.slice(0, 14000), 14, true, true);
      } catch (_) {}

      // 部分 ATG 頁面會把目前遊戲資訊放在全域變數。
      try {
        const keys = Object.keys(gameWindow).filter(key =>
          /(game|current|selected|product|title|slug|theme|slot|machine)/i.test(key)
        ).slice(0, 260);
        for (const key of keys) {
          let value;
          try { value = gameWindow[key]; } catch (_) { continue; }
          if (typeof value === 'string' || typeof value === 'number') {
            addText(key + ' ' + value, 16, true, true);
          } else if (value && typeof value === 'object') {
            for (const sub of ['name','title','game','gameName','gameTitle','slug','code','id','product','theme']) {
              try {
                const v = value[sub];
                if (typeof v === 'string' || typeof v === 'number') {
                  addText(key + ' ' + sub + ' ' + v, 12, true, true);
                }
              } catch (_) {}
            }
          }
        }
      } catch (_) {}

      // Canvas/Cocos 遊戲的可見文字與目前 Sprite 名稱通常最接近「正在玩的這款」。
      try {
        const cocos = gameWindow?.cc || gameWindow?.legacyCC || gameWindow?._cc;
        const scene = cocos?.director?.getScene?.();
        const Component = cocos?.Component;
        if (scene && Component && typeof scene.getComponentsInChildren === 'function') {
          const components = scene.getComponentsInChildren(Component) || [];
          for (let i = 0; i < components.length && i < 2600; i += 1) {
            const component = components[i];
            const node = component?.node;
            const bits = [
              node?.name,
              component?.constructor?.name,
              component?.__classname__,
              component?.string,
              component?._string,
              component?.text,
              component?._text,
              component?.label?.string,
              component?.spriteFrame?.name,
              component?.spriteFrame?._name,
              component?._spriteFrame?.name,
              component?._spriteFrame?._name
            ].filter(Boolean).join(' ');
            if (bits) addText(bits, 9, true, true);
          }
        }
      } catch (_) {}
    }

    let chosen = '';
    // 只要目前畫面有明確虎小妹強訊號，就壓過封包裡殘留的 Seth 共用引擎字樣。
    if (tigerStrong >= 9 && tigerStrong > sethStrong) chosen = 'tiger';
    else if (sethStrong >= 9 && sethStrong > tigerStrong) chosen = 'seth';
    else if (tigerScore >= sethScore + 8) chosen = 'tiger';
    else if (sethScore >= tigerScore + 8) chosen = 'seth';
    else if (probe.gameProfile === 'tiger' && tigerScore > 0) chosen = 'tiger';
    else if (probe.gameProfile === 'seth' && sethScore > tigerScore + 3) chosen = 'seth';
    else if (direct === 'tiger' || direct === 'seth') chosen = direct;
    else if (sharedHint === 'tiger' || sharedHint === 'seth') chosen = sharedHint;
    else chosen = probe.gameProfile || 'seth';

    try {
      window.__XIANYAO_ATG_GAME_PROFILE_HINT__ = chosen;
      window.__XIANYAO_ATG_GAME_PROFILE_DEBUG__ = {
        chosen,
        direct,
        tigerScore: Math.round(tigerScore * 10) / 10,
        sethScore: Math.round(sethScore * 10) / 10,
        tigerStrong: Math.round(tigerStrong * 10) / 10,
        sethStrong: Math.round(sethStrong * 10) / 10,
        at: Date.now()
      };
    } catch (_) {}

    return chosen;
  }

  function gameProfileName(profile = probe.gameProfile) {
    const selected = GAME_PROFILE_OPTIONS.find(item => item.id === String(profile || ''));
    return selected ? selected.label : '未知遊戲';
  }

  // 各遊戲符號表：相同 ID 在不同 ATG 遊戲可能代表不同圖案，所以不能共用名稱。
  const SETH_SYMBOL_LABELS = new Map([
    ['1', '眼睛'],
    ['2', '蛇'],
    ['3', '弓箭'],
    ['4', '戰斧'],
    ['5', '黃寶石'],
    ['6', '紅寶石'],
    ['7', '紫寶石'],
    ['8', '藍寶石'],
    ['9', '綠寶石'],
    ['10', '倍率球'],
    ['12', '倍數球'],
    ['13', '倍率符號'],
    ['15', 'SCATTER'],
    ['16', 'SCATTER']
  ]);

  // 虎小妹：依使用者 2026-10-22 實際 6×5 盤面與右側 ID 計數對照。
  // 5～9 仍是寶石；1～4 改為虎小妹高階圖案。
  const TIGER_SYMBOL_LABELS = new Map([
    ['1', '戰斧'],
    ['2', '虎盾'],
    ['3', '啤酒'],
    ['4', '錢袋'],
    ['5', '黃寶石'],
    ['6', '紅寶石'],
    ['7', '紫寶石'],
    ['8', '藍寶石'],
    ['9', '綠寶石'],
    ['15', 'SCATTER'],
    ['16', 'SCATTER']
  ]);

  const BAPHOMET_SYMBOL_LABELS = new Map([
    ['1','WILD'], ['2','紅色惡魔'], ['3','紅髮女王'],
    ['4','紫色三頭狼'], ['5','藍焰骷髏'], ['6','A'],
    ['7','K'], ['8','Q'], ['9','SCATTER']
  ]);
  const BAPHOMET_SYMBOL_FALLBACK = new Map([
    ['1','🐏'], ['2','😈'], ['3','👑'], ['4','🐺'], ['5','💀'],
    ['6','A'], ['7','K'], ['8','Q'], ['9','🔥']
  ]);

  const VAMPIRE_SYMBOL_LABELS = new Map([
    ['2','黑髮男'], ['3','金髮男'], ['4','女孩'],
    ['5','藥水'], ['6','聖經'], ['7','子彈'], ['8','木槌'], ['9','Scatter'], ['1','Wild']
  ]); // 以惡魔血域實機盤面 2026-10-29 符號出現次數核對；其他 ID 不亂配
  const WUXIA_SYMBOL_LABELS = new Map([
    ['1','Wild'],['2','女主'],['3','男主'],['4','葫蘆'],['5','玉佩'],
    ['6','元寶'],['7','藍色荷包'],['8','A'],['9','K'],['10','Q'],
    ['11','J'],['12','10'],['13','Jackpot'],['14','Scatter']
  ]); // 依使用者提供多張盤面與 ID 計數初步配對，待實機核對。
  function activeSymbolLabels() {
    if (probe.gameProfile === 'scarlet') return new Map();
    if (probe.gameProfile === 'wuxia') return WUXIA_SYMBOL_LABELS;
    if (probe.gameProfile === 'vampire') return VAMPIRE_SYMBOL_LABELS;
    if (probe.gameProfile === 'baphomet') return BAPHOMET_SYMBOL_LABELS;
    return probe.gameProfile === 'tiger' ? TIGER_SYMBOL_LABELS : SETH_SYMBOL_LABELS;
  }

  function symbolLabel(token) {
    const key = String(token ?? '');
    return activeSymbolLabels().get(key) || `ID ${key}`;
  }

  const SETH_SYMBOL_ICON_DATA = new Map([
    ['1', 'data:image/webp;base64,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'],
    ['2', 'data:image/webp;base64,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'],
    ['3', 'data:image/webp;base64,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'],
    ['4', 'data:image/webp;base64,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'],
    ['5', 'data:image/webp;base64,UklGRngDAABXRUJQVlA4IGwDAAAQEgCdASpQAFAAPm00lEakIyIhKlv54IANiWYAt+xQlJ/1+1h1dvLzzmm4bz7kX+33KgtCy/8hzKYaHNLXtNtXhuXM7W6CUkstnNK0ILYmcWF0Nx20d+1yN1bRN+caZ6iz8YewcXh3O2/YRaNp3zE+ht1mih0BxVjr2g2hhZTF/oS03aB4tl/CNV2MjPn1YX5aP3/nCApRe4AA/v/XAL378fwm2Y5vB+pCnkkTAu+vFdJOeq2iP8VAXBjlY8lj/HcPbSarkdEcd6Dn25sdRzhqkcSGXzBkAj3MKatG6OYN9uhWi0rbR0wrGzti5xzEZtbphrp+uRfgDpe4nfvbrvsre4MBvTb3euwEmv1WX6YF09pxCPrByJmk8dxiquvLg8AhJOfwxYjdbkJptvLxQJDROqV6PGufO7uzV8XgUr0evDsGrSjF9fjjTHlXgYTlm/maeYfdi3FjULQUszP7xgZIAMNs1USnjgEvxYkLJqOUrwEX14YuPXXocjCLB12t0o72ks3t506tZQITU+DrgSUXEd3ZFx8eFVGneff2YUO6ONBQnLCFDsBVFQ/EEa9OTcf4nepMWzD1q3KhXAEiQNIDclUXvOoT72oGJsWx5CygB7Je5W4Uiv+2j/MceuGXY5+TqExw1N4ipHZdHx2yNurcfi+ADCQvYOztZvjBWsy0nLl2j9q14Ro497njou7c02y8S+bvSv35Jo/0I9+ij/WJkKE2fWoIouV9Ie4c1+xvZpMkBaTsBoiyEJaOvCGwr/JA7TBefWezl6+qOeA0nYlq3FAxvk/RFvLMHr8lEfhTYg+T86toAun8Tm8YpF8qFivg0W5zBUJb+i2DitJvytGgqqZGvYOusckLnQaPiX4CWqqb0l6+Wz/5VY5wDeeltKj7rXl3eS4+E3GTk3B/evX34dePpn7t1BAVNEHd94KnAPFwJ1vNpZ2bM4/MUhz+Waoxbmwkeo/r7Sab6c+rlbpQk38//8Is1PGUz0vUcuGJG1nTKU6RARPteyB8TcPCcrMooWSKUcU9xxHTUpp2ELOlGGrU9hZv/7jd2AE8DGM8xa0u2LvNRGRCnFvmndI/CBt27PyZADZ2uzGngOO9G5KFVM8CX1TWc+PCQKerJGsUCmqB+Aetbdr5axwAfbC36capfqi9cHfdiYSsKAA='],
    ['6', 'data:image/webp;base64,UklGRkgDAABXRUJQVlA4IDwDAADwEACdASpQAFAAPm02lkckIyIhKln4eIANiWQAy1UkOycJAbOHDt4PMr5xHpA3nfebP23ytvbfkoCvGWXioWve3pWL5erRytEGs/1XH92pY12v8bDX0lsPOyCrFc+kiqSbbbHEom798F2CUglZZfzvu+X0g7fDQk4yKCKIEVq88TYryXnPHMD0MXh0D3ONxmAA/vzFLk6Or3fC+4Ol+ZDnp7OrgCS5lEKYdYvSWo+VXcOT2vGo2pmP13a+RI6hWIzvlB1lVUAv9YRsQ783Bq4MVwWx6ooQYg3lm3fDxomX12Arc/oNuVVUYS+4ifTCTM11/urgmO/fTdq4y5bZM3HmUBTFUdQeJxZjKjfDID9FTDG0A9hvaw0dC1hrQ4G+Hj4iKcpbvbTXS+FnfFU31CNrVBhjX1AvfnDYxmJ6vbDnzVZ1/Rw536Ovm+zp5/7KLQrQR55XdmGNrDEN4c3cmgzF5BfoYw/OMXL/TZYoKE+UlY6U8MLUgYU5h7FvkM7gAnVeQiLO12QZvB6FxlpeVm0YArKobUx/yb98nMeHppr+nPO2HlFcA9RiH78z9Pw/Fdvg1tbnlsVcmpJSVNrmuZ0SX1xqBIs4GIf5ZItEurV4XGkejNflBWwvw6u6OuujXX/zD7vXLKcueyUa3TE5X0k4UXx211hjII0xqeZ1USnN4SMxjs9YDerexGphDZ8rfuO2STZjR6g/+NeENTJy1R7V9/8j2HJMl+3PvqRkssvkbb2/UN0JPpZubYerDNyduAv2v8mYX1ENjUjx3tnCF4/wKHbizUU1x9aGdaCe//x9PC89n1px26EZ3sDri9N0MaOE5YSF9zuXuoUPS/EZAF2XJ7j3K9kZb0nBJAZdwctQMUjZv1Y5toY1BVX6WyVNE4UM/cSUdx1UtDfPxdg5hBt51InZQ69x7+NQNOXeJhYG+zMIBxw2Fr0H4qlIWV5VnWH27buPWgSN5z1ncS/q+m5vyhtbcMpH6oiuxGcKULZAI/M0Dm49QhMBdK0eTkEBk83TQUmInT1iEqYlHk6rxL9krKy6WQ0hhFZdWIqsAoU6yIAis7BbgNxQy9UYwnvne67HWDotneIGiHwAAAA='],
    ['7', 'data:image/webp;base64,UklGRkwDAABXRUJQVlA4IEADAADQEQCdASpQAFAAPm0ukUakIqGhLNmZmIANiWYAcBZV37JvyJxYcW2f0QD9netD9ADyyPZQ/cH9lfaArDu2nLEqpn7JNdbhCXC7iA7u+rmSAg/qFvLKyU5p4XC1vOn5q86DN0jVZn/vy02lMHJxMU7kBHP5jRxSr44Sd4wvJmnYGqevooGs9aphYZ/xIWpeTqDx+mU4FX4IAP778G/9hsSas0X58WGWCVf/JVJE3QrhcrO0orM1i3sHfOAZXd17ZyDiYRbeCtG4CuvvWgfTD6Pf8q29rvmD+Rgq4u6TzeoERfdmUQA9D75i4BZEZzaNrAmPfyeL6GcmbMX6NBInmb2MvDqu2i2ghjD5BxdV/S2sOY0jIVD6sDIGFD+ggGcMyEQPgWBPT5Of622H/mJF5kyKoMbdVJCjIAYdYaDrhzuBwLv5/OJgR/bgK+e2H3BSDI6U1abZjZRHzdJcK1gRgVvvV/QJdvBWnnDf7W0kL+uuzBce9sY/XjvhjCZlkU33w7dKGOsp6l/NFpXY9XzFbws2EQEbzt5AgbdpwmaHQxd3pM3Q190bOSp1MMIkGDQOffBnDkdX5b1pt3fXu5sbK9WmE2gi+afqFIfMLCKa4RgMNO4ib7BthSOL+5Ka7m+F7fZjc9elTw5bvpvL21l3m17VqV6uxDGZz0qVZIhQXJBQEnhON9a4uFdDoUMs+x4D8gVJG+26O0DGArT2bGQQtX/t4tehYse/+Ek784udT4P/zRF7nKcd3EUyVrt++vY0wJu91ABQlg6Gymm0jYLISo5y3VX61n0jMhIMMUB8VPPyA348TEGUPtWIKYlmHgXxbm/Fk8zoSyzpzWFeenWh8ZZbuM02csa+SVNSWWgbub/Ht07+GhJXHCvJ7X2HvyFQ/3sfj84caRiwKdDCdQzasJ1Rq1CbFYkSG9TRVYfrwD0HwyVSa04Tg9FRtTcgqdwzt7mId1O/ypGtPU1aLK+t1trF/zg35GNbZI2OqZhKmvgApZdvpvNzGY24eNZBIa8dJNYtCZE2a78SGUnvXIvCz4byMXvVsZd6IXxL78R7ylRy0688C6E0SLxGJNrqa2FrHeb4vzh6K4COA2h3I9KgAAAA'],
    ['8', 'data:image/webp;base64,UklGRi4DAABXRUJQVlA4ICIDAACwEACdASpQAFAAPm0wk0ekIqGhKPtpWIANiWgAzID5fJcHOeaGl4gHTD5//0G/7P1AP711AHPg+xJ+5noktEEAlK6G11hvLIP7NJ+6RmAygWdUQ2VnbPRSJ60YtH5/0ptFDxc+FOmEkInxi6CdxuE6pu/85xAdGYmlNEZStrzeL5qKcz+kc2l3yekcY+wAAP77aJc/Q9CYJknVh+Ezv3PRVGXpnffNjwWh6ajA8A5vCwXj86AbDqkPXmz7C+OuXBQoXi0wNzTeVFp0ZYNgwJleEVN0sU+YUjOK8NCn2rhiP7FnhOjTajxaP0zlA1OMRcY4W8YGfFbmIpVksC0qz5dVulFvBgip3Cc4eGLvOKZaVisMz9IUaPPVKfPxmE6gLrRzsDLHaoAL5GcNuzOg2z3jGZnuIwn2dfEQtHuv5joc6tHyLEIxg9JZWyUYYdpTkkLksbf71ZSCcvxlUnz2/rflvXyej2f1RCuJaU/R3OlKfT33Bi7HtR//DGeo/FXLzwQi9gHu83N8ltsyvBdmZQOFWDrYXj5JZUWMVkBlY2sDeaehNzxkRW0YXQE8Wzf/6vFKdoclNv9eRw5ZHEh41ukadx/rZ3FcjVfGnyvrtwtS0+HFFtciVWhTsxUCkYC8i1SmtbAiSMLdV8n2hhADnoCUPMnN4m7gNHZUnkPeQ97dj6jwjl9GTY/6cJoNZ5XlsW0cfm2uqyxg5DwRnyI5SGctinF+oqzBpPJtEu24LP+T7v8adAnpUqI1XgfeMtaXf/BPqmdNvpf2r4nFYurArFu+bRdH+tBUOIKOh8n3BvOT8ExQeWa88ubCoROFb3isAvq7RNrOMD6yq+zNS4+3/IaF+A2jrtNA98MPKP5k2FRdeDy7bWQ2fk7R083OtnqC6SG+Wy8tjNTLbZg/JUvNPSrUszhfxiHSJ9/UUAmxqL5G+3sXW9eH/kflTMh3JyvCw50NAnvD/g2IvEptEUDqowMX3ob1CsIUkJQX1mqdfUsOhav3UtqvXDqQFRnw4ccFTImSnRz+GDsjZfoKHLhDhCeyZLmyMepXdUh73QaFH62cqAAA'],
    ['9', 'data:image/webp;base64,UklGRpwCAABXRUJQVlA4IJACAAAwDwCdASpQAFAAPm0ylEgkIqIhJ7gJQIANiWQA1PPG7+TaDcA2zXmA88X0X/6rfFt48IiT0ACINMBnaOYRhvA2k4ooNEz4C+TSgscEm/A2u9kbyxbHKBwZtrj3kPhwBLp/4xFp0FnkdI1YnX1U5YHswVGs+Nww/O5eCBFeraVbr6gAAP767/W12ygSg/4jCn4+Xn0OIalkBgS1rByyoEpNgB+wLarD0LaqclqduHBkFiyqOxxCKuPN/UspB5WmhPW3bdvfxayb+7PaOy25weKWYumQ1f3sn3dXgM/s9hsQw6uXwTLwZNNl6uDlhMYRW35Mr1ZUnwObTG9G4MU/rAqSJEav1wQdNSU4H0TW1iNpOvZ18ouVvhHCzn70ACbZ4UiYMo8e0s68LAarNbzmUAOue7CdHMFIJ8IJnBtpAAXsd8ih1+jYo0B/xDJDhgd2tqTr4Bnw3LTzMxzKOUFc/Py/tK7fxt3RYiotsYUo3NMz8DLZlSfAcghRt2vNW+Bac9KTQNNFXt49NcR2gEbA+ukeZnmEmRtoFcGkIZZDgcpqGrFpDZD10auzo5nRQk0kiiaKXNwCxHYvQOe47E10mGxmb/DDhkOa64KfV/j/KNRxXeRneP4mjHaID8b+gggrDZdHH/Al/QDgfbGrxKSYvXIzcFdpSmJm2wZfeRgeC7RGF6HIBeqtTOt1usxxMynx80a0lHmxZpeCJMzK2bZ2+ZMZU1LtMnT5K/zHUrF4nla5Jvr8GMh1G6pk8fl6l/v7sCt+yu7iraUfV9sYGnM3Jv3Npq/jDXNFnimHquANJhROnLK8H8Y6BwUfxrR+DunvyNP+ZRIo/w65MEmm37bUw9U+b9KGlDEHg+vgAGNqdnAAAA=='],
    ['12', 'data:image/webp;base64,UklGRkoEAABXRUJQVlA4ID4EAABwFACdASpAAEAAPplAmkglpCKhMBn7ALATCWwAnTKEhd/IeYnUP8LvV06eZrzrzpvFP6Zfme88D0Mebt1GfoAdLL+4+JeSTZ8dsc2Lhhpa5pnlFTJWboOh8hJgJuofPZ6wv23jIaZzOtdaHdB5NzamzHE1uuBYNC6cSC3rlEUYySqjxNjgYNewllIsMhj5nrv69wh6cHk2NSOsbpdDz/zHNKYH/0lij3B4FFgAAP75snrx/Bqc64mBxHx3ZcfwEOCh2zw2K5ltGa0ifuolAev7Ebyy/9WKrN4Ubls4Wd8t+vBAIONXHvlSK6s0xm3w2edRKGFK4Z628eL2QKvbecvyIoVS9Bch22FQGQuiqs82H8QMHKrulRCvNBt4cihPEDzKJNYFuHwmVZZkv+Se8RC7SxoWRP5/2m19QbK5MaJTrbbX/0T3E/NfYy4KCmDe0sFa2qu4hX4bveojYbRTAtsF9LBFCXl5BmQOehjcXLFOzVjPYYE/8650K1pRjTRbd6WF016fvbu2W4J1Ts5GxTD/OqKULXIbqhlH9C76ot+sWpj5f9BzrqfWdyc+CORUTvtr3/yU9LDbmHN7W0uX+vnhWuz3WZGJDnuF7fbYFogr8bxvIKwd9TshtJu4ja+4xwUBzSH0Lg7286YMBI+i9I30n3WDWuiOSKCkCX1SlNnXM1Zk8PgcQX7Xxl/GliFAFk8nv1fBFMEv/feeRICPQkHosl8azx/C+swvRNMBAgQbjh7Yi58Tls1QBUi7QDew+xn20aktgN27zd0jL79MigH4ztngNtJMIsxPtDro2Fg3LNzw2lJoS07/Qya5ovhOKZtDSmCf1RenmczENE9y2cqxoumXrSC4I7ZqYJTlbx/H7T1citwPulnL/zRYaPybvgDKELFzMapnC8/wqansOnHC6+JnC4ss1euTubVOMawIrTkbcsdA0WMrHGsUH36ghTsUuBkmNGmx3hjkXKiBJb1MMoEcj2KQClfs6e8dmUAyWMONS1uK2iyS//FzNdUGga01gj+gCrpPqH+Wn7guPa107Lxo1vwWpslz9exqrOtvw55sMME8/IMw29ZVAnlWNcm0FLg4rh1ppPltwCQmihLC/NLLImPs1P9sxdetdGnbTnEm29jw2CcWP5s2RjEIlNsonBrd+OqBcldz2aFr9saS6LsnnwusDSoTwI2BzFxTH/nYQ2yDMZ7f5064+BJ7g3tHsxcriKQ36jPOuS7GVFgPHZ92oOEAWPDKi8zhHbIzDgp04JVH4k2gLV6rGxPVo8dJKx7LAk3otms39fIfz3D3oKr/5idgKFErIhmmNEKY8uqsLk71ThzU80inZpOtEle/xILmVMODV/uMneerWcPHZ5QmUSV3A4+S6HyS61OugXx5zqx3OFy/E3wEMvFdXso9P1/rwIs4ff1mffUKSgFaqqzhfmXbAV/6wNtHIAA='],
    ['15', 'https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/atg-v4-hud/assets/atg-seth/scatter_card_clean.webp'],
    ['16', 'data:image/webp;base64,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'],
    ['13', 'data:image/webp;base64,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']
  ]);

  const TIGER_SYMBOL_ICON_DATA = new Map([
    ['1','data:image/webp;base64,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'],
    ['2','data:image/webp;base64,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'],
    ['3','data:image/webp;base64,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'],
    ['4','data:image/webp;base64,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'],
    ['5','data:image/webp;base64,UklGRowDAABXRUJQVlA4WAoAAAAQAAAALwAALwAAQUxQSFUBAAABkLJtm2or7zffHAWSk6iaNnSL7i6N6u6u2SLdIbs2/oAmd/f5Zl58ZlY7LSImAD2ZTpslHpAGiQdGzYBriigwaNfbL32cNEI8MGjLMyYehjbBA/22vyRDMo6DVhPBwN1PyZDImB6oSi1gwzPSEv80roHWEdf7FhkS/57sywBxVRST+SPxP40noDVEuh9a5H8bZ0MreCxj4P/H9LxLpZziBi2DxkPQYoox0ZibLAyFKyZXmEfjBGghlfGMzE7x3VC4Qg4XGPIi76C0YPC7mErcFinkcYyB+T+4HW2FFPOCFdlWDIqzDCX2VnCjGfOMS+BLQXGOlsU0BK5Cy7KScVgFKM7zx/9Z4q1uJzVapIX4j2T8vroPBBUdjr0imYIl0shbIwFBVYeBC47fJckY+GkD4AWVBUDnuGWXnpFXWnAO9UU9APSdv7QNHg0V9Q4AHJos6gU9kgBWUDggEAIAAPALAJ0BKjAAMAA+lT6bSqWjIiGnOAyQsBKJbADIHQA1GfrvFHvnwANsnuFN4v9ADy0fYj8rFogaVyZx490YBrxopHpTPrVpYqJgfIf6cLGHI8XlnpLjg/J1EcHeICUumkYh8le6ipbgAP78+ELH+N91ZcTgg3/h9mB2v3cfVv6SORUNYNfexWpHUPu7xJrbc/ZLP1brgy9V3fdMWJQfExFqI/da47cYzUj43p62J97rjvzrFwEx2+PTgr4ASZ5PA6DsqLsD5sQVTb8jZsjTTJdIb+1jOiIlaLToY3Iv5LZdARPhlVxteNnOC1dvq9wdnziKlny2Cg1VZZWjhZwjXtbEGbf8gCzuVm2acBD+kNecOEiZdUx2MTfwh9nMF2mtpRMFXDSaruBLBgH8F41V7IprzB3YAXL16EIzhrh0DP703ePLf3pucF8//KFl/anKM8UlVkP4D3BQ7UTEqcSoDlTJ+ZPVs3wA9BFkNgrokDCaQzmitylOZoC18EHkIE+vrBegfXg5+J0Kamg4fsD1sw9EonGuoLOZ1GCj0edoXjaBwJfthRg0rI9nK1BH5VU09dGlCjbVRYUC18PR5On6iXPPo1G4j3Y3luV3H5UNFBdvM6fluM9FyCY4qMwZK++xOq/MSYzI7bY39IiEXDn4VN71Lode6w/z/2sV2MCCbKr3ZNOZpuSNbFq+j1pekgAAAA=='],
    ['6','data:image/webp;base64,UklGRmwDAABXRUJQVlA4WAoAAAAQAAAALwAALwAAQUxQSFoBAAABkGttu2k73z//eWLbto36jNRJaScXYJtdTh90qdw6uQCztG1PfPGcc3Wni4gJQL28qFhTIaP406hUQxTouPXU+tEAVKsA9N3yimQ4Mq8RICqlpPGhQHrvSd7aUwtAyliZyeAjSXpP8szSJpAiiuP+B/8ZfCTPt1ApIGj3OsZ/kfTfuBm2gMV0Ov5/DK/bG8ln9AJ9Ah03w2YzGOgCU2N40QqSy8ouuiQ67obNJZjyljElhvfjYDKJaTnqc0xyPAmDzKqzXobItMWmJheAVXRJ/NIdkknMgLoXIaZ4nhFFZovFzOh/TEM2iN4IPiXycxNINot5TPI8XqPILqbRbedTYi0KwKKOdD7+R4j3G6OkSKe9z0i68Lf4jQdgS/zZYcmJ76R3MQZHvp0sWkYsgGE77/Gvj+Z2gaC0WAVaTj344s3VxT0AgyoaC6B5SwVUUFFRC0ANqiwiqB8GVlA4IOwBAACQCgCdASowADAAPpVEnEslo6Kho4wAsBKJbADIy4T/F7pfhnANsnuAN4v9ADy0fYj8rFogaVyZx490YBrxopHpTPrVpYqJgfIf6cLGHI8XlnpLjg/J1EcHeICUumkYh8le6ipbgAP78+ELH+N91ZcTgg3/h9mB2v3cfVv6SORUNYNfexWpHUPu7xJrbc/ZLP1brgy9V3fdMWJQfExFqI/da47cYzUj43p62J97rjvzrFwEx2+PTgr4ASZ5PA6DsqLsD5sQVTb8jZsjTTJdIb+1jOiIlaLToY3Iv5LZdARPhlVxteNnOC1dvq9wdnziKlny2Cg1VZZWjhZwjXtbEGbf8gCzuVm2acBD+kNecOEiZdUx2MTfwh9nMF2mtpRMFXDSaruBLBgH8F41V7IprzB3YAXL16EIzhrh0DP703ePLf3pucF8//KFl/anKM8UlVkP4D3BQ7UTEqcSoDlTJ+ZPVs3wA9BFkNgrokDCaQzmitylOZoC18EHkIE+vrBegfXg5+J0Kamg4fsD1sw9EonGuoLOZ1GCj0edoXjaBwJfthRg0rI9nK1BH5VU09dGlCjbVRYUC18PR5On6iXPPo1G4j3Y3luV3H5UNFBdvM6fluM9FyCY4qMwZK++xOq/MSYzI7bY39IiEXDn4VN71Lode6w/z/2sV2MCCbKr3ZNOZpuSNbFq+j1pekgAAAA=='],
    ['7','data:image/webp;base64,UklGRjwDAABXRUJQVlA4WAoAAAAQAAAALwAALwAAQUxQSDsBAAABkGttmyIp319/zTqu0eZ45u6h5kQccncntivgCsjd3d0dQnetv+rDq7oziCJiAvAPX1RrJM47AK4eol4BwE0YCamDAkDHkJU775OLoDVA1xELdj0iSTMOg6vK+S3P+WuwSEuXmr1U4zGTZLDI3waug6/G+XMhJP45xWf9RapQjKbxryOvOJVKdjD8HQM3Qss5GfA1poxkX4aLFvNYwcBc41G4UuK6P2XKizdRvIH5DMzjPPhSrrE/WVbix74ihQT9PlnKCmkbPEorltByUvraCVdMVE/QMoyHVVFeZfB7SxnfJqIKeCxn+CuLtyGoVHGS9odk4SsXwlfjZECIJJMFI8kbXZxUA4/F/BoiSb4+uH1yLwgqFm0cJ/nx4Oa5PQBAULnDoEMbZ3QCgHgV1FDwq3ovqKsTrw7/TwIAVlA4INoBAADQCQCdASowADAAPpVEnEslo6Kho4wAsBKJbADHI3L7dfhnE9tRuMN4A3hT90WGCtjQAe3viiMFCmXkqYY4Q1LNa+EutOnAp60RqlJNdjUnAhja/4MhXmAA/vvX//5//ZP/88CiDeAom9oSPf4tll+vv+bcc7HVKSJ7UtrFtjJ3rZIQ4oiWAlPBRE7aGOeRi4VEkW84jn8ba7HE46/ptPE+kS8rm1zBWduKNaTBj58yUHdsR+F8miTk2CzFKXq6j44NrU3wP+pxkDIJftw5zbOFO4lgp1bkBng4B4Yw25RiKoZXT0N43u165vploswrjMmiSAs0gIL/YumxTmulretnoU5wfRA+5uO/Ca0RUpuFVUMFgxGVNEU9FYmugFAHHFE/xOtPVY8uh9Wn434zhcLcXxVVU7fqwuc44cFwm/SCxZSolMiQCyMUBxKvVS6NWcioIVK5RQSIXAq+//8xwvmcwXM/z/iTTjVbFJ935ZLyMGMAd3fOxIJXZ1MCQHVvwZP+6DCCRKBPEGVvG/NcZSpo0A0UbzTXokS513VrHAsV9x82bjubxIDa3UwkA4+zrMIhP0V5j9Mc14/1YtUcwJ693XTgAxfSIcS9yed+d/kXi5cWmJvuxUytQAA='],
    ['8','data:image/webp;base64,UklGRhYDAABXRUJQVlA4WAoAAAAQAAAALwAALwAAQUxQSCMBAAABkKNt27FH9/O8b2wnVSo7mRXMCmx7pscCprVdZxljdLYr23yf97vHH8pUETEBmBSpgPMqxRH83XmVIqjHlju3DqzvEQCQ/BTYzr9emljWVYbcHRp380eMwUjy270WkXw8Om4y8K/RQuRm+Fw82q7zB//T4kPkqph1j4H/bTYNLjun80ljCl5wmpmgPVhg2hh6oVlBsYWWKvAofGai5c8Z0yR8VC+SFRzmJJaGgatRkhkcTtNShWPQ7FT6vljyf4nxFiQ7OGyk/ZclnOjUPMS7B0n8V2L8vhA5O0yl/cPI84MQzQcO+2h/JMbncwCHvEVr3sRIGnmiFaLI32EZIwM/bCqFRyE9LsXIk8MQQTEVIwwbAIfCKpZMgSgKLIBHsb1i8iQAVlA4IMwBAABwCgCdASowADAAPpVEnUqlo6Kho4wAsBKJbADNZYCDAbZjmSfUBvAHoAfrd1jf7jpFtIBq0E0BlBvqPFfCuARewQ9MyQJPHYNorJAb+PtcWkpZAtY+pz5vo54oAAD++29//v///7+n//35XGME3gs4HRddHm89jZ9vGwKV+85ZdxDemJUIW5nxmrxqbf1PTz+tJdYn+7fAsfK5Q8QEI5/xhitq1e9hl7DIrfAS9ULvXYSzHHwFdsj0tkbjt8pC8nOuVVp5zVVR4kDLune0p1ZJungfXfZW69a/XFo4/DrH0TvWbw2wx1TWW5s/8ML7E5ZRd48ukSB7M6w+gr7+P26ZPsLlUv8Ww+F09Q5dfO2ATVL3ojZUyXpg0a33WgIADjF3xNdKeqs71g/NS2Ete9BExnYZlbc20RGXiVqRfWcuLPbEJbQC4hvKg/T3X3Vi11c1eGQnvmztq5NckmX/PeZmLhX64TLC3CpO1jxZJwfDrD4mB6NL7Dek81EJWnT9NKe/PV5HP7zsPyHWtZ4ZxJ0IWfj/iAqrXWc6/0TE+Y6F6OmxvQYQHVNEhTSZ0WoBo450IQgKcf2+jcAtM/nMr4P/K8zQaZ9xXzs0AAAA'],
    ['9','data:image/webp;base64,UklGRtICAABXRUJQVlA4WAoAAAAQAAAALwAALwAAQUxQSEYBAAABkLNtm2k77/fNHMW2bdssjcq2rdYozdLOP7DT2U5Ka61Z88bJTHmqiJgAFJ4UK3EZxK2KohNLQaIxQJ8bXAsbiQK1TpAJ24mJA7nLP13OXMrjiENG3HOTttDRpW1ggqktOWf7gNxBdKTj8QiA2o1bof6bLGPqPFuLCSPoPB4oqHKBjiTf3V4PG0alb3fJxXIm9J/mHv9S+2pNkRCCcqshFiN9mvmnmHWqdNMW0BCwcrKz5GEcU3p/o9mwJViVK2Gw6Azy7QSmpOeXyw1t/5bQEILazwww/Bdm5C3U3QcbAha7j6yYu4WOJL3j0r2rYYKo1uBfJ7wJQViLzfyS/c57nqmkGkil2mfnf+PIzYAgtMF0JiSzjG/7wyjCG9lP51PydA0oYlQp+Zrkw/6AQZwGzZMnC4pDFbEK6pcADCIWwAqiVkHhSVZQOCBmAQAA0AgAnQEqMAAwAD6VRp5LJaOioaOLALASiWwAxamAgwG2g3Cm8m7xBfgD8A5MGqW+e64ipk6Jfc8hV//FZSoGCsK2O4JDWdKTfPjtmV5/YAD+/K0SB32Zc5RE+Qj1LFUGUpBhYCl/tkT+DmFi2QbtWPWNEvQle/2b6Jel7XE9jn//pUzBW22jHEEmn/rhD0lybTEAUj3VA9wcEUXr++ealydHyVyH5G6gPugUNIvVoeTNMQbk5WMQJYzG5wTnxiPg8xViAs6Y6MnymldkqlmZs9/wgLj5ugpMUtLdwZqwWAOqNjPYM8533isNLt/0wMonzBxFzDtnfdi63VjrArNjUveLP/HmMMbB2nXsuPVtM8g7x9EchY7hGMAArCrBv8FHyp2AHn76/bscfijJ8WLfM8SuEg2OMjTOtbjEN3mY3PXQQpPDyEUh+5jOQ3KjuUYyJGBifmaZPrg8So56gf0D4BjPEwAAAA']
  ]);


  const TIGER_CLEAR_ICON_OVERRIDES = new Map([
    // test94：四張曾經糊掉/破圖的素材全部換成新的獨立檔案路徑，避開舊快取。
    ['1', 'https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/atg-v4-hud/assets/atg-tiger-v94/1_axe.webp'],
    ['2', 'https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/atg-v4-hud/assets/atg-tiger-v94/2_shield.webp'],
    ['3', 'https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/atg-v4-hud/assets/atg-tiger-v94/3_beer.webp'],
    ['4', 'https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/atg-v4-hud/assets/atg-tiger-v94/4_bag.webp'],
    ['6', 'https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/atg-v4-hud/assets/atg-tiger/6_red.webp'],
    ['15', 'https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/atg-v4-hud/assets/atg-tiger/15_scatter_red.webp'],
    ['16', 'https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/atg-v4-hud/assets/atg-tiger/16_scatter_blue.webp']
  ]);

  function activeSymbolIconData() {
    return probe.gameProfile === 'tiger' ? TIGER_SYMBOL_ICON_DATA : SETH_SYMBOL_ICON_DATA;
  }

  const BAPHOMET_SPRITE = 'data:image/webp;base64,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';
  function symbolIconHtml(token) {
    const key = String(token ?? '');
    if (probe.gameProfile === 'scarlet') {
      const valid = /^(?:[1-9]|15)$/.test(key);
      if (valid) {
        const file = ({'1':'scarlet_id01_statue.png','2':'scarlet_id02_blue_fan.png','3':'scarlet_id03_green_blade.png','4':'scarlet_id04_wood_token.png','5':'scarlet_id05_yellow_bird.png','6':'scarlet_id06_red_ring.png','7':'scarlet_id07_purple_orb.png','8':'scarlet_id08_blue_c.png','9':'scarlet_id09_green_leaf.png','15':'scarlet_id15_scatter.png'})[key];
        return `<span class="bp-icon-shell" title="赤三國 ID ${esc(key)}"><img class="bp-icon bp-icon-img bp-icon-clean" src="https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/main/assets/${file}" alt="赤三國符號" draggable="false" decoding="async" loading="eager" style="object-fit:contain!important;filter:none!important"></span>`;
      }
      return `<span class="bp-icon bp-unknown" title="赤三國 ID ${esc(key)}">ID ${esc(key)}</span>`;
    }
    if (probe.gameProfile === 'wuxia') {
      // 武俠獨立 PNG，不與賽特系列共用圖示；ID 對應依實機截圖初步核對。
      const wuxiaFiles = {
        '1':'wuxia_wild.png','2':'wuxia_female.png','3':'wuxia_male.png',
        '4':'wuxia_gourd.png','5':'wuxia_jade.png','6':'wuxia_gold_ingots.png',
        '7':'wuxia_blue_pouch.png','8':'wuxia_A.png','9':'wuxia_K.png',
        '10':'wuxia_Q.png','11':'wuxia_J.png','12':'wuxia_10.png',
        '13':'wuxia_jackpot.png','14':'wuxia_scatter.png'
      };
      const file = wuxiaFiles[key];
      if (file) {
        const label = WUXIA_SYMBOL_LABELS.get(key) || `ID ${key}`;
        return `<span class="bp-icon-shell" title="${esc(label)}｜ID ${esc(key)}"><img class="bp-icon bp-icon-img bp-icon-clean" src="https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/main/assets/${file}" alt="${esc(label)}" draggable="false" decoding="async" loading="eager" style="image-rendering:auto!important;filter:none!important;object-fit:contain!important;"></span>`;
      }
      return `<span class="bp-icon bp-unknown" title="武俠符號 ID ${esc(key)}" style="font-size:11px">ID ${esc(key)}</span>`;
    }
    if (probe.gameProfile === 'vampire') {
      // 使用原圖獨立 PNG，避免低解析精靈圖放大模糊。
      const labels = VAMPIRE_SYMBOL_LABELS;
      if (/^(?:[1-9]|10)$/.test(key)) {
        const label = labels.get(key) || (key === '10' ? 'Jackpot' : `ID ${key}`);
        const src = `https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/main/assets/vampire_id${key}.png`;
        return `<span class="bp-icon-shell" title="${esc(label)}｜ID ${esc(key)}"><img class="bp-icon bp-icon-img bp-icon-clean" data-symbol-token="${esc(key)}" src="${src}" alt="${esc(label)}" draggable="false" decoding="async" loading="eager" style="image-rendering:auto!important;filter:none!important;object-fit:contain!important;"></span>`;
      }
      return `<span class="bp-icon bp-unknown" title="惡魔血域符號 ID ${esc(key)}" style="font-size:11px">ID ${esc(key)}</span>`;
    }
    if (probe.gameProfile === 'baphomet') {
      // 古神巴風特：獨立讀取會員上傳的 9 張高清 PNG 原圖，不再裁切小尺寸 sprite。
      const baphometFiles = {
        '1': 'baphomet_wild.png',
        '2': 'baphomet_red_demon.png',
        '3': 'baphomet_red_woman.png',
        '4': 'baphomet_purple_wolf.png',
        '5': 'baphomet_blue_skull.png',
        '6': 'baphomet_letter_A.png',
        '7': 'baphomet_letter_K.png',
        '8': 'baphomet_letter_Q.png',
        '9': 'baphomet_scatter.png'
      };
      const filename = baphometFiles[key];
      const label = BAPHOMET_SYMBOL_LABELS.get(key);
      if (filename && label) {
        const src = 'https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/main/assets/' + filename;
        return `<span class="bp-icon-shell" title="${esc(label)}｜ID ${esc(key)}"><img class="bp-icon bp-icon-img bp-icon-clean" src="${src}" alt="${esc(label)}" draggable="false" decoding="async" loading="eager" style="image-rendering:auto!important;filter:none!important;object-fit:contain!important;"></span>`;
      }
      return '<span class="bp-icon bp-unknown">?</span>';
    }

    // test93：虎小妹清晰圖優先；錢袋、紅寶石、SCATTER 不再用 emoji / ? 替代。
    const clearSrc = probe.gameProfile === 'tiger'
      ? TIGER_CLEAR_ICON_OVERRIDES.get(key)
      : '';
    const src = clearSrc || activeSymbolIconData().get(key);

    if (src) {
      const gemClass = ['5','6','7','8','9'].includes(key) ? ' bp-gem-icon bp-gem-' + key : '';
      return `<span class="bp-icon-shell"><img class="bp-icon bp-icon-img bp-icon-clean${gemClass}" data-symbol-token="${esc(key)}" src="${src}" alt="${esc(symbolLabel(key))}" draggable="false" decoding="sync" loading="eager"></span>`;
    }

    if (key === '10' || key === '13') {
      return `<span class="bp-icon bp-multiplier" aria-label="${esc(symbolLabel(key))}">×</span>`;
    }

    return '<span class="bp-icon bp-unknown">?</span>';
  }

  const CLEAN_ICON_CACHE = new Map();

  function transparentizeIconSource(src, token) {
    const key = String(token ?? '');
    if (!src || ['1','2','3','4','13','15','16'].includes(key)) return Promise.resolve(src);
    if (CLEAN_ICON_CACHE.has(src)) return Promise.resolve(CLEAN_ICON_CACHE.get(src));

    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth || image.width || 64;
          canvas.height = image.naturalHeight || image.height || 64;
          const ctx = canvas.getContext('2d', { willReadFrequently:true });
          if (!ctx) return resolve(src);

          ctx.clearRect(0,0,canvas.width,canvas.height);
          ctx.drawImage(image,0,0,canvas.width,canvas.height);
          const frame = ctx.getImageData(0,0,canvas.width,canvas.height);
          const data = frame.data;
          const w = canvas.width, h = canvas.height;
          const visited = new Uint8Array(w*h);
          const queue = new Int32Array(w*h);
          let head=0, tail=0;

          const sample = [];
          const patch = Math.max(2, Math.min(6, Math.floor(Math.min(w,h)*0.08)));
          const pushPatch=(sx,sy)=>{
            for(let y=sy;y<Math.min(h,sy+patch);y++){
              for(let x=sx;x<Math.min(w,sx+patch);x++){
                const p=(y*w+x)*4;
                sample.push([data[p],data[p+1],data[p+2]]);
              }
            }
          };
          pushPatch(0,0);
          pushPatch(Math.max(0,w-patch),0);
          pushPatch(0,Math.max(0,h-patch));
          pushPatch(Math.max(0,w-patch),Math.max(0,h-patch));

          sample.sort((a,b)=>(a[0]+a[1]+a[2])-(b[0]+b[1]+b[2]));
          const mid=sample[Math.floor(sample.length/2)] || [17,27,42];
          const br=mid[0], bg=mid[1], bb=mid[2];

          const isBackground=(x,y)=>{
            const p=(y*w+x)*4;
            if(data[p+3]===0) return true;
            const r=data[p], g=data[p+1], b=data[p+2];
            const dist=Math.hypot(r-br,g-bg,b-bb);
            const max=Math.max(r,g,b), min=Math.min(r,g,b);
            const dark=max<105;
            const subdued=(max-min)<75 && max<135;
            return dist<78 || (dark && dist<118) || (subdued && dist<95);
          };

          const add=(x,y)=>{
            if(x<0||y<0||x>=w||y>=h) return;
            const idx=y*w+x;
            if(visited[idx]||!isBackground(x,y)) return;
            visited[idx]=1;
            queue[tail++]=idx;
          };

          for(let x=0;x<w;x++){ add(x,0); add(x,h-1); }
          for(let y=0;y<h;y++){ add(0,y); add(w-1,y); }

          while(head<tail){
            const idx=queue[head++];
            const x=idx%w, y=(idx/w)|0;
            const p=idx*4;
            data[p+3]=0;
            add(x-1,y); add(x+1,y); add(x,y-1); add(x,y+1);
          }

          // Feather only the immediate cleaned edge so the symbol does not keep a dark halo.
          for(let y=1;y<h-1;y++){
            for(let x=1;x<w-1;x++){
              const idx=y*w+x, p=idx*4;
              if(data[p+3]===0) continue;
              const nearTransparent =
                data[((y-1)*w+x)*4+3]===0 ||
                data[((y+1)*w+x)*4+3]===0 ||
                data[(y*w+x-1)*4+3]===0 ||
                data[(y*w+x+1)*4+3]===0;
              if(!nearTransparent) continue;
              const r=data[p], g=data[p+1], b=data[p+2];
              const dist=Math.hypot(r-br,g-bg,b-bb);
              if(dist<110) data[p+3]=Math.min(data[p+3], Math.max(0, Math.round((dist-55)/55*255)));
            }
          }

          ctx.putImageData(frame,0,0);
          const cleaned=canvas.toDataURL('image/webp',0.96);
          CLEAN_ICON_CACHE.set(src,cleaned);
          resolve(cleaned);
        } catch (_) {
          resolve(src);
        }
      };
      image.onerror=()=>resolve(src);
      image.src=src;
    });
  }

  function cleanRenderedIconCards(root) {
    if (!root) return;
    if (probe.gameProfile === 'tiger') return;
    const images=[...root.querySelectorAll('img.bp-icon-clean[data-symbol-token]')];
    for (const img of images) {
      const token=String(img.dataset.symbolToken || '');
      if (token === '15' || token === '16') continue;
      const original=img.getAttribute('src') || '';
      transparentizeIconSource(original,token).then(cleaned=>{
        if(cleaned && img.isConnected) img.src=cleaned;
      });
    }
  }

  function safe(fn, fallback = null) {
    try {
      const value = fn();
      return value === undefined ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function normalizeToken(value) {
    if (value === null || value === undefined) return null;

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      return String(value);
    }

    if (typeof value === 'string') {
      const text = value.trim();
      if (!text || text.length > 48 || IGNORE_STRING_RE.test(text)) return null;
      return text;
    }

    return null;
  }

  function tokenFromObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    for (const [key, raw] of Object.entries(value)) {
      if (!SYMBOL_FIELD_RE.test(String(key))) continue;
      const token = normalizeToken(raw);
      if (token !== null) return token;
    }

    return null;
  }

  function flattenSymbolArray(value, out = [], depth = 0) {
    if (!Array.isArray(value) || depth > 5 || out.length > 160) return out;

    for (const item of value) {
      if (Array.isArray(item)) {
        flattenSymbolArray(item, out, depth + 1);
        continue;
      }

      const scalar = normalizeToken(item);
      if (scalar !== null) {
        out.push(scalar);
        continue;
      }

      const objectToken = tokenFromObject(item);
      if (objectToken !== null) out.push(objectToken);
    }

    return out;
  }

  function summarizeTokens(tokens) {
    const counts = new Map();

    for (const token of tokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }

    const items = [...counts.entries()]
      .map(([token, count]) => ({ token, count }))
      .sort((a, b) => b.count - a.count || String(a.token).localeCompare(String(b.token)));

    return {
      total: tokens.length,
      unique: items.length,
      items
    };
  }

  function scoreCandidate(path, summary) {
    if (!summary || summary.total < 6 || summary.total > 120) return -Infinity;
    if (summary.unique < 2 || summary.unique > 40) return -Infinity;

    let score = 0;

    if (POSITIVE_PATH_RE.test(path)) score += 12;
    if (STRONG_PATH_RE.test(path)) score += 16;
    if (NEGATIVE_PATH_RE.test(path)) score -= 18;

    if ([15, 20, 24, 25, 30, 36, 40, 48, 50].includes(summary.total)) score += 18;
    else if (summary.total >= 12 && summary.total <= 60) score += 8;

    if (summary.unique >= 4 && summary.unique <= 18) score += 10;

    const maxCount = summary.items[0]?.count || 0;
    if (maxCount >= 2 && maxCount <= Math.ceil(summary.total * 0.65)) score += 6;

    return score;
  }

  function collectCandidates(root, rootName = 'finalState') {
    const out = [];
    const seen = new WeakSet();

    function visit(value, path, depth) {
      if (!value || typeof value !== 'object' || depth > 9 || seen.has(value)) return;
      seen.add(value);

      if (Array.isArray(value)) {
        const tokens = flattenSymbolArray(value);
        const summary = summarizeTokens(tokens);
        const score = scoreCandidate(path, summary);

        if (Number.isFinite(score)) {
          out.push({
            path,
            score,
            total: summary.total,
            unique: summary.unique,
            items: summary.items.slice(0, 20),
            tokens: tokens.slice(0, 120)
          });
        }

        for (let i = 0; i < Math.min(value.length, 80); i += 1) {
          const child = value[i];
          if (child && typeof child === 'object') visit(child, `${path}[${i}]`, depth + 1);
        }
        return;
      }

      for (const [key, child] of Object.entries(value)) {
        if (!child || typeof child !== 'object') continue;
        visit(child, path ? `${path}.${key}` : String(key), depth + 1);
      }
    }

    visit(root, rootName, 0);

    return out
      .sort((a, b) => b.score - a.score || Math.abs(a.total - 30) - Math.abs(b.total - 30))
      .slice(0, 20);
  }

  function chooseCandidate(finalState, engine) {
    let candidates = collectCandidates(finalState, 'finalState');

    if (!candidates.length || candidates[0].score < 18) {
      const fromEngine = collectCandidates(engine, 'engine');
      candidates = [...candidates, ...fromEngine]
        .sort((a, b) => b.score - a.score || Math.abs(a.total - 30) - Math.abs(b.total - 30))
        .slice(0, 20);
    }

    return {
      best: candidates[0] || null,
      count: candidates.length
    };
  }


  function candidateCount(candidate, token) {
    const key = String(token);
    const item = candidate?.items?.find?.(entry => String(entry?.token) === key);
    return Math.max(0, Number(item?.count) || 0);
  }

  function boardRarityMetric(source) {
    const eye = Number(source?.eye) || 0;
    const snake = Number(source?.snake) || 0;
    const bow = Number(source?.bow) || 0;
    const axe = Number(source?.axe) || 0;
    const scatter = Number(source?.scatter) || 0;
    const counts = [eye, snake, bow, axe].sort((a,b) => b-a);
    const premium = Number.isFinite(Number(source?.premium))
      ? Number(source.premium)
      : eye + snake + bow + axe;
    const strongKinds = counts.filter(v => v >= 4).length;
    const activeKinds = counts.filter(v => v >= 2).length;
    const top = counts[0] || 0;
    const second = counts[1] || 0;

    // 只使用實際盤面圖案統計做一個「結構強度值」。
    // SCATTER 權重刻意很低，避免再次變成只要有 SCATTER 就高分。
    return (
      premium * 2.0 +
      strongKinds * 6.0 +
      activeKinds * 2.0 +
      top * 1.5 +
      second * 1.0 +
      Math.min(scatter, 4) * 3.0
    );
  }

  function boardRarityPercentile(profile, history) {
    const current = boardRarityMetric(profile);
    const values = (Array.isArray(history) ? history : [])
      .map(boardRarityMetric)
      .filter(Number.isFinite);

    if (!values.length) {
      return {
        percentile:0.5,
        qualityIndex:current,
        samples:0,
        mean:0,
        stdDev:0,
        zScore:0
      };
    }

    let below = 0;
    let equal = 0;
    for (const value of values) {
      if (value < current) below += 1;
      else if (value === current) equal += 1;
    }

    const percentile = (below + equal * 0.5) / values.length;
    const mean = values.reduce((a,b) => a+b,0) / values.length;
    const variance = values.reduce((sum,value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(Math.max(0, variance));
    const zScore = stdDev > 0 ? (current - mean) / stdDev : 0;

    return {
      percentile:Math.max(0, Math.min(1, percentile)),
      qualityIndex:current,
      samples:values.length,
      mean,
      stdDev,
      zScore
    };
  }

  function mapPercentileToSignal(percentile) {
    const p = Math.max(0, Math.min(1, Number(percentile) || 0));
    const anchors = [
      [0.000, 8],
      [0.100, 15],
      [0.250, 25],
      [0.500, 40],
      [0.750, 55],
      [0.900, 67],
      [0.960, 76],
      [0.980, 79],
      [0.985, 82],
      [0.990, 87],
      [0.995, 93],
      [0.998, 97],
      [1.000, 100]
    ];

    for (let i = 1; i < anchors.length; i += 1) {
      const [x1, y1] = anchors[i - 1];
      const [x2, y2] = anchors[i];
      if (p <= x2) {
        const t = x2 > x1 ? (p - x1) / (x2 - x1) : 0;
        return Math.round(y1 + (y2 - y1) * t);
      }
    }
    return 100;
  }

  function computeBoardSignal(candidate) {
    if (!candidate) {
      return {
        score:0,
        rawBase:0,
        base:0,
        ready:false,
        triggerEligible:false,
        rarityPercentile:0,
        qualityIndex:0,
        zScore:0,
        adaptiveSamples:0,
        patternTag:'等待資料',
        patternKey:'none',
        patternBonus:0,
        repeatPenalty:0,
        concentrationPenalty:0,
        reason:'等待盤面資料'
      };
    }

    const profile = boardPatternProfile(candidate);
    const {
      eye, snake, bow, axe, scatter,
      patternTag, patternKey
    } = profile;

    const history = adaptiveRoomHistory();
    const rarity = boardRarityPercentile(profile, history);
    const ready = rarity.samples >= ADAPTIVE_MIN_SAMPLES;

    const reasons = [];
    if (scatter > 0) reasons.push(`SCATTER ×${scatter}`);
    if (eye >= 4) reasons.push(`${symbolLabel('1')} ×${eye}`);
    if (snake >= 4) reasons.push(`${symbolLabel('2')} ×${snake}`);
    if (bow >= 4) reasons.push(`${symbolLabel('3')} ×${bow}`);
    if (axe >= 4) reasons.push(`${symbolLabel('4')} ×${axe}`);

    // test87：
    // 顯示分數改用平滑百分位映射，普通盤不會再大量落在 0～5%。
    // 但 80% 以上的自動停止門檻仍維持嚴格：
    // 至少 60 局樣本 + 前約 1.5% + z-score >= 1.5 + 基本強度 >= 68。
    let score = mapPercentileToSignal(rarity.percentile);

    const triggerEligible =
      ready &&
      rarity.percentile >= 0.985 &&
      rarity.zScore >= 1.5 &&
      rarity.qualityIndex >= 68;

    if (!triggerEligible) score = Math.min(score, 79);

    const repeatPenalty = repeatedPatternPenalty(history, patternKey);
    score -= repeatPenalty;

    // 100% 只保留給真正極端離群盤面。
    const extreme =
      triggerEligible &&
      rarity.percentile >= 0.9975 &&
      rarity.zScore >= 2.5;

    if (!extreme) score = Math.min(score, 99);

    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      score,
      base:rarity.qualityIndex,
      rawBase:rarity.qualityIndex,
      ready,
      triggerEligible,
      rarityPercentile:rarity.percentile,
      qualityIndex:rarity.qualityIndex,
      zScore:rarity.zScore,
      historyMean:rarity.mean,
      historyStdDev:rarity.stdDev,
      adaptiveSamples:rarity.samples,
      adaptiveAdjustment:0,
      adaptiveScore:Math.round(rarity.percentile * 100),
      adaptiveTrend:0,
      patternTag,
      patternKey,
      patternBonus:0,
      repeatPenalty,
      concentrationPenalty:0,
      parts:{
        rarityPercentile:Math.round(rarity.percentile * 1000) / 10,
        qualityIndex:Math.round(rarity.qualityIndex * 10) / 10,
        zScore:Math.round(rarity.zScore * 100) / 100,
        mean:Math.round(rarity.mean * 10) / 10,
        stdDev:Math.round(rarity.stdDev * 10) / 10,
        samples:rarity.samples
      },
      reason:reasons.slice(0,3).join('・') || '目前盤面未達訊號條件'
    };
  }

  function sameOriginSignalWindows(root = window) {
    const out = [];
    const seen = new Set();
    const visit = win => {
      if (!win || seen.has(win)) return;
      seen.add(win);
      out.push(win);
      let frames = [];
      try { frames = [...win.document.querySelectorAll('iframe')]; } catch (_) {}
      for (const frame of frames) {
        try {
          const child = frame.contentWindow;
          if (!child) continue;
          void child.document;
          visit(child);
        } catch (_) {}
      }
    };
    visit(root);
    return out;
  }


  function readVisibleMultiplierValues() {
    const hits = [];
    const seen = new Set();

    const normalizeMultiplier = raw => {
      const text = String(raw ?? '').trim().replace(/×/g, 'X').toUpperCase();
      const match = text.match(/(?:^|[^0-9])(\d{1,3})\s*X(?:$|[^A-Z0-9])/);
      if (!match) return null;
      const value = Number(match[1]);
      if (!Number.isFinite(value) || value < 2 || value > 999) return null;
      return value;
    };

    const worldPoint = (node, cocos) => {
      try {
        const p = node?.worldPosition || node?._worldPosition;
        if (Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y))) {
          return { x:Number(p.x), y:Number(p.y) };
        }
      } catch (_) {}
      try {
        if (typeof node?.convertToWorldSpaceAR === 'function') {
          const zero = typeof cocos?.v2 === 'function' ? cocos.v2(0,0) : { x:0, y:0 };
          const p = node.convertToWorldSpaceAR(zero);
          if (Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y))) {
            return { x:Number(p.x), y:Number(p.y) };
          }
        }
      } catch (_) {}
      return null;
    };

    const addHit = (value, node, cocos, source) => {
      if (!value || !node || node.activeInHierarchy === false) return;

      const names = [];
      let cursor = node;
      for (let depth = 0; cursor && depth < 8; depth += 1) {
        names.push(String(cursor.name || ''));
        cursor = cursor.parent || cursor._parent || null;
      }
      const path = names.join('/').toLowerCase();

      // Ignore obvious HUD/menu/autoplay labels. Reel/symbol paths get priority.
      if (/(autoplay|autospin|speed|setting|menu|jackpot|grand|major|minor|mini|buy|stake|bet|linecount)/i.test(path)) return;

      let score = 0;
      if (/(symbol|reel|slot|grid|cell|item|icon|multiple|multiplier|mul|ball)/i.test(path)) score += 5;

      let visible = { width:0, height:0 };
      try {
        const size = cocos?.view?.getVisibleSize?.();
        visible = { width:Number(size?.width)||0, height:Number(size?.height)||0 };
      } catch (_) {}

      const point = worldPoint(node, cocos);
      if (point && visible.width > 0 && visible.height > 0) {
        const nx = point.x / visible.width;
        const ny = point.y / visible.height;
        // Main reel area; excludes the speed/autoplay controls and most bottom banners.
        if (nx >= .08 && nx <= .92 && ny >= .25 && ny <= .88) score += 4;
        else score -= 3;
      }

      // Exact Label text on an active node is already strong evidence.
      if (source === 'label') score += 3;
      if (score < 2) return;

      const px = point ? Math.round(point.x / 6) : 0;
      const py = point ? Math.round(point.y / 6) : 0;
      const key = point ? `${value}:${px}:${py}` : `${value}:${path}`;
      if (seen.has(key)) return;
      seen.add(key);
      hits.push({ value, x:point?.x ?? 0, y:point?.y ?? 0, score });
    };

    for (const gameWindow of sameOriginSignalWindows()) {
      try {
        const cocos = gameWindow?.cc || gameWindow?.legacyCC || gameWindow?._cc;
        const scene = cocos?.director?.getScene?.();
        if (!scene) continue;

        const Label = cocos?.Label;
        if (Label && typeof scene.getComponentsInChildren === 'function') {
          for (const label of (scene.getComponentsInChildren(Label) || [])) {
            const value = normalizeMultiplier(label?.string ?? label?._string);
            if (value) addHit(value, label?.node, cocos, 'label');
          }
        }

        const Component = cocos?.Component;
        if (Component && typeof scene.getComponentsInChildren === 'function') {
          for (const component of (scene.getComponentsInChildren(Component) || [])) {
            const node = component?.node;
            if (!node || node.activeInHierarchy === false) continue;
            const raws = [
              node?.name,
              component?.string,
              component?._string,
              component?.text,
              component?._text,
              component?.value,
              component?.spriteFrame?.name,
              component?.spriteFrame?._name,
              component?._spriteFrame?.name,
              component?._spriteFrame?._name
            ];
            for (const raw of raws) {
              const value = normalizeMultiplier(raw);
              if (value) {
                addHit(value, node, cocos, 'component');
                break;
              }
            }
          }
        }
      } catch (_) {}
    }

    hits.sort((a,b) => (b.y - a.y) || (a.x - b.x) || (a.value - b.value));

    // Multiple components can point at the same symbol. Collapse near-identical hits.
    const compact = [];
    for (const hit of hits) {
      const duplicate = compact.some(prev =>
        prev.value === hit.value &&
        Math.abs(prev.x - hit.x) < 18 &&
        Math.abs(prev.y - hit.y) < 18
      );
      if (!duplicate) compact.push(hit);
    }
    return compact.map(hit => hit.value);
  }

  function multiplierValueIconHtml(value) {
    const safeValue = Math.max(2, Math.min(999, Math.trunc(Number(value) || 2)));
    return `<span class="bp-icon-shell"><span class="bp-icon bp-multiplier-live">${safeValue}X</span></span>`;
  }


  function stopNodePath(node) {
    const parts = [];
    let cursor = node;
    for (let depth = 0; cursor && depth < 12; depth += 1) {
      let index = -1;
      try {
        const parent = cursor.parent || cursor._parent;
        const siblings = parent?.children || parent?._children || [];
        index = Array.isArray(siblings) ? siblings.indexOf(cursor) : -1;
      } catch (_) {}
      parts.push(`${String(cursor?.name || '')}#${index}`);
      cursor = cursor.parent || cursor._parent || null;
    }
    return parts.join('/');
  }

  function resolveNodeByLearnPath(gameWindow, wantedPath) {
    if (!wantedPath) return null;
    try {
      const cocos = gameWindow?.cc || gameWindow?.legacyCC || gameWindow?._cc;
      const scene = cocos?.director?.getScene?.();
      if (!scene) return null;

      const stack = [scene];
      while (stack.length) {
        const node = stack.pop();
        if (!node) continue;
        try {
          if (stopNodePath(node) === wantedPath) return { node, cocos };
        } catch (_) {}
        const children = node.children || node._children || [];
        for (const child of children) stack.push(child);
      }
    } catch (_) {}
    return null;
  }

  function serialiseStopHandlers(events) {
    const out = [];
    for (const handler of (Array.isArray(events) ? events : [])) {
      try {
        out.push({
          targetPath: stopNodePath(handler?.target),
          component: String(handler?.component || ''),
          handler: String(handler?.handler || ''),
          customEventData: handler?.customEventData == null ? '' : String(handler.customEventData)
        });
      } catch (_) {}
    }
    return out.filter(item => item.handler || item.component || item.targetPath);
  }

  function showStopLearnToast(html, ms = 3000) {
    try {
      let toast = document.getElementById('xinyao-atg-stop-learn-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'xinyao-atg-stop-learn-toast';
        toast.style.cssText = 'position:fixed;top:74px;left:50%;transform:translateX(-50%);z-index:2147483647;width:min(410px,calc(100vw - 24px));box-sizing:border-box;padding:12px 14px;border-radius:14px;background:rgba(24,20,31,.97);border:1px solid rgba(255,184,212,.55);color:#fff;font:800 12px -apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif;text-align:center;pointer-events:none;';
        (document.body || document.documentElement).appendChild(toast);
      }
      toast.innerHTML = html;
      clearTimeout(showStopLearnToast._timer);
      showStopLearnToast._timer = setTimeout(() => toast?.remove(), ms);
    } catch (_) {}
  }

  function finishStopLearning(button, cocos, meta = {}) {
    const buttonNode = button?.node || probe.stopReplayNodeRef?.node || null;
    const handlerInfo = probe.stopReplayInfo?.handlers || [];
    const nodeEvent = probe.stopReplayNodeEvent || '';

    const info = {
      version: 2,
      path: buttonNode ? stopNodePath(buttonNode) : '',
      descriptor: button ? signalButtonDescriptor(button, cocos) : '',
      learnedAt: Date.now(),
      nx: Number(meta.nx) || probe.stopReplayInfo?.nx || null,
      ny: Number(meta.ny) || probe.stopReplayInfo?.ny || null,
      handlers: handlerInfo,
      nodePath: probe.stopReplayNodeRef?.node ? stopNodePath(probe.stopReplayNodeRef.node) : '',
      nodeEvent
    };

    // We only declare success when we captured the real runtime action,
    // not merely a nearby visual Button.
    const hasRealReplay =
      (Array.isArray(probe.stopReplayRefs) && probe.stopReplayRefs.length > 0) ||
      Boolean(probe.stopReplayNodeRef?.node && probe.stopReplayNodeEvent) ||
      handlerInfo.length > 0;

    if (!hasRealReplay) {
      probe.stopLearned = false;
      probe.stopLearnMode = false;
      probe.autoStopStatus = '⚠️ 沒抓到真正停止事件，請重新學習';
      render();
      showStopLearnToast('⚠️ 這次只抓到畫面按鈕，沒有抓到真正停止事件。請再按一次「學習停止鍵」。', 3600);
      return false;
    }

    if (button?.node) probe.learnedStopButtonRef = { button, cocos };
    probe.stopLearnInfo = info;
    probe.stopLearned = true;
    probe.stopLearnMode = false;

    try { localStorage.setItem(STOP_LEARN_KEY, JSON.stringify(info)); } catch (_) {}

    probe.autoStopStatus = `✅ 已抓到停止事件（${handlerInfo.length ? 'Handler' : 'Node Event'}）`;
    render();

    showStopLearnToast(
      '<b style="color:#9ff0be">✅ 已抓到真正的停止事件</b><br><span style="font-size:11px;font-weight:700">先按右側「立即測試停止」確認；測試成功後，80% 以上就會用同一個事件停轉。</span>',
      4500
    );
    return true;
  }

  function invokeResolvedHandlerInfo(info) {
    const records = Array.isArray(info?.handlers) ? info.handlers : [];
    if (!records.length) return false;

    let invoked = false;
    for (const record of records) {
      for (const gameWindow of sameOriginSignalWindows()) {
        try {
          const resolved = resolveNodeByLearnPath(gameWindow, record.targetPath);
          const target = resolved?.node;
          if (!target) continue;

          let receiver = target;
          if (record.component && typeof target.getComponent === 'function') {
            try {
              receiver = target.getComponent(record.component) || receiver;
            } catch (_) {}
          }

          const fn = receiver?.[record.handler];
          if (typeof fn === 'function') {
            fn.call(receiver, null, record.customEventData);
            invoked = true;
            break;
          }
        } catch (_) {}
      }
    }
    return invoked;
  }

  function invokeLearnedStopReplay() {
    // Best case: exact live EventHandler objects + the exact params that were used
    // when the user manually pressed the real ■ button.
    try {
      if (
        probe.stopReplayEmitter &&
        Array.isArray(probe.stopReplayRefs) &&
        probe.stopReplayRefs.length &&
        typeof probe.stopReplayEmitter.emitEvents === 'function'
      ) {
        probe.stopReplayEmitter.emitEvents(
          probe.stopReplayRefs,
          ...(Array.isArray(probe.stopReplayParams) ? probe.stopReplayParams : [])
        );
        probe.autoStopLastVia = 'REPLAY exact EventHandler.emitEvents';
        return { ok:true, via:probe.autoStopLastVia, detail:`${probe.stopReplayRefs.length} handler(s)` };
      }
    } catch (_) {}

    // Some ATG controls are wired directly to Node touch/click events rather than Button.clickEvents.
    try {
      const nodeRef = probe.stopReplayNodeRef?.node;
      const type = probe.stopReplayNodeEvent;
      if (nodeRef && type && typeof nodeRef.emit === 'function') {
        nodeRef.emit(type, ...(Array.isArray(probe.stopReplayNodeArgs) ? probe.stopReplayNodeArgs : []));
        probe.autoStopLastVia = `REPLAY exact Node event: ${String(type)}`;
        return { ok:true, via:probe.autoStopLastVia, detail:stopNodePath(nodeRef) };
      }
    } catch (_) {}

    // After refresh/re-entering a room, rebuild the saved click handler by component+method path.
    try {
      if (invokeResolvedHandlerInfo(probe.stopLearnInfo)) {
        probe.autoStopLastVia = 'REPLAY resolved saved handler';
        return { ok:true, via:probe.autoStopLastVia, detail:'saved handler metadata' };
      }
    } catch (_) {}

    return { ok:false, via:'', detail:'' };
  }

  function findButtonByLearnInfo(gameWindow) {
    const info = probe.stopLearnInfo;
    if (!info) return null;

    try {
      const cocos = gameWindow?.cc || gameWindow?.legacyCC || gameWindow?._cc;
      const scene = cocos?.director?.getScene?.();
      const Button = cocos?.Button;
      if (!scene || !Button || typeof scene.getComponentsInChildren !== 'function') return null;

      const buttons = scene.getComponentsInChildren(Button) || [];
      let best = null;
      for (const button of buttons) {
        if (!button?.node || button.node.activeInHierarchy === false) continue;
        const path = stopNodePath(button.node);
        const descriptor = signalButtonDescriptor(button, cocos);
        let score = 0;
        if (info.path && path === info.path) score += 1000;
        if (info.descriptor && descriptor === info.descriptor) score += 400;
        if (!best || score > best.score) best = { button, cocos, score };
      }
      return best && best.score >= 300 ? best : null;
    } catch (_) {
      return null;
    }
  }

  function findLearnedStopButton() {
    const ref = probe.learnedStopButtonRef;
    try {
      if (ref?.button?.node?.activeInHierarchy !== false && ref?.button?.node) return ref;
    } catch (_) {}

    for (const gameWindow of sameOriginSignalWindows()) {
      const found = findButtonByLearnInfo(gameWindow);
      if (found) {
        probe.learnedStopButtonRef = { button:found.button, cocos:found.cocos };
        return probe.learnedStopButtonRef;
      }
    }
    return null;
  }

  function installStopLearningHooks() {
    if (probe.stopLearnHooksInstalled) return;
    probe.stopLearnHooksInstalled = true;

    const attach = () => {
      for (const gameWindow of sameOriginSignalWindows()) {
        try {
          const cocos = gameWindow?.cc || gameWindow?.legacyCC || gameWindow?._cc;
          const scene = cocos?.director?.getScene?.();
          if (!scene) continue;

          // Capture the exact Cocos EventHandler list fired by a real manual press.
          const EventHandler = cocos?.Component?.EventHandler || cocos?.EventHandler;
          if (EventHandler && typeof EventHandler.emitEvents === 'function' && !EventHandler.emitEvents.__XIANYAO_STOP_TRACE__) {
            const originalEmitEvents = EventHandler.emitEvents;
            const wrappedEmitEvents = function(events, ...params) {
              if (probe.stopLearnMode && Array.isArray(events) && events.length) {
                const serial = serialiseStopHandlers(events);
                if (serial.length) {
                  probe.stopReplayRefs = events.slice();
                  probe.stopReplayParams = params.slice();
                  probe.stopReplayEmitter = EventHandler;
                  probe.stopReplayInfo = {
                    ...(probe.stopReplayInfo || {}),
                    handlers: serial,
                    capturedAt: Date.now()
                  };
                }
              }
              return originalEmitEvents.call(this, events, ...params);
            };
            wrappedEmitEvents.__XIANYAO_STOP_TRACE__ = true;
            wrappedEmitEvents.__XIANYAO_STOP_ORIGINAL__ = originalEmitEvents;
            EventHandler.emitEvents = wrappedEmitEvents;
          }

          // Capture direct Node click / touch-end dispatches too.
          const NodeProto = cocos?.Node?.prototype;
          if (NodeProto && typeof NodeProto.emit === 'function' && !NodeProto.emit.__XIANYAO_STOP_TRACE__) {
            const originalNodeEmit = NodeProto.emit;
            const wrappedNodeEmit = function(type, ...args) {
              if (
                probe.stopLearnMode &&
                /(click|touch[-_]?end|mouseup|pointerup)/i.test(String(type || ''))
              ) {
                probe.stopReplayNodeRef = { node:this, cocos };
                probe.stopReplayNodeEvent = type;
                probe.stopReplayNodeArgs = args.slice();
                probe.stopReplayInfo = {
                  ...(probe.stopReplayInfo || {}),
                  nodePath: stopNodePath(this),
                  nodeEvent: String(type || ''),
                  capturedAt: Date.now()
                };
              }
              return originalNodeEmit.call(this, type, ...args);
            };
            wrappedNodeEmit.__XIANYAO_STOP_TRACE__ = true;
            wrappedNodeEmit.__XIANYAO_STOP_ORIGINAL__ = originalNodeEmit;
            NodeProto.emit = wrappedNodeEmit;
          }

          const Button = cocos?.Button;
          if (Button && typeof scene.getComponentsInChildren === 'function') {
            const clickType = Button?.EventType?.CLICK || 'click';
            for (const button of (scene.getComponentsInChildren(Button) || [])) {
              const node = button?.node;
              if (!node || node.__XIANYAO_STOP_LEARN_HOOK_V2__) continue;
              node.__XIANYAO_STOP_LEARN_HOOK_V2__ = true;
              try {
                node.on(clickType, () => {
                  if (!probe.stopLearnMode) return;
                  // Allow the game's own handler to finish, then freeze the captured replay data.
                  setTimeout(() => {
                    if (probe.stopLearnMode) finishStopLearning(button, cocos);
                  }, 80);
                });
              } catch (_) {}
            }
          }

          // Trusted pointer coordinate is saved only as extra metadata; it is no longer used
          // as the primary way to guess the stop button.
          const canvas =
            gameWindow.document?.querySelector('canvas#GameCanvas') ||
            gameWindow.document?.querySelector('canvas') ||
            cocos?.game?.canvas ||
            cocos?.game?._canvas;

          if (canvas && !canvas.__XIANYAO_STOP_POINTER_LEARN_V2__) {
            canvas.__XIANYAO_STOP_POINTER_LEARN_V2__ = true;
            canvas.addEventListener('pointerdown', event => {
              if (!probe.stopLearnMode || event.isTrusted === false) return;
              try {
                const rect = canvas.getBoundingClientRect();
                const nx = (event.clientX - rect.left) / rect.width;
                const ny = (event.clientY - rect.top) / rect.height;
                probe.stopCaptureAt = Date.now();
                probe.stopReplayInfo = {
                  ...(probe.stopReplayInfo || {}),
                  nx, ny, pointerAt:Date.now()
                };

                // Fallback finalizer for non-Button controls:
                // wait for Node/EventHandler tracing generated by this real tap.
                setTimeout(() => {
                  if (probe.stopLearnMode) finishStopLearning(null, cocos, { nx, ny });
                }, 260);
              } catch (_) {}
            }, true);
          }
        } catch (_) {}
      }
    };

    attach();
    setInterval(attach, 700);
  }

  function startStopButtonLearning() {
    probe.stopLearnMode = true;
    probe.stopLearned = false;
    probe.learnedStopButtonRef = null;
    probe.stopReplayRefs = null;
    probe.stopReplayParams = null;
    probe.stopReplayEmitter = null;
    probe.stopReplayNodeRef = null;
    probe.stopReplayNodeEvent = null;
    probe.stopReplayNodeArgs = null;
    probe.stopReplayInfo = null;
    probe.stopCaptureAt = 0;
    probe.autoStopStatus = '🎯 請手動按一次真正的 ■ 停止鍵';
    try { localStorage.removeItem(STOP_LEARN_KEY); } catch (_) {}
    render();

    showStopLearnToast(
      '<b style="color:#ffb8d4">🎯 test87 重新學習停止事件</b><br><span style="font-size:11px;font-weight:700">請先開著自動轉，然後手動按一次遊戲右下角真正的 ■。這版會直接記錄那次按下去所執行的 EventHandler，不再猜按鈕。</span>',
      15000
    );

    clearTimeout(startStopButtonLearning._timer);
    startStopButtonLearning._timer = setTimeout(() => {
      if (probe.stopLearnMode) {
        probe.stopLearnMode = false;
        probe.autoStopStatus = '⚠️ 學習逾時，請重新學習';
        render();
      }
    }, 15000);
  }

  function testLearnedStopNow() {
    const result = tryStopAutoplay();
    probe.autoStopStatus = result?.ok
      ? `🧪 已按下右下角 ■：${result.via}`
      : '⚠️ 找不到 ATG stopAutoBtn';
    render();
    showStopLearnToast(
      result?.ok
        ? '<b style="color:#9ff0be">🧪 已直接按下遊戲右下角 ■ 停止鍵</b><br><span style="font-size:11px">這顆就是 80% 達標時程式會自動按的停止鍵。</span>'
        : '⚠️ 目前找不到 stopAutoBtn；請確認自動轉已經開始。',
      3600
    );
  }

  function explicitStopPattern(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    return /停止(?:自動|連轉|旋轉)|(?:stop|cancel)[-_\s]*(?:auto|autoplay|autospin)|(?:auto|autoplay|autospin)[-_\s]*(?:stop|cancel)/i.test(value);
  }

  function emitSignalCocosClick(target, cocos) {
    if (!target?.node) return false;
    const button = target;

    // Cocos Creator Button has an internal emitter that performs the same action as a real tap.
    // Prefer it over only emitting a raw node event, because raw 'click' can be accepted but ignored.
    try {
      if (button.interactable === false || button.enabledInHierarchy === false) return false;
    } catch (_) {}

    try {
      if (typeof button._emitButtonEvent === 'function') {
        button._emitButtonEvent();
        return true;
      }
    } catch (_) {}

    try {
      if (typeof button._emitClickEvent === 'function') {
        button._emitClickEvent();
        return true;
      }
    } catch (_) {}

    try {
      const events = Array.isArray(button.clickEvents) ? button.clickEvents : [];
      const EventHandler = cocos?.Component?.EventHandler || cocos?.EventHandler;
      if (events.length && typeof EventHandler?.emitEvents === 'function') {
        EventHandler.emitEvents(events, button);
        return true;
      }

      for (const handler of events) {
        try {
          if (typeof handler?.emit === 'function') {
            handler.emit([button]);
            return true;
          }
          const targetNode = handler?.target;
          const methodName = handler?.handler;
          const componentName = handler?.component;
          if (!targetNode || !methodName) continue;
          let component = null;
          try {
            if (componentName && typeof targetNode.getComponent === 'function') component = targetNode.getComponent(componentName);
          } catch (_) {}
          const receiver = component || targetNode;
          if (typeof receiver?.[methodName] === 'function') {
            receiver[methodName].call(receiver, button, handler?.customEventData);
            return true;
          }
        } catch (_) {}
      }
    } catch (_) {}

    try {
      const clickType = cocos?.Button?.EventType?.CLICK || 'click';
      if (typeof button.node.emit === 'function') {
        button.node.emit(clickType, button);
        return true;
      }
    } catch (_) {}

    return false;
  }

  function invokeExplicitAutoplayStopMethod(gameWindow) {
    try {
      const cocos = gameWindow?.cc || gameWindow?.legacyCC || gameWindow?._cc;
      const scene = cocos?.director?.getScene?.();
      const Component = cocos?.Component;
      if (!scene || !Component || typeof scene.getComponentsInChildren !== 'function') return null;

      const methodPattern = /^(?:(?:stop|cancel|end|close|disable).*(?:auto|autoplay|autospin)|(?:auto|autoplay|autospin).*(?:stop|cancel|end|close|disable))$/i;
      const components = scene.getComponentsInChildren(Component) || [];

      for (const component of components) {
        const node = component?.node;
        if (!component || !node || node.activeInHierarchy === false) continue;

        const names = [];
        let cursor = node;
        for (let depth = 0; cursor && depth < 8; depth += 1) {
          names.push(String(cursor.name || ''));
          cursor = cursor.parent || cursor._parent || null;
        }
        const componentName = String(component?.constructor?.name || component?.__classname__ || '');
        const context = `${componentName} ${names.join(' ')}`;

        // Only inspect likely game/control components.
        if (!/(spin|auto|play|game|slot|control|button|round)/i.test(context)) continue;

        const methodNames = new Set();
        let proto = component;
        for (let depth = 0; proto && depth < 4; depth += 1) {
          try {
            Object.getOwnPropertyNames(proto).forEach(name => methodNames.add(name));
          } catch (_) {}
          try { proto = Object.getPrototypeOf(proto); } catch (_) { proto = null; }
        }

        for (const methodName of methodNames) {
          if (!methodPattern.test(methodName)) continue;
          const fn = component?.[methodName];
          if (typeof fn !== 'function') continue;
          try {
            fn.call(component);
            return { ok:true, via:'Cocos stop method', detail:`${componentName}.${methodName}` };
          } catch (_) {}
        }
      }
    } catch (_) {}
    return null;
  }

  function numericLabelText(node, cocos) {
    try {
      const Label = cocos?.Label;
      if (!Label || !node || typeof node.getComponentsInChildren !== 'function') return [];
      return (node.getComponentsInChildren(Label) || [])
        .map(label => String(label?.string ?? label?._string ?? '').trim())
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function autoplayStateScore(button, cocos) {
    const node = button?.node;
    if (!node) return { score:0, text:'', activeEvidence:false };

    const names = [];
    let cursor = node;
    for (let depth = 0; cursor && depth < 10; depth += 1) {
      names.push(String(cursor.name || ''));
      cursor = cursor.parent || cursor._parent || null;
    }

    const handlers = (Array.isArray(button.clickEvents) ? button.clickEvents : [])
      .map(handler => [handler?.component, handler?.handler, handler?.customEventData].filter(Boolean).join(' '))
      .join(' ');

    const labels = numericLabelText(node, cocos);

    const visualNames = [];
    try {
      const Sprite = cocos?.Sprite;
      if (Sprite && typeof node.getComponentsInChildren === 'function') {
        for (const sprite of (node.getComponentsInChildren(Sprite) || [])) {
          const sf = sprite?.spriteFrame || sprite?._spriteFrame;
          const n = String(sf?.name || sf?._name || '');
          if (n) visualNames.push(n);
        }
      }
    } catch (_) {}

    const text = `${names.join(' ')} ${handlers} ${labels.join(' ')} ${visualNames.join(' ')}`;
    if (/(buy|feature|free|table|machine|room|menu|sound|speed|minus|plus|bet|stake)/i.test(text)) {
      return { score:0, text, activeEvidence:false, numericLabels:[] };
    }

    const hasSpin = /(spin|roll|rotate)/i.test(text);
    const hasAuto = /(auto|autoplay|autospin|continuous|times|count)/i.test(text);
    const hasStopVisual = /(stop|pause|cancel|square|stopping)/i.test(text);

    const numericLabels = labels
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value >= 1 && value <= 999);

    let score = 0;
    if (hasSpin) score += 35;
    if (hasAuto) score += 45;
    if (hasStopVisual) score += 55;
    if (numericLabels.length) score += 35;

    const activeEvidence =
      hasStopVisual ||
      (hasAuto && numericLabels.length > 0) ||
      (hasSpin && hasAuto);

    return { score, text, numericLabels, activeEvidence };
  }

  function findActiveAutoplaySpinButton(gameWindow) {
    try {
      const cocos = gameWindow?.cc || gameWindow?.legacyCC || gameWindow?._cc;
      const scene = cocos?.director?.getScene?.();
      const Button = cocos?.Button;
      if (!scene || !Button || typeof scene.getComponentsInChildren !== 'function') return null;

      const candidates = [];
      for (const button of (scene.getComponentsInChildren(Button) || [])) {
        const info = autoplayStateScore(button, cocos);
        if (info.activeEvidence && info.score >= 70) candidates.push({ button, cocos, ...info });
      }
      candidates.sort((a,b) => b.score - a.score);
      return candidates[0] || null;
    } catch (_) {
      return null;
    }
  }

  function signalNodeWorldPoint(node, cocos) {
    try {
      const p = node?.worldPosition || node?._worldPosition;
      if (Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y))) {
        return { x:Number(p.x), y:Number(p.y) };
      }
    } catch (_) {}
    try {
      if (typeof node?.convertToWorldSpaceAR === 'function') {
        const zero = typeof cocos?.v2 === 'function' ? cocos.v2(0,0) : { x:0, y:0 };
        const p = node.convertToWorldSpaceAR(zero);
        if (Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y))) {
          return { x:Number(p.x), y:Number(p.y) };
        }
      }
    } catch (_) {}
    return null;
  }

  function signalButtonDescriptor(button, cocos) {
    const node = button?.node;
    if (!node) return '';

    const parts = [];
    let cursor = node;
    for (let depth = 0; cursor && depth < 8; depth += 1) {
      parts.push(String(cursor.name || ''));
      cursor = cursor.parent || cursor._parent || null;
    }

    try {
      const Label = cocos?.Label;
      if (Label && typeof node.getComponentsInChildren === 'function') {
        for (const label of (node.getComponentsInChildren(Label) || [])) {
          parts.push(String(label?.string ?? label?._string ?? ''));
        }
      }
    } catch (_) {}

    try {
      const Sprite = cocos?.Sprite;
      if (Sprite && typeof node.getComponentsInChildren === 'function') {
        for (const sprite of (node.getComponentsInChildren(Sprite) || [])) {
          const sf = sprite?.spriteFrame || sprite?._spriteFrame;
          parts.push(String(sf?.name || sf?._name || ''));
        }
      }
    } catch (_) {}

    try {
      for (const handler of (Array.isArray(button.clickEvents) ? button.clickEvents : [])) {
        parts.push(String(handler?.component || ''));
        parts.push(String(handler?.handler || ''));
        parts.push(String(handler?.customEventData || ''));
      }
    } catch (_) {}

    return parts.filter(Boolean).join(' ');
  }

  function findAutoplaySquareStopButton(gameWindow) {
    try {
      const cocos = gameWindow?.cc || gameWindow?.legacyCC || gameWindow?._cc;
      const scene = cocos?.director?.getScene?.();
      const Button = cocos?.Button;
      if (!scene || !Button || typeof scene.getComponentsInChildren !== 'function') return null;

      const active = findActiveAutoplaySpinButton(gameWindow);
      if (!active?.button?.node || !active?.activeEvidence) return null;

      const activePoint = signalNodeWorldPoint(active.button.node, cocos);
      if (!activePoint) return null;

      let visibleWidth = 0;
      let visibleHeight = 0;
      try {
        const size = cocos?.view?.getVisibleSize?.();
        visibleWidth = Number(size?.width) || 0;
        visibleHeight = Number(size?.height) || 0;
      } catch (_) {}

      const candidates = [];
      for (const button of (scene.getComponentsInChildren(Button) || [])) {
        if (!button?.node || button === active.button || button.node.activeInHierarchy === false) continue;
        try {
          if (button.interactable === false || button.enabledInHierarchy === false) continue;
        } catch (_) {}

        const point = signalNodeWorldPoint(button.node, cocos);
        if (!point) continue;

        const dx = point.x - activePoint.x;
        const dy = Math.abs(point.y - activePoint.y);

        // Must be on the SAME bottom control row and to the RIGHT of the active spin/count button.
        if (dx <= 0) continue;
        if (visibleHeight > 0 && dy > visibleHeight * 0.085) continue;
        if (visibleWidth > 0 && dx > visibleWidth * 0.38) continue;

        const text = signalButtonDescriptor(button, cocos);
        const lower = text.toLowerCase();

        // Never hit known unrelated controls.
        if (/(buy|feature|free|menu|setting|sound|speed|room|table|machine|bet|stake|minus|decrease)/i.test(lower)) continue;

        const explicitStop = /(stop|pause|square|cancel|endauto|stopauto|autostop)/i.test(lower);
        const explicitPlus = /(?:^|[^a-z])(plus|add|increase)(?:[^a-z]|$)/i.test(lower);

        let score = 0;
        if (explicitStop) score += 500;
        if (explicitPlus) score -= 500;

        // Position is the key in this ATG build:
        // the + button is closer to spin, while the ■ stop button is the RIGHTMOST same-row control.
        if (visibleWidth > 0) {
          const ndx = dx / visibleWidth;
          if (ndx >= 0.14 && ndx <= 0.36) score += 180;
          else if (ndx >= 0.08 && ndx < 0.14) score += 35;
          else if (ndx > 0 && ndx < 0.08) score -= 40;
        }

        if (visibleHeight > 0) {
          const ndy = dy / visibleHeight;
          if (ndy < 0.018) score += 90;
          else if (ndy < 0.04) score += 55;
          else if (ndy < 0.085) score += 20;
        }

        // Square-ish button gets extra weight.
        try {
          const UITransform = cocos?.UITransform;
          let ui = null;
          if (UITransform && typeof button.node.getComponent === 'function') ui = button.node.getComponent(UITransform);
          ui = ui || button.node._uiProps?.uiTransformComp;
          const w = Number(ui?.width ?? ui?.contentSize?.width ?? 0);
          const h = Number(ui?.height ?? ui?.contentSize?.height ?? 0);
          if (w > 0 && h > 0 && Math.abs(w-h) / Math.max(w,h) < 0.30) score += 35;
        } catch (_) {}

        candidates.push({
          button, cocos, text, point, score, dx, dy,
          explicitStop, explicitPlus
        });
      }

      if (!candidates.length) return null;

      // Explicit stop name wins. Otherwise choose the RIGHTMOST eligible control,
      // which matches the visible ATG layout: spin/count -> plus -> square stop.
      const explicit = candidates
        .filter(item => item.explicitStop && !item.explicitPlus)
        .sort((a,b) => b.score - a.score || b.dx - a.dx)[0];
      if (explicit) return explicit;

      const positional = candidates
        .filter(item => !item.explicitPlus && item.score >= 35)
        .sort((a,b) => b.dx - a.dx || b.score - a.score)[0];

      return positional || null;
    } catch (_) {
      return null;
    }
  }

  function dispatchCanvasTapAtWorld(gameWindow, point, cocos) {
    try {
      if (!point) return false;
      const doc = gameWindow?.document;
      if (!doc) return false;

      const canvas =
        doc.querySelector('canvas#GameCanvas') ||
        doc.querySelector('canvas') ||
        cocos?.game?.canvas ||
        cocos?.game?._canvas;
      if (!canvas || typeof canvas.getBoundingClientRect !== 'function') return false;

      const rect = canvas.getBoundingClientRect();
      let visibleWidth = 0;
      let visibleHeight = 0;
      try {
        const size = cocos?.view?.getVisibleSize?.();
        visibleWidth = Number(size?.width) || Number(canvas.width) || 0;
        visibleHeight = Number(size?.height) || Number(canvas.height) || 0;
      } catch (_) {}

      if (!(visibleWidth > 0) || !(visibleHeight > 0) || !(rect.width > 0) || !(rect.height > 0)) return false;

      const clientX = rect.left + (point.x / visibleWidth) * rect.width;
      const clientY = rect.top + (1 - (point.y / visibleHeight)) * rect.height;

      try { canvas.focus?.(); } catch (_) {}

      const common = {
        bubbles:true,
        cancelable:true,
        clientX,
        clientY,
        screenX:clientX,
        screenY:clientY,
        button:0,
        buttons:1
      };

      let sent = false;
      try {
        if (typeof gameWindow.PointerEvent === 'function') {
          canvas.dispatchEvent(new gameWindow.PointerEvent('pointerdown', { ...common, pointerId:1, pointerType:'mouse', isPrimary:true }));
          canvas.dispatchEvent(new gameWindow.PointerEvent('pointerup', { ...common, pointerId:1, pointerType:'mouse', isPrimary:true, buttons:0 }));
          sent = true;
        }
      } catch (_) {}

      try {
        canvas.dispatchEvent(new gameWindow.MouseEvent('mousedown', common));
        canvas.dispatchEvent(new gameWindow.MouseEvent('mouseup', { ...common, buttons:0 }));
        canvas.dispatchEvent(new gameWindow.MouseEvent('click', { ...common, buttons:0 }));
        sent = true;
      } catch (_) {}

      return sent;
    } catch (_) {
      return false;
    }
  }

  // test87：真正的行為不在 QuickStopBtn/Button 這顆 cc.Button 本身，
  // 而在父層 QuickStopBtn 上的自訂 SpinButton component。
  // 前版 _emitButtonEvent() 只代表「事件函式有執行」，不代表遊戲真的接受停止，
  // 所以才會顯示已按下但自動轉繼續。這版直接呼叫父層 SpinButton 真實 handler。
  function componentClassName(component) {
    try {
      return String(
        component?.__classname__ ||
        component?.constructor?.__classname__ ||
        component?.constructor?.name ||
        ''
      );
    } catch (_) {
      return '';
    }
  }

  function quickStopNodeFromExactButton(exact) {
    try {
      return exact?.quickNode || exact?.button?.node?.parent || exact?.button?.node?._parent || null;
    } catch (_) {
      return null;
    }
  }

  function findQuickStopSpinComponent(gameWindow) {
    try {
      const cocos = gameWindow?.cc || gameWindow?.legacyCC || gameWindow?._cc;
      const exact = findExactATGQuickStopButton(gameWindow);
      const quickNode = quickStopNodeFromExactButton(exact);
      if (!quickNode) return null;

      const components = Array.isArray(quickNode.components)
        ? quickNode.components
        : (Array.isArray(quickNode._components) ? quickNode._components : []);

      let spinComponent = components.find(component =>
        /^SpinButton$/i.test(componentClassName(component))
      ) || null;

      if (!spinComponent && typeof quickNode.getComponent === 'function') {
        try { spinComponent = quickNode.getComponent('SpinButton') || null; } catch (_) {}
      }

      if (!spinComponent) {
        spinComponent = components.find(component =>
          /spinbutton/i.test(componentClassName(component))
        ) || null;
      }

      return spinComponent
        ? { component: spinComponent, node: quickNode, cocos, exact }
        : null;
    } catch (_) {
      return null;
    }
  }

  function quickStopMethodNames(component) {
    const names = new Set();
    let cursor = component;

    for (let depth = 0; cursor && depth < 8; depth += 1) {
      try {
        for (const name of Object.getOwnPropertyNames(cursor)) names.add(name);
      } catch (_) {}
      try { cursor = Object.getPrototypeOf(cursor); } catch (_) { cursor = null; }
    }

    const blocked = /^(?:constructor|onLoad|start|update|lateUpdate|onEnable|onDisable|onDestroy|reset|schedule|unschedule)$/i;

    const score = name => {
      const lower = String(name || '').toLowerCase();
      if (!lower || blocked.test(name)) return -1;
      if (/quick.*stop|stop.*quick/.test(lower)) return 1000;
      if (/on.*quick.*stop|quick.*stop.*click/.test(lower)) return 980;
      if (/stop.*(?:auto|spin|reel)|(?:auto|spin|reel).*stop/.test(lower)) return 930;
      if (/quick/.test(lower)) return 880;
      if (/stop|cancel/.test(lower)) return 820;
      if (/click|press|tap/.test(lower)) return 700;
      if (/touch.*end|end.*touch/.test(lower)) return 650;
      return -1;
    };

    return [...names]
      .map(name => ({ name, score: score(name) }))
      .filter(item => item.score >= 0 && typeof component?.[item.name] === 'function')
      .sort((a, b) => b.score - a.score);
  }

  function fakeQuickStopTouchEvent(node, cocos) {
    const point = signalNodeWorldPoint(node, cocos) || { x: 0, y: 0 };
    const touch = {
      getLocation: () => ({ x: point.x, y: point.y }),
      getUILocation: () => ({ x: point.x, y: point.y }),
      getPreviousLocation: () => ({ x: point.x, y: point.y }),
      getDelta: () => ({ x: 0, y: 0 })
    };
    return {
      type: cocos?.Node?.EventType?.TOUCH_END || 'touch-end',
      target: node,
      currentTarget: node,
      touch,
      getLocation: touch.getLocation,
      getUILocation: touch.getUILocation,
      getDelta: touch.getDelta,
      propagationStopped: false,
      stopPropagation() { this.propagationStopped = true; },
      preventDefault() {}
    };
  }

  function invokeQuickStopParentRuntime(gameWindow) {
    const found = findQuickStopSpinComponent(gameWindow);
    if (!found?.component || !found?.node) return null;

    const { component, node, cocos } = found;
    const methods = quickStopMethodNames(component);
    const invoked = [];

    // 1) 直接呼叫 QuickStopBtn 專屬 SpinButton handler。
    // 因為 component 本身就掛在 QuickStopBtn，所以 click/press 類方法也是這顆停止鍵的流程。
    for (const item of methods.slice(0, 6)) {
      try {
        const fn = component[item.name];
        if (typeof fn !== 'function') continue;
        const event = fakeQuickStopTouchEvent(node, cocos);

        let called = false;
        try {
          fn.call(component, event);
          called = true;
        } catch (_) {
          try {
            fn.call(component);
            called = true;
          } catch (_) {}
        }

        if (called) invoked.push(item.name);
      } catch (_) {}
    }

    // 2) 再從父層 QuickStopBtn node 發送 Cocos 原生 touch-end/click，
    // 直接進 node.on(...) 的遊戲 handler，不經瀏覽器 isTrusted 限制。
    const emitted = [];
    try {
      const evt = fakeQuickStopTouchEvent(node, cocos);
      const touchEnd = cocos?.Node?.EventType?.TOUCH_END || 'touch-end';
      if (typeof node.emit === 'function') {
        try { node.emit(touchEnd, evt); emitted.push(String(touchEnd)); } catch (_) {}
        try { node.emit('click', evt); emitted.push('click'); } catch (_) {}
      }
    } catch (_) {}

    if (!invoked.length && !emitted.length) return null;

    probe.autoStopLastVia = `QuickStopBtn SpinButton runtime: ${invoked.join(',') || emitted.join(',')}`;
    return {
      ok: true,
      via: probe.autoStopLastVia,
      detail: stopNodePath(node)
    };
  }

  // test87：已由實機 Runtime 確認，畫面右下角「■」停止鍵就是
  // .../SpinBar*/buttons/QuickStopBtn/Button 的 cc.Button。
  // 不再先猜相對位置，也不要求會員學習停止鍵；直接鎖定 QuickStopBtn。
  function findExactATGQuickStopButton(gameWindow) {
    try {
      const cocos = gameWindow?.cc || gameWindow?.legacyCC || gameWindow?._cc;
      const scene = cocos?.director?.getScene?.();
      const Button = cocos?.Button;
      if (!scene || !Button || typeof scene.getComponentsInChildren !== 'function') return null;

      const buttons = scene.getComponentsInChildren(Button) || [];
      const exact = [];

      for (const button of buttons) {
        const node = button?.node;
        if (!node || node.activeInHierarchy === false) continue;

        const path = stopNodePath(node);
        const parentName = String(node?.parent?.name || node?._parent?.name || '');
        const nodeName = String(node?.name || '');

        const isExactPath = /(?:^|\/)QuickStopBtn\/Button$/i.test(path);
        const isExactParent = /^QuickStopBtn$/i.test(parentName) && /^Button$/i.test(nodeName);

        if (!isExactPath && !isExactParent) continue;

        exact.push({
          button,
          cocos,
          gameWindow,
          path,
          quickNode: node.parent || node._parent || null
        });
      }

      if (!exact.length) return null;

      // 優先真正位於 SpinBar 按鈕列中的 QuickStopBtn，避免其他測試/隱藏節點。
      exact.sort((a, b) => {
        const as = /SpinBar/i.test(a.path) ? 100 : 0;
        const bs = /SpinBar/i.test(b.path) ? 100 : 0;
        return bs - as;
      });

      return exact[0];
    } catch (_) {
      return null;
    }
  }

  function makeQuickStopTouchEvent(node, cocos, type) {
    const point = signalNodeWorldPoint(node, cocos) || { x: 0, y: 0 };
    const touch = {
      getLocation: () => ({ x: point.x, y: point.y }),
      getUILocation: () => ({ x: point.x, y: point.y }),
      getPreviousLocation: () => ({ x: point.x, y: point.y }),
      getStartLocation: () => ({ x: point.x, y: point.y }),
      getDelta: () => ({ x: 0, y: 0 }),
      getID: () => 1
    };
    return {
      type,
      target: node,
      currentTarget: node,
      touch,
      touches: [touch],
      getTouches: () => [touch],
      getLocation: touch.getLocation,
      getUILocation: touch.getUILocation,
      getDelta: touch.getDelta,
      bubbles: true,
      propagationStopped: false,
      propagationImmediateStopped: false,
      stopPropagation() { this.propagationStopped = true; },
      stopPropagationImmediate() {
        this.propagationStopped = true;
        this.propagationImmediateStopped = true;
      },
      preventDefault() {}
    };
  }

  function pressQuickStopFullCocosTouch(gameWindow) {
    const exact = findExactATGQuickStopButton(gameWindow);
    if (!exact?.button?.node) return null;

    const cocos = exact.cocos;
    const button = exact.button;
    const childNode = button.node;
    const quickNode = exact.quickNode || childNode.parent || childNode._parent || null;

    const touchStart =
      cocos?.Node?.EventType?.TOUCH_START ||
      cocos?.Node?.EventType?.TOUCH_BEGIN ||
      'touchstart';
    const touchEnd =
      cocos?.Node?.EventType?.TOUCH_END ||
      'touchend';

    const startEvent = makeQuickStopTouchEvent(childNode, cocos, touchStart);
    const endEvent = makeQuickStopTouchEvent(childNode, cocos, touchEnd);
    const fired = [];

    // Cocos Button 正常是 touch-start 先把 pressed 狀態立起來，
    // touch-end 才真正派發 CLICK。前幾版只送 click / touch-end，
    // 對這個 ATG 版本不夠。
    try {
      if (typeof button._onTouchBegan === 'function') {
        button._onTouchBegan(startEvent);
        fired.push('Button._onTouchBegan');
      } else if (typeof button._onTouchStart === 'function') {
        button._onTouchStart(startEvent);
        fired.push('Button._onTouchStart');
      }
    } catch (_) {}

    try { button._pressed = true; } catch (_) {}

    try {
      if (typeof childNode.emit === 'function') {
        childNode.emit(touchStart, startEvent);
        fired.push(`child.${String(touchStart)}`);
      }
    } catch (_) {}

    try {
      if (quickNode && typeof quickNode.emit === 'function') {
        const parentStart = makeQuickStopTouchEvent(quickNode, cocos, touchStart);
        quickNode.emit(touchStart, parentStart);
        fired.push(`parent.${String(touchStart)}`);
      }
    } catch (_) {}

    try {
      if (typeof button._onTouchEnded === 'function') {
        button._onTouchEnded(endEvent);
        fired.push('Button._onTouchEnded');
      } else if (typeof button._onTouchEnd === 'function') {
        button._onTouchEnd(endEvent);
        fired.push('Button._onTouchEnd');
      }
    } catch (_) {}

    try {
      if (typeof childNode.emit === 'function') {
        childNode.emit(touchEnd, endEvent);
        fired.push(`child.${String(touchEnd)}`);
      }
    } catch (_) {}

    try {
      if (quickNode && typeof quickNode.emit === 'function') {
        const parentEnd = makeQuickStopTouchEvent(quickNode, cocos, touchEnd);
        quickNode.emit(touchEnd, parentEnd);
        fired.push(`parent.${String(touchEnd)}`);
      }
    } catch (_) {}

    // 最後補一次 Button CLICK 派發，但這次是在完整 pressed/touch 流程之後。
    try {
      if (typeof button._emitButtonEvent === 'function') {
        button._emitButtonEvent();
        fired.push('Button._emitButtonEvent');
      } else if (typeof button._emitClickEvent === 'function') {
        button._emitClickEvent();
        fired.push('Button._emitClickEvent');
      }
    } catch (_) {}

    if (!fired.length) return null;

    probe.autoStopLastVia = `full Cocos touch: ${fired.join(' > ')}`;
    return {
      ok: true,
      via: probe.autoStopLastVia,
      detail: exact.path || 'QuickStopBtn/Button'
    };
  }

  function pressExactATGQuickStop(gameWindow) {
    const exact = findExactATGQuickStopButton(gameWindow);
    if (!exact?.button) return null;

    // 這裡直接走 cc.Button 自己的 click 發送流程，等同按右下角框起來的 ■。
    // emitSignalCocosClick 內部優先 _emitButtonEvent()，失敗才走 clickEvents / node click。
    const fired = emitSignalCocosClick(exact.button, exact.cocos);
    if (!fired) return null;

    probe.autoStopLastVia = 'ATG exact QuickStopBtn/Button';
    return {
      ok: true,
      via: probe.autoStopLastVia,
      detail: exact.path || 'QuickStopBtn/Button'
    };
  }

  // test87：v3 實機追蹤已確認「停止自動轉」不是 QuickStopBtn，
  // 真正控制是 .../buttons/autoSpinGroup/stopAutoBtn 的 cc.Button。
  // 因此 80% 達標時只按這顆，不再碰 QuickStopBtn，避免只停當局動畫卻沒有關掉自動轉。
  function findExactATGStopAutoButton(gameWindow) {
    try {
      const cocos = gameWindow?.cc || gameWindow?.legacyCC || gameWindow?._cc;
      const scene = cocos?.director?.getScene?.();
      const Button = cocos?.Button;
      if (!scene || !Button || typeof scene.getComponentsInChildren !== 'function') return null;

      const candidates = [];
      for (const button of (scene.getComponentsInChildren(Button) || [])) {
        const node = button?.node;
        if (!node) continue;

        const path = stopNodePath(node);
        const nodeName = String(node?.name || '');
        const parentName = String(node?.parent?.name || node?._parent?.name || '');

        const exactPath = /(?:^|\/)autoSpinGroup\/stopAutoBtn$/i.test(path);
        const exactNames = /^stopAutoBtn$/i.test(nodeName) && /^autoSpinGroup$/i.test(parentName);
        if (!exactPath && !exactNames) continue;

        candidates.push({
          button,
          cocos,
          gameWindow,
          path,
          node
        });
      }

      if (!candidates.length) return null;

      // 優先目前真的顯示、可按的 stopAutoBtn。
      candidates.sort((a, b) => {
        const score = item => {
          let s = 0;
          try { if (item.node?.activeInHierarchy !== false) s += 100; } catch (_) {}
          try { if (item.button?.enabledInHierarchy !== false) s += 50; } catch (_) {}
          try { if (item.button?.interactable !== false) s += 50; } catch (_) {}
          if (/SpinBar/i.test(item.path)) s += 20;
          return s;
        };
        return score(b) - score(a);
      });

      return candidates[0];
    } catch (_) {
      return null;
    }
  }

  function pressExactATGStopAutoButton(gameWindow) {
    const exact = findExactATGStopAutoButton(gameWindow);
    if (!exact?.button?.node) return null;

    const button = exact.button;
    const node = exact.node;
    const cocos = exact.cocos;

    try {
      if (node.activeInHierarchy === false) return null;
      if (button.enabledInHierarchy === false) return null;
      if (button.interactable === false) return null;
    } catch (_) {}

    const touchStart =
      cocos?.Node?.EventType?.TOUCH_START ||
      cocos?.Node?.EventType?.TOUCH_BEGIN ||
      'touch-start';
    const touchEnd =
      cocos?.Node?.EventType?.TOUCH_END ||
      'touch-end';

    const startEvent = makeQuickStopTouchEvent(node, cocos, touchStart);
    const endEvent = makeQuickStopTouchEvent(node, cocos, touchEnd);
    const fired = [];

    // test87：stopAutoBtn 不是單純 clickEvents。
    // 真實手指按鈕會經過 touch-start -> pressed -> touch-end，
    // 所以這裡完整重現 cc.Button 的實際按壓生命週期。
    try {
      if (typeof button._onTouchBegan === 'function') {
        button._onTouchBegan(startEvent);
        fired.push('Button._onTouchBegan');
      } else if (typeof button._onTouchStart === 'function') {
        button._onTouchStart(startEvent);
        fired.push('Button._onTouchStart');
      }
    } catch (_) {}

    try { button._pressed = true; } catch (_) {}

    // 同步把原生 touch-start 丟給 stopAutoBtn node 上其他 listener。
    try {
      if (typeof node.emit === 'function') {
        node.emit(touchStart, startEvent);
        fired.push('node.touch-start');
      }
    } catch (_) {}

    try {
      if (typeof button._onTouchEnded === 'function') {
        button._onTouchEnded(endEvent);
        fired.push('Button._onTouchEnded');
      } else if (typeof button._onTouchEnd === 'function') {
        button._onTouchEnd(endEvent);
        fired.push('Button._onTouchEnd');
      }
    } catch (_) {}

    // 再送真正 touch-end，讓掛在 stopAutoBtn node 的遊戲 listener 一起收到。
    try {
      if (typeof node.emit === 'function') {
        node.emit(touchEnd, endEvent);
        fired.push('node.touch-end');
      }
    } catch (_) {}

    // 最後只做一次 click fallback；若 touch 流程已觸發，這只是保險。
    try {
      if (typeof button._emitButtonEvent === 'function') {
        button._emitButtonEvent();
        fired.push('Button._emitButtonEvent');
      } else if (typeof button._emitClickEvent === 'function') {
        button._emitClickEvent();
        fired.push('Button._emitClickEvent');
      }
    } catch (_) {}

    if (!fired.length) return null;

    probe.autoStopLastVia = `ATG stopAutoBtn full touch: ${fired.join(' > ')}`;
    return {
      ok: true,
      via: probe.autoStopLastVia,
      detail: exact.path || 'autoSpinGroup/stopAutoBtn'
    };
  }

  function tryStopAutoplay() {
    // 第一順位、也是主要路徑：只鎖定真正的 stopAutoBtn。
    for (const gameWindow of sameOriginSignalWindows()) {
      const result = pressExactATGStopAutoButton(gameWindow);
      if (result?.ok) return result;
    }

    // 不再 fallback 到 QuickStopBtn。
    // 若此刻按鈕正因局內狀態暫時不可按，retry 會在接下來幾秒重新嘗試同一顆 stopAutoBtn。
    return { ok:false, via:'', detail:'autoSpinGroup/stopAutoBtn not interactable yet' };
  }

  function scheduleAutoplayStopRetries(spinId) {
    const token = ++probe.autoStopRetryToken;
    probe.autoStopRetryUntil = Date.now() + 8000;
    probe.autoStopAttempts = 1;

    const delays = [40, 90, 150, 230, 330, 460, 620, 850, 1150, 1500, 2100, 3000, 4300, 6000];
    for (const delay of delays) {
      setTimeout(() => {
        if (probe.autoStopRetryToken !== token) return;
        if (probe.lastSignalSpinId !== spinId) return;
        if (Date.now() > probe.autoStopRetryUntil) return;

        const result = tryStopAutoplay();
        probe.autoStopAttempts += 1;

        if (result?.ok) {
          probe.autoStopStatus = `停止自動轉重試中（第 ${probe.autoStopAttempts} 次）`;
          render();
        }
      }, delay);
    }
  }

  function hideSignalToast() {
    try {
      document.getElementById('xinyao-atg-signal-toast-v1')?.remove();
    } catch (_) {}
  }

  function showSignalToast(signal, stopResult) {
    try {
      let toast = document.getElementById('xinyao-atg-signal-toast-v1');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'xinyao-atg-signal-toast-v1';
        toast.style.cssText = 'position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:2147483647;width:min(320px,calc(100vw - 24px));box-sizing:border-box;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,184,212,.55);background:rgba(24,20,31,.96);color:#fff;box-shadow:0 12px 34px rgba(0,0,0,.42);font-family:-apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif;text-align:center;pointer-events:none;';
        (document.body || document.documentElement).appendChild(toast);
      }

      // test87：不顯示 SCATTER / 眼睛 / 弓箭等判斷明細，
      // 會員只需要看到購買建議與目前盤面訊號百分比。
      const score = Math.max(0, Math.min(100, Math.round(Number(signal?.score) || 0)));
      toast.innerHTML = `
        <div style="font-size:16px;font-weight:950;color:#ffb8d4;">盤面訊號 ${score}%</div>
        <div style="margin-top:6px;font-size:12px;font-weight:900;color:#fff;">🎁 建議購買免費遊戲</div>
      `;

      showSignalToast._shownAt = Date.now();
      try { navigator.vibrate?.([80, 50, 120]); } catch (_) {}
    } catch (_) {}
  }

  // 只在「真正下一轉 spin」發生，而且時間晚於提示出現之後，才把提示框收掉。
  // 上一局的 closeSpin / 結算 / UI 收尾事件全部忽略。
  try {
    window.addEventListener('xinyao:spin-start-observed', event => {
      const type = String(event?.detail?.type || '');
      const at = Number(event?.detail?.at || 0);
      const shownAt = Number(showSignalToast._shownAt || 0);
      if (type !== 'spin') return;
      if (!shownAt || at <= shownAt) return;
      hideSignalToast();
    });
  } catch (_) {}

  function roomText() {
    const value = probe.roomNumber;
    if (value === null || value === undefined || value === '') return '—';
    return String(value).padStart(4, '0');
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureStyle() {
    if (document.getElementById('xinyao-atg-board-probe-style-v01')) return;

    const style = document.createElement('style');
    style.id = 'xinyao-atg-board-probe-style-v01';
    style.textContent = `
      #${PANEL_ID}{
        position:fixed;
        top:8px;
        right:8px;
        z-index:2147483646;
        width:270px;
        max-width:calc(100vw - 16px);
        box-sizing:border-box;
        padding:9px 10px;
        border:1px solid rgba(255,255,255,.20);
        border-radius:14px;
        background:rgba(24,20,31,.92);
        color:#fff;
        box-shadow:0 5px 20px rgba(0,0,0,.32);
        backdrop-filter:blur(10px);
        -webkit-backdrop-filter:blur(10px);
        font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;
        user-select:none;
        -webkit-user-select:none;
      }
      #${PANEL_ID} .bp-head{display:flex;align-items:center;justify-content:space-between;gap:9px;cursor:pointer;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.14)}
      #${PANEL_ID} .bp-title{font-size:12px;font-weight:900;letter-spacing:.05px}
      #${PANEL_ID} .bp-mini{display:flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:5px;background:rgba(255,255,255,.07);font-size:9px;opacity:.82}
      #${PANEL_ID} .bp-status{margin-top:6px;font-size:10px;color:#8deac1;font-weight:800}
      #${PANEL_ID} .bp-profile-switch{position:relative;margin-top:6px}
      #${PANEL_ID} .bp-profile-main{width:100%;display:flex;align-items:center;justify-content:space-between;gap:7px;border:1px solid rgba(255,95,158,.45);border-radius:8px;background:rgba(255,95,158,.10);color:#ffd4e5;padding:6px 8px;font-size:9px;font-weight:900;cursor:pointer;box-shadow:0 0 0 1px rgba(255,95,158,.05) inset}
      #${PANEL_ID} .bp-profile-main-label{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${PANEL_ID} .bp-profile-arrow{font-size:8px;opacity:.78}
      #${PANEL_ID} .bp-profile-menu{display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:30;padding:5px;border:1px solid rgba(255,184,212,.35);border-radius:9px;background:rgba(22,18,28,.985);box-shadow:0 8px 22px rgba(0,0,0,.42)}
      #${PANEL_ID} .bp-profile-menu.open{display:block}
      #${PANEL_ID} .bp-profile-option{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid transparent;border-radius:7px;background:transparent;color:rgba(255,255,255,.82);padding:7px 8px;margin:0 0 3px;font-size:9px;font-weight:850;text-align:left;cursor:pointer}
      #${PANEL_ID} .bp-profile-option:last-child{margin-bottom:0}
      #${PANEL_ID} .bp-profile-option.active{border-color:rgba(255,95,158,.40);background:rgba(255,95,158,.13);color:#ffd4e5}
      #${PANEL_ID} .bp-profile-check{color:#ff9fc4;font-weight:950}
      #${PANEL_ID} .bp-signal{margin-top:7px;padding:7px 8px;border:1px solid rgba(255,255,255,.10);border-radius:9px;background:rgba(255,255,255,.035)}
      #${PANEL_ID} .bp-signal.hot{border-color:rgba(255,95,158,.62);background:rgba(255,95,158,.10);box-shadow:0 0 0 1px rgba(255,95,158,.08) inset}
      #${PANEL_ID} .bp-signal-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:9px}
      #${PANEL_ID} .bp-signal-row b{font-size:10px;color:#ffb8d4}
      #${PANEL_ID} .bp-signal-state{font-weight:850;opacity:.82}
      #${PANEL_ID} .bp-signal-bar{height:4px;margin-top:5px;border-radius:999px;background:rgba(255,255,255,.09);overflow:hidden}
      #${PANEL_ID} .bp-signal-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#ff7bac,#ff3d8b);transition:width .2s ease}
      #${PANEL_ID} .bp-signal-reason{margin-top:5px;font-size:7px;line-height:1.35;opacity:.62}
      #${PANEL_ID} .bp-autostop{margin-top:5px;width:100%;border:1px solid rgba(255,184,212,.20);border-radius:6px;background:rgba(255,255,255,.04);color:#fff;padding:3px;font-size:7px;font-weight:850;cursor:pointer}
      #${PANEL_ID} .bp-autostop.on{color:#ffcae0;border-color:rgba(255,95,158,.32)}
      #${PANEL_ID} .bp-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin-top:7px}
      /* 武俠盤面專用：只保留高清符號及次數，不影響其他遊戲 */
      #${PANEL_ID} .bp-grid.bp-wuxia-compact{grid-template-columns:repeat(3,minmax(0,1fr))!important;grid-auto-rows:min-content!important;align-items:start!important;gap:5px!important}
      #${PANEL_ID} .bp-grid.bp-wuxia-compact .bp-item{box-sizing:border-box!important;height:76px!important;min-height:0!important;max-height:76px!important;padding:4px 2px!important;display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:center!important;gap:3px!important}
      #${PANEL_ID} .bp-grid.bp-wuxia-compact .bp-icon-shell{width:40px!important;height:40px!important;min-height:40px!important;flex:0 0 40px!important;margin:0 auto!important}
      #${PANEL_ID} .bp-grid.bp-wuxia-compact .bp-icon-img{width:40px!important;height:40px!important;max-width:40px!important;max-height:40px!important;object-fit:contain!important}
      #${PANEL_ID} .bp-grid.bp-wuxia-compact .bp-name{display:none!important}
      #${PANEL_ID} .bp-grid.bp-wuxia-compact .bp-count{margin:0!important;line-height:19px!important;font-size:16px!important}
      /* 巴風特專屬緊湊排列：移除九宮格卡片下方的多餘留白 */
      #${PANEL_ID} .bp-grid.bp-baphomet-compact{grid-template-columns:repeat(3,minmax(0,1fr))!important;grid-auto-rows:min-content!important;align-items:start!important;gap:4px!important}
      #${PANEL_ID} .bp-grid.bp-baphomet-compact .bp-item{box-sizing:border-box!important;height:74px!important;min-height:0!important;max-height:74px!important;padding:3px 2px!important;display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:center!important;gap:2px!important}
      #${PANEL_ID} .bp-grid.bp-baphomet-compact .bp-icon-shell{width:45px!important;height:45px!important;min-height:45px!important;flex:0 0 45px!important;margin:0 auto!important}
      #${PANEL_ID} .bp-grid.bp-baphomet-compact .bp-icon-img{width:45px!important;height:45px!important;max-width:45px!important;max-height:45px!important;object-fit:contain!important}
      #${PANEL_ID} .bp-grid.bp-baphomet-compact .bp-count{margin:0!important;line-height:17px!important}
      #${PANEL_ID} .bp-grid.bp-baphomet-compact .bp-name{display:none!important}
      /* 巴風特卡片獨立限制：正方形原圖，僅顯示圖片與次數，不影響其他遊戲 */
      #${PANEL_ID} .bp-item:has(.bp-baphomet-original-art) .bp-icon-shell{width:40px!important;height:40px!important;min-width:40px;min-height:40px;overflow:hidden!important}
      #${PANEL_ID} .bp-item:has(.bp-baphomet-original-art) .bp-baphomet-original-art{width:32px!important;height:32px!important;min-width:32px!important;min-height:32px!important;aspect-ratio:1/1!important;flex-shrink:0!important;image-rendering:-webkit-optimize-contrast!important;filter:contrast(1.14) saturate(1.09)!important}
      #${PANEL_ID} .bp-item:has(.bp-baphomet-original-art) .bp-name{display:none!important}
      #${PANEL_ID} .bp-item{padding:5px 3px 6px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(255,255,255,.045);text-align:center;min-width:0;overflow:visible}
      #${PANEL_ID} .bp-icon-shell{display:flex;width:42px;height:42px;margin:0 auto;align-items:center;justify-content:center;overflow:visible;background:transparent!important}
      #${PANEL_ID} .bp-icon{display:block;width:48px;height:48px;max-width:48px;max-height:48px;margin:0 auto;border-radius:0!important;box-shadow:none!important;background:transparent!important}
      #${PANEL_ID} .bp-icon-img{object-fit:contain;object-position:center center;box-sizing:border-box;padding:0!important;background:transparent!important;overflow:visible;box-shadow:none!important;border-radius:0!important;filter:none!important;image-rendering:auto!important}
      /* test95：五色寶石統一「肉眼大小」，不是只統一外框。 */
      #${PANEL_ID} .bp-gem-icon{width:36px!important;height:36px!important;max-width:36px!important;max-height:36px!important;object-fit:contain!important;transform-origin:center center!important}
      #${PANEL_ID} .bp-gem-5{transform:scale(1.08)!important}
      #${PANEL_ID} .bp-gem-6{transform:scale(.90)!important}
      #${PANEL_ID} .bp-gem-7{transform:scale(1.00)!important}
      #${PANEL_ID} .bp-gem-8{transform:scale(1.05)!important}
      #${PANEL_ID} .bp-gem-9{transform:scale(1.08)!important}
      #${PANEL_ID} .bp-icon-clean{background:transparent!important;padding:0!important;box-shadow:none!important;border-radius:0!important;object-fit:contain!important;object-position:center center!important;filter:none!important}
      #${PANEL_ID} .bp-multiplier{display:flex;align-items:center;justify-content:center;border-radius:50%;background:radial-gradient(circle at 35% 30%,#47d378,#15884d 70%);border:2px solid #e4b54b;color:#ffe16a;font-size:24px;font-weight:950;line-height:1}
      #${PANEL_ID} .bp-multiplier-live{display:flex!important;align-items:center!important;justify-content:center!important;border-radius:50%!important;background:radial-gradient(circle at 35% 30%,#65e58c 0%,#199f55 46%,#087039 78%)!important;border:3px solid #e6b74f!important;outline:1px solid rgba(255,232,132,.55)!important;color:#ffe86b!important;font-size:13px!important;font-weight:950!important;line-height:1!important;text-shadow:0 1px 2px rgba(0,0,0,.85)!important;box-shadow:none!important;}
      #${PANEL_ID} .bp-scatter{display:flex;align-items:center;justify-content:center;border-radius:9px;background:radial-gradient(circle at 35% 30%,#ffd26d,#b22f59 72%);border:1px solid rgba(255,221,128,.78);color:#fff4b8;font-size:18px;font-weight:950;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,.45)}
      #${PANEL_ID} .bp-unknown{display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.06);color:#9eb4c7;font-size:18px;font-weight:900}
      #${PANEL_ID} .bp-name{display:block;margin-top:2px;font-size:8px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.80}
      #${PANEL_ID} .bp-seq-title{margin-top:8px;font-size:9px;font-weight:850;opacity:.78}
      #${PANEL_ID} .bp-board-toggle{width:100%;margin-top:7px;border:1px solid rgba(255,184,212,.26);border-radius:7px;background:rgba(255,95,158,.08);color:#ffd5e6;padding:5px;font-size:8px;font-weight:850;cursor:pointer}
      #${PANEL_ID} .bp-stop-learn{width:100%;margin-top:5px;border:1px solid rgba(125,236,183,.34);border-radius:7px;background:rgba(63,191,126,.10);color:#c8f8dc;padding:5px;font-size:8px;font-weight:900;cursor:pointer}
      #${PANEL_ID} .bp-stop-test{width:100%;margin-top:4px;border:1px solid rgba(255,210,96,.34);border-radius:7px;background:rgba(255,196,64,.08);color:#ffe2a0;padding:5px;font-size:8px;font-weight:900;cursor:pointer}
      #${PANEL_ID} .bp-board-wrap{display:none}
      #${PANEL_ID} .bp-board-wrap.open{display:block}
      #${PANEL_ID} .bp-seq-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:3px;margin-top:5px}
      #${PANEL_ID} .bp-cell{position:relative;display:flex;align-items:center;justify-content:center;min-height:26px;padding:3px;border-radius:7px;background:rgba(255,255,255,.06);font-size:9px;font-weight:900}
      #${PANEL_ID} .bp-cell i{position:absolute;top:1px;left:3px;font-size:6px;font-style:normal;opacity:.35}
      #${PANEL_ID} .bp-count{display:block;margin-top:2px;color:#ffb8d4;font-size:12px;font-weight:950}
      #${PANEL_ID} .bp-path{margin-top:7px;padding-top:6px;border-top:1px solid rgba(255,255,255,.14);font-size:8px;line-height:1.35;opacity:.46;word-break:break-all}
      #${PANEL_ID}.min .bp-body{display:none}
      html.xinyao-phone-ui #${PANEL_ID}{
        top:max(6px,env(safe-area-inset-top,0px));
        right:6px;
        width:min(176px,calc(100vw - 12px));
        max-width:calc(100vw - 12px);
        max-height:58dvh;
        overflow-x:hidden;
        overflow-y:auto;
        -webkit-overflow-scrolling:touch;
        padding:6px;
      }
      html.xinyao-phone-ui #${PANEL_ID}.min{
        width:auto;
        min-width:0;
        max-width:174px;
        padding:7px 9px;
        overflow:hidden;
      }
      html.xinyao-phone-ui #${PANEL_ID}.min .bp-head{
        padding-bottom:0;
        border-bottom:0;
        gap:6px;
      }
      html.xinyao-phone-ui #${PANEL_ID}.min .bp-title{font-size:10px;white-space:nowrap}
      html.xinyao-phone-ui #${PANEL_ID}:not(.min) .bp-title{font-size:10px}
      html.xinyao-phone-ui #${PANEL_ID}:not(.min) .bp-head{gap:5px;padding-bottom:5px}
      html.xinyao-phone-ui #${PANEL_ID} .bp-status{font-size:8px}
      html.xinyao-phone-ui #${PANEL_ID} .bp-signal-card{padding:6px;margin-top:6px}
      html.xinyao-phone-ui #${PANEL_ID}.min .bp-mini{width:15px;height:15px;flex:0 0 auto}
      html.xinyao-phone-ui #${PANEL_ID} .bp-signal-reason,
      html.xinyao-phone-ui #${PANEL_ID} .bp-autostop,
      html.xinyao-phone-ui #${PANEL_ID} .bp-board-toggle,
      html.xinyao-phone-ui #${PANEL_ID} .bp-board-wrap{display:none!important}
      html.xinyao-phone-ui #${PANEL_ID} .bp-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:3px}
      html.xinyao-phone-ui #${PANEL_ID} .bp-item{
        display:block;
        min-height:62px;
        padding:3px 1px;
        border-radius:8px;
      }
      html.xinyao-phone-ui #${PANEL_ID} .bp-icon-shell{width:30px;height:30px;margin:0 auto 2px}
      html.xinyao-phone-ui #${PANEL_ID} .bp-icon{width:28px;height:28px}
      #${PANEL_ID} .bp-text-icon{display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1}
      html.xinyao-phone-ui #${PANEL_ID} .bp-item-name{font-size:8px;line-height:1.15}
      html.xinyao-phone-ui #${PANEL_ID} .bp-item-count{font-size:10px;line-height:1.15;margin-top:2px}

      @media (max-width:760px), (max-height:760px) and (pointer:coarse){
        #${PANEL_ID}{
          top:max(6px,env(safe-area-inset-top,0px));
          right:6px;
          width:min(176px,calc(100vw - 12px));
          max-width:calc(100vw - 12px);
          max-height:58dvh;
          overflow-x:hidden;
          overflow-y:auto;
          -webkit-overflow-scrolling:touch;
          padding:6px;
        }
        #${PANEL_ID}.min{
          width:auto;
          min-width:0;
          max-width:174px;
          padding:7px 9px;
          overflow:hidden;
        }
        #${PANEL_ID}.min .bp-head{
          padding-bottom:0;
          border-bottom:0;
          gap:6px;
        }
        #${PANEL_ID}.min .bp-title{
          font-size:10px;
          white-space:nowrap;
        }
        #${PANEL_ID}.min .bp-mini{
          width:15px;
          height:15px;
          flex:0 0 auto;
        }
        #${PANEL_ID} .bp-signal-reason,
        #${PANEL_ID} .bp-autostop,
        #${PANEL_ID} .bp-board-toggle,
        #${PANEL_ID} .bp-board-wrap{display:none!important}
        #${PANEL_ID} .bp-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:3px}
        #${PANEL_ID} .bp-item{display:block}
        #${PANEL_ID} .bp-item{padding:3px 1px;min-height:62px}
        #${PANEL_ID} .bp-icon-shell{width:30px;height:30px}
        #${PANEL_ID} .bp-icon{width:28px;height:28px}
        #${PANEL_ID} .bp-seq-grid{gap:2px}
        #${PANEL_ID} .bp-cell{min-height:23px;font-size:8px;padding:2px}
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function ensurePanel() {
    ensureStyle();

    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="bp-head">
        <div class="bp-title">🌸 芯瑤 ATG 盤面監測</div>
        <div class="bp-mini">－</div>
      </div>
      <div class="bp-body"></div>
    `;

    panel.classList.toggle('min', probe.minimized);
    {
      const icon = panel.querySelector('.bp-mini');
      if (icon) icon.textContent = probe.minimized ? '＋' : '－';
    }

    panel.querySelector('.bp-head')?.addEventListener('click', () => {
      const opening = probe.minimized;
      probe.minimized = !probe.minimized;
      panel.classList.toggle('min', probe.minimized);
      const icon = panel.querySelector('.bp-mini');
      if (icon) icon.textContent = probe.minimized ? '＋' : '－';

      if (opening && !probe.minimized && xinyaoIsPhoneUi()) {
        try {
          window.dispatchEvent(new CustomEvent('xinyao:mobile-panel-open', {
            detail: { panel:'board' }
          }));
        } catch (_) {}
      }
    });

    try {
      window.addEventListener('xinyao:mobile-panel-open', event => {
        if (!xinyaoIsPhoneUi()) return;
        const who = String(event?.detail?.panel || '');

        // test87：盤面監測與即時資料面板可同時開啟。
        // 只有全房分析打開時才自動收合盤面監測。
        if (who !== 'rooms') return;

        if (!probe.minimized) {
          probe.minimized = true;
          panel.classList.add('min');
          const icon = panel.querySelector('.bp-mini');
          if (icon) icon.textContent = '＋';
          const title = panel.querySelector('.bp-title');
          if (title) title.textContent = probe.signalScore > 0
            ? `📡 盤面 ${probe.signalScore}%`
            : '📡 盤面監測';
        }
      });
    } catch (_) {}

    (document.body || document.documentElement).appendChild(panel);
    return panel;
  }

  function profileSwitchMarkup() {
    const current = gameProfileOption();
    return `
      <div class="bp-profile-switch">
        <button type="button" class="bp-profile-main" aria-expanded="false">
          <span class="bp-profile-main-label">🎮 遊戲類別｜${current.icon} ${current.label}</span>
          <span class="bp-profile-arrow">▾</span>
        </button>
        <div class="bp-profile-menu">
          ${GAME_PROFILE_OPTIONS.map(item => `
            <button type="button" class="bp-profile-option ${probe.gameProfile === item.id ? 'active' : ''}" data-profile="${item.id}">
              <span>${item.icon} ${item.label}</span>
              <span class="bp-profile-check">${probe.gameProfile === item.id ? '✓' : ''}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function bindProfileSwitch(root) {
    if (!root) return;

    const main = root.querySelector('.bp-profile-main');
    const menu = root.querySelector('.bp-profile-menu');
    const arrow = root.querySelector('.bp-profile-arrow');

    if (main && menu) {
      main.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const open = !menu.classList.contains('open');
        menu.classList.toggle('open', open);
        main.setAttribute('aria-expanded', String(open));
        if (arrow) arrow.textContent = open ? '▴' : '▾';
      });
    }

    for (const button of root.querySelectorAll('.bp-profile-option[data-profile]')) {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const profile = String(button.dataset.profile || '');
        if (!validManualGameProfile(profile)) return;

        if (menu) menu.classList.remove('open');
        if (main) main.setAttribute('aria-expanded', 'false');
        if (arrow) arrow.textContent = '▾';

        setManualGameProfile(profile);
      });
    }
  }

  function render() {
    if (window.__XIANYAO_MAINTENANCE_STATE__?.enabled) {
      const existing = document.getElementById(PANEL_ID);
      if (existing) existing.style.display = 'none';
      return;
    }

    const panel = ensurePanel();
    panel.style.display = '';
    panel.classList.toggle('min', probe.minimized);

    {
      const icon = panel.querySelector('.bp-mini');
      if (icon) icon.textContent = probe.minimized ? '＋' : '－';
      const title = panel.querySelector('.bp-title');
      if (title) {
        const mobile = xinyaoIsPhoneUi();
        title.textContent = mobile && probe.minimized
          ? (probe.signalScore > 0 ? `📡 盤面 ${probe.signalScore}%` : '📡 盤面監測')
          : '🌸 芯瑤 ATG 盤面監測';
      }
    }

    const body = panel.querySelector('.bp-body');
    if (!body) return;

    const candidate = probe.candidate;
    const isBaphometSymbols = probe.gameProfile === 'baphomet';

    if (!candidate) {
      body.innerHTML = `
        ${profileSwitchMarkup()}
        <div class="bp-status">● ${esc(probe.status)}</div>
        <div class="bp-path">房號 ${esc(roomText())}｜完成一局後才分析已結束盤面</div>
        ${isBaphometSymbols ? '<div class="bp-path">🔥 巴風特符號 ID 對照模式：等待已完成的盤面資料；不套用賽特2符號。</div>' : ''}
      `;
      bindProfileSwitch(body);
      return;
    }

    const signalHot = probe.signalScore >= SIGNAL_THRESHOLD;
    const signalMarkup = `
      <div class="bp-signal ${signalHot ? 'hot' : ''}">
        <div class="bp-signal-row">
          <b>📡 盤面訊號 ${probe.signalScore}%</b>
          <span class="bp-signal-state">${signalHot ? '條件達標' : '觀察中'}</span>
        </div>
        <div class="bp-signal-bar"><i style="width:${Math.max(0, Math.min(100, probe.signalScore))}%"></i></div>
        <div class="bp-signal-reason">${esc(probe.signalReason)}｜僅依已完成盤面統計</div>
        <div class="bp-autostop on">⏹ 自動停轉：固定開啟｜達 80% 直接按右下角 ■</div>
      </div>
    `;

    const sourceItems = candidate.items
      .filter(item => !['10','12','13'].includes(String(item.token)))
      .slice(0, 12);

    const cards = sourceItems.map(item => `
      <div class="bp-item" title="${esc(symbolLabel(item.token))}｜ID ${esc(item.token)}">
        ${symbolIconHtml(item.token)}
        ${!isBaphometSymbols && probe.gameProfile !== 'scarlet' ? `<span class="bp-name">${esc(symbolLabel(item.token))}</span>` : ''}
        <span class="bp-count">×${item.count}</span>
      </div>
    `).join('');

    const sequence = Array.isArray(candidate.tokens)
      ? candidate.tokens.slice(0, 30).map((token, index) => `
          <div class="bp-cell" title="ID ${esc(token)}"><i>${index + 1}</i>${isBaphometSymbols ? `ID ${esc(token)}` : (['10','12','13'].includes(String(token)) ? '—' : esc(symbolLabel(token)))}</div>
        `).join('')
      : '';

    body.innerHTML = `
      ${profileSwitchMarkup()}
      <div class="bp-status">● 已完成盤面偵測｜${esc(gameProfileOption().label)}</div>
      ${signalMarkup}
      <div class="bp-grid${isBaphometSymbols ? ' bp-baphomet-compact' : (['wuxia','scarlet'].includes(probe.gameProfile) ? ' bp-wuxia-compact' : '')}">${cards}</div>
      ${!isBaphometSymbols ? `
      <button type="button" class="bp-board-toggle">查看 30 格盤面</button>
      <div class="bp-board-wrap">
        ${sequence ? `<div class="bp-seq-title">30 格盤面順序（6 欄）</div><div class="bp-seq-grid">${sequence}</div>` : ''}
        <div class="bp-path">
          ${candidate.total} 格｜${candidate.unique} 種圖案<br>
          偵測來源：${esc(candidate.path)}
        </div>
      </div>
      ` : ''}
    `;

    bindProfileSwitch(body);
    cleanRenderedIconCards(body);

    const boardToggle = body.querySelector('.bp-board-toggle');
    const boardWrap = body.querySelector('.bp-board-wrap');
    if (boardToggle && boardWrap) {
      boardToggle.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        const open = boardWrap.classList.toggle('open');
        boardToggle.textContent = isBaphometSymbols ? (open ? '收起盤面 ID 順序' : '查看盤面 ID 順序') : (open ? '收起 30 格盤面' : '查看 30 格盤面');
      };
    }

  }

  function handleSpinFinal(event) {
    const detail = event?.detail || {};
    const spinId = String(detail.spinId || '');
    if (!spinId || spinId === probe.lastSpinId) return;

    probe.lastSpinId = spinId;

    if (probe.autoStopRetryUntil > Date.now() && probe.lastSignalSpinId && probe.lastSignalSpinId !== spinId) {
      const retryResult = tryStopAutoplay();
      if (retryResult?.ok) {
        probe.autoStopAttempts += 1;
        probe.autoStopStatus = `上一個停止動作未生效，自動轉仍在跑｜已重試第 ${probe.autoStopAttempts} 次`;
      }
    }

    const previousRoom = probe.roomNumber;
    const previousGameProfile = probe.gameProfile;
    // test99：圖示組只看右上角手動選擇，任何封包/Canvas/上一款遊戲都不得覆寫。
    probe.gameProfile = loadManualGameProfile();
    probe.roomNumber = detail.roomNumber ?? null;
    probe.updatedAt = Date.now();

    if (
      String(previousRoom ?? '') !== String(probe.roomNumber ?? '') ||
      previousGameProfile !== probe.gameProfile
    ) {
      probe.signalHistory = [];
      probe.signalArmed = true;
      probe.signalTriggered = false;
      probe.autoStopStatus = '';
      probe.autoStopRetryToken += 1;
      probe.autoStopRetryUntil = 0;
      probe.autoStopAttempts = 0;
      probe.learnedStopButtonRef = null;
      try {
        window.__XIANYAO_ATG_GAME_PROFILE_HINT__ = probe.gameProfile;
        window.__XIANYAO_ATG_GAME_PROFILE_PAYLOAD_HINT__ = '';
      } catch (_) {}
    }

    const result = chooseCandidate(detail.finalState, detail.engine);
    probe.candidate = result.best;
    probe.candidateCount = result.count;
    probe.status = result.best
      ? '已完成本局盤面候選分析'
      : '本局還找不到可靠的盤面陣列';

    probe.multiplierValues = [];

    const signal = computeBoardSignal(probe.candidate);
    probe.signalScore = signal.score;
    probe.signalReason = signal.reason;

    // 計分完成後才把本局加入歷史，避免本局拿自己當基準。
    recordAdaptiveBoard(probe.candidate, signal);

    probe.signalHistory.push({
      spinId,
      base:signal.base,
      score:signal.score,
      adaptiveSamples:signal.adaptiveSamples,
      adaptiveAdjustment:signal.adaptiveAdjustment,
      patternTag:signal.patternTag,
      patternKey:signal.patternKey,
      patternBonus:signal.patternBonus,
      repeatPenalty:signal.repeatPenalty,
      concentrationPenalty:signal.concentrationPenalty,
      at:Date.now()
    });
    if (probe.signalHistory.length > 12) probe.signalHistory.splice(0, probe.signalHistory.length - 12);

    if (signal.score < SIGNAL_REARM_THRESHOLD) {
      probe.signalArmed = true;
      probe.signalTriggered = false;
    }

    let stopResult = null;
    const shouldTrigger =
      signal.score >= SIGNAL_THRESHOLD &&
      signal.ready === true &&
      signal.triggerEligible === true &&
      probe.signalArmed &&
      probe.lastSignalSpinId !== spinId;

    if (shouldTrigger) {
      probe.signalArmed = false;
      probe.signalTriggered = true;
      probe.lastSignalSpinId = spinId;
      stopResult = tryStopAutoplay();
      probe.autoStopStatus = stopResult?.ok
        ? '建議購買免費遊戲'
        : '建議購買免費遊戲';
      scheduleAutoplayStopRetries(spinId);

      try {
        window.dispatchEvent(new CustomEvent('xinyao:board-signal', {
          detail: {
            spinId,
            roomNumber: probe.roomNumber,
            score: signal.score,
            reason: signal.reason,
            autoStop: probe.autoStopStatus
          }
        }));
      } catch (_) {}
    }

    render();
    if (shouldTrigger) showSignalToast(signal, stopResult);

    try {
      window.__XIANYAO_ATG_BOARD_PROBE_STATE__ = {
        spinId: probe.lastSpinId,
        roomNumber: probe.roomNumber,
        gameProfile: probe.gameProfile,
        gameProfileName: gameProfileName(),
        gameProfileSharedHint: String(window.__XIANYAO_ATG_GAME_PROFILE_HINT__ || ''),
        updatedAt: probe.updatedAt,
        candidate: probe.candidate,
        candidateCount: probe.candidateCount,
        signalScore: probe.signalScore,
        signalReason: probe.signalReason,
        signalTriggered: probe.signalTriggered,
        adaptiveRoomSamples: adaptiveRoomHistory().length,
        adaptiveWindow: ADAPTIVE_MAX_SAMPLES,
        adaptiveMinSamples: ADAPTIVE_MIN_SAMPLES,
        boardPatternTag: signal.patternTag,
        boardPatternKey: signal.patternKey,
        boardPatternBonus: signal.patternBonus,
        boardRepeatPenalty: signal.repeatPenalty,
        boardConcentrationPenalty: signal.concentrationPenalty,
        boardSignalParts: signal.parts || null,
        signalReady: Boolean(signal.ready),
        signalTriggerEligible: Boolean(signal.triggerEligible),
        signalRarityPercentile: Number(signal.rarityPercentile || 0),
        signalQualityIndex: Number(signal.qualityIndex || 0),
        signalZScore: Number(signal.zScore || 0),
        signalHistoryMean: Number(signal.historyMean || 0),
        signalHistoryStdDev: Number(signal.historyStdDev || 0),
        autoStopEnabled: probe.autoStopEnabled,
        autoStopStatus: probe.autoStopStatus,
        autoStopLastVia: probe.autoStopLastVia,
        autoStopAttempts: probe.autoStopAttempts,
        stopLearned: probe.stopLearned,
        stopLearnInfo: probe.stopLearnInfo,
        stopReplayHandlerCount: Array.isArray(probe.stopReplayRefs) ? probe.stopReplayRefs.length : 0,
        stopReplayNodeEvent: probe.stopReplayNodeEvent
      };
    } catch (_) {}
  }


  window.__XIANYAO_ATG_STOP_AUTOPLAY__ = {
    version:'1.0.0-test189',
    stop:() => tryStopAutoplay(),
    available:() => {
      try { return sameOriginSignalWindows().some(w => Boolean(findExactATGStopAutoButton(w)?.button)); } catch (_) { return false; }
    },
    getLastVia:() => String(probe.autoStopLastVia || '')
  };

  window.addEventListener(EVENT_NAME, handleSpinFinal);

  try {
    window.addEventListener('xinyao:maintenance', render);
  } catch (_) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once:true });
  } else {
    render();
  }
})();




/* ===== 芯瑤 ATG 止盈／止損 v1.0｜test186 ===== */
(() => {
  'use strict';
  if (window.__XIANYAO_ATG_RISK_GUARD_V1__) return;
  window.__XIANYAO_ATG_RISK_GUARD_V1__ = true;

  const PANEL_ID='xinyao-atg-risk-guard-v1';
  const MINI_ID='xinyao-atg-risk-mini-v1';
  const TOAST_ID='xinyao-atg-risk-toast-v1';
  const STYLE_ID='xinyao-atg-risk-style-v1';
  const SETTINGS_KEY='xinyao_atg_risk_guard_settings_v1';
  const SESSION_KEY='xinyao_atg_risk_guard_session_v1';

  let cfg={autoStop:true,takeProfit:3000,stopLoss:3000,showPnl:true,showLimits:true};
  let run={active:false,startBalance:null,triggered:false,triggerType:'',stopStatus:'',stopAttempts:0};
  let retryToken=0;

  const n=v=>{
    if(v===null||v===undefined||v==='')return null;
    const x=Number(v);
    return Number.isFinite(x)?x:null;
  };
  const clamp=v=>{
    const x=n(v);
    return x===null?0:Math.max(0,Math.min(1000000,Math.round(x)));
  };
  const balance=()=>n((window.__XIANYAO_ATG_LIVE_SNAPSHOT__||{}).balance);
  const pnl=()=>{
    const b=balance();
    if(b===null||run.startBalance===null)return 0;
    return Math.round((b-run.startBalance)*100)/100;
  };
  const money=(v,signed)=>{
    const x=n(v);
    if(x===null)return '—';
    const body=Math.abs(x).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
    if(!signed)return body;
    return x>0?'+'+body:x<0?'-'+body:'+0.00';
  };

  function save(){
    try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(cfg));}catch(_){}
    try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(run));}catch(_){}
  }

  function load(){
    try{
      const x=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');
      cfg=Object.assign(cfg,x||{});
      cfg.autoStop=cfg.autoStop!==false;
      cfg.showPnl=cfg.showPnl!==false;
      cfg.showLimits=cfg.showLimits!==false;
      cfg.takeProfit=clamp(cfg.takeProfit||3000);
      cfg.stopLoss=clamp(cfg.stopLoss||3000);
    }catch(_){}
    try{
      const x=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'{}');
      if(x&&typeof x==='object')run=Object.assign(run,x);
      run.active=Boolean(run.active);
      run.triggered=Boolean(run.triggered);
      run.startBalance=n(run.startBalance);
    }catch(_){}
  }

  function ensureStyle(){
    if(document.getElementById(STYLE_ID))return;
    const el=document.createElement('style');
    el.id=STYLE_ID;
    el.textContent=
      '#'+PANEL_ID+'{position:fixed;z-index:2147483647;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;box-sizing:border-box;padding:18px;border:1px solid rgba(255,181,214,.56);border-radius:20px;background:rgba(17,15,22,.965);color:#fff;box-shadow:0 22px 70px rgba(0,0,0,.55);backdrop-filter:blur(14px);font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif}'+
      '#'+PANEL_ID+' .rg-head{display:flex;align-items:center;justify-content:space-between;gap:12px}'+
      '#'+PANEL_ID+' .rg-title{font-size:18px;font-weight:950;color:#ffd1e3}'+
      '#'+PANEL_ID+' .rg-close{border:0;background:transparent;color:#fff;font-size:24px;cursor:pointer;opacity:.7}'+
      '#'+PANEL_ID+' .rg-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 0;border-top:1px solid rgba(255,255,255,.08)}'+
      '#'+PANEL_ID+' .rg-label{font-size:13px;font-weight:900}'+
      '#'+PANEL_ID+' .rg-sub{font-size:10px;opacity:.62;margin-top:3px}'+
      '#'+PANEL_ID+' .rg-switch{position:relative;width:54px;height:30px;flex:0 0 54px;border:0;border-radius:999px;background:rgba(255,255,255,.13);cursor:pointer}'+
      '#'+PANEL_ID+' .rg-switch:after{content:"";position:absolute;left:4px;top:4px;width:22px;height:22px;border-radius:50%;background:#d9d0d4;transition:.18s}'+
      '#'+PANEL_ID+' .rg-switch.on{background:linear-gradient(135deg,#ff8fba,#ff5f9e)}'+
      '#'+PANEL_ID+' .rg-switch.on:after{transform:translateX(24px);background:#fff}'+
      '#'+PANEL_ID+' .rg-pnl{font-size:36px;font-weight:1000;text-align:center;margin:12px 0 14px}'+
      '#'+PANEL_ID+' .rg-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}'+
      '#'+PANEL_ID+' .rg-btn{border:1px solid rgba(255,184,214,.55);border-radius:11px;background:rgba(255,95,158,.14);color:#fff;padding:10px;font-size:13px;font-weight:950;cursor:pointer}'+
      '#'+PANEL_ID+' .rg-btn.primary{background:linear-gradient(135deg,#ff87b5,#ff5f9e);border-color:transparent}'+
      '#'+PANEL_ID+' .rg-number{display:grid;grid-template-columns:40px 1fr 40px;gap:6px;margin-top:7px}'+
      '#'+PANEL_ID+' .rg-number button{height:36px;border:1px solid rgba(255,184,214,.3);border-radius:9px;background:rgba(255,255,255,.045);color:#fff;font-size:20px;font-weight:900;cursor:pointer}'+
      '#'+PANEL_ID+' .rg-number input{height:36px;box-sizing:border-box;border:1px solid rgba(255,184,214,.28);border-radius:9px;background:rgba(255,255,255,.055);color:#fff;text-align:center;font-size:16px;font-weight:950;outline:none;width:100%}'+
      '#'+PANEL_ID+' .rg-status{margin-top:12px;padding:9px 10px;border:1px solid rgba(255,184,214,.16);border-radius:10px;background:rgba(255,255,255,.035);font-size:11px;line-height:1.55;color:#ffd0e1}'+
      '#'+MINI_ID+'{position:fixed;z-index:2147483645;left:10px;bottom:10px;min-width:126px;padding:8px 10px;border:1px solid rgba(255,184,214,.45);border-radius:12px;background:rgba(18,16,23,.90);color:#fff;box-shadow:0 8px 25px rgba(0,0,0,.35);font:800 11px -apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif;cursor:pointer}'+
      '#'+MINI_ID+' b{font-size:15px;color:#ffd0e2}'+
      '#'+TOAST_ID+'{position:fixed;z-index:2147483647;top:74px;left:50%;transform:translateX(-50%);width:min(330px,calc(100vw - 24px));box-sizing:border-box;padding:13px 15px;border:1px solid rgba(255,184,214,.58);border-radius:14px;background:rgba(19,16,24,.97);color:#fff;text-align:center;box-shadow:0 12px 38px rgba(0,0,0,.46);font:900 12px -apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif}';
    (document.head||document.documentElement).appendChild(el);
  }

  function toast(title,detail){
    let el=document.getElementById(TOAST_ID);
    if(!el){el=document.createElement('div');el.id=TOAST_ID;(document.body||document.documentElement).appendChild(el);}
    el.innerHTML='<div style="color:#ffb6d3;font-size:14px;">'+title+'</div>'+(detail?'<div style="margin-top:5px;font-size:11px;opacity:.8;">'+detail+'</div>':'');
    clearTimeout(toast.t);
    toast.t=setTimeout(()=>el&&el.remove(),4200);
  }

  function stopWithRetry(reason){
    const token=++retryToken;
    const delays=[0,80,180,350,650,1000,1600,2400,3600,5200];
    run.stopStatus='正在停止自動轉…';
    run.stopAttempts=0;
    save();
    update();

    delays.forEach((delay,index)=>{
      setTimeout(()=>{
        if(token!==retryToken)return;
        let result=null;
        try{result=window.__XIANYAO_ATG_STOP_AUTOPLAY__?.stop?.();}catch(_){}
        run.stopAttempts+=1;
        if(result&&result.ok){
          run.stopStatus='✅ 已送出停止自動轉｜'+reason;
          save();
          update();
          return;
        }
        if(index===delays.length-1){
          run.stopStatus='⚠️ 已達標，但目前找不到可按的停止鍵';
          save();
          update();
        }
      },delay);
    });
  }

  function trigger(type,value){
    if(run.triggered)return;
    run.triggered=true;
    run.triggerType=type;
    save();
    const label=type==='profit'?'止盈達標':'止損達標';
    const detail='本場盈虧 '+money(value,true);
    toast('🛡️ '+label,cfg.autoStop?detail+'｜正在停止自動轉':detail);
    if(cfg.autoStop)stopWithRetry(label);
    else{run.stopStatus='✅ '+label+'｜自動停止目前關閉';save();update();}
  }

  function evaluate(){
    if(!run.active||run.startBalance===null||run.triggered)return;
    const value=pnl();
    if(cfg.takeProfit>0&&value>=cfg.takeProfit){trigger('profit',value);return;}
    if(cfg.stopLoss>0&&value<=-cfg.stopLoss)trigger('loss',value);
  }

  function start(){
    const b=balance();
    if(b===null){toast('⚠️ 尚未取得目前點數','請進入遊戲後再按開始');return;}
    retryToken+=1;
    run.active=true;
    run.startBalance=b;
    run.triggered=false;
    run.triggerType='';
    run.stopStatus='監測中';
    run.stopAttempts=0;
    save();
    update();
  }

  function pause(){
    retryToken+=1;
    run.active=false;
    run.stopStatus='已暫停監測';
    save();
    update();
  }

  function reset(){
    retryToken+=1;
    run.startBalance=balance();
    run.triggered=false;
    run.triggerType='';
    run.stopStatus=run.active?'已重置｜監測中':'已重置';
    run.stopAttempts=0;
    save();
    update();
  }

  function ensurePanel(){
    ensureStyle();
    let p=document.getElementById(PANEL_ID);
    if(p)return p;
    p=document.createElement('div');
    p.id=PANEL_ID;
    p.style.display='none';
    p.innerHTML=
      '<div class="rg-head"><div class="rg-title">🛡️ 止盈／止損</div><button class="rg-close" type="button">×</button></div>'+
      '<div class="rg-row"><div><div class="rg-label">達到設定金額自動停止</div><div class="rg-sub">只停止 ATG 自動轉，不修改遊戲結果</div></div><button id="rgAuto" class="rg-switch" type="button"></button></div>'+
      '<div id="rgPnl" class="rg-pnl">+0.00</div>'+
      '<div class="rg-actions"><button id="rgStart" class="rg-btn primary" type="button">開始</button><button id="rgReset" class="rg-btn" type="button">↻ 重置</button></div>'+
      '<div class="rg-row"><div style="width:100%"><div class="rg-label" style="color:#8ff0ad">贏到＋（止盈）</div><div class="rg-number"><button data-delta="tp:-100">−</button><input id="rgTp" inputmode="numeric"><button data-delta="tp:100">＋</button></div></div></div>'+
      '<div class="rg-row"><div style="width:100%"><div class="rg-label" style="color:#ff91aa">輸到－（止損）</div><div class="rg-number"><button data-delta="sl:-100">−</button><input id="rgSl" inputmode="numeric"><button data-delta="sl:100">＋</button></div></div></div>'+
      '<div class="rg-row"><div class="rg-label">顯示本場盈虧</div><button id="rgShowPnl" class="rg-switch" type="button"></button></div>'+
      '<div class="rg-row"><div class="rg-label">顯示止盈／止損</div><button id="rgShowLimits" class="rg-switch" type="button"></button></div>'+
      '<div id="rgStatus" class="rg-status"></div>';
    (document.body||document.documentElement).appendChild(p);

    p.querySelector('.rg-close').onclick=()=>p.style.display='none';
    p.querySelector('#rgAuto').onclick=()=>{cfg.autoStop=!cfg.autoStop;save();update();};
    p.querySelector('#rgShowPnl').onclick=()=>{cfg.showPnl=!cfg.showPnl;save();update();};
    p.querySelector('#rgShowLimits').onclick=()=>{cfg.showLimits=!cfg.showLimits;save();update();};
    p.querySelector('#rgStart').onclick=()=>run.active?pause():start();
    p.querySelector('#rgReset').onclick=reset;

    p.querySelectorAll('[data-delta]').forEach(btn=>{
      btn.onclick=()=>{
        const parts=String(btn.dataset.delta||'').split(':');
        const delta=Number(parts[1]||0);
        if(parts[0]==='tp')cfg.takeProfit=clamp(cfg.takeProfit+delta);
        if(parts[0]==='sl')cfg.stopLoss=clamp(cfg.stopLoss+delta);
        save();update();
      };
    });

    const tp=p.querySelector('#rgTp');
    const sl=p.querySelector('#rgSl');
    const commit=()=>{
      cfg.takeProfit=clamp(tp.value);
      cfg.stopLoss=clamp(sl.value);
      save();update();
    };
    tp.onchange=commit; sl.onchange=commit;
    tp.onkeydown=e=>{if(e.key==='Enter')tp.blur();};
    sl.onkeydown=e=>{if(e.key==='Enter')sl.blur();};
    return p;
  }

  function renderMini(){
    ensureStyle();
    let m=document.getElementById(MINI_ID);
    if(!run.active||(!cfg.showPnl&&!cfg.showLimits)){m&&m.remove();return;}
    if(!m){
      m=document.createElement('button');
      m.type='button';m.id=MINI_ID;m.onclick=open;
      (document.body||document.documentElement).appendChild(m);
    }
    let html='';
    if(cfg.showPnl)html+='<div>🛡️ 本場 <b>'+money(pnl(),true)+'</b></div>';
    if(cfg.showLimits)html+='<div style="margin-top:3px;font-size:10px;opacity:.7;">−'+cfg.stopLoss.toLocaleString()+' / +'+cfg.takeProfit.toLocaleString()+'</div>';
    m.innerHTML=html;
  }

  function update(){
    const p=document.getElementById(PANEL_ID);
    if(p){
      const value=pnl();
      const pe=p.querySelector('#rgPnl');
      if(pe){pe.textContent=money(value,true);pe.style.color=value>0?'#8ff0ad':value<0?'#ff91aa':'#fff';}
      const tp=p.querySelector('#rgTp');
      const sl=p.querySelector('#rgSl');
      if(tp&&document.activeElement!==tp)tp.value=String(cfg.takeProfit);
      if(sl&&document.activeElement!==sl)sl.value=String(cfg.stopLoss);
      const set=(id,on)=>{const el=p.querySelector(id);if(el)el.classList.toggle('on',Boolean(on));};
      set('#rgAuto',cfg.autoStop);set('#rgShowPnl',cfg.showPnl);set('#rgShowLimits',cfg.showLimits);
      const startBtn=p.querySelector('#rgStart');if(startBtn)startBtn.textContent=run.active?'暫停監測':'開始';
      const st=p.querySelector('#rgStatus');
      if(st)st.innerHTML=(run.active?'● 監測中':'○ 尚未開始')+'｜起始點數 '+money(run.startBalance)+'｜目前點數 '+money(balance())+'<br>'+(run.stopStatus||'設定完成後按「開始」即可');
    }
    renderMini();
    try{window.__XIANYAO_ATG_RISK_GUARD_STATE__={version:'test189',settings:Object.assign({},cfg),session:Object.assign({},run),balance:balance(),pnl:pnl()};}catch(_){}
  }

  function open(){
    const p=ensurePanel();
    p.style.display='block';
    update();
  }

  load();
  document.addEventListener('click',e=>{
    const b=e.target&&e.target.closest?e.target.closest('#xinyaoRiskOpen'):null;
    if(!b)return;
    e.preventDefault();e.stopPropagation();open();
  },true);

  setInterval(()=>{evaluate();update();},250);

  window.__XIANYAO_ATG_RISK_GUARD__={
    version:'1.0.0-test189',
    open,start,pause,reset,
    getState:()=>({settings:Object.assign({},cfg),session:Object.assign({},run),balance:balance(),pnl:pnl()})
  };
  update();
})();


/* ===== 芯瑤 ATG Mobile Quick HUD v1.0｜test87 超小懸浮工具 ===== */
(() => {
  'use strict';

  if (window.__XIANYAO_ATG_MOBILE_QUICK_HUD_V1__) return;
  window.__XIANYAO_ATG_MOBILE_QUICK_HUD_V1__ = true;

  const HUD_ID = 'xinyao-atg-mobile-quick-hud';
  const STYLE_ID = 'xinyao-atg-mobile-quick-hud-style';
  const SIDE_KEY = 'xinyao_atg_mobile_quick_side_v1';
  const RESULT_POPUP_ID = 'xinyao-atg-result-popup-v1';
  const SPEEDS = [1, 3, 5, 8, 10, 12, 16];

  const isMobile = () => true;

  let side = 'left';
  let resultPopupOpen = false;
  try {
    side = localStorage.getItem(SIDE_KEY) === 'right' ? 'right' : 'left';
  } catch (_) {}

  function formatSigned(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    const digits = abs >= 10000 ? 0 : abs >= 1000 ? 0 : abs >= 100 ? 0 : 1;
    const body = abs.toLocaleString(undefined, {
      minimumFractionDigits:digits,
      maximumFractionDigits:digits
    });
    if (n > 0) return '+' + body;
    if (n < 0) return '-' + body;
    return '0';
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      html:not(.xinyao-phone-ui) #${HUD_ID}{display:none!important}
      #${HUD_ID}{
        position:fixed;
        top:max(48px,calc(env(safe-area-inset-top,0px) + 8px));
        left:6px;
        z-index:2147483645;
        width:92px;
        box-sizing:border-box;
        padding:6px;
        border:1px solid rgba(255,184,214,.72);
        border-radius:14px;
        background:rgba(8,8,12,.72);
        color:#fff;
        box-shadow:
          0 0 0 .5px rgba(255,205,225,.10) inset,
          0 0 5px rgba(255,170,207,.16),
          0 8px 24px rgba(0,0,0,.30);
        backdrop-filter:blur(9px);
        -webkit-backdrop-filter:blur(9px);
        font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;
        user-select:none;
        -webkit-user-select:none;
        touch-action:manipulation;
      }
      #${HUD_ID}.right{left:auto;right:6px}
      #${RESULT_POPUP_ID}{
        position:fixed;
        top:max(10px,calc(env(safe-area-inset-top,0px) + 6px));
        left:50%;
        transform:translateX(-50%);
        z-index:2147483646;
        width:max-content;
        min-width:150px;
        max-width:min(220px,calc(100vw - 24px));
        box-sizing:border-box;
        padding:7px 16px 8px;
        border:1px solid rgba(255,126,178,.42);
        border-radius:16px;
        background:rgba(26,21,32,.94);
        color:#fff;
        box-shadow:0 8px 22px rgba(0,0,0,.30);
        backdrop-filter:blur(10px);
        -webkit-backdrop-filter:blur(10px);
        text-align:center;
        font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;
      }
      #${RESULT_POPUP_ID} .rp-title{
        font-size:10px;
        font-weight:800;
        color:rgba(255,255,255,.72);
        letter-spacing:.4px;
      }
      #${RESULT_POPUP_ID} .rp-value{
        margin-top:3px;
        font-size:19px;
        line-height:1.15;
        font-weight:950;
        color:#ff9fc4;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      @media (max-width:760px), (max-height:760px) and (pointer:coarse){
        #${RESULT_POPUP_ID}{
          width:max-content;
          min-width:145px;
          max-width:min(190px,calc(100vw - 20px));
          padding:6px 13px 7px;
          border-radius:14px;
        }
        #${RESULT_POPUP_ID} .rp-title{font-size:9px}
        #${RESULT_POPUP_ID} .rp-value{font-size:16px}
      }
      #${HUD_ID} .qh-top{display:flex;align-items:center;gap:4px;min-width:0}
      #${HUD_ID} .qh-dot{width:6px;height:6px;border-radius:50%;background:#7a7280;flex:0 0 auto;box-shadow:0 0 6px rgba(122,114,128,.48)}
      #${HUD_ID} .qh-dot.on{background:#ffb6d3;box-shadow:0 0 5px rgba(255,182,211,.48)}
      #${HUD_ID} .qh-pnl{min-width:0;flex:1;font-size:9px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${HUD_ID} .qh-pnl.pos{color:#a7f3c2}
      #${HUD_ID} .qh-pnl.neg{color:#ff9fbe}
      #${HUD_ID} .qh-signal{margin-top:4px;font-size:10px;font-weight:950;color:#ffc1d9;white-space:nowrap;text-shadow:0 0 3px rgba(255,180,211,.18)}
      #${HUD_ID} .qh-signal.hot{color:#ff9fc4;text-shadow:0 0 4px rgba(255,170,205,.26)}
      #${HUD_ID} .qh-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        grid-auto-rows:43px;
        gap:5px;
        margin-top:6px;
      }
      #${HUD_ID} .qh-btn{
        position:relative;
        display:grid;
        grid-template-rows:22px 10px;
        align-content:center;
        justify-items:center;
        gap:2px;
        min-width:0;
        width:100%;
        height:43px;
        padding:3px 2px;
        border:1px solid rgba(255,188,215,.52);
        border-radius:9px;
        background:rgba(8,8,12,.48);
        color:#fff;
        font-weight:900;
        line-height:1;
        cursor:pointer;
        -webkit-tap-highlight-color:transparent;
        box-sizing:border-box;
      }
      #${HUD_ID} .qh-icon{
        display:flex;
        align-items:center;
        justify-content:center;
        width:22px;
        height:22px;
        min-width:22px;
        min-height:22px;
        margin:0;
        padding:0;
        font-size:16px;
        line-height:22px;
        text-align:center;
        vertical-align:middle;
        font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;
        transform-origin:center center;
      }
      #${HUD_ID} .qh-label{
        display:flex;
        align-items:center;
        justify-content:center;
        width:100%;
        height:10px;
        margin:0;
        font-size:7px;
        line-height:10px;
        color:rgba(255,255,255,.94);
        white-space:nowrap;
        letter-spacing:.2px;
        text-align:center;
      }
      #${HUD_ID} .qh-speed-value{
        display:flex;
        align-items:center;
        justify-content:center;
        min-width:28px;
        height:20px;
        padding:0;
        color:#ffd6e7;
        font-size:11px;
        font-weight:950;
        line-height:1;
        white-space:nowrap;
        text-align:center;
      }

      #${HUD_ID} .qh-btn:active{
        transform:scale(.96);
        background:rgba(255,190,216,.10);
        border-color:rgba(255,201,222,.78);
        box-shadow:0 0 4px rgba(255,185,213,.18) inset;
      }
      #${HUD_ID} .qh-btn.speed{color:#fff}
      #${HUD_ID} .qh-btn.rooms{color:#fff}
      #${HUD_ID} [data-qh="board"] .qh-icon{transform:scale(.94)}
      #${HUD_ID} [data-qh="result"] .qh-icon{transform:scale(.92)}
      #${HUD_ID} [data-qh="side"] .qh-icon{transform:scale(.90)}
      #${HUD_ID} .qh-btn.detail{color:#fff}
      #${HUD_ID} .qh-btn.board{color:#fff}
      #${HUD_ID} .qh-btn{
        box-shadow:0 0 0 .5px rgba(255,200,223,.04) inset;
      }
      @media (hover:hover) and (pointer:fine){
        #${HUD_ID} .qh-btn:hover{
          border-color:rgba(255,200,221,.72);
          background:rgba(255,190,216,.07);
          box-shadow:0 0 5px rgba(255,182,211,.12);
        }
      }

      @media (orientation:landscape) and (max-height:760px) and (pointer:coarse){
        #${HUD_ID}{top:8px;width:88px;padding:5px}
        #${HUD_ID} .qh-grid{grid-auto-rows:41px}
        #${HUD_ID} .qh-btn{height:41px}
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureHud() {
    if (!isMobile()) {
      document.getElementById(HUD_ID)?.remove();
      return null;
    }

    ensureStyle();
    let hud = document.getElementById(HUD_ID);
    if (hud) return hud;

    hud = document.createElement('div');
    hud.id = HUD_ID;
    hud.innerHTML = `
      <div class="qh-top">
        <span class="qh-dot"></span>
        <div class="qh-pnl">盈虧 —</div>
      </div>
      <div class="qh-signal">訊號 —%</div>
      <div class="qh-grid">
        <button type="button" class="qh-btn detail" data-qh="detail" title="完整數據" aria-label="完整數據">
          <span class="qh-icon">📋</span><span class="qh-label">資料</span>
        </button>
        <button type="button" class="qh-btn speed" data-qh="speed" title="切換極速" aria-label="切換極速">
          <span class="qh-speed-value">10×</span>
          <span class="qh-label">極速</span>
        </button>
        <button type="button" class="qh-btn board" data-qh="board" title="盤面監測" aria-label="盤面監測">
          <span class="qh-icon">🎯</span><span class="qh-label">盤面</span>
        </button>
        <button type="button" class="qh-btn rooms" data-qh="rooms" title="全房分析" aria-label="全房分析">
          <span class="qh-icon">🏠</span><span class="qh-label">全房</span>
        </button>
        <button type="button" class="qh-btn result" data-qh="result" title="下輪開獎結果" aria-label="下輪開獎結果">
          <span class="qh-icon">💎</span><span class="qh-label">結果</span>
        </button>
        <button type="button" class="qh-btn side" data-qh="side" title="左右換邊" aria-label="左右換邊">
          <span class="qh-icon">↔️</span><span class="qh-label">換邊</span>
        </button>
      </div>
    `;

    hud.addEventListener('click', event => {
      const button = event.target?.closest?.('[data-qh]');
      if (!button || !hud.contains(button)) return;

      const action = String(button.dataset.qh || '');

      if (action === 'detail') {
        try {
          window.dispatchEvent(new CustomEvent('xinyao:mobile-live-detail', {
            detail:{ open:true }
          }));
        } catch (_) {}
        return;
      }

      if (action === 'speed') {
        const api = window.__XIANYAO_ATG_UNIFIED_SPEED__;
        const current = Number(api?.speed ?? api?.getState?.()?.speed ?? 10);
        const index = Math.max(0, SPEEDS.indexOf(current));
        const next = SPEEDS[(index + 1) % SPEEDS.length];
        try { api?.setSpeed?.(next); } catch (_) {}
        updateHud();
        return;
      }

      if (action === 'board') {
        const head = document.querySelector('#xinyao-atg-board-probe-v01 .bp-head');
        try { head?.click(); } catch (_) {}
        return;
      }

      if (action === 'rooms') {
        const panel = document.getElementById('xinyao-atg-room-scanner');
        const mini = document.getElementById('xinyao-room-mini');
        let visible = false;
        try { visible = Boolean(panel && getComputedStyle(panel).display !== 'none'); } catch (_) {}
        if (visible) {
          panel.style.display = 'none';
          if (mini) mini.style.display = 'block';
        } else if (mini) {
          try { mini.click(); } catch (_) {}
        } else if (panel) {
          panel.style.display = 'block';
        }
        return;
      }

      if (action === 'result') {
        resultPopupOpen = !resultPopupOpen;
        if (resultPopupOpen) ensureResultPopup();
        else document.getElementById(RESULT_POPUP_ID)?.remove();
        updateResultPopup();
        return;
      }

      if (action === 'side') {
        side = side === 'left' ? 'right' : 'left';
        try { localStorage.setItem(SIDE_KEY, side); } catch (_) {}
        hud.classList.toggle('right', side === 'right');
      }
    });

    (document.body || document.documentElement).appendChild(hud);
    return hud;
  }

  function resultValueText(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString(undefined, {
      minimumFractionDigits:2,
      maximumFractionDigits:2
    });
  }

  function ensureResultPopup() {
    if (!resultPopupOpen) return null;
    let popup = document.getElementById(RESULT_POPUP_ID);
    if (popup) return popup;

    popup = document.createElement('div');
    popup.id = RESULT_POPUP_ID;
    popup.setAttribute('role', 'status');
    popup.setAttribute('aria-live', 'polite');
    popup.innerHTML = `
      <div class="rp-title">📢 下輪開獎結果</div>
      <div class="rp-value">—</div>
    `;
    (document.body || document.documentElement).appendChild(popup);
    return popup;
  }

  function updateResultPopup() {
    if (!resultPopupOpen) return;
    const popup = ensureResultPopup();
    if (!popup) return;

    const live = window.__XIANYAO_ATG_LIVE_SNAPSHOT__ || {};
    const valueEl = popup.querySelector('.rp-value');
    if (valueEl) valueEl.textContent = resultValueText(live.latestPayout);
  }

  function updateHud() {
    const hud = ensureHud();
    if (!hud) return;

    const detailOpen = Boolean(window.__XIANYAO_ATG_MOBILE_DETAIL_OPEN__);
    const maintenance = Boolean(window.__XIANYAO_MAINTENANCE_STATE__?.enabled);
    hud.style.display = detailOpen || maintenance ? 'none' : '';
    const resultPopup = document.getElementById(RESULT_POPUP_ID);
    if (resultPopup) resultPopup.style.display = maintenance ? 'none' : '';

    hud.classList.toggle('right', side === 'right');

    const live = window.__XIANYAO_ATG_LIVE_SNAPSHOT__ || {};
    const board = window.__XIANYAO_ATG_BOARD_PROBE_STATE__ || {};
    const speedApi = window.__XIANYAO_ATG_UNIFIED_SPEED__;

    const pnl = Number(live.roomProfit);
    const pnlEl = hud.querySelector('.qh-pnl');
    if (pnlEl) {
      pnlEl.textContent = `盈虧 ${formatSigned(live.roomProfit)}`;
      pnlEl.classList.toggle('pos', Number.isFinite(pnl) && pnl > 0);
      pnlEl.classList.toggle('neg', Number.isFinite(pnl) && pnl < 0);
    }

    const dot = hud.querySelector('.qh-dot');
    if (dot) dot.classList.toggle('on', Boolean(live.connected));

    const score = Number(board.signalScore);
    const signalEl = hud.querySelector('.qh-signal');
    if (signalEl) {
      signalEl.textContent = Number.isFinite(score) ? `訊號 ${Math.round(score)}%` : '訊號 —%';
      signalEl.classList.toggle('hot', Number.isFinite(score) && score >= 80);
    }

    const speed = Number(speedApi?.speed ?? speedApi?.getState?.()?.speed ?? 10);
    const speedButton = hud.querySelector('[data-qh="speed"]');
    if (speedButton) {
      const label = SPEEDS.includes(speed) ? `${speed}× 極速` : '極速';
      speedButton.title = label;
      speedButton.setAttribute('aria-label', label);

      const speedValue = speedButton.querySelector('.qh-speed-value');
      if (speedValue) speedValue.textContent = SPEEDS.includes(speed) ? `${speed}×` : '—';
    }

    updateResultPopup();
  }

  try {
    window.addEventListener('resize', updateHud, { passive:true });
    window.addEventListener('orientationchange', () => {
      xinyaoApplyPhoneUiClass();
      setTimeout(() => { xinyaoApplyPhoneUiClass(); updateHud(); }, 120);
      setTimeout(() => { xinyaoApplyPhoneUiClass(); updateHud(); }, 350);
    }, { passive:true });
    window.addEventListener('xinyao:maintenance', updateHud);
    window.addEventListener('xinyao:speed-changed', updateHud);
    window.addEventListener('xinyao:board-signal', updateHud);
  } catch (_) {}

  updateHud();
  setInterval(updateHud, 250);
})();

}

/* ===== 芯瑤 ATG Free Game Helper v1.0｜test159 ===== */
(() => {
  'use strict';

  if (window.__XIANYAO_ATG_FREE_GAME_HELPER_V1__) return;
  window.__XIANYAO_ATG_FREE_GAME_HELPER_V1__ = true;

  const SETTINGS_KEY = 'xinyao_atg_free_helper_v1';
  const PANEL_ID = 'xinyao-atg-free-helper-panel';
  const STYLE_ID = 'xinyao-atg-free-helper-style';
  const TOAST_ID = 'xinyao-atg-free-spoiler-toast';
  const DESKTOP_BTN_ID = 'xinyao-atg-free-helper-desktop-btn';
  const HUD_ID = 'xinyao-atg-mobile-quick-hud';

  let settings = { auto:false, spoiler:false };
  let lastSpoilerSpinId = '';
  let lastSpoilerValue = null;
  let lastClickAt = 0;
  let freeWasActive = false;
  let nativeStatus = '等待免遊';
  let lastNativeVia = '';
  let lastNativeAttemptAt = 0;

  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    settings.auto = false;
    settings.spoiler = false;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
  } catch (_) {}

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
    renderPanel();
    updateButtons();
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}{
        position:fixed;
        top:72px;
        left:112px;
        z-index:2147483647;
        width:min(360px,calc(100vw - 132px));
        box-sizing:border-box;
        padding:15px 16px;
        border:1px solid rgba(255,183,214,.58);
        border-radius:17px;
        background:rgba(18,17,23,.95);
        color:#fff;
        box-shadow:0 16px 42px rgba(0,0,0,.42),0 0 18px rgba(255,111,166,.08);
        backdrop-filter:blur(12px);
        -webkit-backdrop-filter:blur(12px);
        font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;
      }
      #${PANEL_ID}.right{left:auto;right:112px}
      #${PANEL_ID} .fg-title{
        font-size:18px;font-weight:950;color:#ffd0e2;margin-bottom:12px;
      }
      #${PANEL_ID} .fg-row{
        display:flex;align-items:center;justify-content:space-between;gap:14px;
        min-height:58px;padding:4px 0;border-top:1px solid rgba(255,255,255,.09);
      }
      #${PANEL_ID} .fg-row:first-of-type{border-top:0}
      #${PANEL_ID} .fg-text{font-size:14px;font-weight:850;line-height:1.45}
      #${PANEL_ID} .fg-sub{
        margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.09);
        font-size:11px;line-height:1.55;color:rgba(255,255,255,.64);
      }
      #${PANEL_ID} .fg-status{
        margin-top:8px;font-size:11px;font-weight:800;color:#ffb4d2;
      }
      #${PANEL_ID} .fg-switch{
        position:relative;flex:0 0 54px;width:54px;height:30px;border:0;border-radius:999px;
        background:rgba(255,255,255,.13);cursor:pointer;padding:0;
      }
      #${PANEL_ID} .fg-switch::after{
        content:"";position:absolute;top:4px;left:4px;width:22px;height:22px;border-radius:50%;
        background:#d7ccd1;transition:transform .18s ease,background .18s ease;
      }
      #${PANEL_ID} .fg-switch.on{background:linear-gradient(135deg,#ff8fba,#ff5f9e)}
      #${PANEL_ID} .fg-switch.on::after{transform:translateX(24px);background:#fff}
      #${PANEL_ID} .fg-close{
        position:absolute;top:8px;right:10px;border:0;background:transparent;color:rgba(255,255,255,.62);
        font-size:20px;line-height:1;cursor:pointer;
      }
      #${TOAST_ID}{
        position:fixed;top:74px;left:50%;transform:translateX(-50%);z-index:2147483647;
        width:min(340px,calc(100vw - 24px));box-sizing:border-box;padding:13px 16px;
        border:1px solid rgba(255,178,211,.62);border-radius:15px;
        background:rgba(20,17,26,.97);color:#fff;text-align:center;
        box-shadow:0 14px 40px rgba(0,0,0,.44);
        font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;
        pointer-events:none;
      }
      #${TOAST_ID} b{display:block;font-size:13px;color:#ffb6d3}
      #${TOAST_ID} strong{display:block;margin-top:4px;font-size:25px;color:#fff}
      #${DESKTOP_BTN_ID}{
        position:fixed;left:8px;top:220px;z-index:2147483646;
        border:1px solid rgba(255,185,215,.55);border-radius:12px;
        background:rgba(16,15,20,.86);color:#fff;padding:8px 10px;
        font:900 11px -apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif;
        cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.28);
      }
      html.xinyao-phone-ui #${DESKTOP_BTN_ID}{display:none!important}
      #${HUD_ID} [data-qh="free"] .qh-icon{transform:scale(.92)}
      @media(max-width:760px){
        #${PANEL_ID}{top:58px;left:104px;width:min(300px,calc(100vw - 114px));padding:13px}
        #${PANEL_ID}.right{left:auto;right:104px}
        #${PANEL_ID} .fg-title{font-size:15px}
        #${PANEL_ID} .fg-text{font-size:12px}
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  }

  function readFreeStartSignal(root) {
    let start = false;
    let count = null;
    const seen = new WeakSet();

    function visit(value, path = '', depth = 0) {
      if (start || value == null || depth > 14) return;
      if (typeof value !== 'object') return;
      if (seen.has(value)) return;
      seen.add(value);

      const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
      for (const [rawKey, rawValue] of entries) {
        const key = String(rawKey || '').replace(/[^a-z0-9]/gi,'').toLowerCase();
        const nextPath = path ? path + '.' + key : key;
        const freePath = /freegame|freespin/.test(nextPath);

        if (['startfreegame','startfreespin','triggerfreegame','triggerfreespin'].includes(key)) {
          if (rawValue === true || Number(rawValue) > 0) start = true;
        }
        if (freePath && ['start','trigger','triggered'].includes(key) && rawValue === true) start = true;
        if (freePath && ['count','left','remaining','remain','spins','times'].includes(key)) {
          const n = Number(rawValue);
          if (Number.isFinite(n)) count = Math.max(count == null ? 0 : count, n);
        }
        if (rawValue && typeof rawValue === 'object') visit(rawValue, nextPath, depth + 1);
      }
    }

    visit(root);
    return { start, count };
  }

  function extractSpoilerPayout(detail) {
    const values = [];
    const push = value => {
      const n = Number(value);
      if (Number.isFinite(n)) values.push(n);
    };

    push(detail?.finalState?.totalWinnings);
    push(detail?.finalState?.roundWinnings);

    const states = Array.isArray(detail?.engine?.gameState) ? detail.engine.gameState : [];
    for (const row of states) {
      push(row?.totalWinnings);
    }
    if (!values.length) return null;
    return Math.max(...values);
  }

  function showSpoiler(value) {
    lastSpoilerValue = value;
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      (document.body || document.documentElement).appendChild(toast);
    }
    toast.innerHTML = `<b>👁 免遊劇透｜ATG 已回傳</b><strong>${money(value)}</strong><div style="margin-top:4px;font-size:10px;opacity:.66;">本次免遊得分</div>`;
    clearTimeout(showSpoiler._timer);
    showSpoiler._timer = setTimeout(() => toast?.remove(), 6500);
    renderPanel();
  }

  function visible(el) {
    if (!el?.isConnected) return false;
    try {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0 && r.width > 3 && r.height > 3;
    } catch (_) { return false; }
  }

  function roots() {
    const out = [document];
    const seen = new Set();
    function walk(root) {
      if (!root || seen.has(root)) return;
      seen.add(root);
      let nodes = [];
      try { nodes = root.querySelectorAll('*'); } catch (_) {}
      for (const node of nodes) {
        if (node?.shadowRoot) {
          out.push(node.shadowRoot);
          walk(node.shadowRoot);
        }
        if (node?.tagName === 'IFRAME') {
          try {
            if (node.contentDocument) {
              out.push(node.contentDocument);
              walk(node.contentDocument);
            }
          } catch (_) {}
        }
      }
    }
    walk(document);
    return out;
  }

  function clickByTexts(texts) {
    const wanted = new Set(texts.map(x => String(x).trim().toLowerCase()));
    for (const root of roots()) {
      let nodes = [];
      try { nodes = [...root.querySelectorAll('button,[role="button"],a,[aria-label],[title],div,span')]; } catch (_) {}
      for (const el of nodes) {
        if (!visible(el)) continue;
        if (el.closest?.('#' + PANEL_ID + ',#' + HUD_ID + ',#xinyaoATGLiveV200,#xinyao-atg-room-scanner,#xinyao-atg-board-probe-v01')) continue;
        const raw = [
          String(el.textContent || '').trim(),
          String(el.getAttribute?.('aria-label') || '').trim(),
          String(el.getAttribute?.('title') || '').trim()
        ].filter(Boolean);
        if (!raw.some(t => wanted.has(t.toLowerCase()))) continue;
        const target = el.closest?.('button,[role="button"],a') || el;
        try {
          target.click();
          lastClickAt = Date.now();
          return true;
        } catch (_) {}
      }
    }
    return false;
  }

  function gameWindows() {
    const out = [];
    const seen = new Set();
    const visit = w => {
      if (!w || seen.has(w)) return;
      seen.add(w);
      try {
        void w.location.href;
        out.push(w);
        for (let i = 0; i < w.frames.length; i += 1) visit(w.frames[i]);
      } catch (_) {}
    };
    visit(window);
    return out;
  }

  function cocosNodePath(node) {
    const parts = [];
    let cur = node;
    for (let i = 0; cur && i < 14; i += 1) {
      const name = String(cur?.name || '').trim();
      if (name) parts.push(name);
      cur = cur.parent || cur._parent || null;
    }
    return parts.reverse().join('/');
  }

  function cocosButtonText(button, cocos) {
    try {
      const node = button?.node;
      const Label = cocos?.Label;
      if (!node || !Label || typeof node.getComponentsInChildren !== 'function') return '';
      return (node.getComponentsInChildren(Label) || [])
        .map(label => String(label?.string ?? label?._string ?? '').trim())
        .filter(Boolean)
        .join(' | ');
    } catch (_) { return ''; }
  }

  function buttonHandlerText(button) {
    try {
      const events = Array.isArray(button?.clickEvents) ? button.clickEvents : [];
      return events.map(handler => [
        handler?.handler,
        handler?.component,
        handler?.customEventData,
        handler?.target?.name
      ].filter(Boolean).join(' ')).join(' | ');
    } catch (_) { return ''; }
  }

  function emitCocosButton(candidate) {
    const button = candidate?.button;
    const cocos = candidate?.cocos;
    const node = button?.node;
    if (!button || !node) return false;

    try {
      if (button.interactable === false || button.enabledInHierarchy === false) return false;
    } catch (_) {}

    try {
      if (typeof button._emitButtonEvent === 'function') {
        button._emitButtonEvent();
        return true;
      }
    } catch (_) {}

    try {
      if (typeof button._emitClickEvent === 'function') {
        button._emitClickEvent();
        return true;
      }
    } catch (_) {}

    try {
      const events = Array.isArray(button.clickEvents) ? button.clickEvents : [];
      const EventHandler = cocos?.Component?.EventHandler || cocos?.EventHandler;
      if (events.length && typeof EventHandler?.emitEvents === 'function') {
        EventHandler.emitEvents(events, button);
        return true;
      }
    } catch (_) {}

    try {
      const clickType = cocos?.Button?.EventType?.CLICK || 'click';
      node.emit?.(clickType, button);
      return true;
    } catch (_) {}

    return false;
  }

  function scoreCocosButton(button, cocos, mode) {
    const node = button?.node;
    if (!node || node.activeInHierarchy === false) return null;

    const text = cocosButtonText(button, cocos);
    const path = cocosNodePath(node);
    const handlers = buttonHandlerText(button);
    const hay = (text + ' ' + path + ' ' + handlers).toLowerCase();

    if (/(buyfree|buy.*free|purchase|購買|购买|bet|押注|spinbtn|autospin|menu|sound|setting)/i.test(hay)) {
      return null;
    }

    let score = 0;

    if (mode === 'start') {
      if (/開始免費遊戲|開始免遊|進入免費遊戲|進入免遊/i.test(text)) score += 160;
      if (/\bstart\b.*(?:free|bonus)|(?:free|bonus).*\bstart\b/i.test(hay)) score += 120;
      if (/(freegame|freespin|bonus).*(start|enter|play)/i.test(hay)) score += 100;
      if (/(startfree|freegamestart|freespinstart)/i.test(hay)) score += 130;
    } else {
      if (/^(?:跳過|略過|skip|skip all)$/i.test(String(text || '').trim())) score += 180;
      if (/跳過|略過|skip/i.test(text)) score += 150;
      if (/(freegame|freespin|bonus).*(skip|finish|complete|result|summary)/i.test(hay)) score += 140;
      if (/(skipfree|skip.*bonus|onskip|clickskip|handleskip)/i.test(hay)) score += 170;
      if (/(skip|finishfreegame|completefreegame|showresult|showresultview)/i.test(handlers)) score += 150;
      if (/skip/i.test(path)) score += 110;
    }

    if (button.interactable !== false) score += 10;
    return score > 0 ? { score, text, path, handlers } : null;
  }

  function findCocosAction(mode) {
    const candidates = [];

    for (const w of gameWindows()) {
      try {
        const cocos = w.cc || w.legacyCC || w._cc;
        const scene = cocos?.director?.getScene?.();
        const Button = cocos?.Button;
        if (!scene || !Button || typeof scene.getComponentsInChildren !== 'function') continue;

        const buttons = scene.getComponentsInChildren(Button) || [];
        for (const button of buttons) {
          const meta = scoreCocosButton(button, cocos, mode);
          if (!meta) continue;
          candidates.push({ button, cocos, window:w, ...meta });
        }
      } catch (_) {}
    }

    candidates.sort((a,b) => b.score - a.score);
    const best = candidates[0] || null;
    const threshold = mode === 'skip' ? 140 : 100;
    return best && best.score >= threshold ? best : null;
  }

  function scanNativeSkipCandidates() {
    const buttons = [];
    const components = [];

    for (const w of gameWindows()) {
      try {
        const cocos = w.cc || w.legacyCC || w._cc;
        const scene = cocos?.director?.getScene?.();
        const Button = cocos?.Button;
        const Component = cocos?.Component;
        if (!scene || typeof scene.getComponentsInChildren !== 'function') continue;

        if (Button) {
          const allButtons = scene.getComponentsInChildren(Button) || [];
          for (const button of allButtons) {
            try {
              const node = button?.node;
              if (!node || node.activeInHierarchy === false) continue;

              const textValue = cocosButtonText(button, cocos);
              const pathValue = cocosNodePath(node);
              const handlersValue = buttonHandlerText(button);
              const hay = (textValue + ' ' + pathValue + ' ' + handlersValue).toLowerCase();

              if (!/(skip|跳過|略過|free|bonus|finish|complete|result|summary|continue|next)/i.test(hay)) continue;
              if (/(buyfree|buy.*free|purchase|購買|购买|bet|押注|spinbtn|autospin)/i.test(hay)) continue;

              const scored = scoreCocosButton(button, cocos, 'skip');
              buttons.push({
                score: scored?.score || 0,
                text: textValue || '',
                path: pathValue || '',
                handlers: handlersValue || '',
                interactable: button.interactable !== false,
                enabledInHierarchy: button.enabledInHierarchy !== false
              });
            } catch (_) {}
          }
        }

        if (Component) {
          const allComponents = scene.getComponentsInChildren(Component) || [];
          for (const component of allComponents) {
            try {
              const node = component?.node;
              if (!node || node.activeInHierarchy === false) continue;

              const cls = String(
                component?.__classname__ ||
                component?.constructor?.__classname__ ||
                component?.constructor?.name ||
                ''
              );
              const pathValue = cocosNodePath(node);
              const ctx = (cls + ' ' + pathValue).toLowerCase();
              if (!/(free|bonus|result|summary|win|gameview|feature)/i.test(ctx)) continue;

              const methods = [];
              const seen = new Set();
              let cur = component;

              for (let depth = 0; cur && depth < 6; depth += 1) {
                let names = [];
                try { names = Object.getOwnPropertyNames(cur); } catch (_) {}
                for (const name of names) {
                  if (seen.has(name)) continue;
                  seen.add(name);
                  try {
                    if (
                      typeof component?.[name] === 'function' &&
                      /(skip|finish|complete|showresult|result|summary|continue|next|endfree|free.*end|bonus.*end)/i.test(name)
                    ) {
                      methods.push(name);
                    }
                  } catch (_) {}
                }
                try { cur = Object.getPrototypeOf(cur); } catch (_) { cur = null; }
              }

              if (methods.length) {
                components.push({
                  component: cls || '(anonymous)',
                  path: pathValue,
                  methods: [...new Set(methods)].slice(0, 20)
                });
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    buttons.sort((a,b) => b.score - a.score);

    const uniqueComponents = [];
    const used = new Set();
    for (const row of components) {
      const key = row.component + '|' + row.path + '|' + row.methods.join(',');
      if (used.has(key)) continue;
      used.add(key);
      uniqueComponents.push(row);
    }

    const result = {
      version: 'test189',
      at: Date.now(),
      freeGameActive: Boolean(window.__XIANYAO_ATG_LIVE_SNAPSHOT__?.freeGameActive),
      freeGameCount: window.__XIANYAO_ATG_LIVE_SNAPSHOT__?.freeGameCount ?? null,
      buttons: buttons.slice(0, 20),
      components: uniqueComponents.slice(0, 30)
    };

    try {
      window.__XIANYAO_ATG_NATIVE_SKIP_SCAN__ = result;
      localStorage.setItem('xinyao_atg_native_skip_scan_v1', JSON.stringify(result));
    } catch (_) {}

    return result;
  }

  function tryNativeStart() {
    // test164：先只辨識，不自動送出 Cocos 事件，避免命中錯誤的開始/離開流程。
    const candidate = findCocosAction('start');
    if (candidate) {
      nativeStatus = '🔎 已辨識免遊開始候選';
      lastNativeVia = [
        candidate.path || '',
        candidate.handlers || '',
        candidate.text || ''
      ].filter(Boolean).join(' ｜ ').slice(0, 260);
    }
    return false;
  }

  function tryNativeSkip() {
    // test164：安全模式。禁止直接 emit/click 任意 Skip/Finish/Result，
    // 避免誤觸 ATG「離開遊戲／恢復遊戲」流程。
    const candidate = findCocosAction('skip');

    if (candidate) {
      nativeStatus = '🔎 已找到候選，等待確認';
      lastNativeVia = [
        candidate.path || '',
        candidate.handlers || '',
        candidate.text || ''
      ].filter(Boolean).join(' ｜ ').slice(0, 260);
      return false;
    }

    nativeStatus = '🔎 診斷中：尚未找到安全 Skip';
    lastNativeVia = '';
    return false;
  }

  function freeRuntimeDiagnostics() {
    const rows = [];

    for (const w of gameWindows()) {
      try {
        const cocos = w.cc || w.legacyCC || w._cc;
        const scene = cocos?.director?.getScene?.();
        const Component = cocos?.Component;
        if (!scene || !Component || typeof scene.getComponentsInChildren !== 'function') continue;

        const components = scene.getComponentsInChildren(Component) || [];
        for (const component of components) {
          const node = component?.node;
          if (!node || node.activeInHierarchy === false) continue;

          const cls = String(
            component?.__classname__ ||
            component?.constructor?.__classname__ ||
            component?.constructor?.name ||
            ''
          );
          const path = cocosNodePath(node);
          const ctx = (cls + ' ' + path).toLowerCase();

          if (!/(free|bonus|result|summary|win|settle|feature|award|currenttimes|gameview)/i.test(ctx)) continue;

          const methods = [];
          let cur = component;
          const seen = new Set();

          for (let depth = 0; cur && depth < 6; depth += 1) {
            try {
              for (const name of Object.getOwnPropertyNames(cur)) {
                if (seen.has(name)) continue;
                seen.add(name);
                if (
                  typeof component?.[name] === 'function' &&
                  /(skip|finish|complete|result|summary|next|continue|close|end|free|bonus)/i.test(name)
                ) {
                  methods.push(name);
                }
              }
            } catch (_) {}
            try { cur = Object.getPrototypeOf(cur); } catch (_) { cur = null; }
          }

          if (!methods.length && !/(free|bonus|result|summary)/i.test(ctx)) continue;

          rows.push({
            component: cls || '(anonymous)',
            path,
            methods: methods.slice(0, 12)
          });
        }
      } catch (_) {}
    }

    const unique = [];
    const used = new Set();

    for (const row of rows) {
      const key = row.component + '|' + row.path + '|' + row.methods.join(',');
      if (used.has(key)) continue;
      used.add(key);
      unique.push(row);
      if (unique.length >= 18) break;
    }

    try {
      window.__XIANYAO_ATG_FREE_RUNTIME_DIAG__ = {
        at: Date.now(),
        freeActive: Boolean(window.__XIANYAO_ATG_LIVE_SNAPSHOT__?.freeGameActive),
        rows: unique
      };
      localStorage.setItem(
        'xinyao_atg_free_runtime_diag_v1',
        JSON.stringify(window.__XIANYAO_ATG_FREE_RUNTIME_DIAG__)
      );
    } catch (_) {}

    return unique;
  }

  function diagText() {
    const rows = freeRuntimeDiagnostics();
    if (!rows.length) return '尚未抓到免遊元件';

    return rows.slice(0, 4).map(row => {
      const methods = row.methods.length ? row.methods.join(',') : '無方法';
      return (row.component + '｜' + row.path + '｜' + methods).slice(0, 180);
    }).join(' ⬥ ');
  }

  function handleAuto(active) {
    if (!settings.auto) {
      freeWasActive = false;
      nativeStatus = '結果先顯示已關閉';
      lastNativeVia = '';
      return;
    }

    if (!active) {
      if (freeWasActive) nativeStatus = '等待下一次免遊';
      freeWasActive = false;
      lastNativeVia = '';
      return;
    }

    freeWasActive = true;

    const result = window.__XIANYAO_ATG_FREE_RESULT_STATE__ || {};
    if (result.mode === 'preloaded' && Number.isFinite(Number(result.finalAmount))) {
      nativeStatus = '✅ 已取得本次免遊最終結果：' + money(result.finalAmount);
    } else {
      nativeStatus = '⏳ 等待 ATG 回傳本次免遊最終結果…';
    }
    lastNativeVia = '';
  }

  function ensurePanel() {
    ensureStyle();
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.display = 'none';
    (document.body || document.documentElement).appendChild(panel);
    return panel;
  }

  function renderPanel() {
    const panel = ensurePanel();
    if (!panel || panel.style.display === 'none') return;

    panel.innerHTML = `
      <button type="button" class="fg-close" aria-label="關閉">×</button>
      <div class="fg-title">🎁 遇到免費遊戲</div>
      <div style="font-size:10px;opacity:.65;margin:-2px 0 8px;">版本 test189</div>

      <div class="fg-row">
        <div class="fg-text">免遊：結果先顯示</div>
        <button type="button" class="fg-switch ${settings.auto ? 'on' : ''}" data-fg-toggle="auto" aria-label="免遊結果先顯示"></button>
      </div>

      <div class="fg-sub">
        ATG 一旦先回傳本次免遊的最終贏分，芯瑤會立即顯示結果卡。<br>
        不修改 ATG 的免遊播放、派彩或結算流程；遊戲動畫會在背景正常完成。
      </div>

      <div class="fg-status">${(() => {
        const result = window.__XIANYAO_ATG_FREE_RESULT_STATE__ || {};
        if (!settings.auto) return '結果先顯示目前已關閉';
        if (result.mode === 'preloaded' && Number.isFinite(Number(result.finalAmount))) {
          return '✅ 本次免遊最終結果：' + money(result.finalAmount);
        }
        if (result.mode === 'sequential') return '⏳ 這次結果尚未一次完整回傳';
        return nativeStatus || '等待免遊';
      })()}</div>
    `;

    panel.querySelector('.fg-close')?.addEventListener('click', () => {
      panel.style.display = 'none';
    });

    panel.querySelector('[data-fg-toggle="auto"]')?.addEventListener('click', () => {
      settings.auto = !settings.auto;
      settings.spoiler = false;
      saveSettings();
    });
  }

  function openPanel() {
    const panel = ensurePanel();
    panel.style.display = 'block';
    const hud = document.getElementById(HUD_ID);
    panel.classList.toggle('right', Boolean(hud?.classList.contains('right')));
    renderPanel();
  }

  function ensureButtons() {
    // test184：免遊助手完全移除，只保留原本六格 HUD。
    try { document.getElementById(DESKTOP_BTN_ID)?.remove(); } catch (_) {}
    try { document.querySelector('#' + HUD_ID + ' [data-qh="free"]')?.remove(); } catch (_) {}
    try { document.getElementById(PANEL_ID)?.remove(); } catch (_) {}
    try { document.getElementById(TOAST_ID)?.remove(); } catch (_) {}
    try { document.getElementById('xinyao-atg-free-result-overlay')?.remove(); } catch (_) {}
  }

  function updateButtons() {
    ensureButtons();
  }

  setInterval(ensureButtons, 1000);

  window.__XIANYAO_ATG_FREE_HELPER__ = {
    version:'1.3.0-test184',
    getState:() => ({auto:false,spoiler:false,lastSpoilerValue:null,removed:true}),
    setAuto:() => false,
    setSpoiler:() => false,
    open:() => false,
    close:() => true
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureButtons, {once:true});
  } else {
    ensureButtons();
  }
})();






/* ===== 芯瑤 ATG Free Packet Trace v1.0｜test168 ===== */
(() => {
  'use strict';

  if (window.__XIANYAO_ATG_FREE_PACKET_TRACE__) return;

  let overlayDismissed = false;
  let overlayAmount = null;

  const state = {
    active:false,
    startedAt:0,
    inbound:[],
    outbound:[],
    max:60,
    freeStart:null
  };

  function freeActive(){
    const live=window.__XIANYAO_ATG_LIVE_SNAPSHOT__||{};
    return Boolean(live.freeGameActive)||Number(live.freeGameCount||0)>0;
  }

  function summarize(raw){
    const text=String(raw??'').trim();
    if(!text)return '';

    let event='';
    try{
      const m=text.match(/(?:^|\d)(?:\d)?\s*\[\s*["']([^"']+)["']/);
      if(m)event=m[1];
    }catch(_){}

    const keys=[];
    const re=/"([^"]{1,48})"\s*:/g;
    let mm;
    while((mm=re.exec(text)) && keys.length<24){
      const k=mm[1];
      if(/^token$/i.test(k))continue;
      if(!keys.includes(k))keys.push(k);
    }

    return JSON.stringify({
      event,
      keys,
      bytes:text.length
    });
  }

  function safeEngineSnapshot(raw){
    try{
      const text=String(raw??'').trim();
      const positions=[text.indexOf('['),text.indexOf('{')].filter(i=>i>=0);
      if(!positions.length)return null;
      const start=Math.min(...positions);

      let parsed;
      try{ parsed=JSON.parse(text.slice(start)); }catch(_){ return null; }

      const found=[];
      const seen=new WeakSet();

      const pickState=s=>{
        if(!s || typeof s!=='object')return null;
        const keys=[
          'currentView','totalViews','totalWinnings','roundWinnings',
          'startFreeGame','startFreeSpin','freeGameCount','freeSpinCount',
          'freeGamesLeft','freeSpinsLeft','remainingFreeGame','remainingFreeSpin',
          'action','view','buyFeatureType'
        ];
        const out={};
        for(const key of keys){
          if(Object.prototype.hasOwnProperty.call(s,key)){
            const v=s[key];
            if(
              v===null ||
              typeof v==='string' ||
              typeof v==='number' ||
              typeof v==='boolean'
            ){
              out[key]=v;
            }
          }
        }
        return Object.keys(out).length?out:null;
      };

      const visit=(value,depth=0)=>{
        if(!value || typeof value!=='object' || depth>8 || seen.has(value))return;
        seen.add(value);

        if(!Array.isArray(value)){
          const obj={};

          if(value.eventName!==undefined) obj.eventName=value.eventName;
          if(value.spinId!==undefined) obj.spinId=String(value.spinId);
          if(value.action!==undefined) obj.action=value.action;
          if(value.buyFeatureType!==undefined) obj.buyFeatureType=value.buyFeatureType;

          if(Array.isArray(value.gameState)){
            obj.gameState=value.gameState
              .map(pickState)
              .filter(Boolean)
              .slice(0,30);
          }

          if(Object.keys(obj).length && (obj.gameState?.length || obj.spinId || obj.eventName)){
            found.push(obj);
          }

          for(const [key,child] of Object.entries(value)){
            if(/^token$/i.test(key))continue;
            if(child && typeof child==='object')visit(child,depth+1);
          }
        }else{
          for(const child of value){
            if(child && typeof child==='object')visit(child,depth+1);
          }
        }
      };

      visit(parsed);
      return found.length?found.slice(0,12):null;
    }catch(_){
      return null;
    }
  }

  function push(kind,raw){
    if(!freeActive() && !state.active)return;
    if(freeActive() && !state.active){
      state.active=true;
      state.startedAt=Date.now();
      state.inbound=[];
      state.outbound=[];
    }

    const summaryText=summarize(raw);
    let summaryObj=null;
    try{ summaryObj=JSON.parse(summaryText); }catch(_){}

    // test173：忽略房間排行榜更新與 ping，只保留真正遊戲流程封包。
    if(kind==='in'){
      const evt=String(summaryObj?.event||'');
      const keys=Array.isArray(summaryObj?.keys)?summaryObj.keys:[];
      const looksGame=
        /^(spin|closeSpin|notify)$/i.test(evt) ||
        keys.includes('engine') ||
        keys.includes('gameState') ||
        keys.includes('freeGameCount') ||
        keys.includes('startFreeGame') ||
        keys.includes('totalWinnings');

      if(!looksGame)return;
    }else{
      const evt=String(summaryObj?.event||'');
      if(!/^(spin|closeSpin)$/i.test(evt))return;
    }

    const row={
      at:Date.now(),
      summary:summaryText
    };

    if(kind==='in'){
      const engineSnapshot=safeEngineSnapshot(raw);
      if(engineSnapshot)row.engineSnapshot=engineSnapshot;
    }

    const arr=kind==='out'?state.outbound:state.inbound;
    arr.push(row);
    if(arr.length>state.max)arr.splice(0,arr.length-state.max);

    try{
      window.__XIANYAO_ATG_FREE_PACKET_TRACE_STATE__={
        active:state.active,
        startedAt:state.startedAt,
        freeStart:state.freeStart,
        inbound:[...state.inbound],
        outbound:[...state.outbound]
      };
    }catch(_){}
  }

  function patchWindow(w){
    try{
      const WS=w?.WebSocket;
      const proto=WS?.prototype;
      if(proto && typeof proto.send==='function' && !proto.send.__xinyaoFreeTrace168){
        const native=proto.send;
        const wrapped=function(data){
          try{ if(freeActive()||state.active)push('out',data); }catch(_){}
          return native.call(this,data);
        };
        try{Object.defineProperty(wrapped,'__xinyaoFreeTrace168',{value:true})}catch(_){wrapped.__xinyaoFreeTrace168=true}
        proto.send=wrapped;
      }
    }catch(_){}
  }

  function windows(){
    const out=[],seen=new Set();
    const visit=w=>{
      if(!w||seen.has(w))return;
      seen.add(w);
      try{
        void w.location.href;
        out.push(w);
        for(let i=0;i<w.frames.length;i++)visit(w.frames[i]);
      }catch(_){}
    };
    visit(window);
    return out;
  }

  function patchMessages(w){
    try{
      const WS=w?.WebSocket;
      if(!WS||WS.__xinyaoFreeTraceCtor168)return;
      const Native=WS;
      const Wrapped=new Proxy(Native,{
        construct(Target,args,NewTarget){
          const ws=Reflect.construct(Target,args,NewTarget);
          try{
            ws.addEventListener('message',e=>{
              try{ if(freeActive()||state.active)push('in',e.data); }catch(_){}
            },true);
          }catch(_){}
          return ws;
        }
      });
      try{
        Object.defineProperties(Wrapped,{
          CONNECTING:{value:Native.CONNECTING},
          OPEN:{value:Native.OPEN},
          CLOSING:{value:Native.CLOSING},
          CLOSED:{value:Native.CLOSED},
          __xinyaoFreeTraceCtor168:{value:true}
        });
      }catch(_){}
      w.WebSocket=Wrapped;
    }catch(_){}
  }

  setInterval(()=>{
    for(const w of windows()){
      patchWindow(w);
      patchMessages(w);
    }

    const nowFree=freeActive();
    if(!nowFree && state.active && Date.now()-state.startedAt>1200){
      state.active=false;
      try{
        window.__XIANYAO_ATG_FREE_PACKET_TRACE_STATE__={
          active:false,
          startedAt:state.startedAt,
          freeStart:state.freeStart,
          inbound:[...state.inbound],
          outbound:[...state.outbound]
        };
        localStorage.setItem(
          'xinyao_atg_free_packet_trace_v1',
          JSON.stringify(window.__XIANYAO_ATG_FREE_PACKET_TRACE_STATE__)
        );
      }catch(_){}
    }
  },500);

  function safeEngineSnapshotFromObject(root){
    try{
      if(!root || typeof root!=='object')return null;

      const found=[];
      const seen=new WeakSet();

      const pickState=s=>{
        if(!s || typeof s!=='object')return null;
        const keys=[
          'currentView','totalViews','totalWinnings','roundWinnings',
          'startFreeGame','startFreeSpin','freeGameCount','freeSpinCount',
          'freeGamesLeft','freeSpinsLeft','remainingFreeGame','remainingFreeSpin',
          'action','view','buyFeatureType','superMainGameCount','isGoldenFg',
          'isJp','currentTimes'
        ];
        const out={};
        for(const key of keys){
          if(!Object.prototype.hasOwnProperty.call(s,key))continue;
          const v=s[key];
          if(
            v===null ||
            typeof v==='string' ||
            typeof v==='number' ||
            typeof v==='boolean'
          ) out[key]=v;
        }
        return Object.keys(out).length?out:null;
      };

      const visit=(value,depth=0)=>{
        if(!value || typeof value!=='object' || depth>8 || seen.has(value))return;
        seen.add(value);

        if(!Array.isArray(value)){
          const obj={};
          if(value.eventName!==undefined) obj.eventName=value.eventName;
          if(value.spinId!==undefined) obj.spinId=String(value.spinId);
          if(value.action!==undefined) obj.action=value.action;
          if(value.buyFeatureType!==undefined) obj.buyFeatureType=value.buyFeatureType;

          if(Array.isArray(value.gameState)){
            obj.gameState=value.gameState
              .map(pickState)
              .filter(Boolean)
              .slice(0,40);
          }

          if(Object.keys(obj).length && (obj.gameState?.length || obj.spinId || obj.eventName)){
            found.push(obj);
          }

          for(const [key,child] of Object.entries(value)){
            if(/^token$/i.test(key))continue;
            if(child && typeof child==='object')visit(child,depth+1);
          }
        }else{
          for(const child of value){
            if(child && typeof child==='object')visit(child,depth+1);
          }
        }
      };

      visit(root);
      return found.length?found.slice(0,16):null;
    }catch(_){
      return null;
    }
  }

  function beginFromDetail(detail){
    state.active=true;
    state.startedAt=Date.now();
    state.inbound=[];
    state.outbound=[];

    const snapshot=safeEngineSnapshotFromObject(detail?.engine || detail || null);
    state.freeStart={
      at:Date.now(),
      summary:JSON.stringify({
        event:'xinyao:free-start',
        keys:['spinId','gameState'],
        bytes:0
      }),
      engineSnapshot:snapshot || []
    };

    try{
      window.__XIANYAO_ATG_FREE_PACKET_TRACE_STATE__={
        active:true,
        startedAt:state.startedAt,
        freeStart:state.freeStart,
        inbound:[...state.inbound],
        outbound:[...state.outbound]
      };
    }catch(_){}
  }

  window.__XIANYAO_ATG_FREE_PACKET_TRACE__={
    version:'1.4.4-test177',
    push,
    beginFromDetail,
    getState:()=>({
      active:state.active,
      startedAt:state.startedAt,
      freeStart:state.freeStart,
      inbound:[...state.inbound],
      outbound:[...state.outbound]
    }),
    reset:()=>{
      state.active=false;
      state.startedAt=0;
      state.freeStart=null;
      state.inbound=[];
      state.outbound=[];
    }
  };
})();


/* ===== 芯瑤 ATG Native Free Result Curtain v1.0｜test177 ===== */
(() => {
  'use strict';

  if(window.__XIANYAO_ATG_NATIVE_FREE_CURTAIN__)return;

  const ID='xinyao-atg-native-free-curtain';
  const state={
    active:false,
    startedAt:0,
    nativeResultSeen:false,
    lastDetectedText:'',
    pollTimer:0
  };

  function gameWindows(){
    const out=[],seen=new Set();
    const visit=w=>{
      if(!w||seen.has(w))return;
      seen.add(w);
      try{
        void w.document;
        out.push(w);
        for(const frame of [...w.document.querySelectorAll('iframe')]){
          try{ visit(frame.contentWindow); }catch(_){}
        }
      }catch(_){}
    };
    visit(window);
    return out;
  }

  function ensureCurtain(){
    let el=document.getElementById(ID);
    if(el)return el;

    el=document.createElement('div');
    el.id=ID;
    el.style.cssText=[
      'position:fixed',
      'inset:0',
      'z-index:2147483646',
      'display:none',
      'pointer-events:none',
      'background:#09070d'
    ].join(';');

    (document.body||document.documentElement).appendChild(el);
    return el;
  }

  function show(){
    const el=ensureCurtain();
    el.style.display='block';
    state.active=true;
    state.nativeResultSeen=false;
    state.startedAt=Date.now();
  }

  function hide(){
    const el=document.getElementById(ID);
    if(el)el.style.display='none';
    state.active=false;
  }

  function collectVisibleLabels(){
    const texts=[];
    for(const w of gameWindows()){
      try{
        const cc=w.cc||w.legacyCC||w._cc;
        const scene=cc?.director?.getScene?.();
        const Label=cc?.Label;
        if(!scene||!Label||typeof scene.getComponentsInChildren!=='function')continue;

        const labels=scene.getComponentsInChildren(Label)||[];
        for(const label of labels){
          const node=label?.node;
          if(!node||node.activeInHierarchy===false)continue;
          const text=String(label?.string??'').trim();
          if(text)texts.push(text);
        }
      }catch(_){}
    }
    return texts;
  }

  function nativeResultVisible(){
    try{
      const texts=collectVisibleLabels();
      if(!texts.length)return false;

      const joined=texts.join('|');
      state.lastDetectedText=joined.slice(0,1200);

      const hasWinTitle=texts.some(t=>/贏得獎金|獲得獎金|總贏分|總獎金/i.test(t));
      const hasClose=texts.some(t=>/^關閉$|^关闭$/i.test(t));

      return hasWinTitle && hasClose;
    }catch(_){
      return false;
    }
  }

  function begin(){
    // test179：純診斷模式，不遮罩、不加速、不改遊戲流程。
    state.active=false;
    state.nativeResultSeen=false;
    state.startedAt=Date.now();
    return false;

    if(state.pollTimer)clearInterval(state.pollTimer);
    state.pollTimer=setInterval(()=>{
      if(!state.active){
        clearInterval(state.pollTimer);
        state.pollTimer=0;
        return;
      }

      if(nativeResultVisible()){
        state.nativeResultSeen=true;
        hide();
        try{
          window.__XIANYAO_ATG_UNIFIED_SPEED__?.stopFreeSkipBoost?.();
        }catch(_){}
        clearInterval(state.pollTimer);
        state.pollTimer=0;
        return;
      }

      // fail-safe：不能無限黑屏。
      if(Date.now()-state.startedAt>12000){
        hide();
        try{
          window.__XIANYAO_ATG_UNIFIED_SPEED__?.stopFreeSkipBoost?.();
        }catch(_){}
        clearInterval(state.pollTimer);
        state.pollTimer=0;
      }
    },40);
  }

  function stop(){
    hide();
    if(state.pollTimer){
      clearInterval(state.pollTimer);
      state.pollTimer=0;
    }
    try{
      window.__XIANYAO_ATG_UNIFIED_SPEED__?.stopFreeSkipBoost?.();
    }catch(_){}
  }

  window.__XIANYAO_ATG_NATIVE_FREE_CURTAIN__={
    version:'1.0.0-test177',
    begin,
    stop,
    nativeResultVisible,
    getState:()=>({...state})
  };
})();

/* ===== 芯瑤 ATG Free Result Probe v1.0｜test166 ===== */
(() => {
  'use strict';

  if (window.__XIANYAO_ATG_FREE_RESULT_PROBE__) return;

  const OVERLAY_ID = 'xinyao-atg-free-result-overlay';
  const SETTINGS_KEY = 'xinyao_atg_free_helper_v1';

  const state = {
    active:false,
    mode:'idle',
    startedAt:0,
    startBalance:null,
    startCount:null,
    spinIds:[],
    payoutBySpin:{},
    runningTotal:0,
    finalAmount:null,
    finalPath:'',
    candidate:null,
    candidatePath:'',
    candidateScore:0,
    packetCount:0,
    updatedAt:0
  };

  function enabled() {
    try {
      return Boolean(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')?.auto);
    } catch (_) {
      return false;
    }
  }

  function num(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeKey(value) {
    return String(value || '').replace(/[^a-z0-9]/gi,'').toLowerCase();
  }

  function candidateScore(path, key) {
    const p = String(path || '').toLowerCase();
    const k = normalizeKey(key);

    if (/(stake|bet|balance|jackpot|multiplier|multiply|count|left|remain|remaining|times|currentview|totalviews|room|table)/i.test(p)) {
      return -1;
    }

    let score = 0;

    if (/(freegame|freegames|freespin|freespins|bonus|feature)/i.test(p)) score += 6;
    if (/(total|final|overall|accum|accumulate|sum)/i.test(p)) score += 6;
    if (/(win|winning|winnings|payout|prize|award|reward|credit)/i.test(p)) score += 6;

    if (/^(freegame|freegames|freespin|freespins|bonus|feature)(total|final)?(win|winnings|payout|prize)$/i.test(k)) score += 14;
    if (/^(total|final)(freegame|freegames|freespin|freespins|bonus|feature)(win|winnings|payout|prize)$/i.test(k)) score += 14;
    if (/^(bonus|feature)(total|final)win$/i.test(k)) score += 14;

    return score;
  }

  function scanCandidates(root) {
    const found = [];
    const seen = new WeakSet();

    const visit = (value, path = '', depth = 0) => {
      if (value == null || depth > 12) return;

      if (typeof value !== 'object') return;
      if (seen.has(value)) return;
      seen.add(value);

      let entries = [];
      try { entries = Object.entries(value); } catch (_) { return; }

      for (const [key, child] of entries) {
        const next = path ? path + '.' + key : key;

        if (child !== null && child !== undefined && typeof child !== 'object') {
          const n = num(child);
          if (n !== null && n >= 0) {
            const score = candidateScore(next, key);
            if (score >= 12) found.push({value:n,path:next,score});
          }
        }

        if (child && typeof child === 'object') visit(child,next,depth+1);
      }
    };

    visit(root);
    found.sort((a,b) => b.score - a.score || b.value - a.value);
    return found;
  }

  function collectSpinIds(root) {
    const ids = [];
    const seen = new WeakSet();

    const visit = (value, depth = 0) => {
      if (!value || typeof value !== 'object' || depth > 8 || seen.has(value)) return;
      seen.add(value);

      if (!Array.isArray(value)) {
        for (const [key, child] of Object.entries(value)) {
          if (/^spinid$/i.test(String(key)) && child !== null && child !== undefined) {
            ids.push(String(child));
          }
          if (child && typeof child === 'object') visit(child,depth+1);
        }
      } else {
        for (const child of value) if (child && typeof child === 'object') visit(child,depth+1);
      }
    };

    visit(root);
    return [...new Set(ids)];
  }

  function currentSnapshot() {
    return window.__XIANYAO_ATG_LIVE_SNAPSHOT__ || {};
  }

  function startSession() {
    if (state.active) return;
    const live = currentSnapshot();

    overlayDismissed = false;
    overlayAmount = null;
    try { document.getElementById(OVERLAY_ID)?.remove(); } catch (_) {}

    state.active = true;
    state.mode = 'probing';
    state.startedAt = Date.now();
    state.startBalance = num(live.balance);
    state.startCount = num(live.freeGameCount);
    state.spinIds = [];
    state.payoutBySpin = {};
    state.runningTotal = 0;
    state.finalAmount = null;
    state.finalPath = '';
    state.candidate = null;
    state.candidatePath = '';
    state.candidateScore = 0;
    state.packetCount = 0;
    state.updatedAt = Date.now();

    renderOverlay();
    publish();
  }

  function finishSession() {
    if (!state.active) return;

    state.active = false;
    state.mode = 'finished';

    const live = currentSnapshot();
    const endBalance = num(live.balance);
    let final = null;

    if (state.finalAmount !== null) {
      final = state.finalAmount;
    } else if (state.runningTotal > 0) {
      final = Math.round(state.runningTotal * 100) / 100;
    } else if (state.startBalance !== null && endBalance !== null) {
      final = Math.round((endBalance - state.startBalance) * 100) / 100;
    }

    state.finalAmount = final;
    state.updatedAt = Date.now();
    renderOverlay(true);
    publish();
  }

  function observe(root) {
    try {
      if (!root || typeof root !== 'object') return;

      const live = currentSnapshot();
      const freeNow = Boolean(live.freeGameActive) || Number(live.freeGameCount || 0) > 0;

      if (freeNow && !state.active) startSession();
      if (!state.active) return;

      state.packetCount += 1;

      const ids = collectSpinIds(root);
      for (const id of ids) {
        if (!state.spinIds.includes(id)) state.spinIds.push(id);
      }

      const candidates = scanCandidates(root);
      const best = candidates[0];

      if (best && best.score >= state.candidateScore) {
        state.candidate = best.value;
        state.candidatePath = best.path;
        state.candidateScore = best.score;

        // 高可信總贏分欄位：一收到就直接顯示。
        if (best.score >= 18) {
          state.mode = 'preloaded';
          state.finalAmount = best.value;
          state.finalPath = best.path;
        }
      }

      // 已看到 2 個以上不同 spinId 且仍沒有高可信最終欄位，
      // 視為逐轉向伺服器取結果。
      if (state.mode !== 'preloaded' && state.spinIds.length >= 2) {
        state.mode = 'sequential';
      }

      state.updatedAt = Date.now();
      renderOverlay();
      publish();
    } catch (_) {}
  }

  function noteSpin(detail) {
    try {
      if (!enabled()) return;

      const engine = detail?.engine || {};
      const spinId = String(detail?.spinId || engine?.spinId || '');
      const live = currentSnapshot();
      const freeNow = Boolean(live.freeGameActive) || Number(live.freeGameCount || 0) > 0;

      if (freeNow && !state.active) startSession();
      if (!state.active) return;

      if (spinId && !state.spinIds.includes(spinId)) state.spinIds.push(spinId);

      let payout = num(detail?.finalState?.totalWinnings);
      if (payout === null) payout = num(detail?.finalState?.roundWinnings);

      if (payout !== null && spinId && !(spinId in state.payoutBySpin)) {
        state.payoutBySpin[spinId] = payout;
        state.runningTotal = Math.round(
          Object.values(state.payoutBySpin).reduce((sum,v) => sum + (num(v) || 0),0) * 100
        ) / 100;
      }

      observe(engine);
    } catch (_) {}
  }

  function ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483645',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:18px',
      'background:rgba(5,4,8,.58)',
      'backdrop-filter:blur(3px)',
      '-webkit-backdrop-filter:blur(3px)',
      'font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif'
    ].join(';');

    overlay.innerHTML = `
      <div style="
        width:min(420px,calc(100vw - 32px));
        border:1px solid rgba(255,184,215,.72);
        border-radius:22px;
        background:rgba(20,17,25,.97);
        box-shadow:0 24px 70px rgba(0,0,0,.55),0 0 26px rgba(255,95,158,.16);
        padding:24px 22px 20px;
        color:#fff;
        text-align:center;
      ">
        <div style="font-size:16px;font-weight:950;color:#ffc4dc;">🎁 本次免遊最終結果</div>
        <div data-free-result-amount style="
          margin-top:12px;
          font-size:46px;
          line-height:1;
          font-weight:1000;
          letter-spacing:.5px;
          color:#fff;
          text-shadow:0 0 18px rgba(255,95,158,.32);
        ">—</div>
        <div style="margin-top:12px;font-size:12px;line-height:1.6;color:rgba(255,255,255,.68);">
          ATG 已提前回傳本次免遊最終贏分<br>
          遊戲動畫會在背景正常完成
        </div>
        <button type="button" data-free-result-close style="
          margin-top:18px;
          width:100%;
          border:1px solid rgba(255,185,215,.68);
          border-radius:12px;
          background:linear-gradient(135deg,#ff83b3,#ff5f9e);
          color:#fff;
          padding:11px 14px;
          font-size:13px;
          font-weight:950;
          cursor:pointer;
        ">關閉結果</button>
      </div>
    `;

    overlay.querySelector('[data-free-result-close]')?.addEventListener('click', () => {
      overlayDismissed = true;
      try { overlay.remove(); } catch (_) {}
    });

    (document.body || document.documentElement).appendChild(overlay);
    return overlay;
  }

  function renderOverlay(forceFinal = false) {
    publish();

    if (!enabled()) {
      try { document.getElementById(OVERLAY_ID)?.remove(); } catch (_) {}
      return;
    }

    const amount = num(state.finalAmount);
    if (amount === null || state.mode !== 'preloaded' || overlayDismissed) return;

    overlayAmount = amount;
    const overlay = ensureOverlay();
    const value = overlay?.querySelector?.('[data-free-result-amount]');
    if (value) {
      value.textContent = amount.toLocaleString(undefined,{
        minimumFractionDigits:2,
        maximumFractionDigits:2
      });
    }
  }

  function publish() {
    try {
      window.__XIANYAO_ATG_FREE_RESULT_STATE__ = {
        ...state,
        spinIds:[...state.spinIds],
        payoutBySpin:{...state.payoutBySpin}
      };
    } catch (_) {}
  }

  window.addEventListener('xinyao:spin-final-observed', e => noteSpin(e?.detail || {}));

  setInterval(() => {
    if (!enabled() && !state.active) {
      publish();
      return;
    }

    const live = currentSnapshot();
    const freeNow = Boolean(live.freeGameActive) || Number(live.freeGameCount || 0) > 0;

    // test175 fallback：若第一包已被 tracer 保留但 result probe 尚未吃到，
    // 直接從 pinned freeStart 最後一個 gameState 取最終 totalWinnings。
    if(freeNow && state.finalAmount===null){
      try{
        const pinned=window.__XIANYAO_ATG_FREE_PACKET_TRACE__?.getState?.()?.freeStart;
        const snaps=Array.isArray(pinned?.engineSnapshot)?pinned.engineSnapshot:[];
        let states=[];
        for(const snap of snaps){
          if(Array.isArray(snap?.gameState) && snap.gameState.length>states.length){
            states=snap.gameState;
          }
        }
        if(states.length){
          const last=states
            .slice()
            .sort((a,b)=>(Number(b?.currentView)||0)-(Number(a?.currentView)||0))[0];
          const total=num(last?.totalWinnings);
          const hasFree=states.some(s=>
            s?.startFreeGame===true ||
            String(s?.action||'').toLowerCase()==='freespin' ||
            Number(s?.freeGameCount||0)>0
          );
          if(hasFree && total!==null){
            state.active=true;
            state.mode='preloaded';
            state.finalAmount=Math.round(total*100)/100;
            state.finalPath='packets.freeStart.engineSnapshot.gameState[last].totalWinnings';
            state.updatedAt=Date.now();
            try{
              const curtain=window.__XIANYAO_ATG_NATIVE_FREE_CURTAIN__;
              if(!curtain?.getState?.()?.active){
                curtain?.begin?.();
              }
            }catch(_){}
          }
        }
      }catch(_){}
    }

    if (freeNow && !state.active) startSession();
    if (!freeNow && state.active && Date.now() - state.startedAt > 700) finishSession();

    if (state.active) renderOverlay();
  }, 120);

  function resetState(){
    state.active=false;
    state.mode='idle';
    state.startedAt=0;
    state.startBalance=null;
    state.startCount=null;
    state.spinIds=[];
    state.payoutBySpin={};
    state.runningTotal=0;
    state.finalAmount=null;
    state.finalPath='';
    state.candidate=null;
    state.candidatePath='';
    state.candidateScore=0;
    state.packetCount=0;
    state.updatedAt=Date.now();
    overlayDismissed=false;
    overlayAmount=null;
    try{ document.getElementById(OVERLAY_ID)?.remove(); }catch(_){}
    try{
      window.__XIANYAO_ATG_NATIVE_FREE_CURTAIN__?.stop?.();
    }catch(_){}
    publish();
  }

  function readPreloadedFreeFinal(detail){
    try{
      const engine=detail?.engine || {};
      const states=Array.isArray(engine?.gameState)?engine.gameState:[];
      if(!states.length)return null;

      const ranked=states
        .map((item,index)=>({
          item,
          index,
          current:num(item?.currentView),
          total:num(item?.totalViews)
        }))
        .sort((a,b)=>{
          const ac=a.current===null?-1:a.current;
          const bc=b.current===null?-1:b.current;
          return bc-ac || b.index-a.index;
        });

      const last=ranked[0]?.item;
      if(!last)return null;

      const final=num(last.totalWinnings);
      if(final===null)return null;

      const hasFree=states.some(item=>
        item?.startFreeGame===true ||
        String(item?.action||'').toLowerCase()==='freespin' ||
        Number(item?.freeGameCount||0)>0
      );
      if(!hasFree)return null;

      return {
        amount:Math.round(final*100)/100,
        path:'engine.gameState[last].totalWinnings',
        currentView:num(last.currentView),
        totalViews:num(last.totalViews)
      };
    }catch(_){
      return null;
    }
  }

  function beginFromDetail(detail){
    resetState();

    const live=currentSnapshot();
    state.active=true;
    state.mode='probing';
    state.startedAt=Date.now();
    state.startBalance=num(live.balance);
    state.startCount=num(live.freeGameCount);

    const engine=detail?.engine || {};
    const spinId=String(detail?.spinId || engine?.spinId || '');

    if(spinId) state.spinIds.push(spinId);

    let payout=num(detail?.finalState?.totalWinnings);
    if(payout===null) payout=num(detail?.finalState?.roundWinnings);

    if(payout!==null && spinId){
      state.payoutBySpin[spinId]=payout;
      state.runningTotal=Math.round(payout*100)/100;
    }

    const preloaded=readPreloadedFreeFinal(detail);
    if(preloaded){
      state.mode='preloaded';
      state.finalAmount=preloaded.amount;
      state.finalPath=preloaded.path;
      state.candidate=preloaded.amount;
      state.candidatePath=preloaded.path;
      state.candidateScore=99;
    }

    state.packetCount=1;
    observe(engine);

    if(preloaded){
      try{
        window.__XIANYAO_ATG_NATIVE_FREE_CURTAIN__?.begin?.();
        window.__XIANYAO_ATG_FREE_NATIVE_SKIP_STATE__={
          at:Date.now(),
          amount:preloaded.amount,
          totalViews:preloaded.totalViews,
          currentView:preloaded.currentView,
          spinId,
          mode:'collapse-preloaded-freegame-to-final'
        };
      }catch(_){}
    }

    publish();
  }

  window.__XIANYAO_ATG_FREE_RESULT_PROBE__ = {
    version:'1.8.3-test183',
    observe,
    beginFromDetail,
    getState:() => ({...state,spinIds:[...state.spinIds],payoutBySpin:{...state.payoutBySpin}}),
    reset:resetState
  };

  publish();
})();

