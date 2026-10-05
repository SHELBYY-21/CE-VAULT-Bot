import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { assertSandboxFlags, commandTarget, TELEGRAM_ACTIONS } from "./domain/contract.mjs";
import { bindingDigest, issueCallbackData, makeCallbackReference, nonceDigest, verifyCallbackData } from "./domain/callbacks.mjs";
import { createWorkflowRepository } from "./repositories/supabase.mjs";
import { buildStatusCard, createTelegramClient } from "./repositories/telegram.mjs";
import { runSandboxE2E } from "./e2e.mjs";

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

async function processTelegramUpdate(update) {
  if (!update || !Number.isSafeInteger(update.update_id)) return;
  const claimed = await repository.claimTelegramUpdate(update.update_id);
  if (!claimed) return;

  const message = update.message;
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

app.get("/api/v1/telegram/status", async (req, res) => {
  if (!telegram) return problem(res, req, 503, "TELEGRAM_NOT_CONFIGURED", "Telegram bot token is not configured for this server.");
  try {
    const info = await telegram.getWebhookInfo();
    res.json({ configured: true, webhook: info });
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
