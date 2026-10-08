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
    "👑 CE EMPIRE",
    "BUILD • GROW • EMPOWER",
    "",
    "🤖 CE VAULT OPERATOR",
    "ระบบรับสลิปและตรวจสอบรายการ USDT",
    "",
    "01 SCAN            ส่งรูปสลิป",
    "02 OCR / EXTRACTED อ่านยอดและข้อมูลบัญชี",
    "03 VERIFY          ตรวจ PIN / เรต / ตลาด",
    "04 RECORD          บันทึกเมื่อผ่านเงื่อนไข",
    "",
    "คำสั่งหลัก: /rate · /pin · /status",
    "ส่งรูปสลิปเพื่อเริ่มงานได้ทันที",
  ].join("\n");
}

export function formatBotSystemReply({
  telegramOnline = true,
  webhookVerified = false,
  databaseConfigured = false,
  pendingUpdates = 0,
  safety = "LOCKED",
} = {}) {
  return [
    "◈ CE EMPIRE · SYSTEM STATUS",
    "",
    `● TELEGRAM      ${telegramOnline ? "ONLINE" : "CHECK"}`,
    `● WEBHOOK       ${webhookVerified ? "VERIFIED" : "CHECK"}`,
    `● DATABASE      ${databaseConfigured ? "CONFIGURED" : "UNAVAILABLE"}`,
    `● QUEUE         ${Number.isFinite(Number(pendingUpdates)) ? Number(pendingUpdates) : 0}`,
    `● SAFETY        ${safety || "LOCKED"}`,
    "",
    "⚡ CE VAULT OPERATOR READY",
  ].join("\n");
}

export function formatScanStageReply() {
  return [
    "◈ CE · 01 SCAN",
    "📄 RECEIVING SLIP",
    "▰▰▰ READING SLIP",
    "",
    "กำลังตรวจยอด / บัญชี / Binance TH Spot",
    "NEXT · 02 OCR / EXTRACTED",
  ].join("\n");
}

export function formatIntakeReply({ pending, market, deskRate, recorded, duplicate }) {
  const isRecorded = pending?.status === "RECORDED" && Boolean(recorded?.tx_id || pending?.tx_id);
  const lines = [
    duplicate ? "◈ CE · DUPLICATE" : isRecorded ? "◈ CE · 03 DONE ✓" : "◈ CE · 02 OCR / EXTRACTED",
  ];

  if (duplicate) lines.push("⚠️ รายการนี้เคยรับแล้ว");
  if (pending?.ledger_ref) lines.push(`REF        ${pending.ledger_ref}`);
  if (pending?.thb_in != null) lines.push(`AMOUNT     ${pending.thb_in} THB`);
  if (pending?.should_send != null) lines.push(`EST. USDT  ${pending.should_send} USDT`);
  if (pending?.account_masked) {
    lines.push(`BANK       ${pending.bank || "BANK"} ${pending.account_masked} · ${pending.pin_match ? "VERIFIED" : "NOT VERIFIED"}`);
  }
  if (deskRate?.sell_rate) lines.push(`DESK       ${deskRate.sell_rate} THB/USDT`);
  if (market?.price) lines.push(`MARKET     ${market.price} THB/USDT · BINANCE TH SPOT`);

  if (isRecorded) {
    lines.push("");
    lines.push("✅ OCR EXTRACTED");
    lines.push("✅ PIN / BANK VERIFIED");
    lines.push("✅ RECORD SAVED");
    lines.push("⏳ SETTLEMENT NOT RUN · ยังไม่ยืนยันการชำระสุดท้าย");
    lines.push("READY FOR NEXT");
  } else {
    lines.push("");
    lines.push(`STATUS     ${pending?.status || "NEEDS_REVIEW"}`);
    lines.push("VERIFYING · ตรวจเงื่อนไขก่อนบันทึก");
  }
  return lines.join("\n");
}
