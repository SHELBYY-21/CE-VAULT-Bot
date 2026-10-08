// Opt-in, one-shot proof of CANONICAL Render bot outbound delivery.
// This is NOT inbound /status or photo E2E. Never writes ledger/PIN/balances.
import { createHash } from "node:crypto";
const TG_API = "https://api.telegram.org/bot";
function logProof(payload) {
  console.log("[CE TELEGRAM REAL OUTBOUND PROOF]", JSON.stringify(payload));
}
function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}
export async function probeCanonicalBotDelivery(env = process.env, fetchImpl = globalThis.fetch) {
  const started = Date.now();
  const token = String(env.TELEGRAM_BOT_TOKEN || env.BOT_TOKEN || "").trim();
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "https://iuaaviivkumvzbdmpzty.supabase.co").replace(/\/$/, "");
  const dbKey = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const targetWebhook = String(env.RENDER_EXTERNAL_URL || "https://ce-vault-menu-first.onrender.com").replace(/\/$/, "") + "/api/telegram/webhook";
  const result = { verdict: "NOT_RUN", botVerified: false, webhookVerified: false, eligiblePrivateOperator: false, acceptedByTelegram: false, connectorBotSame: null };
  const gatewayUrl = String(env.SUPABASE_GATEWAY_URL || "").trim();
  const anon = String(env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  const gatewayAuth = env.CE_DATA_GATEWAY_SECRET ||
    (token ? createHash("sha256").update("ce-vault-data-gateway-v1:" + token).digest("hex") : "");
  const useDirectDb = Boolean(dbKey) && env.SUPABASE_FORCE_GATEWAY !== "1";
  const hasDbPath = useDirectDb || Boolean(gatewayUrl && anon && gatewayAuth);
  if (!token || !/^https:\/\/[^/?#]+/i.test(url) || !hasDbPath) {
    result.reason = "MISSING_CANONICAL_RUNTIME_CONFIGURATION";
    logProof(result);
    return false;
  }
  const fetchBounded = async (endpoint, opts = {}) => {
    const response = await fetchImpl(endpoint, { ...opts, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw err("HTTP_" + response.status);
    return response.json();
  };
  const telegram = async (method, body = {}) => {
    const data = await fetchBounded(TG_API + token + "/" + method, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!data?.ok) throw err("TELEGRAM_" + method.toUpperCase() + "_REJECTED");
    return data.result;
  };
  try {
    const me = await telegram("getMe");
    if (!me?.is_bot || !Number.isSafeInteger(Number(me.id))) throw err("INVALID_BOT_IDENTITY");
    result.botVerified = true;
    // Connector identity is public bot metadata, not a credential.
    result.connectorBotSame = Number(me.id) === 8731325927;
    const webhook = await telegram("getWebhookInfo");
    result.webhookVerified = webhook?.url === targetWebhook;
    if (!result.webhookVerified) throw err("CANONICAL_WEBHOOK_MISMATCH");
    const query = "/rest/v1/admins?select=telegram_user_id&is_active=eq.true&order=created_at.asc&limit=10";
    let admins;
    if (useDirectDb) {
      const headers = { apikey: dbKey, accept: "application/json" };
      if (dbKey.split(".").length === 3) headers.authorization = "Bearer " + dbKey;
      admins = await fetchBounded(url + query, { method: "GET", headers });
    } else {
      // The existing CE Data Gateway is the official server-only fallback.
      // Forward only a read-only SELECT request; never put its secret in a log.
      admins = await fetchBounded(gatewayUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: anon,
          authorization: "Bearer " + anon,
          "x-ce-gateway-auth": gatewayAuth,
        },
        body: JSON.stringify({
          method: "GET",
          path: query,
          headers: { accept: "application/json" },
          bodyBase64: null,
        }),
      });
    }
    if (!Array.isArray(admins) || !admins.length) throw err("NO_ACTIVE_ADMINS");
    let chosen = null;
    for (const admin of admins) {
      const id = Number(admin?.telegram_user_id);
      if (!Number.isSafeInteger(id) || id < 1) continue;
      try {
        const chat = await telegram("getChat", { chat_id: id });
        if (chat?.type === "private" && Number(chat.id) === id) {
          chosen = id;
          break;
        }
      } catch {
        // Some operators may not have initiated a private chat with this bot.
      }
    }
    if (!chosen) throw err("NO_VERIFIED_PRIVATE_OPERATOR_CHAT");
    result.eligiblePrivateOperator = true;
    const message = [
      "◈ CE VAULT · PRODUCTION BOT SMOKE TEST",
      "SANDBOX / LOCKED · ทดสอบเฉพาะการส่งข้อความ",
      "นี่ไม่ใช่การรับชำระเงินและไม่มีรายการธุรกรรม",
      "หากต้องการตรวจขารับคำสั่ง ให้ตอบ /status กับบอทนี้",
    ].join("\n");
    const sent = await telegram("sendMessage", {
      chat_id: chosen, text: message, disable_notification: true,
      link_preview_options: { is_disabled: true },
    });
    result.acceptedByTelegram = Number.isSafeInteger(Number(sent?.message_id));
    if (!result.acceptedByTelegram) throw err("MESSAGE_ACCEPTANCE_UNVERIFIED");
    result.verdict = "PASS";
    result.elapsedMs = Date.now() - started;
    logProof(result);
    return true;
  } catch (e) {
    result.verdict = "NOT_CONFIRMED";
    result.reason = String(e?.code || "TRANSPORT_ERROR").slice(0, 80);
    result.elapsedMs = Date.now() - started;
    logProof(result);
    return false;
  }
}
if (process.argv[1]?.endsWith("telegram-canonical-outbound-probe.mjs")) {
  probeCanonicalBotDelivery().then(ok => { process.exitCode = ok ? 0 : 1; });
}
