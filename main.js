'use strict';
const {app, BrowserWindow, net, dialog} = require('electron');
const SITE='https://xinyao-ai.github.io/xinyao-ai/';
const SCRIPT_URL='https://raw.githubusercontent.com/xinyao-ai/xinyao-ai/main/xinyao_ATG_live.user.js';
const GAME_ORIGIN='https://play.godeebxp.com';
let scriptText='';
const injected=new WeakSet();

async function getScript(){
  try {
    const response=await net.fetch(SCRIPT_URL+'?t='+Date.now(),{cache:'no-store'});
    if(!response.ok) throw new Error('HTTP '+response.status);
    const value=await response.text();
    if(!value.includes('// ==UserScript==') || value.length<1000) throw new Error('Invalid userscript');
    scriptText=value;
    console.log('[SethOracle] Script fetched, length:',value.length, 'version:',value.match(/@version\s+([^\s]+)/)?.[1]);
  }catch(err){
    console.error('[SethOracle] Fetch failed',err);
    dialog.showMessageBox({type:'warning',title:'賽特神諭',message:'無法取得最新助手腳本，遊戲功能可能不完整。',detail:String(err)});
  }
}

function setupInjection(contents){
  if(!scriptText || injected.has(contents))return;
  injected.add(contents);
  // The first page might navigate before debugger attachment is ready.
  // Register a new-document script AND run it in already existing game frames.
  const guard=`(function(){if(location.origin!==${JSON.stringify(GAME_ORIGIN)})return;\n${scriptText}\n})();`;
  (async()=>{
    try{
      if(!contents.debugger.isAttached())contents.debugger.attach('1.3');
      await contents.debugger.sendCommand('Page.enable');
      const answer=await contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{
        source:guard,runImmediately:true
      });
      console.log('[SethOracle] Injection registered',contents.id,answer?.identifier||'');
    }catch(e){
      console.error('[SethOracle] Injection registration failed',contents.id,e);
      injected.delete(contents);
    }
  })();
  contents.once('destroyed',()=>{
    try {if(contents.debugger.isAttached())contents.debugger.detach();}catch(_e){}
  });
}

app.whenReady().then(async()=>{
  await getScript();
  app.on('web-contents-created',(_event,contents)=>{
    setupInjection(contents);
    contents.setWindowOpenHandler(({url})=>{
      if(/^https:\/\//i.test(url))return {action:'allow',overrideBrowserWindowOptions:{
        title:'賽特神諭',autoHideMenuBar:true,width:1180,height:850,
        webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}
      }};
      return {action:'deny'};
    });
  });
  const mainWindow=new BrowserWindow({width:1200,height:850,minWidth:400,minHeight:650,
    title:'賽特神諭',autoHideMenuBar:true,
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  setupInjection(mainWindow.webContents);
  await mainWindow.loadURL(SITE);
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)mainWindow.loadURL(SITE);});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
