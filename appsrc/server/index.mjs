import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { assertSandboxFlags, commandTarget, TELEGRAM_ACTIONS } from "./domain/contract.mjs";
import { bindingDigest, issueCallbackData, makeCallbackReference, nonceDigest, verifyCallbackData } from "./domain/callbacks.mjs";
import { createWorkflowRepository } from "./repositories/supabase.mjs";
import { buildStatusCard, createTelegramClient } from "./repositories/telegram.mjs";
import { runSandboxE2E } from "./e2e.mjs";
import { buildOpsOverview } from "./ops-summary.mjs";
import { accountLast4, analyzeSlipBuffer, bangkokDateKey, decideIntake, divideDecimal, fetchBinanceThSpot, findPinnedMatch, fingerprintImage, botHomeReplyMarkup, formatAccountPinReply, formatBotHomeReply, formatBotCeBriefReply, ceBriefReplyMarkup, formatBotBanksReply, formatSlipVerifyReply, isSlipQrPayload, verifySlip, verifySlipAi, formatBotSystemReply, formatIntakeReply, formatIntakeRichMessage, formatIntakeV4Reply, formatIntakeV4RichMessage, formatScanStageReply, formatScanStageRichMessage, formatScanDraftRichMessage, formatSlipPhotoCaption, intakeCapability, makeLedgerIdentity, normalizeBank } from "./live-intake.mjs";
import { decodeSlipQrPayload } from "./slip-verify.mjs";
import { createGatekeeperRuntime } from "./gatekeeper-runtime.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPortIndex = process.argv.indexOf("--port");
const PORT = Number(process.env.PORT || (cliPortIndex >= 0 ? process.argv[cliPortIndex + 1] : 3000));
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iuaaviivkumvzbdmpzty.supabase.co";
const repository = createWorkflowRepository({ url: SUPABASE_URL, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY });
const telegram = createTelegramClient(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN);
const sseClients = new Set();

function equalSecret(received, expected) {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function currentSafety() {
  try {
    assertSandboxFlags(process.env);
    return { ok: true };
  } catch (error) {
    return { ok: false, code: error.message };
  }
}

function problem(res, req, status, code, detail, extra = {}) {
  res.status(status)
    .type("application/problem+json")
    .set("X-Request-ID", req.requestId)
    .json({
      type: `https://cevault.local/errors/${code.toLowerCase().replaceAll("_", "-")}`,
      title: code.replaceAll("_", " "),
      status,
      detail,
      instance: req.originalUrl,
      request_id: req.requestId,
      ...extra,
    });
}

function repositoryError(res, req, error) {
  const map = {
    JOB_NOT_FOUND: [404, "Job not found"],
    STATE_VERSION_STALE: [409, "Job state changed before this command could be applied"],
    TERMINAL_STATE_IMMUTABLE: [409, "Terminal job records are immutable"],
    INVALID_STATE_TRANSITION: [409, "Requested state transition is not allowed"],
    CONFIRM_PROCESS_NOT_ALLOWED: [409, "Confirmation is only valid for NEED_CONFIRMATION"],
    IDEMPOTENCY_KEY_CONFLICT: [409, "Idempotency key was previously used with a different request"],
    CE_VAULT_SANDBOX_GUARD_FAILED: [503, "Sandbox safety configuration rejects this operation"],
  };
  const [status, detail] = map[error?.code || error?.message] || [503, "Workflow source of truth is unavailable"];
  return problem(res, req, status, error?.code || error?.message || "DATABASE_UNAVAILABLE", detail);
}

function requireRepository(req, res) {
  const safety = currentSafety();
  if (!repository) {
    problem(res, req, 503, "DATABASE_UNAVAILABLE", "Server-only Supabase credentials are not configured.");
    return false;
  }
  if (!safety.ok) {
    problem(res, req, 503, safety.code, "Sandbox safety flags are not configured for this runtime.");
    return false;
  }
  return true;
}

function requireSandboxApiKey(req, res) {
  if (!requireRepository(req, res)) return false;
  if (!equalSecret(req.get("x-ce-sandbox-key"), process.env.CE_VAULT_SANDBOX_API_KEY)) {
    problem(res, req, 403, "SANDBOX_COMMAND_DISABLED", "A valid sandbox operator key is required for write commands.");
    return false;
  }
  return true;
}

function requestHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function publishSse(event, payload) {
  const encoded = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) client.write(encoded);
}

async function flushOutbox() {
  if (!repository || !currentSafety().ok) return;
  try {
    const messages = await repository.claimOutbox(25);
    for (const message of messages) publishSse("activity", message);
  } catch {
    // Outbox remains durable; a later polling cycle can recover pending rows.
  }
}

function allowedCardActions(job) {
  const actions = [TELEGRAM_ACTIONS.REFRESH, TELEGRAM_ACTIONS.DETAILS, TELEGRAM_ACTIONS.AUDIT];
  if (job.state === "NEED_CONFIRMATION") actions.push(TELEGRAM_ACTIONS.CONFIRM_PROCESS);
  if (["FAILED", "DUPLICATE", "TIMEOUT"].includes(job.state)) actions.push(TELEGRAM_ACTIONS.RECHECK);
  return actions;
}

async function createCardKeyboard(job, chatId, messageId) {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const tokens = allowedCardActions(job).map((action) => {
    const nonce = randomBytes(6).toString("base64url");
    const reference = makeCallbackReference(`${job.id}:${action}:${nonce}:${expiresAt}`);
    const binding = bindingDigest({ chatId, messageId, reference });
    const callbackData = issueCallbackData({ action, reference, nonce, expiresAt, binding, secret: process.env.TELEGRAM_CALLBACK_SECRET });
    return {
      reference,
      job_id: job.id,
      action,
      nonce_hash: nonceDigest(nonce),
      binding_digest: binding,
      chat_id: chatId,
      message_id: messageId,
      expires_at: new Date(expiresAt).toISOString(),
      metadata: { version: job.state_version },
      callbackData,
    };
  });
  await repository.insertCallbackTokens(tokens.map(({ callbackData, ...record }) => record));
  return {
    inline_keyboard: tokens.map((token) => [{ text: token.action.replaceAll("_", " "), callback_data: token.callbackData }]),
  };
}

async function refreshTelegramCard(job) {
  if (!telegram || !job.telegram_chat_id || !job.telegram_message_id) return;
  const keyboard = await createCardKeyboard(job, job.telegram_chat_id, job.telegram_message_id);
  await telegram.editMessage(job.telegram_chat_id, job.telegram_message_id, buildStatusCard(job), keyboard);
}

async function createTelegramSandboxCard(chatId, updateId) {
  const created = await repository.createSandboxJob({
    transactionType: "TELEGRAM_SANDBOX_JOB",
    worker: "TG-INTAKE",
    summary: "Created from private Telegram sandbox command",
    correlationId: `telegram-update-${updateId}`,
    metadata: { source: "telegram", update_id: updateId },
  });
  const job = await repository.getJob(created.job_id);
  const message = await telegram.sendMessage(chatId, buildStatusCard(job));
  const registered = await repository.registerTelegramCard(job.id, chatId, message.message_id);
  await refreshTelegramCard(registered);
  return registered;
}
function imageFileId(message) {
  if (Array.isArray(message?.photo) && message.photo.length) {
    const photos = message.photo.filter((photo) => photo?.file_id);
    const preferred = [...photos].reverse().find((photo) => {
      const width = Number(photo?.width || 0);
      const height = Number(photo?.height || 0);
      const area = width > 0 && height > 0 ? width * height : 0;
      return area >= 250_000 && area <= 1_200_000;
    });
    const fallback = photos.length > 1 ? photos[photos.length - 2] : photos[photos.length - 1];
    return (preferred || fallback || photos[0])?.file_id || null;
  }
  if (message?.document?.file_id && /^image\//i.test(message.document.mime_type || "")) return message.document.file_id;
  return null;
}

function roomNameFor(message) {
  return String(message?.chat?.title || message?.chat?.username || "TELEGRAM").slice(0, 40);
}

function fullBank(account) {
  const number = String(account?.account_number || "").trim() || "NO ACCOUNT";
  const label = String(account?.label || "").trim();
  return `${account?.bank_name || "BANK"} ${number}${label ? ` · ${label}` : ""}`;
}

async function handleTelegramHome(message) {
  if (!message?.chat?.id) return true;
  const welcomeOrigin = String(process.env.RENDER_EXTERNAL_URL || "https://ce-vault-menu-first.onrender.com");
  const brandBase = welcomeOrigin.endsWith("/") ? welcomeOrigin.slice(0, -1) : welcomeOrigin;
  const welcomeUrl = brandBase + "/brand/welcome.jpg";
  const webmUrl = brandBase + "/brand/webflow.mp4";
  let homeSent = false;
  if (typeof telegram.sendAnimationWithMarkup === "function" && process.env.CE_RESPONSE_WEBM !== "0") {
    try {
      await telegram.sendAnimationWithMarkup(message.chat.id, webmUrl, formatBotHomeReply(), botHomeReplyMarkup());
      homeSent = true;
    } catch {
      // WEB FLOW animation rejected: fall back to the static photo, then plain text.
    }
  }
  if (!homeSent) {
    try {
      await telegram.sendPhotoWithMarkup(message.chat.id, welcomeUrl, formatBotHomeReply(), botHomeReplyMarkup());
      homeSent = true;
    } catch {
      await telegram.sendMessageWithMarkup(message.chat.id, formatBotHomeReply(), botHomeReplyMarkup());
    }
  }
  if (process.env.CE_RESPONSE_ACCOUNT_PIN !== "0") {
    try {
      const pinMessage = await telegram.sendMessageWithMarkup(message.chat.id, formatAccountPinReply(), botHomeReplyMarkup());
      if (typeof telegram.pinChatMessage === "function" && Number(pinMessage?.message_id) > 0) {
        try {
          await telegram.pinChatMessage(message.chat.id, Number(pinMessage.message_id));
        } catch {
          // Pinning is best-effort: chat type or client may reject it.
        }
      }
    } catch {
      // Account pin card is best-effort: the home flow already succeeded.
    }
  }
  return true;
}

async function handleSlipVerifyMessage(message) {
  if (!message?.chat?.id) return true;
  const payload = String(message.text || "").trim();
  try {
    let result = await verifySlip(payload);
    if (result.status === "NOT_CONFIGURED") {
      try {
        result = await verifySlipAi(payload, null, null);
      } catch {
        result = { status: "NOT_CONFIGURED", provider: null };
      }
    }
    await telegram.sendMessageWithMarkup(message.chat.id, formatSlipVerifyReply(result), undefined);
  } catch {
    await telegram.sendMessageWithMarkup(message.chat.id, "🔴 ตรวจสลิปไม่สำเร็จ · ลองใหม่อีกครั้ง", undefined);
  }
  return true;
}

async function handleTelegramCeBrief(message) {
  const operator = await requireTelegramOperator(message);
  if (!operator) return true;
  const chatId = message.chat.id;
  let overview = null;
  if (typeof buildOpsOverview === "function" && repository && typeof repository.listOpsTransactions === "function") {
    try {
      const [transactions, pendingSlips, rates, cycles, bankAccounts, exceptions] = await Promise.all([
        repository.listOpsTransactions(1000),
        repository.listOpsPendingSlips(100),
        repository.listOpsRates(),
        repository.listOpsOpenCycles(),
        repository.listOpsBankAccounts(),
        repository.listOpsOpenExceptions(),
      ]);
      overview = buildOpsOverview({ transactions, pendingSlips, rates, cycles, bankAccounts, exceptions, transactionLimit: 1000 });
    } catch {}
  }
  await telegram.sendMessageWithMarkup(chatId, formatBotCeBriefReply(overview, process.env), ceBriefReplyMarkup());
  return true;
}
async function getWebhookInfoBounded(timeoutMs = 1500) {
  let timer;
  try {
    return await Promise.race([
      telegram.getWebhookInfo(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("WEBHOOK_INFO_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function handleTelegramSystemStatus(message) {
  if (!message?.chat?.id) return true;
  const chatId = message.chat.id;
  let webhook = null;
  try {
    webhook = await getWebhookInfoBounded();
  } catch {}
  const origin = String(process.env.RENDER_EXTERNAL_URL || "https://ce-vault-menu-first.onrender.com").replace(/\/$/, "");
  const expectedWebhook = `${origin}/api/telegram/webhook`;
  await telegram.sendMessage(chatId, formatBotSystemReply({
    telegramOnline: true,
    webhookVerified: webhook?.url === expectedWebhook,
    databaseConfigured: Boolean(repository),
    pendingUpdates: webhook ? Number(webhook.pending_update_count ?? 0) : null,
    safety: "LOCKED",
  }));
  return true;
}

async function handleTelegramCallback(callback) {
  const chatId = callback?.message?.chat?.id;
  if (!chatId) return true;
  const data = String(callback?.data || "");
  await telegram.answerCallbackQuery(callback?.id).catch(() => undefined);
  const message = { ...callback.message, from: callback.from, chat: callback.message.chat };

  // Callback tokens contain only a pending UUID; identity is always callback.from.
  if (/^ce:approve:[0-9a-f-]{36}$/i.test(data)) {
    message.text = "/approve " + data.slice("ce:approve:".length);
    return handleTelegramApprove(message);
  }
  if (/^ce:reject:[0-9a-f-]{36}$/i.test(data)) {
    message.text = "/reject " + data.slice("ce:reject:".length);
    return handleTelegramReject(message);
  }
  if (/^ce:edit:[0-9a-f-]{36}$/i.test(data)) {
    message.text = "/edit " + data.slice("ce:edit:".length);
    return handleTelegramEdit(message);
  }
  if (data === "ce:brief") {
    message.text = "/ce";
    return handleTelegramCeBrief(message);
  }
  if (data === "ce:home") return handleTelegramHome(message);
  if (data === "ce:status") return handleTelegramSystemStatus(message);
  if (data === "ce:scan") {
    await telegram.sendMessage(chatId, formatScanStageReply());
    return true;
  }
  if (data === "ce:rate") {
    message.text = "/rate";
    return handleTelegramRate(message);
  }
  if (data === "ce:pin") {
    message.text = "/pin";
    return handleTelegramPin(message, false);
  }
  if (data === "ce:banks") {
    await telegram.sendMessageWithMarkup(chatId, formatBotBanksReply(), botHomeReplyMarkup());
    return true;
  }
  return true;
}

async function handleTelegramReject(message) {
  const operator = await requireTelegramOperator(message);
  if (!operator) return true;
  if (!["owner", "admin", "superadmin"].includes(String(operator.role || "").toLowerCase())) {
    await telegram.sendMessage(message.chat.id, "⛔ ไม่มีสิทธิ์ปฏิเสธ (Reject denied)");
    return true;
  }
  const id = String(message.text || "").match(/^\/reject(?:@\w+)?\s+([0-9a-f-]{36})\s*$/i)?.[1];
  if (!id) {
    await telegram.sendMessage(message.chat.id, "ใช้ /reject <pending UUID> (Reject)");
    return true;
  }
  const pending = await repository.getPendingSlipForApproval(id);
  if (!pending || String(pending.chat_id) !== String(message.chat.id)) {
    await telegram.sendMessage(message.chat.id, "ไม่พบรายการในห้องนี้ (Not found)");
    return true;
  }
  if (pending.status !== "VERIFIED" || pending.tx_id) {
    await telegram.sendMessage(message.chat.id, "⛔ สถานะเปลี่ยนแล้ว (Not pending approval)");
    return true;
  }
  const rejected = await repository.rejectVerifiedPendingSlip(id, String(message.chat.id), String(message.from.id));
  await telegram.sendMessage(message.chat.id, rejected
    ? "🚫 ปฏิเสธรายการ (Rejected) · " + pending.ledger_ref
    : "⛔ สถานะเปลี่ยนแล้ว (Not pending approval)");
  return true;
}

async function handleTelegramEdit(message) {
  const operator = await requireTelegramOperator(message);
  if (!operator) return true;
  if (!["owner", "admin", "superadmin"].includes(String(operator.role || "").toLowerCase())) {
    await telegram.sendMessage(message.chat.id, "⛔ ไม่มีสิทธิ์แก้ไข (Edit denied)");
    return true;
  }
  const id = String(message.text || "").match(/^\/edit(?:@\w+)?\s+([0-9a-f-]{36})\s*$/i)?.[1];
  if (!id) {
    await telegram.sendMessage(message.chat.id, "ใช้ /edit <pending UUID> เพื่อดูข้อมูลก่อนแก้ไข (Review)");
    return true;
  }
  const pending = await repository.getPendingSlipForApproval(id);
  if (!pending || String(pending.chat_id) !== String(message.chat.id)) {
    await telegram.sendMessage(message.chat.id, "ไม่พบรายการในห้องนี้ (Not found)");
    return true;
  }
  await telegram.sendMessage(message.chat.id, [
    "📝 ตรวจสอบก่อนแก้ไข (Edit review)",
    "อ้างอิง (Reference): " + pending.ledger_ref,
    "สถานะ (Status): " + pending.status,
    "ยอดรับ (Received): " + (pending.thb_in ?? "—") + " THB",
    "ต้องส่ง (Total Due): " + (pending.should_send ?? "—") + " USDT",
    "การแก้ไขยอดยังปิดอยู่เพื่อป้องกันการเปลี่ยน Ledger โดยไม่มีหลักฐาน (Edit disabled).",
  ].join("\n"));
  return true;
}

async function handleTelegramApprove(message) {
  const chatId = message?.chat?.id;
  const operator = await requireTelegramOperator(message);
  if (!operator) return true;
  if (!["owner", "admin", "superadmin"].includes(String(operator.role || "").toLowerCase())) {
    await telegram.sendMessage(chatId, "⛔ ไม่มีสิทธิ์อนุมัติ (Approval denied)");
    return true;
  }
  const pendingId = String(message.text || "").match(/^\/approve(?:@\w+)?\s+([0-9a-f-]{36})\s*$/i)?.[1];
  if (!pendingId) {
    await telegram.sendMessage(chatId, "ใช้ /approve <pending UUID> หลังตรวจข้อมูล OCR และบัญชีรับครบแล้ว");
    return true;
  }
  const pending = await repository.getPendingSlipForApproval(pendingId);
  if (!pending || String(pending.chat_id) !== String(chatId)) {
    await telegram.sendMessage(chatId, "ไม่พบรายการในห้องนี้ (Not found)");
    return true;
  }
  if (pending.status !== "VERIFIED" || pending.pin_match !== true || !pending.thb_in || !pending.should_send) {
    await telegram.sendMessage(chatId, "⛔ ข้อมูลยังไม่ผ่านการตรวจ (Review required) — ห้ามบันทึก");
    return true;
  }
  try {
    const result = await repository.promotePendingSlip(pending.id, operator.id, roomNameFor(message));
    if (result.reused) {
      await telegram.sendMessage(chatId, "ℹ️ รายการนี้บันทึกแล้ว (Already recorded) · " + pending.ledger_ref);
      return true;
    }
    await telegram.sendMessage(chatId, [
      "✅ แอดมินอนุมัติ (Admin Approved)",
      "🟡 IN ✓ → WAIT USDT · DONE —",
      `อ้างอิง (Reference): ${pending.ledger_ref}`,
      `ยอดรับ (Received): ${pending.thb_in} THB`,
      `ต้องส่ง (Total Due): ${pending.should_send} USDT`,
      "เคลียร์แล้ว (Cleared): — USDT",
      "ค้างส่ง (Outstanding): — USDT",
      `Transaction ID: ${result.tx_id}`,
    ].join("\n"));
  } catch (error) {
    await telegram.sendMessage(chatId, "⛔ บันทึกไม่สำเร็จ (Approval failed) — ตรวจ Ledger ก่อน retry");
  }
  return true;
}

async function requireTelegramOperator(message) {
  const operator = await repository.getOperatorByTelegramId(message?.from?.id);
  if (!operator) {
    if (message?.chat?.id) await telegram.sendMessage(message.chat.id, "CE VAULT · ACCESS DENIED\nบัญชี Telegram นี้ไม่ได้เป็น operator ที่เปิดใช้งาน").catch(() => undefined);
    return null;
  }
  return operator;
}

async function handleTelegramRate(message) {
  const operator = await requireTelegramOperator(message);
  if (!operator) return true;
  const chatId = message.chat.id;
  const raw = String(message.text || "").replace(/^\/rate(?:@\w+)?/i, "").trim();
  const market = await fetchBinanceThSpot().catch(() => null);
  const current = await repository.getLatestDeskRate();
  if (!raw) {
    await telegram.sendMessage(chatId, [
      "CE VAULT · RATE",
      `DESK ${current?.sell_rate || "NOT SET"} THB/USDT`,
      `MARKET ${market?.price || "UNAVAILABLE"} THB/USDT · BINANCE TH SPOT`,
      market?.observed_at ? `AS OF ${market.observed_at}` : "AUTO-RECORD ปิดเมื่อ market feed ใช้ไม่ได้",
    ].join("\n"));
    return true;
  }
  const sellRate = Number(raw);
  if (!Number.isFinite(sellRate) || sellRate < 10 || sellRate > 100) {
    await telegram.sendMessage(chatId, "CE VAULT · RATE INVALID\nใช้ /rate 35.20 (ช่วง 10-100 THB/USDT)");
    return true;
  }
  if (!market?.fresh) {
    await telegram.sendMessage(chatId, "CE VAULT · MARKET UNAVAILABLE\nไม่บันทึก desk rate เพราะ Binance TH Spot ยังยืนยันไม่ได้");
    return true;
  }
  const saved = await repository.insertDeskRate(operator.id, String(sellRate), market.price);
  await telegram.sendMessage(chatId, `CE VAULT · RATE SET\nDESK ${saved.sell_rate} THB/USDT\nMARKET ${market.price} THB/USDT · BINANCE TH SPOT`);
  return true;
}

async function handleTelegramPin(message, unpin = false) {
  const operator = await requireTelegramOperator(message);
  if (!operator) return true;
  const chatId = message.chat.id;
  const today = bangkokDateKey();
  const command = unpin ? "unpin" : "pin";
  const raw = String(message.text || "").replace(new RegExp(`^\/${command}(?:@\w+)?`, "i"), "").trim();
  const accounts = await repository.listBankAccountsForPin();
  const pinned = accounts.filter((account) => account.pinned_for_date === today);
  if (!raw) {
    const rows = accounts.length ? accounts.map((account, index) => `${index + 1}. ${fullBank(account)} ${account.pinned_for_date === today ? "· PIN" : ""}`) : ["ยังไม่มี bank account ในระบบ"];
    await telegram.sendMessage(chatId, [`CE VAULT · ${unpin ? "UNPIN" : "PIN"} · ${today}`, ...rows, unpin ? "ใช้ /unpin 7890" : "ใช้ /pin 7890"].join("\n"));
    return true;
  }
  const last4 = accountLast4(raw);
  const bankHint = normalizeBank(raw.replace(/\d/g, ""));
  let candidates = accounts.filter((account) => !last4 || accountLast4(account.account_number) === last4);
  if (bankHint) {
    const byBank = candidates.filter((account) => normalizeBank(account.bank_name) === bankHint);
    if (byBank.length) candidates = byBank;
  }
  if (candidates.length !== 1) {
    await telegram.sendMessage(chatId, `CE VAULT · ${unpin ? "UNPIN" : "PIN"} FAILED\nระบุเลขท้าย 4 ตัวที่ตรงเพียงบัญชีเดียว`);
    return true;
  }
  const target = candidates[0];
  if (unpin) {
    const changed = await repository.unpinBankForDate(target.id, today);
    await telegram.sendMessage(chatId, changed ? `CE VAULT · UNPIN OK\n${fullBank(target)}` : "CE VAULT · UNPIN\nบัญชีนี้ไม่ได้ PIN วันนี้");
    return true;
  }
  if (target.pinned_for_date !== today && pinned.length >= 3) {
    await telegram.sendMessage(chatId, "CE VAULT · PIN LIMIT\nวันนี้ PIN ได้สูงสุด 3 บัญชี");
    return true;
  }
  await repository.pinBankForDate(target.id, today);
  await telegram.sendMessage(chatId, `CE VAULT · PIN OK\n${fullBank(target)}\nDATE ${today}`);
  return true;
}

function buildIntakeApprovalButtons(pending) {
  const useV4 = process.env.CE_RESPONSE_V4 !== "0";
  const id = String(pending?.id || "");
  return useV4 && pending?.status === "VERIFIED" &&
    /^[0-9a-f-]{36}$/i.test(id) ? {
      inline_keyboard: [[
        { text: "✅ เข้า · ยืนยัน", style: "success", callback_data: "ce:approve:" + id },
        { text: "📝 แก้ไข", style: "primary", callback_data: "ce:edit:" + id },
        { text: "⛔ ไม่เข้า · ยกเลิก", style: "danger", callback_data: "ce:reject:" + id },
      ]],
    } : undefined;
}

async function upsertIntakeLiveMessage(chatId, liveMessageId, args) {
  // CE_RESPONSE_V4=0 is the no-redeploy-data-migration rollback switch.
  const useV4 = process.env.CE_RESPONSE_V4 !== "0";
  const rich = useV4 ? formatIntakeV4RichMessage(args) : formatIntakeRichMessage(args);
  const fallback = useV4 ? formatIntakeV4Reply(args) : formatIntakeReply(args);
  const approvalButtons = args?.approvalHandled ? undefined : buildIntakeApprovalButtons(args?.pending);
  if (liveMessageId) {
    try {
      return await telegram.editRichMessageWithFallback(chatId, liveMessageId, rich, fallback, approvalButtons);
    } catch {}
  }
  return telegram.sendRichMessageWithFallback(chatId, rich, fallback, approvalButtons);
}

async function handleLiveSlipMessage(message) {
  const operator = await requireTelegramOperator(message);
  if (!operator) return;
  const fileId = imageFileId(message);
  if (!fileId) return;
  const chatId = message.chat.id;
  let liveMessage = null;
  // Telegram 2026 (Bot API 10.1+): stream honest scan status as animated drafts.
  // Same draft_id animates in place; drafts are ephemeral and the final card persists.
  let streamScan = false;
  const scanDraftId = Number(message.message_id) || 0;
  if (process.env.CE_RESPONSE_STREAM_SCAN !== "0" && scanDraftId && typeof telegram.sendRichMessageDraft === "function") {
    try {
      await telegram.sendRichMessageDraft(chatId, scanDraftId, formatScanDraftRichMessage("download"));
      streamScan = true;
    } catch {}
  }
  if (!streamScan) {
    try {
      liveMessage = await telegram.sendRichMessageWithFallback(
        chatId,
        formatScanStageRichMessage(),
        formatScanStageReply(),
      );
    } catch {}
  }
  const liveMessageId = Number(liveMessage?.message_id) || null;

  const downloaded = await telegram.downloadFile(fileId);
  // Credential auto-fix: decode the slip QR (vendored jsQR + jpeg-js), best-effort.
  let slipQrPayload = null;
  if (typeof decodeSlipQrPayload === "function") {
    try {
      slipQrPayload = decodeSlipQrPayload(downloaded.buffer);
    } catch {
      slipQrPayload = null;
    }
  }
  if (streamScan) {
    try {
      await telegram.sendRichMessageDraft(chatId, scanDraftId, formatScanDraftRichMessage("match"));
    } catch {}
  }
  const fingerprint = fingerprintImage(downloaded.buffer);
  const duplicate = await repository.findIntakeDuplicate(fingerprint);
  if (duplicate) {
    const pending = duplicate.source === "pending_slips" ? duplicate : {
      ledger_ref: duplicate.ledger_ref || "existing-transaction",
      status: duplicate.status || "RECORDED",
      thb_in: duplicate.thb_amount,
      should_send: duplicate.expected_usdt,
      account_masked: null,
      bank: null,
      pin_match: false,
    };
    await upsertIntakeLiveMessage(chatId, liveMessageId, { pending, duplicate: true });
    return;
  }

  const businessDate = bangkokDateKey();
  if (streamScan) {
    try {
      await telegram.sendRichMessageDraft(chatId, scanDraftId, formatScanDraftRichMessage("ocr"));
    } catch {}
  }
  const [slip, deskRate, pinnedBanks, market] = await Promise.all([
    analyzeSlipBuffer(downloaded.buffer, downloaded.mimeType),
    repository.getLatestDeskRate(),
    repository.listPinnedBanksForDate(businessDate),
    fetchBinanceThSpot().catch(() => null),
  ]);
  const pinnedMatch = findPinnedMatch(slip, pinnedBanks);
  const decision = decideIntake({ slip, pinnedMatch, pinnedCount: pinnedBanks.length, deskRate, market, businessDate });
  const pinnedAccount = pinnedMatch || (pinnedBanks.length === 1 ? pinnedBanks[0] : null);
  const pinnedAccountsForReply = decision.status === "BANK_MISMATCH" ? pinnedBanks : [];
  const amount = Number(slip?.thbAmount);
  const shouldSend = Number.isFinite(amount) && amount > 0 && Number(deskRate?.sell_rate) > 0
    ? divideDecimal(String(amount), String(deskRate.sell_rate), 6)
    : null;
  const identity = makeLedgerIdentity(fingerprint);
  const receiverLast4 = accountLast4(slip?.receiverLast4);
  const pending = await repository.createPendingSlip({
    short_ref: identity.shortRef,
    date_key: identity.dateKey,
    ledger_ref: identity.ledgerRef,
    chat_id: String(chatId),
    admin_tg_id: String(message.from.id),
    admin_name: operator.name,
    status: decision.status,
    thb_in: Number.isFinite(amount) && amount > 0 ? String(amount) : null,
    should_send: shouldSend,
    desk_rate: deskRate?.sell_rate ? String(deskRate.sell_rate) : null,
    mkt_rate: market?.fresh ? String(market.price) : null,
    bot_usd: shouldSend,
    bank: normalizeBank(slip?.bank),
    account_masked: receiverLast4 ? `••••${receiverLast4}` : null,
    name: slip?.receiverName || null,
    pin_match: Boolean(pinnedMatch),
    ocr_confidence: slip?.confidence == null ? null : String(slip.confidence),
    source_file_id: fileId,
    slip_url: null,
    slip_fingerprint: fingerprint,
    message_id: message.message_id || null,
    tx_id: null,
    note: `OCR=${slip?.provider || "UNAVAILABLE"};SLIP_DATE=${slip?.date || ""};SLIP_TIME=${slip?.time || ""};MARKET=${market?.fresh ? "BINANCE_TH_SPOT" : "UNAVAILABLE"}`,
    bank_account_id: pinnedMatch?.id || null,
  });

  if (pending.duplicate) {
    const replyPending = { ...pending, account_number: pinnedMatch?.account_number || null };
    await upsertIntakeLiveMessage(chatId, liveMessageId, {
      pending: replyPending,
      market,
      deskRate,
      duplicate: true,
      pinnedAccount: pinnedAccount,
      pinnedAccounts: pinnedAccountsForReply,
    });
    return;
  }

  // Human approval is mandatory even when OCR and bank checks pass.
  // No settlement ledger write may occur in the image ingestion path.
  const recorded = null;
  const finalPending = pending;
  const replyPending = {
    ...finalPending,
    account_number: pinnedMatch?.account_number || null,
    name: finalPending?.name || slip?.receiverName || null,
  };
  // Slip photo evidence: slip + amounts + confirm/cancel buttons (money in or not).
  const approvalButtons = buildIntakeApprovalButtons(replyPending);
  let approvalHandled = false;
  if (approvalButtons && typeof telegram.sendPhotoWithMarkup === "function") {
    try {
      await telegram.sendPhotoWithMarkup(
        chatId,
        fileId,
        formatSlipPhotoCaption({ pending: replyPending, pinnedAccount: pinnedAccount }),
        approvalButtons,
      );
      approvalHandled = true;
    } catch {}
  }
  await upsertIntakeLiveMessage(chatId, liveMessageId, {
    pending: replyPending,
    market,
    deskRate,
    recorded,
    approvalHandled: approvalHandled,
    pinnedAccount: pinnedAccount,
    pinnedAccounts: pinnedAccountsForReply,
  });
  // Slip verification card: only when the QR decoded and the env-configured provider returned a verdict.
  if (slipQrPayload) {
    try {
      let verifyResult = await verifySlip(slipQrPayload);
      if (verifyResult.status === "NOT_CONFIGURED") {
        try {
          verifyResult = await verifySlipAi(slipQrPayload, slip, pending.thb_in);
        } catch {
          verifyResult = { status: "NOT_CONFIGURED", provider: null };
        }
      }
      if (["VALID", "INVALID", "ERROR", "AI_VERIFIED", "AI_MISMATCH", "AI_PARTIAL", "AI_REJECTED"].includes(verifyResult.status)) {
        await telegram.sendMessageWithMarkup(chatId, formatSlipVerifyReply(verifyResult, "photo"), undefined);
      }
    } catch {}
  }
}

// CE GATEKEEPER: Telegram approval gate (/gate namespace). Audit record in
// Supabase happens BEFORE any merge action; see docs/GATEKEEPER.md.
let gatekeeperRuntimeRef = null;
function getGatekeeperRuntime() {
  if (!gatekeeperRuntimeRef) {
    gatekeeperRuntimeRef = createGatekeeperRuntime({ repository, telegram });
  }
  return gatekeeperRuntimeRef;
}

async function handleGateCommand(message) {
  try {
    await getGatekeeperRuntime().handleTelegramGateMessage(message);
  } catch (error) {
    console.error("[CE GATEKEEPER] command failed: " + String(error?.message || error));
  }
}

async function processTelegramUpdate(update) {
  if (!update || !Number.isSafeInteger(update.update_id)) return;
  const claimed = await repository.claimTelegramUpdate(update.update_id);
  if (!claimed) return;

  const ceCallback = update.callback_query;
  if (ceCallback?.message?.chat?.id && /^ce:/.test(String(ceCallback.data || ""))) {
    await handleTelegramCallback(ceCallback);
    return;
  }
  const message = update.message;
  if (message?.chat?.id && /^\/(?:ce|brief)(?:@\w+)?(?:\s|$)/i.test(message.text || "")) {
    await handleTelegramCeBrief(message);
    return;
  }
  if (message?.chat?.id && /^\/(?:start|help|menu)(?:@\w+)?(?:\s|$)/i.test(message.text || "")) {
    await handleTelegramHome(message);
    return;
  }
  if (message?.chat?.id && /^\/(?:ping|status)(?:@\w+)?(?:\s|$)/i.test(message.text || "")) {
    await handleTelegramSystemStatus(message);
    return;
  }
  if (message?.chat?.id && /^\/gate(?:@\w+)?(?:\s|$)/i.test(message.text || "")) {
    await handleGateCommand(message);
    return;
  }
  if (message?.chat?.id && /^\/approve(?:@\w+)?(?:\s|$)/i.test(message.text || "")) {
    await handleTelegramApprove(message);
    return;
  }
  if (message?.chat?.id && /^\/reject(?:@\w+)?(?:\s|$)/i.test(message.text || "")) {
    await handleTelegramReject(message);
    return;
  }
  if (message?.chat?.id && /^\/edit(?:@\w+)?(?:\s|$)/i.test(message.text || "")) {
    await handleTelegramEdit(message);
    return;
  }
  if (message?.chat?.id && /^\/rate(?:@\w+)?(?:\s|$)/i.test(message.text || "")) {
    await handleTelegramRate(message);
    return;
  }
  if (message?.chat?.id && /^\/pin(?:@\w+)?(?:\s|$)/i.test(message.text || "")) {
    await handleTelegramPin(message, false);
    return;
  }
  if (message?.chat?.id && /^\/unpin(?:@\w+)?(?:\s|$)/i.test(message.text || "")) {
    await handleTelegramPin(message, true);
    return;
  }
  if (message?.chat?.id && isSlipQrPayload(message.text)) {
    await handleSlipVerifyMessage(message);
    return;
  }
  if (message?.chat?.id && imageFileId(message)) {
    await handleLiveSlipMessage(message);
    return;
  }
  if (message?.chat?.type === "private" && /^\/sandbox(?:\s|$)/i.test(message.text || "")) {
    await createTelegramSandboxCard(message.chat.id, update.update_id);
    return;
  }

  const callback = update.callback_query;
  if (!callback?.id || !callback.message || callback.message.chat?.type !== "private") return;
  const chatId = callback.message.chat.id;
  const messageId = callback.message.message_id;
  let parsed;
  try {
    parsed = verifyCallbackData(callback.data, { secret: process.env.TELEGRAM_CALLBACK_SECRET });
    const expectedBinding = bindingDigest({ chatId, messageId, reference: parsed.reference });
    if (!equalSecret(parsed.binding, expectedBinding)) throw new Error("CALLBACK_BINDING_INVALID");
  } catch (error) {
    await telegram.answerCallback(callback.id, "Callback expired or invalid. Refresh the card.").catch(() => undefined);
    return;
  }

  const token = await repository.claimCallback(parsed.reference, parsed.nonceHash, parsed.binding);
  if (!token || token.action !== parsed.action || token.chat_id !== chatId || token.message_id !== messageId) {
    await telegram.answerCallback(callback.id, "Callback is stale. Refresh the card.").catch(() => undefined);
    return;
  }

  const job = await repository.getJob(token.job_id);
  if (!job) {
    await telegram.answerCallback(callback.id, "Job is no longer available.").catch(() => undefined);
    return;
  }

  if (parsed.action === TELEGRAM_ACTIONS.CONFIRM_PROCESS) {
    const toState = commandTarget(parsed.action, job.state);
    if (!toState) {
      await telegram.answerCallback(callback.id, "Confirmation is no longer valid.").catch(() => undefined);
      return;
    }
    const response = await repository.transitionJob({
      jobId: job.id,
      expectedVersion: job.state_version,
      toState,
      commandCode: "CONFIRM_PROCESS",
      idempotencyKey: `telegram-callback-${callback.id}`,
      requestHash: requestHash({ callback_id: callback.id, action: parsed.action, job_id: job.id, version: job.state_version }),
      actorType: "TELEGRAM",
      actorId: String(callback.from?.id || ""),
      requestId: `tg-${update.update_id}`,
      payload: { callback_reference: parsed.reference },
    });
    const changed = await repository.getJob(response.job_id);
    await refreshTelegramCard(changed);
    await telegram.answerCallback(callback.id, "Sandbox confirmation recorded.").catch(() => undefined);
    return;
  }

  await refreshTelegramCard(job);
  await telegram.answerCallback(callback.id, `Authoritative state: ${job.state}.`).catch(() => undefined);
}

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  req.requestId = req.get("x-request-id") || randomUUID();
  res.set("X-Request-ID", req.requestId);
  next();
});

app.get("/api/v1/health", (req, res) => {
  const safety = currentSafety();
  res.json({
    service: "ce-vault-workflow-api",
    mode: safety.ok ? "SANDBOX" : "DISABLED",
    database: repository ? "CONFIGURED" : "MISSING_SERVER_SECRET",
    telegram: telegram ? "CONFIGURED" : "MISSING_BOT_TOKEN",
    safety: safety.ok ? "LOCKED" : safety.code,
    live_settlement_enabled: false,
  });
});

app.get("/api/v1/market-rate", async (req, res) => {
  try {
    const market = await fetchBinanceThSpot();
    res.set("Cache-Control", "no-store").json({ data: market });
  } catch (error) {
    problem(res, req, 503, "MARKET_RATE_UNAVAILABLE", "Binance TH USDT/THB spot could not be verified.");
  }
});

app.get("/api/v1/intake/status", async (req, res) => {
  if (!requireRepository(req, res)) return;
  const [deskRate, pins, market] = await Promise.all([
    repository.getLatestDeskRate().catch(() => null),
    repository.listPinnedBanksForDate(bangkokDateKey()).catch(() => []),
    fetchBinanceThSpot().catch(() => null),
  ]);
  res.set("Cache-Control", "no-store").json({
    data: {
      ...intakeCapability(),
      market: market ? { symbol: market.symbol, price: market.price, source: market.source, observed_at: market.observed_at, fresh: market.fresh } : null,
      desk_rate_configured: Number(deskRate?.sell_rate) > 0,
      pinned_accounts_today: pins.length,
      settlement_enabled: false,
    },
  });
});

app.get("/api/v1/telegram/status", async (req, res) => {
  const configured = Boolean(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN);
  if (!configured || !telegram) {
    res.set("Cache-Control", "no-store").json({ configured: false, webhook: null });
    return;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      // Scope the deadline to diagnostics; never retry outbound messages.
      const response = await fetch("https://api.telegram.org/bot" + token + "/getWebhookInfo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        const status = response.ok ? Number(payload?.error_code) : response.status;
        const error = new Error(status === 401 || status === 403 ? "TELEGRAM_AUTH_FAILED" : "TELEGRAM_API_ERROR");
        error.transient = status === 429 || status >= 500;
        throw error;
      }
      const webhook = payload.result;
      res.set("Cache-Control", "no-store").json({ configured, webhook });
      return;
    } catch (error) {
      clearTimeout(timeout);
      if (error?.transient !== false && attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        continue;
      }
      res.set("Cache-Control", "no-store").json({
        configured,
        webhook: null,
        degraded: error?.transient === false ? error.message : "TELEGRAM_API_UNREACHABLE",
        detail: error?.transient === false ? error.message : "TELEGRAM_API_UNREACHABLE",
      });
      return;
    } finally {
      clearTimeout(timeout);
    }
  }
});

app.get("/api/v1/telegram/status", async (req, res) => {
  if (!telegram) return problem(res, req, 503, "TELEGRAM_NOT_CONFIGURED", "Telegram bot token is not configured for this server.");
  try {
    const info = await telegram.getWebhookInfo();
    res.json({ configured: true, webhook: info });
  } catch (error) {
    repositoryError(res, req, error);
  }
});

app.get("/api/v1/ops/overview", async (req, res) => {
  if (!requireRepository(req, res)) return;
  try {
    const transactionLimit = 1000;
    const [transactions, pendingSlips, rates, cycles, bankAccounts, exceptions, market] = await Promise.all([
      repository.listOpsTransactions(transactionLimit),
      repository.listOpsPendingSlips(100),
      repository.listOpsRates(),
      repository.listOpsOpenCycles(),
      repository.listOpsBankAccounts(),
      repository.listOpsOpenExceptions(),
      fetchBinanceThSpot().catch(() => null),
    ]);
    res.set("Cache-Control", "no-store").json({
      data: buildOpsOverview({ transactions, pendingSlips, rates, cycles, bankAccounts, exceptions, market, transactionLimit }),
    });
  } catch (error) {
    repositoryError(res, req, error);
  }
});

app.get("/api/v1/jobs", async (req, res) => {
  if (!requireRepository(req, res)) return;
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 25, 100));
    const data = await repository.listJobs(limit);
    res.json({ data, pagination: { limit, next_cursor: null, has_more: data.length === limit } });
  } catch (error) {
    repositoryError(res, req, error);
  }
});

app.get("/api/v1/jobs/:id", async (req, res) => {
  if (!requireRepository(req, res)) return;
  try {
    const job = await repository.getJob(req.params.id);
    if (!job) return problem(res, req, 404, "JOB_NOT_FOUND", "No workflow job matches this identifier.");
    const events = await repository.getJobEvents(job.id);
    res.json({ data: job, audit: events });
  } catch (error) {
    repositoryError(res, req, error);
  }
});

app.post("/api/v1/jobs", express.json({ limit: "64kb" }), async (req, res) => {
  if (!requireSandboxApiKey(req, res)) return;
  try {
    const body = req.body || {};
    const created = await repository.createSandboxJob({
      transactionType: body.transaction_type || "SANDBOX_JOB",
      amount: body.amount ?? null,
      currency: body.currency || "THB",
      worker: body.worker || "API-SANDBOX",
      summary: body.summary || "Created through sandbox API",
      correlationId: body.correlation_id || `api-${req.requestId}`,
      metadata: { source: "api", request_id: req.requestId },
    });
    await flushOutbox();
    res.status(201).json({ data: created });
  } catch (error) {
    repositoryError(res, req, error);
  }
});

app.post("/api/v1/jobs/:id/commands", express.json({ limit: "64kb" }), async (req, res) => {
  if (!requireSandboxApiKey(req, res)) return;
  const body = req.body || {};
  if (body.action !== TELEGRAM_ACTIONS.CONFIRM_PROCESS || !Number.isInteger(body.expected_state_version) || !body.idempotency_key) {
    return problem(res, req, 400, "VALIDATION_ERROR", "action CONFIRM_PROCESS, expected_state_version and idempotency_key are required.");
  }
  try {
    const job = await repository.getJob(req.params.id);
    if (!job) return problem(res, req, 404, "JOB_NOT_FOUND", "No workflow job matches this identifier.");
    const toState = commandTarget(body.action, job.state);
    if (!toState) return problem(res, req, 409, "CONFIRM_PROCESS_NOT_ALLOWED", "Confirmation is only valid for NEED_CONFIRMATION.");
    const output = await repository.transitionJob({
      jobId: job.id,
      expectedVersion: body.expected_state_version,
      toState,
      commandCode: "CONFIRM_PROCESS",
      idempotencyKey: body.idempotency_key,
      requestHash: requestHash({ job_id: job.id, action: body.action, expected_state_version: body.expected_state_version }),
      actorType: "SANDBOX_API",
      requestId: req.requestId,
      payload: { source: "sandbox_api" },
    });
    await flushOutbox();
    res.json({ data: output });
  } catch (error) {
    repositoryError(res, req, error);
  }
});

app.get("/api/v1/activity", async (req, res) => {
  if (!requireRepository(req, res)) return;
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
    res.json({ data: await repository.listActivity(limit) });
  } catch (error) {
    repositoryError(res, req, error);
  }
});

app.get("/api/v1/activity/stream", (req, res) => {
  if (!requireRepository(req, res)) return;
  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(`event: ready\ndata: ${JSON.stringify({ request_id: req.requestId })}\n\n`);
  sseClients.add(res);
  const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

function verifyTelegramWebhook(req, res, next) {
  if (!equalSecret(req.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return problem(res, req, 401, "TELEGRAM_WEBHOOK_UNAUTHORIZED", "Webhook secret verification failed.");
  }
  if (!repository || !telegram || !currentSafety().ok) {
    return problem(res, req, 503, "TELEGRAM_NOT_CONFIGURED", "Telegram workflow runtime is not configured.");
  }
  next();
}

async function handleTelegramWebhook(req, res) {
  try {
    await processTelegramUpdate(req.body);
    await flushOutbox();
    res.status(200).json({ ok: true });
  } catch (error) {
    repositoryError(res, req, error);
  }
}

const telegramWebhookHandlers = [verifyTelegramWebhook, express.json({ limit: "256kb" }), handleTelegramWebhook];
app.post("/api/v1/telegram/webhook", telegramWebhookHandlers);
// Compatibility alias for the path used by the currently registered Telegram webhook.
app.post("/api/telegram/webhook", telegramWebhookHandlers);

// Public brand banner: read-only static asset, no secrets.
app.get("/brand/welcome.jpg", (req, res) => {
  res.set("Cache-Control", "public, max-age=3600").sendFile(path.join(ROOT, "server", "brand", "welcome.jpg"));
});
// Public WEB FLOW animation: read-only static asset, no secrets.
app.get("/brand/webflow.mp4", (req, res) => {
  res.set("Cache-Control", "public, max-age=3600").sendFile(path.join(ROOT, "server", "brand", "webflow.mp4"));
});
app.get("/brand/banks/:code", (req, res) => {
  const allowed = new Set(["scb","ktb","kbank","bbl","bay","gsb","ttb"]);
  const code = String(req.params.code || "").toLowerCase();
  if (!allowed.has(code)) {
    problem(res, req, 404, "BANK_LOGO_NOT_FOUND", "No bank logo matches this code.");
    return;
  }
  res.set("Cache-Control", "public, max-age=86400").type("image/svg+xml").sendFile(path.join(ROOT, "server", "brand", "banks", code + ".svg"));
});
app.all("/api/{*path}", (req, res) => problem(res, req, 404, "API_ROUTE_NOT_FOUND", "No API resource matches this route."));

async function start() {
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(ROOT, "dist")));
    app.get("/{*path}", (_req, res) => res.sendFile(path.join(ROOT, "dist", "index.html")));
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ root: ROOT, server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }
  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`CE VAULT server listening on ${PORT}; sandbox safety=${currentSafety().ok ? "locked" : "disabled"}`);
  });
  setInterval(flushOutbox, 1_500).unref();
  if (process.env.RUN_E2E === "true") {
    httpServer.once("listening", async () => {
      try {
        const result = await runSandboxE2E({ repository, callbackSecret: process.env.TELEGRAM_CALLBACK_SECRET });
        console.log(`CE_VAULT_E2E_RESULT ${JSON.stringify(result)}`);
        httpServer.close(() => process.exit(0));
      } catch (error) {
        console.error(`CE_VAULT_E2E_FAILED ${error.message}`);
        httpServer.close(() => process.exit(1));
      }
    });
  }
}

start().catch((error) => {
  console.error("CE VAULT server startup failed", error);
  process.exit(1);
});
