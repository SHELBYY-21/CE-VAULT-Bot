// Opt-in, one-shot PREVIEW of every operator card for the boss.
// Sample payloads are DEMO-only; nothing is written to the ledger or production tables.
import { createHash } from 'node:crypto';
import {
  botHomeReplyMarkup,
  formatBotHomeReply,
  formatBotSystemReply,
  formatScanStageReply,
  formatIntakeV4Reply,
} from '../runtime-patches/live-intake.mjs';

const TG_API = 'https://api.telegram.org/bot';

function logDemo(payload) {
  console.log('[CE DEMO CARDS]', JSON.stringify(payload));
}

function buildDemoApprovalMarkup(ref) {
  return {
    inline_keyboard: [[
      { text: '✅ เข้า · ยืนยัน', style: 'success', callback_data: 'ce:approve:' + ref },
      { text: '📝 แก้ไข', style: 'primary', callback_data: 'ce:edit:' + ref },
      { text: '⛔ ไม่เข้า · ยกเลิก', style: 'danger', callback_data: 'ce:reject:' + ref },
    ]],
  };
}

export function buildDemoCards() {
  const deskRate = { sell_rate: '33.30' };
  const market = { price: '33.25', fresh: true };
  const verified = {
    pending: {
      status: 'VERIFIED', ledger_ref: 'CE-DEMO-0001', thb_in: '5000', should_send: '150.150150',
      pin_match: true, ocr_confidence: '98', bank: 'SCB', account_masked: '••••1234',
    },
    deskRate, market,
  };
  const blocked = {
    pending: {
      status: 'BANK_MISMATCH', ledger_ref: 'CE-DEMO-0002', thb_in: '9900', should_send: '297.297297',
      pin_match: false, ocr_confidence: '61', bank: 'KBANK', account_masked: '••••3855',
    },
    deskRate, market,
  };
  const recorded = {
    pending: {
      status: 'RECORDED', ledger_ref: 'CE-DEMO-0003', tx_id: 'demo-tx-001', thb_in: '2000', should_send: '60.060060',
      pin_match: true, ocr_confidence: '96', bank: 'SCB', account_masked: '••••1234',
    },
    deskRate, market,
  };
  return [
    { id: 'intro', kind: 'text', text: ['🧪 CE DEMO PREVIEW · ตัวอย่างการ์ดทั้งหมด', 'ข้อมูลทั้งหมดเป็น DEMO · ไม่มีรายการจริง · ไม่เขียน Ledger'].join('\n') },
    { id: 'webm', kind: 'animation', caption: ['⚡ CE EMPIRE · WEB FLOW — ANIMATION DEMO', 'OCR → MATCH → IN → WAIT → DONE'].join('\n') },
    { id: 'home', kind: 'photo', caption: formatBotHomeReply(), markup: botHomeReplyMarkup() },
    { id: 'scan', kind: 'text', text: formatScanStageReply() },
    { id: 'verified', kind: 'text', text: formatIntakeV4Reply(verified), markup: buildDemoApprovalMarkup('CE-DEMO-0001') },
    { id: 'blocked', kind: 'text', text: formatIntakeV4Reply(blocked) },
    { id: 'recorded', kind: 'text', text: formatIntakeV4Reply(recorded) },
    { id: 'duplicate', kind: 'text', text: formatIntakeV4Reply({ pending: recorded.pending, duplicate: true }) },
    { id: 'status', kind: 'text', text: formatBotSystemReply({ telegramOnline: true, webhookVerified: true, databaseConfigured: true, pendingUpdates: 0, safety: 'LOCKED' }) },
    { id: 'outro', kind: 'text', text: '🧪 จบการสาธิต — ส่งรูปสลิปจริงเพื่อเริ่มใช้งานจริง' },
  ];
}

async function sendDemoAnimationCard(telegram, chatId, webmUrl, card) {
  try {
    await telegram('sendAnimation', { chat_id: chatId, animation: webmUrl, caption: card.caption, reply_markup: card.markup, disable_notification: true });
    return 'sendAnimation';
  } catch (animationError) {
    try {
      await telegram('sendDocument', { chat_id: chatId, document: webmUrl, caption: card.caption, reply_markup: card.markup, disable_notification: true });
      return 'sendDocument';
    } catch {
      logDemo({ card: card.id, error: String(animationError?.message || 'ANIMATION_TRANSPORT_FAILED').slice(0, 80) });
      return null;
    }
  }
}

export async function fireDemoCards(env = process.env, fetchImpl = globalThis.fetch) {
  const result = { verdict: 'NOT_RUN', sent: 0, cards: 0, reason: '' };
  const token = String(env.TELEGRAM_BOT_TOKEN || env.BOT_TOKEN || '').trim();
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || 'https://iuaaviivkumvzbdmpzty.supabase.co');
  const dbKey = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const gatewayUrl = String(env.SUPABASE_GATEWAY_URL || '').trim();
  const anon = String(env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const gatewayAuth = env.CE_DATA_GATEWAY_SECRET ||
    (token ? createHash('sha256').update('ce-vault-data-gateway-v1:' + token).digest('hex') : '');
  const useDirectDb = Boolean(dbKey) && env.SUPABASE_FORCE_GATEWAY !== '1';
  const hasDbPath = useDirectDb || Boolean(gatewayUrl && anon && gatewayAuth);
  if (!token || !/^https:\/\/[^/?#]+/i.test(url) || !hasDbPath) {
    result.reason = 'MISSING_CANONICAL_RUNTIME_CONFIGURATION';
    logDemo(result);
    return result;
  }
  const fetchBounded = async (endpoint, opts = {}) => {
    const response = await fetchImpl(endpoint, { ...opts, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('HTTP_' + response.status);
    return response.json();
  };
  const telegram = async (method, body = {}) => {
    const data = await fetchBounded(TG_API + token + '/' + method, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!data?.ok) throw new Error('TELEGRAM_' + method.toUpperCase() + '_REJECTED');
    return data.result;
  };
  try {
    const origin = String(env.RENDER_EXTERNAL_URL || 'https://ce-vault-menu-first.onrender.com');
    const welcomeUrl = (origin.endsWith('/') ? origin.slice(0, -1) : origin) + '/brand/welcome.jpg';
    const webmUrl = (origin.endsWith('/') ? origin.slice(0, -1) : origin) + '/brand/webflow.webm';
    const query = '/rest/v1/admins?select=telegram_user_id&is_active=eq.true&order=created_at.asc&limit=10';
    let admins;
    if (useDirectDb) {
      const headers = { apikey: dbKey, accept: 'application/json' };
      if (dbKey.split('.').length === 3) headers.authorization = 'Bearer ' + dbKey;
      admins = await fetchBounded(url + query, { method: 'GET', headers });
    } else {
      admins = await fetchBounded(gatewayUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: anon, authorization: 'Bearer ' + anon, 'x-ce-gateway-auth': gatewayAuth },
        body: JSON.stringify({ method: 'GET', path: query, headers: { accept: 'application/json' }, bodyBase64: null }),
      });
    }
    if (!Array.isArray(admins) || !admins.length) throw new Error('NO_ACTIVE_ADMINS');
    let chosen = null;
    for (const admin of admins) {
      const id = Number(admin?.telegram_user_id);
      if (!Number.isSafeInteger(id) || id < 1) continue;
      try {
        const chat = await telegram('getChat', { chat_id: id });
        if (chat?.type === 'private' && Number(chat.id) === id) { chosen = id; break; }
      } catch {
        // Operator may not have started a private chat with the bot yet.
      }
    }
    if (!chosen) throw new Error('NO_VERIFIED_PRIVATE_OPERATOR_CHAT');
    const cards = buildDemoCards();
    result.cards = cards.length;
    for (const card of cards) {
      if (card.kind === 'animation') {
        const transport = await sendDemoAnimationCard(telegram, chosen, webmUrl, card);
        if (transport) result.sent++;
        logDemo({ card: card.id, transport: transport || 'FAILED' });
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }
      if (card.kind === 'photo') {
        await telegram('sendPhoto', { chat_id: chosen, photo: welcomeUrl, caption: card.caption, reply_markup: card.markup, disable_notification: true });
      } else {
        await telegram('sendMessage', { chat_id: chosen, text: card.text, reply_markup: card.markup, disable_notification: true, link_preview_options: { is_disabled: true } });
      }
      result.sent++;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    result.verdict = 'PASS';
    logDemo(result);
    return result;
  } catch (error) {
    result.reason = String(error?.message || 'TRANSPORT_ERROR').slice(0, 80);
    logDemo(result);
    return result;
  }
}

if (process.argv[1] && process.argv[1].endsWith('telegram-demo-cards.mjs')) {
  fireDemoCards().then((result) => { process.exitCode = result.verdict === 'PASS' ? 0 : 1; });
}
