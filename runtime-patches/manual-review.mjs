import { accountLast4, findPinnedMatch, normalizeBank } from "./live-intake.mjs";

function reviewError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function positiveDecimalString(value, code) {
  const raw = String(value ?? "").trim();
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) throw reviewError(code);
  const fraction = (match[2] || "").padEnd(2, "0");
  const scaled = BigInt(match[1]) * 100n + BigInt(fraction || "0");
  if (scaled <= 0n || scaled > 1_000_000_000n) throw reviewError(code);
  return raw;
}

function positiveRate(value) {
  const raw = String(value ?? "").trim();
  const match = /^(\d{1,3})(?:\.(\d{1,12}))?$/.exec(raw);
  if (!match) return false;
  const digits = `${match[1]}${match[2] || ""}`;
  return BigInt(digits) > 0n;
}

export function parseManualReviewCommand(text) {
  const raw = String(text || "").trim();
  const parts = raw.split(/\s+/);
  if (!/^\/review(?:@\w+)?$/i.test(parts[0] || "") || parts.length !== 5) {
    throw reviewError("MANUAL_REVIEW_FORMAT_INVALID");
  }
  const ledgerRef = String(parts[1] || "").trim().toUpperCase();
  if (!/^CE-\d{8}-[A-Z0-9]{6,32}$/.test(ledgerRef)) {
    throw reviewError("MANUAL_REVIEW_REF_INVALID");
  }
  const amount = positiveDecimalString(parts[2], "MANUAL_REVIEW_AMOUNT_INVALID");
  const bank = normalizeBank(parts[3]);
  if (!bank) throw reviewError("MANUAL_REVIEW_BANK_INVALID");
  const last4 = accountLast4(parts[4]);
  if (!/^\d{4}$/.test(last4 || "") || String(parts[4]).replace(/\D/g, "").length !== 4) {
    throw reviewError("MANUAL_REVIEW_LAST4_INVALID");
  }
  return { ledgerRef, amount, bank, last4 };
}

export function validateManualReviewGate({ pending, bank, last4, pinnedBanks, deskRate, market }) {
  if (!pending) return { ok: false, code: "MANUAL_REVIEW_NOT_FOUND" };
  if (pending.tx_id || pending.status === "RECORDED") {
    return { ok: false, code: "MANUAL_REVIEW_ALREADY_RECORDED" };
  }
  if (!new Set(["OCR_FAILED", "NEEDS_REVIEW"]).has(String(pending.status || ""))) {
    return { ok: false, code: "MANUAL_REVIEW_STATE_INVALID" };
  }
  const pinnedMatch = findPinnedMatch({ bank, receiverLast4: last4 }, pinnedBanks || []);
  if (!pinnedMatch) return { ok: false, code: "MANUAL_REVIEW_PIN_MISMATCH" };
  if (!positiveRate(deskRate?.sell_rate)) return { ok: false, code: "MANUAL_REVIEW_RATE_REQUIRED" };
  if (!market?.fresh || !positiveRate(market?.price)) {
    return { ok: false, code: "MANUAL_REVIEW_MARKET_UNAVAILABLE" };
  }
  return { ok: true, pinnedMatch };
}
