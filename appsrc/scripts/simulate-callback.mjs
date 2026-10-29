import { strict as assert } from "node:assert";
import { bindingDigest, issueCallbackData, verifyCallbackData } from "../server/domain/callbacks.mjs";
import { commandTarget } from "../server/domain/contract.mjs";

const now = 1_790_000_000_000;
const secret = "local-simulation-secret-32-bytes-minimum";
const reference = "YB2sim7Qx";
const nonce = "n0nce7";
const binding = bindingDigest({ chatId: 100200300, messageId: 7701, reference });
const callbackData = issueCallbackData({
  action: "CONFIRM_PROCESS",
  reference,
  nonce,
  expiresAt: now + 600_000,
  binding,
  secret,
});
const update = {
  update_id: 910001,
  callback_query: {
    id: "callback-sim-910001",
    from: { id: 424242 },
    message: { message_id: 7701, chat: { id: 100200300, type: "private" } },
    data: callbackData,
  },
};
const parsed = verifyCallbackData(update.callback_query.data, { secret, now });
assert.equal(parsed.action, "CONFIRM_PROCESS");
assert.equal(parsed.reference, reference);
assert.equal(commandTarget(parsed.action, "NEED_CONFIRMATION"), "PROCESSING");
assert.ok(Buffer.byteLength(callbackData, "utf8") <= 64);
assert.throws(() => verifyCallbackData(`${callbackData.slice(0, -1)}x`, { secret, now }), /CALLBACK_SIGNATURE_INVALID/);
assert.throws(() => verifyCallbackData(callbackData, { secret, now: now + 601_000 }), /CALLBACK_EXPIRED/);

console.log(JSON.stringify({
  simulated: "callback_query",
  update_id: update.update_id,
  action: parsed.action,
  reference: parsed.reference,
  target: commandTarget(parsed.action, "NEED_CONFIRMATION"),
  callback_bytes: Buffer.byteLength(callbackData, "utf8"),
  tamper_rejected: true,
  expiry_rejected: true,
  external_delivery: false,
}, null, 2));
