import assert from "node:assert/strict";
import test from "node:test";
import { TELEGRAM_ACTIONS, canTransition, commandTarget, isTerminalState } from "../server/domain/contract.mjs";
import { bindingDigest, issueCallbackData, verifyCallbackData } from "../server/domain/callbacks.mjs";

const secret = "callback-test-secret-that-is-never-a-runtime-secret";
const now = 1_790_000_000_000;
const reference = "x2J7pQ9LmA";
const nonce = "n4Z8kT1q";
const binding = bindingDigest({ chatId: 998877, messageId: 4567, reference });

function sample(action = TELEGRAM_ACTIONS.CONFIRM_PROCESS, expiresAt = now + 300_000) {
  return issueCallbackData({ action, reference, nonce, expiresAt, binding, secret });
}

test("signed callback is Telegram-safe, verifies and maps CONFIRM_PROCESS", () => {
  const callbackData = sample();
  assert.ok(Buffer.byteLength(callbackData) <= 64);
  const parsed = verifyCallbackData(callbackData, { secret, now });
  assert.equal(parsed.action, TELEGRAM_ACTIONS.CONFIRM_PROCESS);
  assert.equal(parsed.reference, reference);
  assert.equal(commandTarget(parsed.action, "NEED_CONFIRMATION"), "PROCESSING");
  assert.equal(canTransition("NEED_CONFIRMATION", "PROCESSING"), true);
  assert.equal(canTransition("NEED_CONFIRMATION", "VERIFYING"), false);
});

test("tampered, expired and mismatched-secret callbacks fail closed", () => {
  const signed = sample();
  assert.throws(() => verifyCallbackData(`${signed.slice(0, -1)}x`, { secret, now }), /CALLBACK_SIGNATURE_INVALID/);
  assert.throws(() => verifyCallbackData(sample(TELEGRAM_ACTIONS.REFRESH, now - 1), { secret, now }), /CALLBACK_EXPIRED/);
  assert.throws(() => verifyCallbackData(signed, { secret: "different-secret-value", now }), /CALLBACK_SIGNATURE_INVALID/);
});

test("terminal records are immutable and confirmation is narrowly scoped", () => {
  for (const state of ["COMPLETED", "FAILED", "DUPLICATE", "TIMEOUT"]) {
    assert.equal(isTerminalState(state), true);
    assert.equal(commandTarget(TELEGRAM_ACTIONS.CONFIRM_PROCESS, state), null);
  }
  assert.equal(commandTarget(TELEGRAM_ACTIONS.CONFIRM_PROCESS, "VERIFYING"), null);
});
