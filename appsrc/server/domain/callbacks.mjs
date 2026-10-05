import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { CALLBACK_ACTIONS } from "./contract.mjs";

const PREFIX = "c1";
const ACTION_CODE = Object.freeze({
  REFRESH: "rf",
  DETAILS: "dt",
  CONFIRM_PROCESS: "cp",
  RECHECK: "rc",
  AUDIT: "au",
});
const CODE_ACTION = Object.freeze(Object.fromEntries(Object.entries(ACTION_CODE).map(([action, code]) => [code, action])));

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function hmac(secret, message) {
  return createHmac("sha256", secret).update(message).digest("base64url").slice(0, 14);
}

function fixedEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function nonceDigest(nonce) {
  return createHash("sha256").update(nonce).digest("hex");
}

export function bindingDigest({ chatId, messageId, reference }) {
  return createHash("sha256").update(`${chatId}:${messageId}:${reference}`).digest("base64url").slice(0, 8);
}

export function issueCallbackData({ action, reference, nonce, expiresAt, binding, secret }) {
  if (!CALLBACK_ACTIONS.includes(action)) throw new Error("CALLBACK_ACTION_INVALID");
  if (!/^[A-Za-z0-9_-]{6,11}$/.test(reference)) throw new Error("CALLBACK_REFERENCE_INVALID");
  if (!/^[A-Za-z0-9_-]{6,12}$/.test(nonce)) throw new Error("CALLBACK_NONCE_INVALID");
  if (!/^[A-Za-z0-9_-]{6,12}$/.test(binding)) throw new Error("CALLBACK_BINDING_INVALID");
  if (!secret || secret.length < 16) throw new Error("CALLBACK_SECRET_INVALID");

  const payload = [PREFIX, ACTION_CODE[action], "j", reference, nonce, Number(expiresAt).toString(36), binding].join(".");
  const value = `${payload}.${hmac(secret, payload)}`;
  if (Buffer.byteLength(value, "utf8") > 64) throw new Error("CALLBACK_DATA_TOO_LONG");
  return value;
}

export function verifyCallbackData(value, { secret, now = Date.now() }) {
  const parts = String(value).split(".");
  if (parts.length !== 8 || parts[0] !== PREFIX || parts[2] !== "j") throw new Error("CALLBACK_FORMAT_INVALID");
  const [prefix, actionCode, marker, reference, nonce, expiresBase36, binding, signature] = parts;
  const action = CODE_ACTION[actionCode];
  if (!action || !/^[A-Za-z0-9_-]{6,11}$/.test(reference) || !/^[A-Za-z0-9_-]{6,12}$/.test(nonce) || !/^[A-Za-z0-9_-]{6,12}$/.test(binding)) {
    throw new Error("CALLBACK_FORMAT_INVALID");
  }
  const payload = [prefix, actionCode, marker, reference, nonce, expiresBase36, binding].join(".");
  if (!fixedEqual(hmac(secret, payload), signature)) throw new Error("CALLBACK_SIGNATURE_INVALID");
  const expiresAt = Number.parseInt(expiresBase36, 36);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) throw new Error("CALLBACK_EXPIRED");
  return { action, reference, nonce, nonceHash: nonceDigest(nonce), binding, expiresAt };
}

export function makeCallbackReference(seed) {
  return base64url(createHash("sha256").update(seed).digest()).slice(0, 10);
}
