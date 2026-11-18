'use strict';
const { app, BrowserWindow, net, dialog, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const APP_ICON = path.join(__dirname, 'icon-512.png');

const SITE = 'https://xinyao-ai.github.io/xinyao-ai/';
const SCRIPT_URL = 'https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/main/xinyao_ATG_live.user.js';
const GAME_ORIGIN = 'https://play.godeebxp.com';
const DEALER_PREVIEW = SITE + 'dealer-preview.html?dealer=';
const DEALER_CONFIG = SITE + 'carousel-config.json';
const DEALER_CODE_FILE = () => path.join(app.getPath('userData'), 'dealer-code.json');
let dealerCode = '';

function normalizeDealer(value) {
  const result = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9_-]{2,24}$/.test(result) ? result : '';
}

async function verifyDealer(code) {
  if (!code) return false;
  try {
    const res = await net.fetch(DEALER_CONFIG + '?t=' + Date.now(), {cache: 'no-store'});
    if (!res.ok) return false;
    const config = await res.json();
    const d = config.dealerRegistry?.[code];
    if (!d || d.enabled === false) return false;
    const reg = new URL(d.register), line = new URL(d.line);
    return reg.protocol === 'https:' &&
      (reg.hostname === 'hd5957.com' || reg.hostname.endsWith('.hd5957.com')) &&
      line.protocol === 'https:' && line.hostname === 'lin.ee';
  } catch (err) {
    console.warn('[SethOracle] Unable to verify dealer:', err.message);
    return false;
  }
}

function readSavedDealer() {
  try {
    return normalizeDealer(JSON.parse(fs.readFileSync(DEALER_CODE_FILE(), 'utf8')).dealer);
  } catch (_) { return ''; }
}

function persistDealer(code) {
  fs.writeFileSync(DEALER_CODE_FILE(), JSON.stringify({dealer:code}), {mode:0o600});
  dealerCode = code;
}

function siteForDealer() {
  const url = dealerCode ? DEALER_PREVIEW + encodeURIComponent(dealerCode) : SITE;
  return url + (url.includes('?') ? '&' : '?') + 'appview=5135';
}

async function refreshSiteCache(win) {
  // Drop only cached HTTP resources; preserve logins, cookies, storage and device pairing.
  try { await win.webContents.session.clearCache(); }
  catch (error) { console.warn('[SethOracle] Could not clear site cache', error?.message); }
}

async function openDealerSettings(window) {
  const popup = new BrowserWindow({
    parent: window, modal: true, width: 460, height: 330, resizable: false,
    title: '賽特神諭｜經銷商設定', icon: APP_ICON,
    autoHideMenuBar: true,
    webPreferences: {nodeIntegration:false,contextIsolation:true,sandbox:true}
  });
  const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>經銷商設定</title>
<style>body{margin:0;background:#101e20;color:#f6d98a;font-family:"Microsoft JhengHei",sans-serif;padding:24px;text-align:center}
h2{margin:0 0 12px}p{font-size:13px;color:#ddd0af}input{width:95%;box-sizing:border-box;padding:12px;border-radius:9px;background:#1e2c2d;color:white;border:1px solid #c7a669;text-align:center;font-size:18px}
button{margin:16px 5px;padding:12px 18px;border:0;border-radius:9px;background:#edc66f;font-weight:bold;cursor:pointer}
.secondary{background:#3a4441;color:#f6ddb2}</style>
<h2>👑 經銷商專屬設定</h2><p>輸入經銷商編號，例如 A001。原版不需要輸入。</p>
<input id="dealer" maxlength="24" value="${dealerCode}" placeholder="A001">
<div><button onclick="go()">儲存並切換</button><button class="secondary" onclick="location.href='https://xinyao-ai.github.io/xinyao-ai/__dealer_configure__?dealer='">恢復原版</button></div>
<p>只有已啟用的經銷商代碼可以使用。</p>
<script>function go(){location.href='https://xinyao-ai.github.io/xinyao-ai/__dealer_configure__?dealer='+encodeURIComponent(document.getElementById('dealer').value.trim())}</script></html>`;
  popup.webContents.on('will-navigate', async (event,url) => {
    if (!url.startsWith('https://xinyao-ai.github.io/xinyao-ai/__dealer_configure__?')) return;
    event.preventDefault();
    let candidate='';
    try {candidate=normalizeDealer(new URL(url).searchParams.get('dealer'));}catch(_){}
    if (candidate && !(await verifyDealer(candidate))) {
      dialog.showMessageBoxSync(popup,{type:'warning',title:'經銷商代碼無效',message:'找不到已啟用的經銷商代碼，請確認後再試。'});
      return;
    }
    try {
      persistDealer(candidate);
      if (!popup.isDestroyed()) popup.close();
      if (!window.isDestroyed()) {
        await refreshSiteCache(window);
        await window.loadURL(siteForDealer());
      }
    } catch(e) {
      dialog.showErrorBox('切換失敗', String(e));
    }
  });
  await popup.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function setupDealerMenu(window) {
  const menu = Menu.buildFromTemplate([
    {label:'賽特神諭',submenu:[
      {label:'經銷商代碼設定',accelerator:'CommandOrControl+Shift+D',click:()=>openDealerSettings(window)},
      {type:'separator'},
      {label:'回到首頁',click:async()=>{await refreshSiteCache(window);return window.loadURL(siteForDealer());}}
    ]}
  ]);
  window.setMenu(menu);
}

let scriptText = '';
const configured = new WeakSet();
const injectionPromises = new WeakMap();

function isGameURL(url) {
  try { return new URL(url).origin === GAME_ORIGIN; } catch (_) { return false; }
}

async function getScript() {
  try {
    const response = await net.fetch(SCRIPT_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const value = await response.text();
    if (!value.includes('// ==UserScript==') || value.length < 1000) throw new Error('Invalid userscript');
    scriptText = value;
    console.log('[SethOracle] Assistant loaded:', value.match(/@version\s+([^\s]+)/)?.[1]);
  } catch (err) {
    console.error('[SethOracle] Assistant download failed', err);
    dialog.showMessageBox({
      type: 'warning', title: '賽特神諭',
      message: '無法取得 ATG 助手腳本，遊戲工具可能無法顯示。',
      detail: String(err)
    });
  }
}

function assistantSource() {
  // Both early injection and fallback use this guard to avoid two HUD copies.
  return '(function(){if(location.origin!==' + JSON.stringify(GAME_ORIGIN) +
    '||window.__SETH_ORACLE_DESKTOP_INJECTED__)return;' +
    'window.__SETH_ORACLE_DESKTOP_INJECTED__=true;\n' +
    scriptText + '\n})();';
}

async function injectCurrentPage(contents) {
  if (!scriptText || contents.isDestroyed() || !isGameURL(contents.getURL())) return;
  try {
    await contents.executeJavaScript(assistantSource(), true);
    console.log('[SethOracle] Assistant checked in game window', contents.id);
  } catch (err) {
    console.error('[SethOracle] Game assistant injection failed', contents.id, err);
  }
}

function setupInjection(contents) {
  if (configured.has(contents)) return;
  configured.add(contents);

  // Attach BEFORE game navigation when possible. Child windows created by
  // window.open are still Electron windows, never external Chrome windows.
  const register = (async () => {
    if (!scriptText) return;
    try {
      if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
      await contents.debugger.sendCommand('Page.enable');
      await contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: assistantSource(),
        runImmediately: true
      });
      console.log('[SethOracle] Assistant registered for navigation', contents.id);
    } catch (err) {
      console.error('[SethOracle] Early assistant registration failed', contents.id, err);
    }
  })();
  injectionPromises.set(contents, register);

  // Recovery path if Electron's first navigation raced the debugger setup.
  contents.on('did-finish-load', () => {
    register.then(() => injectCurrentPage(contents)).catch(console.error);
  });
  contents.on('did-frame-finish-load', (_event, isMainFrame) => {
    if (isMainFrame) register.then(() => injectCurrentPage(contents)).catch(console.error);
  });

  contents.setWindowOpenHandler(({ url }) => {
    const target = (() => { try { return new URL(url); } catch (_) { return null; } })();
    if (target && target.protocol === 'https:' &&
        (target.origin === new URL(SITE).origin || target.origin === GAME_ORIGIN ||
         (target.hostname === 'hd5957.com' || target.hostname.endsWith('.hd5957.com')))) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          title: '賽特神諭｜ATG', icon: APP_ICON, autoHideMenuBar: true,
          width: 1180, height: 850,
          webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
        }
      };
    }
    console.warn('[SethOracle] Blocked unexpected popup', url);
    return { action: 'deny' };
  });

  contents.once('destroyed', () => {
    try { if (contents.debugger.isAttached()) contents.debugger.detach(); } catch (_) {}
  });
}

app.whenReady().then(async () => {
  await getScript();

  app.on('web-contents-created', (_event, contents) => {
    setupInjection(contents);
  });

  // Electron creates its own child BrowserWindow for window.open; never
  // delegate the game to the operating system default browser.
  const mainWindow = new BrowserWindow({
    width: 1200, height: 850, minWidth: 400, minHeight: 650,
    title: '賽特神諭', icon: APP_ICON, autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  setupInjection(mainWindow.webContents);
  dealerCode = readSavedDealer();
  // 驗證失敗時不更動原版設定；經銷商代碼仍保存在本機供稍後重試。
  if (dealerCode && !(await verifyDealer(dealerCode))) {
    console.warn('[SethOracle] Saved dealer unavailable, opening original site');
    dealerCode = '';
  }
  setupDealerMenu(mainWindow);
  await refreshSiteCache(mainWindow);
  await mainWindow.loadURL(siteForDealer());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = new BrowserWindow({
        width: 1200, height: 850, title: '賽特神諭', icon: APP_ICON,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
      });
      setupInjection(win.webContents);
      setupDealerMenu(win);
      refreshSiteCache(win).then(()=>win.loadURL(siteForDealer()));
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
