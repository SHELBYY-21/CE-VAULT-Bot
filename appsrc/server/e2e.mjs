import { createHash, randomBytes } from "node:crypto";
import { assertSandboxFlags, commandTarget } from "./domain/contract.mjs";
import { bindingDigest, issueCallbackData, makeCallbackReference, nonceDigest, verifyCallbackData } from "./domain/callbacks.mjs";

function requestHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function runSandboxE2E({ repository, callbackSecret, now = Date.now() }) {
  assertSandboxFlags(process.env);
  if (!repository) throw new Error("DATABASE_UNAVAILABLE");
  if (!callbackSecret) throw new Error("CALLBACK_SECRET_MISSING");

  const created = await repository.createSandboxJob({
    transactionType: "TELEGRAM_SANDBOX_E2E",
    worker: "TG-INTAKE",
    summary: "E2E simulated /sandbox command",
    correlationId: `telegram-e2e-${now}`,
    metadata: { source: "telegram", test: "e2e", external_delivery: false },
  });
  const jobId = created.job_id;
  const states = [created.state];
  let job = await repository.getJob(jobId);

  for (const toState of ["SCANNING", "OCR_EXTRACTING", "VERIFYING", "NEED_CONFIRMATION"]) {
    const response = await repository.transitionJob({
      jobId,
      expectedVersion: job.state_version,
      toState,
      commandCode: "SANDBOX_ADVANCE",
      idempotencyKey: `telegram-e2e-${toState.toLowerCase()}`,
      requestHash: requestHash({ jobId, toState, version: job.state_version }),
      actorType: "TELEGRAM_SIMULATION",
      actorId: "e2e-runner",
      requestId: `telegram-e2e-${now}`,
      payload: { source: "telegram", simulated: true },
    });
    states.push(response.state);
    job = await repository.getJob(jobId);
  }

  const chatId = 100200300;
  const messageId = 99001;
  const expiresAt = now + 600_000;
  const nonce = randomBytes(6).toString("base64url");
  const reference = makeCallbackReference(`${job.id}:CONFIRM_PROCESS:${nonce}:${expiresAt}`);
  const binding = bindingDigest({ chatId, messageId, reference });
  const callbackData = issueCallbackData({
    action: "CONFIRM_PROCESS",
    reference,
    nonce,
    expiresAt,
    binding,
    secret: callbackSecret,
  });
  const parsed = verifyCallbackData(callbackData, { secret: callbackSecret, now });
  await repository.insertCallbackTokens([{
    reference,
    job_id: job.id,
    action: parsed.action,
    nonce_hash: nonceDigest(nonce),
    binding_digest: binding,
    chat_id: chatId,
    message_id: messageId,
    expires_at: new Date(expiresAt).toISOString(),
    metadata: { state_version: job.state_version, source: "telegram_simulation" },
  }]);
  const claimed = await repository.claimCallback(parsed.reference, parsed.nonceHash, parsed.binding);
  if (!claimed) throw new Error("CALLBACK_STALE_OR_REPLAYED");
  const target = commandTarget(parsed.action, job.state);
  if (target !== "PROCESSING") throw new Error("CONFIRM_PROCESS_TARGET_INVALID");

  const processing = await repository.transitionJob({
    jobId,
    expectedVersion: job.state_version,
    toState: target,
    commandCode: "CONFIRM_PROCESS",
    idempotencyKey: `telegram-e2e-${parsed.reference}`,
    requestHash: requestHash({ jobId, callback: parsed.reference, version: job.state_version }),
    actorType: "TELEGRAM_SIMULATION",
    actorId: "e2e-runner",
    requestId: `telegram-e2e-${now}`,
    payload: { callback_reference: parsed.reference, chat_id: chatId, message_id: messageId },
  });
  states.push(processing.state);
  job = await repository.getJob(jobId);

  for (const toState of ["SETTLING", "COMPLETED"]) {
    const response = await repository.transitionJob({
      jobId,
      expectedVersion: job.state_version,
      toState,
      commandCode: "SANDBOX_ADVANCE",
      idempotencyKey: `telegram-e2e-${toState.toLowerCase()}`,
      requestHash: requestHash({ jobId, toState, version: job.state_version }),
      actorType: "TELEGRAM_SIMULATION",
      actorId: "e2e-runner",
      requestId: `telegram-e2e-${now}`,
      payload: { source: "telegram", simulated: true },
    });
    states.push(response.state);
    job = await repository.getJob(jobId);
  }

  return {
    source: "telegram_sandbox_simulation",
    public_ref: job.public_ref,
    job_id: job.id,
    states,
    callback_action: parsed.action,
    callback_bytes: Buffer.byteLength(callbackData, "utf8"),
    callback_claimed_once: true,
    final_state: job.state,
    state_version: job.state_version,
    terminal_at: job.terminal_at,
    external_delivery: false,
    live_settlement_enabled: false,
  };
}
