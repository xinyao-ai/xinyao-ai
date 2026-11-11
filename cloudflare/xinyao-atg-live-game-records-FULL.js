/**
 * 賽特神諭 ATG Live Worker v329 + 遊戲事件紀錄
 * 保留會員驗證、裝置配對、即時同步與維護模式
 */
const SESSION_TTL = 60 * 60 * 12;

const PAIR_TTL = 60 * 10;

const LIVE_TTL = 60 * 60 * 24;

const MAINTENANCE_KEY = "system:maintenance";

const ADMIN_USER = "love613710";

const ADMIN_SESSION_SECRET_FALLBACK =

  "xinyao-atg-admin-session-secret-613710";



const CORS = {

  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",

  "Access-Control-Allow-Headers": "Content-Type, Authorization",

  "Content-Type": "application/json; charset=utf-8",

  "Cache-Control": "no-store"

};



const json = (data, status = 200) =>

  new Response(JSON.stringify(data), {

    status,

    headers: CORS

  });



export default {

  async fetch(request, env, ctx) {

    const url = new URL(request.url);



    if (request.method === "OPTIONS") {

      return new Response(null, {

        status: 204,

        headers: CORS

      });

    }



    if (!env.ATG_LIVE_KV) {

      return json({

        ok: false,

        error: "kv_not_bound"

      }, 500);

    }



    // ===== 維護狀態 =====



    if (

      url.pathname === "/maintenance" &&

      request.method === "GET"

    ) {

      const stored = safeJson(

        await env.ATG_LIVE_KV.get(MAINTENANCE_KEY)

      );



      return json({

        ok: true,

        ...normalizeMaintenanceState(stored)

      });

    }



    if (

      url.pathname === "/maintenance" &&

      request.method === "POST"

    ) {

      const token = getBearerToken(request);



      if (!token) {

        return json({

          ok: false,

          error: "admin_authorization_required",

          message: "請先登入管理後台"

        }, 401);

      }



      const verified =

        await verifyAdminSessionToken(token, env);



      if (!verified.ok) {

        return json({

          ok: false,

          error: "admin_authorization_failed",

          message: verified.message

        }, verified.status || 401);

      }



      try {

        const body = await request.json();



        const state = {

          enabled: Boolean(body.enabled),

          message: cleanText(

            body.message ||

              "賽特神諭系統升級維護中，完成後將立即開放使用。",

            500

          ),

          updatedAt: Date.now()

        };



        await env.ATG_LIVE_KV.put(

          MAINTENANCE_KEY,

          JSON.stringify(state)

        );



        return json({

          ok: true,

          maintenance: state

        });

      } catch (error) {

        return json({

          ok: false,

          error: "invalid_maintenance_payload",

          message: String(error?.message || error)

        }, 400);

      }

    }



    // ===== 健康檢查 =====



    if (

      url.pathname === "/" &&

      request.method === "GET"

    ) {

      return json({

        ok: true,

        service: "xinyao-atg-live",

        status: "running",

        mode: "member-device-v2",

        version: "329"

      });

    }



    // ===== 皇鼎會員 Session =====



    if (

      url.pathname === "/session" &&

      request.method === "POST"

    ) {

      try {

        const body = await request.json();

        const memberAccount =

          cleanMember(body.memberAccount);



        if (!memberAccount) {

          return json({

            ok: false,

            error: "missing_member"

          }, 400);

        }



        const ssoAccessToken =

          typeof body.ssoAccessToken === "string"

            ? body.ssoAccessToken.trim()

            : "";



        const verified = ssoAccessToken

          ? await verifyHdSsoMember(

              ssoAccessToken,

              memberAccount,

              env

            )

          : await verifyMember(memberAccount, env);



        if (!verified.ok) {

          return json({

            ok: false,

            error: "member_not_verified",

            message:

              verified.message ||

              "會員身分驗證失敗"

          }, 403);

        }



        const sessionToken = randomToken(32);

        const now = Date.now();

        const expiresAt =

          now + SESSION_TTL * 1000;



        await env.ATG_LIVE_KV.put(

          `session:${sessionToken}`,

          JSON.stringify({

            memberAccount,

            createdAt: now,

            expiresAt

          }),

          { expirationTtl: SESSION_TTL }

        );



        return json({

          ok: true,

          memberAccount,

          sessionToken,

          expiresAt

        });

      } catch (error) {

        return json({

          ok: false,

          error: "session_failed",

          message: String(error?.message || error)

        }, 500);

      }

    }



    // ===== 產生配對碼 =====



    if (

      url.pathname === "/pair/start" &&

      request.method === "POST"

    ) {

      const session =

        await requireSession(request, env);



      if (!session.ok) {

        return json(session.body, session.status);

      }



      let pairCode = "";



      for (let i = 0; i < 6; i++) {

        const candidate = randomCode(6);



        const exists =

          await env.ATG_LIVE_KV.get(

            `pair:${candidate}`

          );



        if (!exists) {

          pairCode = candidate;

          break;

        }

      }



      if (!pairCode) {

        return json({

          ok: false,

          error: "pair_code_unavailable"

        }, 503);

      }



      const now = Date.now();

      const expiresAt =

        now + PAIR_TTL * 1000;



      await env.ATG_LIVE_KV.put(

        `pair:${pairCode}`,

        JSON.stringify({

          memberAccount: session.data.memberAccount,

          createdAt: now,

          expiresAt

        }),

        { expirationTtl: PAIR_TTL }

      );



      return json({

        ok: true,

        pairCode,

        expiresAt

      });

    }



    // ===== 配對碼綁定裝置 =====



    if (

      url.pathname === "/pair/claim" &&

      request.method === "POST"

    ) {

      try {

        const body = await request.json();

        const pairCode =

          cleanPairCode(body.pairCode);



        if (!pairCode) {

          return json({

            ok: false,

            error: "missing_pair_code"

          }, 400);

        }



        const rawPair =

          await env.ATG_LIVE_KV.get(

            `pair:${pairCode}`

          );



        if (!rawPair) {

          return json({

            ok: false,

            error: "pair_code_invalid_or_expired"

          }, 404);

        }



        const pair = safeJson(rawPair);



        if (

          !pair?.memberAccount ||

          Number(pair.expiresAt || 0) < Date.now()

        ) {

          await env.ATG_LIVE_KV.delete(

            `pair:${pairCode}`

          );



          return json({

            ok: false,

            error: "pair_code_invalid_or_expired"

          }, 410);

        }



        const memberAccount =

          cleanMember(pair.memberAccount);



        const deviceId =

          cleanText(body.deviceId, 120) ||

          randomToken(12);



        const deviceName =

          cleanText(body.deviceName, 80) ||

          "此裝置";



        const platform =

          cleanText(body.platform, 40) ||

          "unknown";



        const deviceToken = randomToken(32);

        const now = Date.now();



        const memberKey =

          `member:${memberKvPart(memberAccount)}`;



        const oldBindingRaw =

          await env.ATG_LIVE_KV.get(memberKey);



        const oldBinding = safeJson(oldBindingRaw);



        const binding = {

          memberAccount,

          deviceId,

          deviceName,

          platform,

          deviceToken,

          boundAt: now

        };



        await env.ATG_LIVE_KV.put(

          memberKey,

          JSON.stringify(binding)

        );



        await env.ATG_LIVE_KV.put(

          `device:${deviceToken}`,

          JSON.stringify(binding)

        );



        await env.ATG_LIVE_KV.delete(

          `pair:${pairCode}`

        );



        if (

          oldBinding?.deviceToken &&

          oldBinding.deviceToken !== deviceToken

        ) {

          await env.ATG_LIVE_KV.delete(

            `device:${oldBinding.deviceToken}`

          );

        }



        return json({

          ok: true,

          memberAccount,

          deviceToken,

          deviceId,

          deviceName,

          platform,

          replacedOldDevice:

            Boolean(oldBinding?.deviceToken)

        });

      } catch (error) {

        return json({

          ok: false,

          error: "pair_claim_failed",

          message: String(error?.message || error)

        }, 500);

      }

    }



    // ===== 裝置狀態 =====



    if (

      url.pathname === "/device/status" &&

      request.method === "GET"

    ) {

      const session =

        await requireSession(request, env);



      if (!session.ok) {

        return json(session.body, session.status);

      }



      const memberAccount =

        session.data.memberAccount;



      const raw = await env.ATG_LIVE_KV.get(

        `member:${memberKvPart(memberAccount)}`

      );



      const binding = safeJson(raw);



      const liveRaw = await env.ATG_LIVE_KV.get(

        `live:${memberKvPart(memberAccount)}`

      );



      const live = safeJson(liveRaw);



      return json({

        ok: true,

        bound: Boolean(binding?.deviceToken),

        device: binding

          ? {

              deviceId: binding.deviceId,

              deviceName: binding.deviceName,

              platform: binding.platform,

              boundAt: binding.boundAt

            }

          : null,

        lastUpdatedAt: live?.updatedAt || null

      });

    }



    // ===== 遊戲即時資料上傳 =====



    if (

      url.pathname === "/push" &&

      request.method === "POST"

    ) {

      const authToken =

        getBearerToken(request);



      if (authToken) {

        const rawDevice =

          await env.ATG_LIVE_KV.get(

            `device:${authToken}`

          );



        const device = safeJson(rawDevice);



        if (!device?.memberAccount) {

          return json({

            ok: false,

            error: "device_unauthorized"

          }, 401);
        }



        const memberKey =

          `member:${memberKvPart(device.memberAccount)}`;



        const currentRaw =

          await env.ATG_LIVE_KV.get(memberKey);



        const current = safeJson(currentRaw);



        if (

          !current?.deviceToken ||

          current.deviceToken !== authToken

        ) {

          return json({

            ok: false,

            error: "device_replaced"

          }, 409);

        }



        try {

          const body = await request.json();



          const data = normalizeLiveData(body, {

            memberAccount: device.memberAccount,

            deviceId: device.deviceId,

            deviceName: device.deviceName,

            platform: device.platform

          });



          // 保存可確認的單轉事件。失敗不影響即時同步。
          if (env.GAME_DB && ctx?.waitUntil) {
            const liveKey = `live:${memberKvPart(device.memberAccount)}`;
            try {
              const previous = safeJson(await env.ATG_LIVE_KV.get(liveKey));
              if (previous) ctx.waitUntil(recordSpinSnapshot(env.GAME_DB, previous, data).catch(e => console.error("game_event_record_failed", e)));
            } catch(e) { console.error("game_event_previous_state_failed", e); }
          }
          await env.ATG_LIVE_KV.put(

            `live:${memberKvPart(

              device.memberAccount

            )}`,

            JSON.stringify(data),

            { expirationTtl: LIVE_TTL }

          );



          return json({

            ok: true,

            updatedAt: data.updatedAt

          });

        } catch (error) {

          return json({

            ok: false,

            error: "invalid_payload",

            message: String(error?.message || error)

          }, 400);

        }

      }



      // 舊版 channel 相容



      try {

        const body = await request.json();

        const channel =

          cleanChannel(body.channel);



        if (!channel) {

          return json({

            ok: false,

            error: "missing_channel"

          }, 400);

        }



        const data =

          normalizeLegacyLiveData(body, channel);



        await env.ATG_LIVE_KV.put(

          `live:${channel}`,

          JSON.stringify(data),

          { expirationTtl: LIVE_TTL }

        );



        return json({

          ok: true,

          legacy: true,

          updatedAt: data.updatedAt

        });

      } catch (error) {

        return json({

          ok: false,

          error: "invalid_payload",

          message: String(error?.message || error)

        }, 400);

      }

    }



    // ===== 管理員遊戲事件查詢（需要管理員登入） =====
    if (url.pathname === "/admin/game-events" && request.method === "GET") {
      if (!env.ADMIN_SESSION_SECRET) return json({ok:false,error:"admin_secret_not_configured"},503);
      const token = getBearerToken(request);
      if (!token) return json({ok:false,error:"admin_authorization_required"},401);
      const verified=await verifyAdminSessionToken(token,env);
      if (!verified.ok) return json({ok:false,error:"admin_authorization_failed",message:verified.message},verified.status||401);
      if (!env.GAME_DB) return json({ok:false,error:"game_db_not_bound"},503);
      try {
        const limit=Math.min(5000,Math.max(1,Number(url.searchParams.get("limit"))||1000));
        const result=await env.GAME_DB.prepare("SELECT event_id,member_id,game,room,event_type,bet,payout,free_buy_count,occurred_at FROM game_events ORDER BY occurred_at DESC LIMIT ?").bind(limit).all();
        return json({ok:true,events:(result.results||[]).map(r=>({id:r.event_id,member:r.member_id,game:r.game,room:r.room,type:r.event_type,bet:r.bet,payout:r.payout,free_buy_count:r.free_buy_count,time:r.occurred_at}))});
      }catch(error){console.error("game_event_query_failed",error);return json({ok:false,error:"game_event_query_failed"},500)}
    }
    // ===== 讀取最新資料 =====



    if (

      url.pathname === "/latest" &&

      request.method === "GET"

    ) {

      const authToken =

        getBearerToken(request);



      if (authToken) {

        const session =

          await requireSession(request, env);



        if (!session.ok) {

          return json(session.body, session.status);

        }



        const memberAccount =

          session.data.memberAccount;



        const raw = await env.ATG_LIVE_KV.get(

          `live:${memberKvPart(memberAccount)}`

        );



        const data = safeJson(raw);



        return json({

          ok: true,

          found: Boolean(data),

          data: data || null

        });

      }



      const channel = cleanChannel(

        url.searchParams.get("channel")

      );



      if (channel) {

        const raw =

          await env.ATG_LIVE_KV.get(

            `live:${channel}`

          );



        const data = safeJson(raw);



        return json({

          ok: true,

          found: Boolean(data),

          data: data || null,

          legacy: true

        });

      }



      return json({

        ok: false,

        error: "missing_authorization"

      }, 401);

    }



    return json({

      ok: false,

      error: "not_found"

    }, 404);

  }

};



// ===== 皇鼎 SSO Service Binding =====



async function verifyHdSsoMember(

  accessToken,

  expectedUsername,

  env

) {

  if (!/^[a-f0-9]{64}$/.test(accessToken)) {

    return {

      ok: false,

      message: "皇鼎登入憑證無效，請重新登入"

    };

  }



  if (!env.HD_SSO_SERVICE?.fetch) {

    return {

      ok: false,

      message: "HD_SSO_SERVICE 尚未綁定"

    };

  }



  try {

    const response = await env.HD_SSO_SERVICE.fetch(

      new Request(

        "https://seth-oracle-sso.love06130430.workers.dev/me",

        {

          method: "GET",

          headers: {

            Origin: "https://xinyao-ai.github.io",

            Authorization: `Bearer ${accessToken}`

          }

        }

      )

    );



    if (!response.ok) {

      return {

        ok: false,

        message:

          response.status === 401

            ? "皇鼎登入已失效，請重新登入"

            : `皇鼎 SSO 驗證失敗（HTTP ${response.status}）`

      };

    }



    const identity = await response.json();



    if (

      typeof identity?.username !== "string" ||

      !identity.username ||

      identity.username !== expectedUsername

    ) {

      return {

        ok: false,

        message: "會員身分驗證不一致，請重新登入"

      };

    }



    return {

      ok: true,

      message: ""

    };

  } catch (error) {

    console.error(

      "HD SSO Service Binding Error",

      error

    );



    return {

      ok: false,

      message: "皇鼎 SSO Service Binding 連線失敗"

    };

  }

}



// ===== 舊會員驗證相容 =====



async function verifyMember(memberAccount, env) {

  try {

    if (!env.MEMBER_VERIFY?.fetch) {

      return {

        ok: false,

        message: "會員驗證服務尚未綁定"

      };

    }



    const response = await env.MEMBER_VERIFY.fetch(

      new Request(

        "https://member-verify.internal/",

        {

          method: "POST",

          headers: {

            "Content-Type": "application/json"

          },

          body: JSON.stringify({

            action: "verify",

            memberAccount

          })

        }

      )

    );



    const data = await response

      .json()

      .catch(() => ({}));



    return {

      ok: Boolean(

        response.ok && data?.success

      ),

      message:

        data?.message ||

        data?.error ||

        ""

    };

  } catch (\_) {

    return {

      ok: false,

      message: "會員驗證服務暫時無法連線"

    };

  }

}



// ===== Session =====



async function requireSession(request, env) {

  const token = getBearerToken(request);



  if (!token) {

    return {

      ok: false,

      status: 401,

      body: {

        ok: false,

        error: "missing_session"

      }

    };

  }



  const raw = await env.ATG_LIVE_KV.get(

    `session:${token}`

  );



  const data = safeJson(raw);



  if (

    !data?.memberAccount ||

    Number(data.expiresAt || 0) < Date.now()

  ) {

    if (raw) {

      await env.ATG_LIVE_KV.delete(

        `session:${token}`

      );

    }



    return {

      ok: false,

      status: 401,

      body: {

        ok: false,

        error: "session_expired"

      }

    };

  }



  return {

    ok: true,

    data

  };

}



function getBearerToken(request) {

  const auth =

    request.headers.get("Authorization") || "";



  const match =

    auth.match(/^Bearer\s+(.+)$/i);



  return match ? match[1].trim() : "";

}



// ===== 維護狀態 =====



function normalizeMaintenanceState(value) {

  const source =

    value && typeof value === "object"

      ? value

      : {};



  return {

    enabled: Boolean(source.enabled),

    message: cleanText(

      source.message ||

        "賽特神諭系統升級維護中，完成後將立即開放使用。",

      500

    ),

    updatedAt:

      Number.isFinite(Number(source.updatedAt))

        ? Number(source.updatedAt)

        : null

  };

}



// ===== 管理員驗證 =====



async function verifyAdminSessionToken(

  token,

  env

) {

  try {

    const raw = String(token || "").trim();

    const dot = raw.lastIndexOf(".");



    if (

      !raw ||

      dot <= 0 ||

      dot >= raw.length - 1

    ) {

      return {

        ok: false,

        status: 401,

        message: "管理員登入已失效"

      };

    }



    const payload = raw.slice(0, dot);

    const signature = raw.slice(dot + 1);



    const expected =

      await signAdminSessionPayload(

        payload,

        env

      );



    if (

      !constantTimeTextEqual(

        signature,

        expected

      )

    ) {

      return {

        ok: false,

        status: 401,

        message: "管理員登入已失效"

      };

    }



    const parts = payload.split("|");

    const expiresAt = Number(parts[1] || 0);



    const valid =

      parts[0] === ADMIN_USER &&

      Number.isFinite(expiresAt) &&

      expiresAt >

        Math.floor(Date.now() / 1000);



    return valid

      ? { ok: true, status: 200, message: "" }

      : {

          ok: false,

          status: 401,

          message: "管理員登入已失效"

        };

  } catch (\_) {

    return {

      ok: false,

      status: 500,

      message: "管理員驗證失敗"

    };

  }

}



async function signAdminSessionPayload(

  payload,

  env

) {

  const secret =

    env?.ADMIN_SESSION_SECRET ||

    ADMIN_SESSION_SECRET_FALLBACK;



  const key = await crypto.subtle.importKey(

    "raw",

    new TextEncoder().encode(secret),

    {

      name: "HMAC",

      hash: "SHA-256"

    },

    false,

    ["sign"]

  );



  const signature = await crypto.subtle.sign(

    "HMAC",

    key,

    new TextEncoder().encode(payload)

  );


  return Array.from(

    new Uint8Array(signature),

    b => b.toString(16).padStart(2, "0")

  ).join("");

}



function constantTimeTextEqual(a, b) {

  const left = String(a || "");

  const right = String(b || "");



  if (left.length !== right.length) {

    return false;

  }



  let diff = 0;



  for (let i = 0; i < left.length; i++) {

    diff |=

      left.charCodeAt(i) ^

      right.charCodeAt(i);

  }



  return diff === 0;

}



// ===== 即時遊戲資料 =====



function normalizeLiveData(body, device) {

  return {

    memberAccount: device.memberAccount,

    deviceId: device.deviceId,

    deviceName: device.deviceName,

    platform: device.platform,

    balance: toNumber(body.balance),

    stake: toNumber(body.stake),

    latestPayout: toNumber(body.latestPayout),

    maxPayout: toNumber(body.maxPayout),

    freeGameCount: toInteger(body.freeGameCount),

    freeGameActive: Boolean(body.freeGameActive),

    completedSpins: toInteger(body.completedSpins),

    currentRoomNumber:

      toInteger(body.currentRoomNumber),

    currentRoomKey:

      cleanText(body.currentRoomKey, 120),

    roomEntryBalance:

      toNumber(body.roomEntryBalance),

    roomProfit: toNumber(body.roomProfit),

    roomFreeGameEntries:

      toInteger(body.roomFreeGameEntries),

    updatedAt: Date.now()

  };

}



function normalizeLegacyLiveData(

  body,

  channel

) {

  return {

    channel,

    balance: toNumber(body.balance),

    stake: toNumber(body.stake),

    latestPayout: toNumber(body.latestPayout),

    maxPayout: toNumber(body.maxPayout),

    freeGameCount: toInteger(body.freeGameCount),

    freeGameActive: Boolean(body.freeGameActive),

    completedSpins: toInteger(body.completedSpins),

    currentRoomNumber:

      toInteger(body.currentRoomNumber),

    currentRoomKey:

      cleanText(body.currentRoomKey, 120),

    roomEntryBalance:

      toNumber(body.roomEntryBalance),

    roomProfit: toNumber(body.roomProfit),

    roomFreeGameEntries:

      toInteger(body.roomFreeGameEntries),

    updatedAt: Date.now()

  };

}



// ===== 工具函式 =====



function cleanMember(value) {

  return String(value ?? "")

    .trim()

    .slice(0, 100);

}



function memberKvPart(memberAccount) {

  return encodeURIComponent(

    cleanMember(memberAccount)

  );

}



function cleanPairCode(value) {

  return String(value ?? "")

    .toUpperCase()

    .replace(/[^A-Z0-9]/g, "")

    .slice(0, 12);

}



function cleanChannel(value) {

  return String(value ?? "")

    .replace(/[^a-zA-Z0-9\_-]/g, "")

    .slice(0, 80);

}



function cleanText(value, maxLength = 80) {

  return String(value ?? "")

    .trim()

    .slice(0, maxLength);

}



function toNumber(value) {

  if (

    value === null ||

    value === undefined ||

    value === ""

  ) {

    return null;

  }



  const n = Number(value);



  return Number.isFinite(n) ? n : null;

}



function toInteger(value) {

  if (

    value === null ||

    value === undefined ||

    value === ""

  ) {

    return null;

  }



  const n = Number(value);



  return Number.isFinite(n)

    ? Math.max(0, Math.trunc(n))

    : null;

}



function safeJson(raw) {

  if (!raw) return null;



  try {

    return typeof raw === "string"

      ? JSON.parse(raw)

      : raw;

  } catch (\_) {

    return null;

  }

}



function randomCode(length = 6) {

  const alphabet =

    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";



  const bytes = new Uint8Array(length);

  crypto.getRandomValues(bytes);



  let result = "";



  for (const b of bytes) {

    result += alphabet[b % alphabet.length];

  }



  return result;

}



function randomToken(bytesLength = 32) {

  const bytes = new Uint8Array(bytesLength);

  crypto.getRandomValues(bytes);



  return Array.from(

    bytes,

    b => b.toString(16).padStart(2, "0")

  ).join("");

}
// ===== 確認單轉快照並寫入 D1 =====
// 注意：快照並非 ATG 官方逐局帳務資料；跨房或跳轉時不猜測。
async function recordSpinSnapshot(db,before,after){
 const a=Number(before.completedSpins),b=Number(after.completedSpins);
 if(!Number.isInteger(a)||!Number.isInteger(b)||b!==a+1)return;
 const member=cleanMember(after.memberAccount);
 if(!member||cleanMember(before.memberAccount)!==member)return;
 const oldRoom=String(before.currentRoomNumber||before.currentRoomKey||"");
 const newRoom=String(after.currentRoomNumber||after.currentRoomKey||"");
 if(!oldRoom||oldRoom!==newRoom)return;
 const bet=toNumber(after.stake),payout=toNumber(after.latestPayout);
 if(bet===null||payout===null||bet<0||payout<0)return;
 if(!Number.isFinite(after.updatedAt)||!Number.isFinite(before.updatedAt)||after.updatedAt<=before.updatedAt)return;
 const idText=[member,after.deviceId||"",newRoom,b,before.updatedAt].join("|");
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(idText));
 const eventId=Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
 await db.prepare("INSERT OR IGNORE INTO game_events (event_id,member_id,game,room,event_type,bet,payout,free_buy_count,occurred_at) VALUES (?,?,?,?,'spin',?,?,0,?)")
 .bind(eventId,member,"未提供遊戲名稱",newRoom.slice(0,120),bet,payout,new Date(after.updatedAt).toISOString()).run();
}
