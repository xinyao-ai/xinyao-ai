/* 戰神賽特（一代）｜獨立房號與全房分析設定（測試版）
 * 只包含一代資料，不修改賽特2、虎小妹或原始掃描器。
 * roomId 線性對應來自 001/019/020/101/501/1001 抽樣，
 * 每次真正進房仍須用伺服器回應核對，不能只靠公式自動進房。
 */
(function(root){
  'use strict';
  const GAME_ID='seth1';
  const GAME_CODE='egyptian-mythology';
  const ROOM_MIN=1,ROOM_MAX=1300,ROOM_ID_OFFSET=304861;
  const PAGE_RANGES=Object.freeze([
    Object.freeze({page:1,min:1,max:500}),
    Object.freeze({page:2,min:501,max:1000}),
    Object.freeze({page:3,min:1001,max:1300})
  ]);
  function roomNumber(v){
    const n=Number(v);
    return Number.isSafeInteger(n)&&n>=ROOM_MIN&&n<=ROOM_MAX?n:null;
  }
  function roomIdCandidate(number){
    const n=roomNumber(number);
    return n===null?null:n+ROOM_ID_OFFSET;
  }
  function roomPage(number){
    const n=roomNumber(number);
    return n===null?null:PAGE_RANGES.find(x=>x.min<=n&&n<=x.max)?.page||null;
  }
  function normalizeRoom(raw){
    if(!raw||typeof raw!=='object')return null;
    const number=roomNumber(raw.number);
    const roomId=Number(raw.roomId);
    // Do not silently equate server room ID with visible room number.
    if(number===null||!Number.isSafeInteger(roomId))return null;
    if(roomId!==roomIdCandidate(number))return null;
    return Object.freeze({
      number,roomId,status:String(raw.status||'Unknown'),
      bet:finite(raw.bet),win:finite(raw.win),
      today:Object.freeze({bet:finite(raw.today?.bet),win:finite(raw.today?.win)})
    });
  }
  function finite(x){if(x===null||x===undefined||x==='')return null;const n=Number(x);return Number.isFinite(n)?n:null;}
  function rate(win,bet){return Number.isFinite(win)&&Number.isFinite(bet)&&bet>0?(win/bet)*100:null;}
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  function metrics(room){
    // Same observation formula as xinyao_ATG_room_scanner.user.js v2.1.3.
    const todayRate=rate(room.today?.win,room.today?.bet);
    const totalRate=rate(room.win,room.bet);
    const delta=(r,b,scale,max)=>r===null?null:clamp((r-100)*clamp(Math.log10(Math.max(0,b||0)+1)/scale,.2,1),-max,max);
    const td=delta(todayRate,room.today?.bet,5.5,45);
    const cd=delta(totalRate,room.bet,6,35);
    const observationScore=td!==null&&cd!==null?clamp(50+td*.65+cd*.35,0,100):td!==null?clamp(50+td,0,100):cd!==null?clamp(50+cd,0,100):null;
    return Object.freeze({todayRate,totalRate,observationScore,todayBet:room.today?.bet??null,totalBet:room.bet??null});
  }
  function rankRooms(rawRooms,options={}){
    const mode=['observation','today','total'].includes(options.mode)?options.mode:'observation';
    const rows=(Array.isArray(rawRooms)?rawRooms:[]).map(normalizeRoom).filter(Boolean).filter(r=>options.onlyEmpty===false||r.status==='Empty')
      .map(r=>({...r,metrics:metrics(r)}));
    const key=mode==='today'?'todayRate':mode==='total'?'totalRate':'observationScore';
    return rows.sort((a,b)=>(b.metrics[key]??-Infinity)-(a.metrics[key]??-Infinity)||a.number-b.number);
  }
  const api=Object.freeze({GAME_ID,GAME_CODE,ROOM_MIN,ROOM_MAX,PAGE_RANGES,roomNumber,roomIdCandidate,roomPage,normalizeRoom,metrics,rankRooms});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.XinyaoSeth1RoomProfile=api;
})(typeof window!=='undefined'?window:null);
