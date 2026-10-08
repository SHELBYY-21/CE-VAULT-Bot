import { createHash } from "node:crypto";

const BINANCE_TH_SPOT_URL = "https://api.binance.th/api/v1/ticker/price?symbol=USDTTHB";
const MARKET_TTL_MS = 30_000;
const OCR_AUTO_MIN = Math.max(1, Math.min(Number(process.env.OCR_AUTO_MIN || 90), 100));
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
let marketCache = null;

function asError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function decimalParts(value) {
  const raw = String(value ?? "").trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) throw asError("INVALID_DECIMAL");
  const fraction = match[3] || "";
  const digits = (match[2] + fraction).replace(/^0+(?=\d)/, "") || "0";
  return {
    coefficient: BigInt(digits) * (match[1] === "-" ? -1n : 1n),
    scale: fraction.length,
  };
}

function pow10(n) {
  return 10n ** BigInt(n);
}

function renderScaled(coefficient, scale) {
  const negative = coefficient < 0n;
  let digits = (negative ? -coefficient : coefficient).toString();
  if (scale === 0) return `${negative ? "-" : ""}${digits}`;
  if (digits.length <= scale) digits = digits.padStart(scale + 1, "0");
  const integer = digits.slice(0, -scale) || "0";
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

export function divideDecimal(numeratorValue, denominatorValue, scale = 6) {
  const numerator = decimalParts(numeratorValue);
  const denominator = decimalParts(denominatorValue);
  if (denominator.coefficient <= 0n || numerator.coefficient < 0n) throw asError("INVALID_FINANCIAL_VALUE");
  const up = numerator.coefficient * pow10(scale + denominator.scale);
  const down = denominator.coefficient * pow10(numerator.scale);
  const rounded = (up + down / 2n) / down;
  return renderScaled(rounded, scale);
}

export function normalizeBank(value) {
  const raw = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9ก-๙]/g, "");
  const aliases = [
    [/KBANK|KASIKORN|KPLUS|กสิกร/, "KBANK"],
    [/SCB|SIAMCOMMERCIAL|ไทยพาณิชย์/, "SCB"],
    [/BBL|BANGKOKBANK|กรุงเทพ/, "BBL"],
    [/KTB|KRUNGTHAI|กรุงไทย/, "KTB"],
    [/BAY|KRUNGSRI|กรุงศรี/, "BAY"],
    [/TTB|TMB|ธนชาต/, "TTB"],
    [/GSB|ออมสิน/, "GSB"],
    [/KKP|เกียรตินาคิน/, "KKP"],
    [/CIMB/, "CIMB"],
    [/UOB/, "UOB"],
    [/TISCO|ทิสโก้/, "TISCO"],
    [/TMN|TRUEMONEY|ทรูมันนี่/, "TMN"],
  ];
  for (const [pattern, code] of aliases) if (pattern.test(raw)) return code;
  return raw || null;
}

export function accountLast4(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export function bangkokDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function normalizeSlipDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/.exec(raw);
  if (!match) return null;
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  if (year > 2400) year -= 543;
  const month = String(Number(match[2])).padStart(2, "0");
  const day = String(Number(match[1])).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fingerprintImage(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function makeLedgerIdentity(fingerprint, now = new Date()) {
  const dateKey = bangkokDateKey(now);
  const compact = dateKey.replaceAll("-", "");
  const token = String(fingerprint).slice(0, 10).toUpperCase();
  return {
    dateKey,
    shortRef: token,
    ledgerRef: `CE-${compact}-${token}`,
  };
}

export function findPinnedMatch(slip, accounts) {
  const slipLast4 = accountLast4(slip?.receiverLast4);
  const slipBank = normalizeBank(slip?.bank);
  if (!slipLast4) return null;
  const candidates = (accounts || []).filter((account) => accountLast4(account.account_number) === slipLast4);
  if (!candidates.length) return null;
  if (slipBank) {
    const exact = candidates.find((account) => normalizeBank(account.bank_name) === slipBank);
    if (exact) return exact;
    return null;
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export function decideIntake({ slip, pinnedMatch, pinnedCount, deskRate, market, businessDate }) {
  const amount = Number(slip?.thbAmount);
  const confidence = Number(slip?.confidence);
  const slipDate = normalizeSlipDate(slip?.date);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return { status: "OCR_FAILED", promotable: false };
  if (slipDate && slipDate !== businessDate) return { status: "STALE_SLIP", promotable: false };
  if (!Number.isFinite(confidence) || confidence < OCR_AUTO_MIN) return { status: "NEEDS_REVIEW", promotable: false };
  if (!pinnedCount) return { status: "PIN_REQUIRED", promotable: false };
  if (!pinnedMatch) return { status: "BANK_MISMATCH", promotable: false };
  if (!deskRate || Number(deskRate.sell_rate) <= 0) return { status: "RATE_REQUIRED", promotable: false };
  if (!market?.fresh || Number(market.price) <= 0) return { status: "MARKET_UNAVAILABLE", promotable: false };
  return { status: "VERIFIED", promotable: true };
}

export function parseBinanceSpot(payload, observedAt = new Date().toISOString()) {
  if (!payload || payload.symbol !== "USDTTHB") throw asError("BINANCE_SYMBOL_INVALID");
  const price = String(payload.price ?? "").trim();
  const parts = decimalParts(price);
  if (parts.coefficient <= 0n) throw asError("BINANCE_PRICE_INVALID");
  return { symbol: "USDTTHB", price, source: "BINANCE_TH_SPOT", observed_at: observedAt, fresh: true };
}

export async function fetchBinanceThSpot() {
  const now = Date.now();
  if (marketCache && now - marketCache.cached_at < MARKET_TTL_MS) return { ...marketCache.value, fresh: true };
  try {
    const response = await fetch(BINANCE_TH_SPOT_URL, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw asError("BINANCE_HTTP_ERROR");
    const value = parseBinanceSpot(await response.json(), new Date().toISOString());
    marketCache = { cached_at: now, value };
    return value;
  } catch (error) {
    throw asError("MARKET_RATE_UNAVAILABLE", error?.message || "Binance TH spot unavailable");
  }
}

function parseVisionJson(text) {
  const cleaned = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < first) return null;
  const data = JSON.parse(cleaned.slice(first, last + 1));
  const amount = Number(data.thbAmount);
  const confidence = Number(data.confidence);
  return {
    thbAmount: Number.isFinite(amount) ? amount : null,
    time: typeof data.time === "string" ? data.time.trim() || null : null,
    date: typeof data.date === "string" ? data.date.trim() || null : null,
    receiverLast4: accountLast4(data.receiverLast4),
    bank: normalizeBank(data.bank),
    receiverName: typeof data.receiverName === "string" ? data.receiverName.trim() || null : null,
    senderName: typeof data.senderName === "string" ? data.senderName.trim() || null : null,
    confidence: Number.isFinite(confidence) ? confidence : null,
    provider: "XAI_VISION",
  };
}

const SLIP_PROMPT = `You are a Thai bank transfer slip parser. Return ONLY JSON: {"thbAmount":number|null,"time":"HH:MM"|null,"date":"DD/MM/YY"|null,"receiverLast4":"XXXX"|null,"bank":"KBANK|SCB|BBL|KTB|BAY|TTB|GSB|KKP|CIMB|LH|UOB|TISCO|TMN|OTHER"|null,"receiverName":string|null,"senderName":string|null,"confidence":number}. Read the RECEIVER/payee account, not sender. Do not invent values. confidence is 0-100.`;

async function analyzeWithXai(buffer, mimeType) {
  const key = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (!key) return null;
  const model = process.env.GROK_MODEL || "grok-4.20-non-reasoning";
  const dataUrl = `data:${mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;
  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [{ role: "user", content: [{ type: "text", text: SLIP_PROMPT }, { type: "image_url", image_url: { url: dataUrl, detail: "high" } }] }],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return parseVisionJson(payload?.choices?.[0]?.message?.content || "");
  } catch {
    return null;
  }
}

function pickAmount(text) {
  const decimals = (String(text || "").match(/\d[\d,]*\.\d{2}/g) || []).map((item) => Number(item.replaceAll(",", "")));
  const integers = (String(text || "").match(/\d[\d,]{2,}/g) || []).map((item) => Number(item.replaceAll(",", "")));
  const pool = (decimals.length ? decimals : integers).filter((value) => Number.isFinite(value) && value >= 10 && value <= 10_000_000);
  return pool.length ? Math.max(...pool) : null;
}

async function analyzeWithOcrSpace(buffer, mimeType) {
  const key = process.env.OCR_SPACE_API_KEY;
  if (!key) return null;
  try {
    const base64Image = `data:${mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;
    const body = new URLSearchParams({ apikey: key, base64Image, OCREngine: "2", scale: "true", isTable: "true", language: "eng" });
    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const amount = pickAmount(payload?.ParsedResults?.[0]?.ParsedText || "");
    if (amount == null) return null;
    return { thbAmount: amount, time: null, date: null, receiverLast4: null, bank: null, receiverName: null, senderName: null, confidence: 70, provider: "OCR_SPACE" };
  } catch {
    return null;
  }
}

export async function analyzeSlipBuffer(buffer, mimeType = "image/jpeg") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw asError("EMPTY_IMAGE");
  if (buffer.length > MAX_IMAGE_BYTES) throw asError("IMAGE_TOO_LARGE");
  const xai = await analyzeWithXai(buffer, mimeType);
  if (xai?.thbAmount != null) return xai;
  const fallback = await analyzeWithOcrSpace(buffer, mimeType);
  return fallback || { thbAmount: null, time: null, date: null, receiverLast4: null, bank: null, receiverName: null, senderName: null, confidence: null, provider: "UNAVAILABLE" };
}

export function intakeCapability() {
  const xai = Boolean(process.env.GROK_API_KEY || process.env.XAI_API_KEY);
  const ocrSpace = Boolean(process.env.OCR_SPACE_API_KEY);
  return {
    ocr_configured: xai || ocrSpace,
    providers: { xai_vision: xai, ocr_space: ocrSpace },
    auto_min_confidence: OCR_AUTO_MIN,
    market_source: "BINANCE_TH_SPOT",
    market_ttl_seconds: MARKET_TTL_MS / 1000,
  };
}

export function formatBotHomeReply() {
  return [
    "👑 CE EMPIRE · OPERATOR",
    "CURRENT STATE  READY",
    "",
    "FLOW · BANK SLIP → USDT",
    "① OCR    รับและอ่านสลิป",
    "② MATCH  ตรวจบัญชี / วัน / เรต",
    "③ IN     บันทึกยอดเมื่อผ่านเงื่อนไข",
    "④ WAIT   รอ USDT / การดำเนินการถัดไป",
    "⑤ DONE   ปิดเมื่อมีผลลัพธ์จริง",
    "",
    "NEXT ACTION",
    "→ ส่งรูปสลิปธนาคารในแชตนี้",
    "",
    "/status · /rate · /pin",
  ].join("\n");
}

export function botHomeReplyMarkup() {
  return {
    inline_keyboard: [
      [
        { text: "🏠 HOME", callback_data: "ce:home" },
        { text: "📄 SCAN", callback_data: "ce:scan" },
      ],
      [
        { text: "📊 STATUS", callback_data: "ce:status" },
        { text: "💱 RATE", callback_data: "ce:rate" },
        { text: "🏦 ACCOUNTS", callback_data: "ce:pin" },
      ],
    ],
  };
}

export function formatBotSystemReply({
  telegramOnline = true,
  webhookVerified = false,
  databaseConfigured = false,
  pendingUpdates = null,
  safety = "LOCKED",
} = {}) {
  const queue = pendingUpdates == null || !Number.isFinite(Number(pendingUpdates))
    ? "UNKNOWN"
    : String(Number(pendingUpdates));
  const ready = telegramOnline && webhookVerified && databaseConfigured;
  return [
    "◈ CE EMPIRE · SYSTEM STATUS",
    `CURRENT STATE  ${ready ? "READY" : "CHECK REQUIRED"}`,
    "",
    "KEY DATA",
    `TELEGRAM      ${telegramOnline ? "ONLINE" : "CHECK"}`,
    `WEBHOOK       ${webhookVerified ? "VERIFIED" : "CHECK"}`,
    `DATABASE      ${databaseConfigured ? "CONFIGURED" : "UNAVAILABLE"}`,
    `QUEUE         ${queue}`,
    `SAFETY        ${safety || "LOCKED"}`,
    "",
    "NEXT ACTION",
    ready ? "→ ส่ง /start หรือส่งรูปสลิปเพื่อเริ่มงาน" : "→ ตรวจรายการที่ขึ้น CHECK ก่อนใช้งาน",
  ].join("\n");
}

export function formatScanStageReply() {
  return [
    "◈ CE EMPIRE · BANK SLIP → USDT",
    "CURRENT STATE  ① OCR",
    "",
    "① OCR    ACTIVE",
    "② MATCH  NEXT",
    "③ IN     LOCKED",
    "④ WAIT   LOCKED",
    "⑤ DONE   LOCKED",
    "",
    "NEXT ACTION",
    "→ กำลังอ่านยอด / บัญชี / วันที่จากสลิป",
  ].join("\n");
}

function displayMoney(value, maximumFractionDigits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "—");
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(n);
}

function confidenceBadge(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "⚪ OCR UNKNOWN";
  const icon = n >= 90 ? "🟢" : n >= 60 ? "🟡" : "🔴";
  return `${icon} OCR ${String(value).replace(/\.0+$/, "")}%`;
}

function pinAccountLines(pinnedAccount, pinnedAccounts) {
  const list = Array.isArray(pinnedAccounts) && pinnedAccounts.length
    ? pinnedAccounts
    : pinnedAccount
      ? [pinnedAccount]
      : [];
  if (!list.length) return [];
  return [
    "📌 บัญชี PIN วันนี้",
    ...list.map((account) => `🏦 ${account?.bank_name || "BANK"} · ${account?.account_number || "ไม่พบเลขบัญชีเต็ม"}${account?.label ? ` · ${account.label}` : ""}`),
  ];
}

export function formatIntakeReply({
  pending,
  market,
  deskRate,
  recorded,
  duplicate,
  pinnedAccount = null,
  pinnedAccounts = [],
}) {
  const status = String(pending?.status || "NEEDS_REVIEW");
  const isRecorded = status === "RECORDED" && Boolean(recorded?.tx_id || pending?.tx_id);
  const isPromotionFailed = status === "PROMOTION_FAILED";
  const isOcrFailed = status === "OCR_FAILED";
  const isBankMismatch = status === "BANK_MISMATCH";
  const fullAccount = pending?.account_number || (pending?.pin_match ? pinnedAccount?.account_number : null);
  const slipAccount = fullAccount || pending?.account_masked || null;

  let header = "◈ CE · VERIFY";
  if (duplicate) header = "◈ CE · DUPLICATE";
  else if (isOcrFailed) header = "◈ CE · OCR ERROR";
  else if (isBankMismatch) header = "◈ CE · MISMATCH ⚠️";
  else if (status === "NEEDS_REVIEW") header = "◈ CE · REVIEW ⚠️";
  else if (isPromotionFailed) header = "◈ CE · ERROR";
  else if (isRecorded) header = "◈ CE · RECORDED ✓";

  const lines = [header, "━━━━━━━━━━━━━━"];

  if (duplicate) lines.push("⚠️ พบสลิปนี้ในระบบแล้ว", "");
  if (isBankMismatch) {
    lines.push("📄 บัญชีในสลิป");
    lines.push(`🏦 ${pending?.bank || "BANK"} · ${pending?.account_masked || "ไม่พบเลขบัญชีจากสลิป"} · NOT VERIFIED`);
    if (pending?.name) lines.push(`👤 ${pending.name}`);
    lines.push("", ...pinAccountLines(pinnedAccount, pinnedAccounts), "");
  }

  if (pending?.thb_in != null) lines.push(`📥 ${displayMoney(pending.thb_in, 2)} THB`);
  if (pending?.should_send != null) lines.push(`💎 ${displayMoney(pending.should_send, 6)} USDT`);
  if (!isBankMismatch && (pending?.bank || slipAccount)) {
    lines.push(`🏦 ${pending?.bank || pinnedAccount?.bank_name || "BANK"} · ${slipAccount || "ไม่พบเลขบัญชี"}`);
  }
  if (!isBankMismatch && pending?.name) lines.push(`👤 ${pending.name}`);
  if (deskRate?.sell_rate != null) lines.push(`💱 RATE ${displayMoney(deskRate.sell_rate, 2)}`);
  if (pending?.ledger_ref) lines.push(`🆔 #${pending.ledger_ref}`);

  lines.push("─────────────");
  lines.push(confidenceBadge(pending?.ocr_confidence));
  if (pending?.pin_match) lines.push("🟢 BANK MATCH");
  else if (isBankMismatch) lines.push("🔴 BANK MISMATCH");
  else lines.push("🟡 BANK NOT VERIFIED");
  if (deskRate?.sell_rate && market?.price) lines.push("🟢 RATE OK");
  else if (!deskRate?.sell_rate) lines.push("🟡 RATE REQUIRED");
  else if (!market?.price) lines.push("🟡 MARKET CHECK");

  lines.push("─────────────", "STATUS");
  if (!isRecorded) lines.push(`CODE        ${status}`);
  if (duplicate) lines.push("🟣 DUPLICATE · ไม่สร้างรายการใหม่");
  else if (isRecorded) lines.push("🟢 RECORDED · FINAL NOT VERIFIED");
  else if (isPromotionFailed) lines.push("🔴 RECORD FAILED");
  else if (isOcrFailed) lines.push("🔴 OCR ERROR");
  else if (isBankMismatch) lines.push("🔴 BANK MISMATCH");
  else if (status === "VERIFIED") lines.push("🟡 READY");
  else lines.push(`🟡 ${status}`);

  lines.push("─────────────", "FLOW");
  if (isRecorded) {
    lines.push(
      "① OCR    DONE",
      "② MATCH  VERIFIED",
      "✅ ACCOUNT / DATE MATCHED",
      "③ IN     RECORDED",
      "④ WAIT   USDT",
      "⑤ DONE   PENDING",
      "SETTLEMENT NOT RUN · ยังไม่ยืนยันการชำระสุดท้าย",
    );
  } else if (duplicate) {
    lines.push("① OCR    DONE", "② MATCH  DUPLICATE", "③ IN     BLOCKED", "④ WAIT   LOCKED", "⑤ DONE   LOCKED");
  } else if (isPromotionFailed) {
    lines.push("① OCR    DONE", "② MATCH  VERIFIED", "③ IN     RECORD FAILED", "④ WAIT   BLOCKED", "⑤ DONE   BLOCKED");
  } else if (isOcrFailed) {
    lines.push("① OCR    ALERT", "② MATCH  BLOCKED", "③ IN     BLOCKED", "④ WAIT   LOCKED", "⑤ DONE   LOCKED");
  } else if (isBankMismatch) {
    lines.push("① OCR    DONE", "② MATCH  ALERT", "③ IN     BLOCKED", "④ WAIT   LOCKED", "⑤ DONE   LOCKED");
  } else {
    lines.push("① OCR    DONE", `② MATCH  ${pending?.pin_match ? "VERIFIED" : "REVIEW"}`, `③ IN     ${status === "VERIFIED" ? "READY" : "PENDING"}`, "④ WAIT   NEXT", "⑤ DONE   PENDING");
  }

  lines.push("─────────────", "NEXT ACTION");
  if (duplicate) lines.push("→ เปิดรายการเดิมก่อนดำเนินการต่อ");
  else if (isRecorded) lines.push("→ รอขั้นตอน USDT ต่อไป");
  else if (isBankMismatch) lines.push("→ ตรวจบัญชีในสลิปเทียบกับบัญชี PIN");
  else if (isOcrFailed) lines.push("→ ส่งภาพสลิปใหม่ที่อ่านได้ชัดขึ้น");
  else if (isPromotionFailed) lines.push("→ ตรวจการบันทึกรายการก่อนดำเนินการต่อ");
  else lines.push("→ ตรวจข้อมูลแล้วดำเนินการตามสถานะ");

  return lines.join("\n");
}


function richEscape(value) {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shortTxRef(ledgerRef) {
  const clean = String(ledgerRef || "").replace(/[^A-Za-z0-9]/g, "");
  return clean ? clean.slice(-4).toUpperCase() : "—";
}

function intakeV3State({ pending, recorded, duplicate }) {
  const status = String(pending?.status || "NEEDS_REVIEW");
  if (duplicate) return { label: "⛔ DUPLICATE", next: "ตรวจรายการเดิมก่อน", error: true };
  if (status === "OCR_FAILED") return { label: "🔴 OCR ERROR", next: "ส่งภาพสลิปใหม่", error: true };
  if (status === "BANK_MISMATCH") return { label: "🔴 BANK MISMATCH", next: "ตรวจบัญชี", error: true };
  if (status === "PROMOTION_FAILED") return { label: "🔴 RECORD FAILED", next: "ตรวจ Ledger ก่อนลองใหม่", error: true };
  if (status === "RATE_REQUIRED") return { label: "🟡 RATE REQUIRED", next: "ตั้ง desk rate", error: true };
  if (status === "MARKET_UNAVAILABLE") return { label: "🟡 MARKET CHECK", next: "รอ market feed", error: true };
  if (status === "PIN_REQUIRED") return { label: "🟡 ACCOUNT REQUIRED", next: "เลือกบัญชีรับ", error: true };
  if (status === "STALE_SLIP") return { label: "🔴 STALE SLIP", next: "ตรวจวันที่สลิป", error: true };
  if (status === "RECORDED" && Boolean(recorded?.tx_id || pending?.tx_id)) {
    return { label: "✅ RECORDED", next: "รอส่ง USDT", error: false };
  }
  if (status === "VERIFIED") return { label: "🟡 READY", next: "ระบบบันทึกรายการ", error: false };
  return { label: "🟡 REVIEW", next: "ตรวจข้อมูล", error: true };
}

function intakeV3Trace({ pending, recorded, duplicate }) {
  const status = String(pending?.status || "NEEDS_REVIEW");
  const isRecorded = status === "RECORDED" && Boolean(recorded?.tx_id || pending?.tx_id);
  if (duplicate) return "OCR ✓ · [MATCH ✕] · IN · WAIT · DONE";
  if (status === "OCR_FAILED") return "[OCR ✕] · MATCH · IN · WAIT · DONE";
  if (["BANK_MISMATCH", "PIN_REQUIRED", "STALE_SLIP", "NEEDS_REVIEW"].includes(status)) {
    return "OCR ✓ · [MATCH] · IN · WAIT · DONE";
  }
  if (["RATE_REQUIRED", "MARKET_UNAVAILABLE", "PROMOTION_FAILED"].includes(status)) {
    return "OCR ✓ · MATCH ✓ · [IN] · WAIT · DONE";
  }
  if (isRecorded) return "OCR ✓ · MATCH ✓ · IN ✓ · [WAIT] · DONE";
  if (status === "VERIFIED") return "OCR ✓ · MATCH ✓ · [IN] · WAIT · DONE";
  return "OCR ✓ · [MATCH] · IN · WAIT · DONE";
}

function intakeV3Issues({ pending, deskRate, market, pinnedAccount, pinnedAccounts, duplicate }) {
  const status = String(pending?.status || "NEEDS_REVIEW");
  const rows = [];
  if (duplicate) rows.push("รายการซ้ำ · ไม่สร้างรายการใหม่");
  if (status === "BANK_MISMATCH") {
    rows.push(`FOUND · ${pending?.bank || "BANK"} ${pending?.account_masked || "—"}`);
    const pins = Array.isArray(pinnedAccounts) && pinnedAccounts.length
      ? pinnedAccounts
      : pinnedAccount ? [pinnedAccount] : [];
    for (const account of pins.slice(0, 3)) {
      rows.push(`EXPECTED · ${account?.bank_name || "BANK"} ${account?.account_number || "—"}`);
    }
  } else if (status === "OCR_FAILED") rows.push("OCR อ่านข้อมูลหลักไม่สำเร็จ");
  else if (status === "PIN_REQUIRED") rows.push("ยังไม่มีบัญชีรับที่เลือกสำหรับวันนี้");
  else if (status === "STALE_SLIP") rows.push("วันที่สลิปไม่ตรงวันทำงาน");
  else if (status === "RATE_REQUIRED") rows.push("ยังไม่มี desk rate ที่ใช้ได้");
  else if (status === "MARKET_UNAVAILABLE") rows.push("Binance TH Spot ยังยืนยันไม่ได้");
  else if (status === "PROMOTION_FAILED") rows.push("บันทึกรายการไม่สำเร็จ · ตรวจ Ledger ก่อน retry");
  else if (status === "NEEDS_REVIEW") rows.push("OCR confidence หรือข้อมูลสลิปต้องตรวจเพิ่ม");
  else if (pending?.pin_match && deskRate?.sell_rate && market?.price) rows.push("🟢 ALL CHECKS PASS");

  const confidence = Number(pending?.ocr_confidence);
  if (Number.isFinite(confidence) && confidence < 95) rows.push(`OCR confidence · ${confidence}%`);
  return rows.length ? rows : ["ข้อมูลตรวจสอบไม่มีข้อผิดพลาดที่ต้องแสดง"];
}

export function formatScanStageRichMessage() {
  return {
    html:
      "<h3>◈ CE · OCR</h3>" +
      "<p><b>⚙️ กำลังอ่านสลิป</b> — NEXT: ตรวจบัญชีอัตโนมัติ</p>" +
      "<hr/>" +
      "<p>OCR กำลังประมวลผลจากภาพจริง · ไม่มี fake progress</p>",
  };
}

export function formatIntakeRichMessage({
  pending,
  market,
  deskRate,
  recorded,
  duplicate,
  pinnedAccount = null,
  pinnedAccounts = [],
}) {
  const state = intakeV3State({ pending, recorded, duplicate });
  const trace = intakeV3Trace({ pending, recorded, duplicate });
  const issues = intakeV3Issues({ pending, deskRate, market, pinnedAccount, pinnedAccounts, duplicate });
  const fullAccount = pending?.account_number || (pending?.pin_match ? pinnedAccount?.account_number : null);
  const account = fullAccount || pending?.account_masked || "—";
  const bank = pending?.bank || pinnedAccount?.bank_name || "—";
  const tx = shortTxRef(pending?.ledger_ref);
  const amount = pending?.thb_in != null ? `${displayMoney(pending.thb_in, 2)} THB` : "—";
  const usdt = pending?.should_send != null ? `${displayMoney(pending.should_send, 6)} USDT` : "—";
  const rate = deskRate?.sell_rate != null ? displayMoney(deskRate.sell_rate, 2) : "—";
  const name = pending?.name || "—";
  const detailOpen = state.error ? " open" : "";
  const details = issues.map((line) => `<p>${richEscape(line)}</p>`).join("");
  const copyButtons = [
    fullAccount ? `<tg-button type="copy_text" text="${richEscape(fullAccount)}">COPY ACCOUNT</tg-button>` : "",
    pending?.ledger_ref ? `<tg-button type="copy_text" text="${richEscape(pending.ledger_ref)}">COPY REF</tg-button>` : "",
  ].filter(Boolean).join("");

  const html =
    `<h3>◈ CE · TX-${richEscape(tx)}</h3>` +
    `<p><b>${richEscape(state.label)}</b> — NEXT: ${richEscape(state.next)}</p>` +
    "<hr/>" +
    "<table>" +
      `<tr><th>THB</th><td>${richEscape(amount)}</td></tr>` +
      `<tr><th>USDT</th><td>${richEscape(usdt)}</td></tr>` +
      `<tr><th>RATE</th><td>${richEscape(rate)}</td></tr>` +
      `<tr><th>BANK</th><td>${richEscape(bank)}</td></tr>` +
      `<tr><th>ACCOUNT</th><td>${richEscape(account)}</td></tr>` +
      `<tr><th>NAME</th><td>${richEscape(name)}</td></tr>` +
    "</table>" +
    `<p><code>${richEscape(trace)}</code></p>` +
    `<details${detailOpen}><summary>ตรวจสอบ · CHECKS</summary>${details}</details>` +
    (copyButtons ? `<tg-button-row>${copyButtons}</tg-button-row>` : "");

  return { html };
}
