'use strict';
const { app, BrowserWindow, net, dialog } = require('electron');

const SITE = 'https://xinyao-ai.github.io/xinyao-ai/';
const SCRIPT_URL = 'https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/main/xinyao_ATG_live.user.js';
const GAME_ORIGIN = 'https://play.godeebxp.com';
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
         target.hostname.endsWith('.hd5957.com'))) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          title: '賽特神諭｜ATG', autoHideMenuBar: true,
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
    title: '賽特神諭', autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  setupInjection(mainWindow.webContents);
  await mainWindow.loadURL(SITE);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = new BrowserWindow({
        width: 1200, height: 850, title: '賽特神諭',
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
      });
      setupInjection(win.webContents);
      win.loadURL(SITE);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
