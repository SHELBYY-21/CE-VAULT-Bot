import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'appsrc');
const partsDir = path.join(root, '.manus-source', 'parts');
const archivePath = path.join(root, '.manus-source', 'cevault.tgz');

if (existsSync(appPath)) rmSync(appPath, { recursive: true, force: true });
mkdirSync(appPath, { recursive: true });

const encoded = readdirSync(partsDir)
  .sort()
  .map((name) => readFileSync(path.join(partsDir, name), 'utf8'))
  .join('');
writeFileSync(archivePath, Buffer.from(encoded, 'base64'));

function run(cmd, args, cwd) {
  const out = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });
  if (out.status !== 0) process.exit(out.status ?? 1);
}

function applyRenderCompatibility() {
  const supabasePath = path.join(appPath, 'server', 'repositories', 'supabase.mjs');
  const indexPath = path.join(appPath, 'server', 'index.mjs');

  writeFileSync(supabasePath, `import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const GATEWAY_FORWARD_HEADERS = [
  "accept", "accept-profile", "content-profile", "content-type", "prefer",
  "range", "if-match", "if-none-match", "cache-control", "x-client-info", "x-upsert",
];
const GATEWAY_AUTH_CONTEXT = "ce-vault-data-gateway-v1";

function asRepositoryError(error, fallbackCode = "DATABASE_UNAVAILABLE") {
  const wrapped = new Error(error?.message || fallbackCode);
  wrapped.code = error?.code || fallbackCode;
  return wrapped;
}

function ensureData({ data, error }) {
  if (error) throw asRepositoryError(error);
  return data;
}

function derivedGatewayAuth(botToken) {
  return createHash("sha256").update(\`${'${GATEWAY_AUTH_CONTEXT}:${botToken}'}\`).digest("hex");
}

function createGatewayFetch({ supabaseUrl, gatewayUrl, gatewayAuth, anonKey }) {
  const supabaseOrigin = new URL(supabaseUrl).origin;
  return async (input, init) => {
    const request = new Request(input, init);
    const target = new URL(request.url);
    if (target.origin !== supabaseOrigin) throw new Error("Supabase gateway refused unexpected upstream origin");
    if (!target.pathname.startsWith("/rest/v1/") && !target.pathname.startsWith("/storage/v1/object/")) {
      throw new Error("Supabase gateway refused unsupported upstream path");
    }
    const headers = {};
    for (const key of GATEWAY_FORWARD_HEADERS) {
      const value = request.headers.get(key);
      if (value) headers[key] = value;
    }
    let bodyBase64 = null;
    if (request.method !== "GET" && request.method !== "HEAD") {
      const body = Buffer.from(await request.arrayBuffer());
      if (body.byteLength) bodyBase64 = body.toString("base64");
    }
    return fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: anonKey,
        authorization: \`Bearer ${'${anonKey}'}\`,
        "x-ce-gateway-auth": gatewayAuth,
      },
      body: JSON.stringify({
        method: request.method,
        path: \`${'${target.pathname}${target.search}'}\`,
        headers,
        bodyBase64,
      }),
      cache: "no-store",
    });
  };
}

function makeClient(url, serviceRoleKey) {
  const directKey = serviceRoleKey || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  if (url && directKey && process.env.SUPABASE_FORCE_GATEWAY !== "1") {
    return createClient(url, directKey, { auth: { autoRefreshToken: false, persistSession: false } });
  }

  const gatewayUrl = process.env.SUPABASE_GATEWAY_URL || "";
  const botToken = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
  const gatewayAuth = process.env.CE_DATA_GATEWAY_SECRET || (botToken ? derivedGatewayAuth(botToken) : "");
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !gatewayUrl || !gatewayAuth || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: createGatewayFetch({ supabaseUrl: url, gatewayUrl, gatewayAuth, anonKey }) },
  });
}

export function createWorkflowRepository({ url, serviceRoleKey }) {
  const db = makeClient(url, serviceRoleKey);
  if (!db) return null;

  return Object.freeze({
    async listJobs(limit = 25) {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
      return ensureData(await db.from("workflow_jobs").select("id,public_ref,state,state_version,transaction_type,amount,currency,worker,summary,created_at,updated_at,terminal_at,telegram_chat_id,telegram_message_id").order("updated_at", { ascending: false }).limit(safeLimit));
    },
    async getJob(id) {
      return ensureData(await db.from("workflow_jobs").select("id,public_ref,state,state_version,transaction_type,amount,currency,worker,summary,created_at,updated_at,terminal_at,telegram_chat_id,telegram_message_id,metadata").eq("id", id).maybeSingle());
    },
    async getJobEvents(jobId, limit = 50) {
      return ensureData(await db.from("job_events").select("event_id,event_type,from_state,to_state,command_code,actor_type,actor_id,request_id,payload,occurred_at").eq("job_id", jobId).order("occurred_at", { ascending: false }).limit(Math.max(1, Math.min(Number(limit) || 50, 100))));
    },
    async listActivity(limit = 50) {
      return ensureData(await db.from("job_events").select("event_id,job_id,event_type,from_state,to_state,command_code,actor_type,payload,occurred_at,workflow_jobs(public_ref,state,transaction_type,worker)").order("occurred_at", { ascending: false }).limit(Math.max(1, Math.min(Number(limit) || 50, 100))));
    },
    async createSandboxJob(input) {
      return ensureData(await db.rpc("create_sandbox_workflow_job", { p_transaction_type: input.transactionType, p_amount: input.amount ?? null, p_currency: input.currency || "THB", p_worker: input.worker || "INTAKE-01", p_summary: input.summary || "Sandbox job created", p_correlation_id: input.correlationId || null, p_metadata: input.metadata || {} }));
    },
    async transitionJob(input) {
      return ensureData(await db.rpc("transition_workflow_job", { p_job_id: input.jobId, p_expected_version: input.expectedVersion, p_to_state: input.toState, p_command_code: input.commandCode, p_idempotency_key: input.idempotencyKey, p_request_hash: input.requestHash, p_actor_type: input.actorType || "SYSTEM", p_actor_id: input.actorId || null, p_request_id: input.requestId || null, p_payload: input.payload || {} }));
    },
    async claimOutbox(limit = 25) {
      return ensureData(await db.rpc("claim_pending_outbox_messages", { p_limit: limit }));
    },
    async registerTelegramCard(jobId, chatId, messageId) {
      return ensureData(await db.from("workflow_jobs").update({ telegram_chat_id: chatId, telegram_message_id: messageId, updated_at: new Date().toISOString() }).eq("id", jobId).select("id,public_ref,state,state_version,transaction_type,amount,currency,worker,summary,created_at,updated_at,terminal_at,telegram_chat_id,telegram_message_id").single());
    },
    async insertCallbackTokens(tokens) {
      if (!tokens.length) return [];
      return ensureData(await db.from("telegram_callback_tokens").insert(tokens).select("reference"));
    },
    async claimCallback(reference, nonceHash, binding) {
      const data = ensureData(await db.rpc("claim_telegram_callback", { p_reference: reference, p_nonce_hash: nonceHash, p_binding_digest: binding }));
      return data[0] || null;
    },
    async claimTelegramUpdate(updateId) {
      const { error } = await db.from("telegram_updates").insert({ update_id: updateId });
      if (!error) return true;
      if (error.code === "23505") return false;
      throw asRepositoryError(error, "TELEGRAM_UPDATE_CLAIM_FAILED");
    },
    async recordCallbackRejected(jobId, payload) {
      return ensureData(await db.from("job_events").insert({ job_id: jobId, event_type: "job.callback_rejected.v1", actor_type: "TELEGRAM", payload }).select("event_id").single());
    },
  });
}
`);

  let indexSource = readFileSync(indexPath, 'utf8');
  indexSource = indexSource
    .replace(
      'const SUPABASE_URL = process.env.SUPABASE_URL || "https://iuaaviivkumvzbdmpzty.supabase.co";',
      'const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iuaaviivkumvzbdmpzty.supabase.co";',
    )
    .replace(
      'const telegram = createTelegramClient(process.env.TELEGRAM_BOT_TOKEN);',
      'const telegram = createTelegramClient(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN);',
    );
  writeFileSync(indexPath, indexSource);
}

run('tar', ['-xzf', archivePath, '-C', appPath], root);
applyRenderCompatibility();
run('npm', ['ci', '--no-audit', '--no-fund'], appPath);
run('npm', ['run', 'check'], appPath);
