import { createHash } from "node:crypto";

const BINANCE_TH_SPOT_URL = "https://api.binance.th/api/v1/ticker/price?symbol=USDTTHB";
const MARKET_TTL_MS = 30_000;
const OCR_AUTO_MIN = Math.max(1, Math.min(Number(process.env.OCR_AUTO_MIN || 90), 100));
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PADDLEOCR_MODEL = "PaddleOCR-VL-1.6";
const PADDLEOCR_TIMEOUT_MS = Math.max(5_000, Math.min(Number(process.env.PADDLEOCR_TIMEOUT_MS || 20_000), 60_000));
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
  for (const [pattern, code] of aliases) if (raw.length <= 48 && pattern.test(raw)) return code;
  return null;
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
  if (slip?.date && !slipDate) return { status: "NEEDS_REVIEW", promotable: false };
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

function finiteNumberOrNull(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    if (!value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

export function parseVisionJson(text) {
  const cleaned = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < first) return null;
  const data = JSON.parse(cleaned.slice(first, last + 1));
  const amount = finiteNumberOrNull(data.thbAmount);
  const confidence = finiteNumberOrNull(data.confidence);
  return {
    thbAmount: amount,
    time: typeof data.time === "string" ? data.time.trim() || null : null,
    date: typeof data.date === "string" ? data.date.trim() || null : null,
    receiverLast4: accountLast4(data.receiverLast4),
    bank: normalizeBank(data.bank),
    receiverName: typeof data.receiverName === "string" ? data.receiverName.trim() || null : null,
    senderName: typeof data.senderName === "string" ? data.senderName.trim() || null : null,
    confidence,
    provider: "XAI_VISION",
  };
}


function amountFromLabeledText(text) {
  const normalized = String(text || "").replace(/\u00a0/g, " ");
  const patterns = [
    /(?:จำนวนเงิน|ยอดชำระ|ยอดเงิน|ยอดโอน|จำนวนที่ชำระ|transaction\s*amount|transfer\s*amount|amount\s*paid|paid\s*amount|total\s*paid|amount)[^\d]{0,32}(\d[\d,]*(?:\.\d{1,2})?)/iu,
    /(\d[\d,]*\.\d{2})\s*(?:บาท|THB)\b/iu,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (!match) continue;
    const value = Number(match[1].replaceAll(",", ""));
    if (Number.isFinite(value) && value > 0 && value <= 10_000_000) return value;
  }
  return null;
}

function dateFromText(text) {
  const raw = String(text || "");
  const numeric = raw.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/);
  if (numeric) return numeric[1];

  const months = {
    "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6,
    "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12,
  };
  const thai = raw.match(/(?:^|\s)(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{2,4})(?=\s|$)/u);
  if (!thai) return null;
  const month = months[thai[2]];
  return month ? `${thai[1]}/${month}/${thai[3]}` : null;
}

function timeFromText(text) {
  const match = String(text || "").match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function receiverSectionText(text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => /^(?:ไปยัง|TO|ผู้รับ|PAYEE)(?:\b|$)/iu.test(line));
  if (start < 0) return String(text || "");
  const out = [];
  for (let index = start; index < Math.min(lines.length, start + 5); index += 1) {
    const line = lines[index];
    if (index > start && /^(?:จำนวนเงิน|AMOUNT|ยอดชำระ|ยอดเงิน|ข้อมูลเพิ่มเติม|BILLER NOTE)(?:\b|$)/iu.test(line)) break;
    out.push(line);
  }
  return out.join("\n");
}

function receiverLast4FromText(text) {
  const raw = receiverSectionText(text);
  const direct4 = /(?:x|X|•|\*)[\s\-xX•*]*?(\d{4})(?=[\s\-xX•*]|$)/u.exec(raw);
  if (direct4) return direct4[1];
  const split4 = /(?:x|X|•|\*)[\s\-xX•*]*?(\d{3})[\s-]*(\d)(?!\d)/u.exec(raw);
  if (split4) return `${split4[1]}${split4[2]}`;
  const card = /(?:\d{4}[\s-]+)?\d{2}(?:x|X|•|\*){2}[\s-]+(?:x|X|•|\*){4}[\s-]+(\d{4})/u.exec(raw);
  if (card) return card[1];
  const labeled = /(?:บัญชี(?:ผู้รับ)?|account|acct)[^\d]{0,24}(?:\d[\s-]*){4,}(\d{4})(?!\d)/iu.exec(raw);
  return labeled?.[1] || null;
}

function receiverNameFromText(text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const receiverIndex = lines.findIndex((line) => /^(?:ไปยัง|TO|ผู้รับ|PAYEE)(?:\b|$)/iu.test(line));
  if (receiverIndex >= 0) {
    const sameLine = /^(?:ไปยัง|TO|ผู้รับ|PAYEE)\s*[:：-]?\s*(.+)$/iu.exec(lines[receiverIndex]);
    if (sameLine?.[1] && /[A-Za-zก-๙]/u.test(sameLine[1])) return sameLine[1].trim();
    for (let index = receiverIndex + 1; index < Math.min(lines.length, receiverIndex + 4); index += 1) {
      const candidate = lines[index];
      if (/^(?:จำนวนเงิน|AMOUNT|ยอดชำระ|ยอดเงิน|ข้อมูลเพิ่มเติม|BILLER NOTE)(?:\b|$)/iu.test(candidate)) break;
      if (/[A-Za-zก-๙]/u.test(candidate) && !/^(?:x|X|•|\*|\d|[-\s])+$/u.test(candidate)) return candidate;
    }
  }
  const inlinePatterns = [
    /^(?:ไปยัง|ผู้รับ|ชื่อผู้รับ|receiver|payee)\s*[:：-]?\s*(.+)$/iu,
    /^biller\s*note\s*[:：-]?\s*([A-Za-zก-๙][A-Za-zก-๙ .'-]{2,})$/iu,
  ];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const pattern of inlinePatterns) {
      const match = pattern.exec(line);
      if (match?.[1] && !/^\d[\d\s-]+$/.test(match[1].trim())) return match[1].trim();
    }
    if (/^biller\s*note\b/i.test(line)) {
      const next = lines[index + 1];
      if (next && /[A-Za-zก-๙]/u.test(next) && !/^\d[\d\s-]+$/.test(next)) return next;
    }
  }
  return null;
}

export function parseThaiSlipText(text, provider = "OCR_TEXT") {
  const raw = String(text || "").trim();
  if (!raw) return {
    thbAmount: null, time: null, date: null, receiverLast4: null, bank: null,
    receiverName: null, senderName: null, confidence: null, provider,
  };
  const thbAmount = amountFromLabeledText(raw);
  const bank = normalizeBank(raw);
  const receiverLast4 = receiverLast4FromText(raw);
  const receiverName = receiverNameFromText(raw);
  const date = dateFromText(raw);
  const time = timeFromText(raw);
  const evidence = [
    thbAmount != null ? 45 : 0,
    bank ? 15 : 0,
    receiverLast4 ? 15 : 0,
    receiverName ? 10 : 0,
    date ? 10 : 0,
    time ? 5 : 0,
  ].reduce((sum, value) => sum + value, 0);
  return {
    thbAmount,
    time,
    date,
    receiverLast4,
    bank,
    receiverName,
    senderName: null,
    confidence: thbAmount == null ? null : evidence,
    provider,
  };
}


const TYPHOON_OCR_MODEL = process.env.TYPHOON_OCR_MODEL || "typhoon-ocr";
const TYPHOON_OCR_PROMPT = `Below is an image of a document page along with its dimensions.
Simply return the markdown representation of this document, presenting tables in markdown format as they naturally appear.
If the document contains images, use a placeholder like dummy.png for each image.
Your final output must be in JSON format with a single key \`natural_text\` containing the response.
RAW_TEXT_START

RAW_TEXT_END`;

function typhoonConfigured() {
  return Boolean(
    String(process.env.TYPHOON_OCR_API_KEY || "").trim() ||
    String(process.env.TYPHOON_OCR_BASE_URL || "").trim()
  );
}

function typhoonEndpoint() {
  if (!typhoonConfigured()) return null;
  const base = String(
    process.env.TYPHOON_OCR_BASE_URL || "https://api.opentyphoon.ai/v1"
  ).trim().replace(/\/$/, "");
  return /\/v1$/i.test(base)
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;
}

function typhoonNaturalText(content) {
  if (typeof content !== "string") return "";
  const cleaned = content
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\`\`\`\s*$/i, "")
    .trim();
  if (!cleaned) return "";
  try {
    const parsed = JSON.parse(cleaned);
    return typeof parsed?.natural_text === "string" ? parsed.natural_text : cleaned;
  } catch {
    return cleaned;
  }
}

async function analyzeWithTyphoon(buffer, mimeType = "image/jpeg") {
  const endpoint = typhoonEndpoint();
  if (!endpoint) return null;
  const key = String(process.env.TYPHOON_OCR_API_KEY || "").trim();
  const headers = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  const dataUrl = `data:${mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: TYPHOON_OCR_MODEL,
        temperature: 0.1,
        top_p: 0.6,
        repetition_penalty: 1.2,
        max_tokens: Math.max(512, Math.min(Number(process.env.TYPHOON_OCR_MAX_TOKENS || 2048), 4096)),
        messages: [{
          role: "user",
          content: [
            { type: "text", text: TYPHOON_OCR_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
      }),
      signal: AbortSignal.timeout(
        Math.max(5_000, Math.min(Number(process.env.TYPHOON_OCR_TIMEOUT_MS || 15_000), 30_000)),
      ),
    });

    if (!response.ok) {
      console.warn("[CE OCR] TYPHOON_HTTP", { status: response.status, model: TYPHOON_OCR_MODEL });
      return null;
    }

    const payload = await response.json();
    const text = typhoonNaturalText(payload?.choices?.[0]?.message?.content);
    if (!text.trim()) {
      console.warn("[CE OCR] TYPHOON_EMPTY", { model: TYPHOON_OCR_MODEL });
      return null;
    }

    const parsed = parseThaiSlipText(text, "TYPHOON_OCR_1_5");
    if (parsed.thbAmount == null) {
      console.warn("[CE OCR] TYPHOON_NO_AMOUNT", { model: TYPHOON_OCR_MODEL });
    }
    return parsed;
  } catch (error) {
    console.warn("[CE OCR] TYPHOON_ERROR", { name: error?.name || "Error", model: TYPHOON_OCR_MODEL });
    return null;
  }
}

function paddleEndpoint() {
  const raw = String(process.env.PADDLEOCR_VL_URL || process.env.PADDLEOCR_BASE_URL || "").trim();
  if (!raw) return null;
  return /\/layout-parsing\/?$/i.test(raw) ? raw.replace(/\/$/, "") : `${raw.replace(/\/$/, "")}/layout-parsing`;
}

function paddleLlamaEndpoint() {
  // Expensive self-hosted inference is opt-in. No implicit production URL.
  if (process.env.PADDLEOCR_LLAMA_ENABLED !== "1") return null;
  const raw = String(process.env.PADDLEOCR_LLAMA_URL || "").trim();
  if (!raw || !/^https:\/\//i.test(raw)) return null;
  return /\/v1\/chat\/completions\/?$/i.test(raw)
    ? raw.replace(/\/$/, "")
    : `${raw.replace(/\/$/, "")}/v1/chat/completions`;
}

const PADDLE_LLAMA_MODEL =
  process.env.PADDLEOCR_LLAMA_MODEL ||
  "LunarOilRig/PaddleOCR-VL-1.6-GGUF-Q4:Q4_K_M";

const PADDLE_LLAMA_PROMPT = "OCR:";

function llamaMessageText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part === "string" ? part : part?.text || "")
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

async function analyzeWithPaddleLlama(buffer, mimeType = "image/jpeg") {
  const endpoint = paddleLlamaEndpoint();
  if (!endpoint) return null;
  const dataUrl = `data:${mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: PADDLE_LLAMA_MODEL,
        temperature: 0,
        max_tokens: 384,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: PADDLE_LLAMA_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
      }),
      signal: AbortSignal.timeout(Math.max(PADDLEOCR_TIMEOUT_MS, 30_000)),
    });

    if (!response.ok) {
      console.warn("[CE OCR] PADDLE_LLAMA_HTTP", {
        status: response.status,
        model: PADDLEOCR_MODEL,
      });
      return null;
    }

    const payload = await response.json();
    const text = llamaMessageText(payload?.choices?.[0]?.message?.content);
    if (!text.trim()) {
      console.warn("[CE OCR] PADDLE_LLAMA_EMPTY", { model: PADDLEOCR_MODEL });
      return null;
    }

    const parsed = parseThaiSlipText(text, "PADDLEOCR_VL_1_6_LLAMA");
    if (parsed.thbAmount == null) {
      console.warn("[CE OCR] PADDLE_LLAMA_NO_AMOUNT", { model: PADDLEOCR_MODEL });
    }
    return parsed;
  } catch (error) {
    console.warn("[CE OCR] PADDLE_LLAMA_ERROR", {
      name: error?.name || "Error",
      model: PADDLEOCR_MODEL,
    });
    return null;
  }
}

async function analyzeWithPaddleVl(buffer) {
  const endpoint = paddleEndpoint();
  if (!endpoint) return null;
  const headers = { "content-type": "application/json" };
  const token = String(process.env.PADDLEOCR_ACCESS_TOKEN || "").trim();
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        file: buffer.toString("base64"),
        fileType: 1,
        useDocOrientationClassify: true,
        useDocUnwarping: true,
        useLayoutDetection: true,
        useChartRecognition: false,
        temperature: 0,
        prettifyMarkdown: false,
        visualize: false,
      }),
      signal: AbortSignal.timeout(PADDLEOCR_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn("[CE OCR] PADDLE_HTTP", { status: response.status, model: PADDLEOCR_MODEL });
      return null;
    }
    const payload = await response.json();
    const text = (payload?.result?.layoutParsingResults || [])
      .map((item) => item?.markdown?.text || "")
      .filter(Boolean)
      .join("\n");
    if (!text.trim()) {
      console.warn("[CE OCR] PADDLE_EMPTY", { model: PADDLEOCR_MODEL });
      return null;
    }
    const parsed = parseThaiSlipText(text, "PADDLEOCR_VL_1_6");
    if (parsed.thbAmount == null) console.warn("[CE OCR] PADDLE_NO_AMOUNT", { model: PADDLEOCR_MODEL });
    return parsed;
  } catch (error) {
    console.warn("[CE OCR] PADDLE_ERROR", { name: error?.name || "Error", model: PADDLEOCR_MODEL });
    return null;
  }
}

function extractionScore(value) {
  if (!value) return -1;
  let score = 0;
  if (value.thbAmount != null) score += 50;
  if (value.bank) score += 12;
  if (value.receiverLast4) score += 12;
  if (value.receiverName) score += 10;
  if (value.date) score += 8;
  if (value.time) score += 4;
  if (finiteNumberOrNull(value.confidence) != null) score += Math.min(4, Number(value.confidence) / 25);
  return score;
}

function bestExtraction(...values) {
  return values.filter(Boolean).sort((a, b) => extractionScore(b) - extractionScore(a))[0] || null;
}

const SLIP_PROMPT = `You are a Thai payment evidence parser. The image may be a bank transfer slip, QR payment slip, bill-payment/biller receipt, or a bank-generated receipt screenshot. Return ONLY JSON: {"thbAmount":number|null,"time":"HH:MM"|null,"date":"DD/MM/YY"|null,"receiverLast4":"XXXX"|null,"bank":"KBANK|SCB|BBL|KTB|BAY|TTB|GSB|KKP|CIMB|LH|UOB|TISCO|TMN|OTHER"|null,"receiverName":string|null,"senderName":string|null,"confidence":number|null}. "thbAmount" is the transaction amount actually paid/transferred in THB. Never use account numbers, reference numbers, dates, times, fees, or balances as the transaction amount. Read the RECEIVER/payee or biller, not the sender. For biller receipts, BILLER NOTE may identify the payee but is not an account number. If a value is not visibly supported by the image, return null. Do not invent values. confidence is 0-100 only when the image supports the extraction.`;

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
    if (!response.ok) {
      console.warn("[CE OCR] XAI_HTTP", { status: response.status, model });
      return null;
    }
    const payload = await response.json();
    const parsed = parseVisionJson(payload?.choices?.[0]?.message?.content || "");
    if (!parsed?.thbAmount) console.warn("[CE OCR] XAI_NO_AMOUNT", { model });
    return parsed;
  } catch (error) {
    console.warn("[CE OCR] XAI_ERROR", { name: error?.name || "Error" });
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
    if (!response.ok) {
      console.warn("[CE OCR] OCR_SPACE_HTTP", { status: response.status });
      return null;
    }
    const payload = await response.json();
    const amount = pickAmount(payload?.ParsedResults?.[0]?.ParsedText || "");
    if (amount == null) {
      console.warn("[CE OCR] OCR_SPACE_NO_AMOUNT");
      return null;
    }
    return { thbAmount: amount, time: null, date: null, receiverLast4: null, bank: null, receiverName: null, senderName: null, confidence: 70, provider: "OCR_SPACE" };
  } catch (error) {
    console.warn("[CE OCR] OCR_SPACE_ERROR", { name: error?.name || "Error" });
    return null;
  }
}

export async function analyzeSlipBuffer(buffer, mimeType = "image/jpeg") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw asError("EMPTY_IMAGE");
  if (buffer.length > MAX_IMAGE_BYTES) throw asError("IMAGE_TOO_LARGE");

  const typhoon = await analyzeWithTyphoon(buffer, mimeType);
  if (typhoon?.thbAmount != null && extractionScore(typhoon) >= 80) return typhoon;

  const paddleLlama = await analyzeWithPaddleLlama(buffer, mimeType);
  if (paddleLlama?.thbAmount != null && extractionScore(paddleLlama) >= 80) return paddleLlama;

  const paddleOfficial = await analyzeWithPaddleVl(buffer);
  const paddle = bestExtraction(paddleLlama, paddleOfficial);
  const bestDocument = bestExtraction(typhoon, paddle);
  if (bestDocument?.thbAmount != null && extractionScore(bestDocument) >= 80) return bestDocument;

  const xai = await analyzeWithXai(buffer, mimeType);
  const bestPrimary = bestExtraction(bestDocument, xai);
  if (bestPrimary?.thbAmount != null) return bestPrimary;

  const ocrSpace = await analyzeWithOcrSpace(buffer, mimeType);
  return bestExtraction(bestPrimary, ocrSpace) || {
    thbAmount: null,
    time: null,
    date: null,
    receiverLast4: null,
    bank: null,
    receiverName: null,
    senderName: null,
    confidence: null,
    provider: "UNAVAILABLE",
  };
}

export function intakeCapability() {
  const typhoon = typhoonConfigured();
  const paddleLlama = Boolean(paddleLlamaEndpoint());
  const paddleOfficial = Boolean(process.env.PADDLEOCR_VL_URL || process.env.PADDLEOCR_BASE_URL);
  const paddle = paddleLlama || paddleOfficial;
  const xai = Boolean(process.env.GROK_API_KEY || process.env.XAI_API_KEY);
  const ocrSpace = Boolean(process.env.OCR_SPACE_API_KEY);
  return {
    ocr_configured: typhoon || paddle || xai || ocrSpace,
    preferred_model: typhoon ? TYPHOON_OCR_MODEL : paddle ? PADDLEOCR_MODEL : "MANUAL_REVIEW",
    provider_order: ["typhoon_ocr_1_5", "paddleocr_vl_1_6", "xai_vision", "ocr_space"],
    paddle_backend: paddleLlama
      ? "LLAMA_CPP_MULTIMODAL"
      : paddleOfficial
        ? "LAYOUT_PARSING"
        : "UNCONFIGURED",
    providers: {
      typhoon_ocr_1_5: typhoon,
      paddleocr_vl_1_6: paddle,
      xai_vision: xai,
      ocr_space: ocrSpace,
    },
    thai_strategy: paddle
      ? "Typhoon OCR 1.5 primary when configured; enabled PaddleOCR fallback; XAI and OCR.space if configured; manual review otherwise"
      : "Typhoon OCR 1.5 primary when configured; slow self-hosted PaddleOCR disabled; other configured fallbacks or manual review/OCR_FAILED",
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
  const n = finiteNumberOrNull(value);
  if (n == null) return "⚪ OCR UNKNOWN";
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
  const raw = String(ledgerRef || "");
  const token = raw.split("-").at(-1)?.replace(/[^0-9A-Fa-f]/g, "") || "";
  if (!token) return "—";
  try {
    return String(Number(BigInt(`0x${token.slice(0, 12)}`) % 10000n)).padStart(4, "0");
  } catch {
    const digits = raw.replace(/\D/g, "");
    return digits ? digits.slice(-4).padStart(4, "0") : "—";
  }
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
  else if (status === "NEEDS_REVIEW") {
    const confidence = finiteNumberOrNull(pending?.ocr_confidence);
    if (confidence == null || confidence >= OCR_AUTO_MIN) rows.push("ข้อมูลสลิปต้องตรวจเพิ่ม");
  }
  else if (pending?.pin_match && deskRate?.sell_rate && market?.price) rows.push("🟢 ALL CHECKS PASS");

  const confidence = finiteNumberOrNull(pending?.ocr_confidence);
  if (confidence != null && confidence < OCR_AUTO_MIN) rows.push(`OCR ${confidence}% ต่ำกว่าเกณฑ์ ${OCR_AUTO_MIN}% · ตรวจสอบด้วยตา`);
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

// V4 is presentation-only. Financial decisions remain in decideIntake/promotePendingSlip.
export function formatIntakeV4Reply({pending,market,deskRate,recorded,duplicate,pinnedAccount=null,pinnedAccounts=[]}) {
  const status = String(pending?.status || "NEEDS_REVIEW");
  const isRecorded = !duplicate && status === "RECORDED" && Boolean(recorded?.tx_id || pending?.tx_id);
  const verified = !duplicate && status === "VERIFIED";
  const n = (value, digits=2) => value == null || String(value).trim() === "" ||
    !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("en-US", {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    });
  const safeBank = (value) => {
    const raw = String(value || "").trim();
    if (raw.length > 64 || /[\\r\\n]/.test(raw) || /(?:โอนเงินสำเร็จ|รหัสอ้างอิง|จำนวนเงิน|เงื่อนไขการโอน|ตรวจสอบสถานะ|จากนาง|ไปยัง)/u.test(raw)) return null;
    const code = normalizeBank(raw);
    return ["KBANK","SCB","BBL","KTB","BAY","TTB","GSB","KKP","CIMB","UOB","TISCO","TMN"].includes(code) ? code : null;
  };
  const bank = safeBank(pending?.bank) || (pending?.pin_match ? safeBank(pinnedAccount?.bank_name) : null);
  const accountRaw = pending?.account_masked || (pending?.pin_match ? pinnedAccount?.account_number : null);
  const accountLast = accountLast4(accountRaw);
  const account = accountLast ? "••••" + accountLast : "—";
  const amount = n(pending?.thb_in);
  const estimate = n(pending?.should_send, 6);
  const rate = n(pending?.desk_rate ?? deskRate?.sell_rate);
  const due = (isRecorded || verified) && pending?.should_send != null && String(pending.should_send).trim() !== ""
    ? n(pending.should_send, 2) : "—";
  const cleared = isRecorded && recorded?.settlement_verified === true && recorded?.cleared_usdt != null &&
    String(recorded.cleared_usdt).trim() !== "" ? Number(recorded.cleared_usdt) : null;
  const dueValue = due === "—" ? null : Number(pending.should_send);
  const clearedValid = cleared != null && Number.isFinite(cleared) && cleared >= 0 &&
    dueValue != null && cleared <= dueValue;
  const confidence = pending?.ocr_confidence == null || String(pending.ocr_confidence).trim() === ""
    ? null : Number(pending.ocr_confidence);
  const note = String(pending?.note || "");
  const slipDate = note.match(/(?:^|;)SLIP_DATE=([^;]*)/)?.[1];
  const slipTime = note.match(/(?:^|;)SLIP_TIME=([^;]*)/)?.[1];
  const ocrProvider = note.match(/(?:^|;)OCR=([^;]*)/)?.[1];
  const titles = {
    OCR_FAILED: "🔴 OCR อ่านไม่สำเร็จ", BANK_MISMATCH: "🔴 บัญชีไม่ตรง",
    NEEDS_REVIEW: "🟡 รอตรวจสอบ OCR", PIN_REQUIRED: "🟡 ยังไม่ PIN บัญชี",
    STALE_SLIP: "🔴 วันที่สลิปไม่ตรง", RATE_REQUIRED: "🟡 ยังไม่มีเรต",
    MARKET_UNAVAILABLE: "🟡 ราคาตลาดไม่พร้อม", PROMOTION_FAILED: "🔴 บันทึกไม่สำเร็จ",
    VERIFIED: "🟡 รอแอดมินอนุมัติ", RECORDED: "🟡 บันทึก IN แล้ว · WAIT USDT",
    REJECTED: "⛔ แอดมินปฏิเสธ",
  };
  const headline = duplicate ? "⛔ สลิปซ้ำ" : isRecorded ? titles.RECORDED :
    (titles[status] || "🟡 รอตรวจสอบ");
  const lines = [
    `◈ CE · TX-${shortTxRef(pending?.ledger_ref)}`,
    headline,
    `💵 รับ (THB): ${amount} · เรต: ${rate}`,
    `💎 ประเมิน (USDT): ${estimate}`,
    `📊 ต้องส่ง (Due): ${due} USDT`,
    `✅ ส่งยืนยันแล้ว (Cleared): ${clearedValid ? n(cleared) : "—"} USDT`,
    `⏳ ค้างส่ง (Outstanding): ${clearedValid ? n(dueValue-cleared) : "—"} USDT`,
    `🏦 บัญชีรับ: ${bank || "ไม่ยืนยัน"} · ${account}`,
  ];
  if (pending?.name && String(pending.name).length <= 80) lines.push(`👤 ผู้รับ: ${pending.name}`);
  if (slipDate || slipTime) lines.push(`🗓 สลิป: ${slipDate || "—"} ${slipTime || ""}`.trim());
  if (pending?.ledger_ref) lines.push(`🔖 Ref: ${pending.ledger_ref}`);
  if (ocrProvider) lines.push(`🔎 OCR: ${ocrProvider}`);
  lines.push(`📋 Confidence: ${confidence != null && Number.isFinite(confidence) ? n(confidence,1)+"%" : "—"}`);
  if (verified && pending?.id) lines.push(`🛡 /approve ${pending.id}`);
  const flow = isRecorded ? "OCR ✓ → MATCH ✓ → IN ✓ → WAIT ⏳ → DONE —" :
    verified ? "OCR ✓ → MATCH ✓ → APPROVE ⏳ → IN — → DONE —" :
    status === "BANK_MISMATCH" ? "OCR ✓ → MATCH ✗ → IN —" :
    status === "OCR_FAILED" ? "OCR ✗ → MATCH — → IN —" :
    "OCR ✓ → REVIEW ⏳ → IN —";
  lines.push("─────────────", flow);
  const issues = intakeV3Issues({pending,market,deskRate,pinnedAccount,pinnedAccounts,duplicate})
    .filter(x => x !== "🟢 ALL CHECKS PASS" && x !== "ข้อมูลตรวจสอบไม่มีข้อผิดพลาดที่ต้องแสดง");
  for (const issue of issues.slice(0,4)) {
    // Issue details may contain raw OCR bank text; never echo it into Telegram.
    const safeIssue = String(issue).replace(/FOUND[^\n]*?(?=EXPECTED|$)/u, "FOUND · [unverified OCR] · ");
    lines.push("⚠️ " + safeIssue.slice(0,160));
  }
  lines.push("NEXT: " + (duplicate ? "ตรวจรายการเดิม" : isRecorded ? "รอหลักฐานส่ง USDT" :
    verified ? "แอดมินตรวจสลิปแล้วกด Approve" : "ตรวจข้อมูลก่อนอนุมัติ"));
  return lines.join("\n");
}

export function formatIntakeV4RichMessage(args) {
  const pending = args?.pending || {};
  const card = formatIntakeV4Reply(args).split('\n');
  const fullAccount = pending.account_number || (pending.pin_match ? args?.pinnedAccount?.account_number : null);
  const issueHtml = card.filter(line => line.startsWith('⚠️ ')).map(line => `<p>${richEscape(line)}</p>`).join('');
  const copyButtons = [
    fullAccount ? `<tg-button type="copy_text" text="${richEscape(fullAccount)}">COPY ACCOUNT</tg-button>` : '',
    pending.ledger_ref ? `<tg-button type="copy_text" text="${richEscape(pending.ledger_ref)}">COPY REF</tg-button>` : '',
  ].filter(Boolean).join('');
  const amountRows = card.slice(2).filter(line => /^(💵|💎|📊|✅|⏳|🏦|👤|🗓|🔖|🔎|📋|🛡)/u.test(line));
  const otherLines = card.slice(2).filter(line => !amountRows.includes(line) && !line.startsWith('⚠️ '));
  return {html:
    `<h3>${richEscape(card[0])}</h3>` +
    `<p><b>${richEscape(card[1])}</b></p><hr/>` +
    `<table>${amountRows.map(line => `<tr><td>${richEscape(line)}</td></tr>`).join('')}</table>` +
    `<p><code>${richEscape(otherLines.join('\n'))}</code></p>` +
    `<details${issueHtml ? ' open' : ''}><summary>ตรวจสอบ · CHECKS</summary>${issueHtml || '<p>ไม่มีประเด็นที่ต้องแสดง</p>'}</details>` +
    (copyButtons ? `<tg-button-row>${copyButtons}</tg-button-row>` : '')
  };
}

