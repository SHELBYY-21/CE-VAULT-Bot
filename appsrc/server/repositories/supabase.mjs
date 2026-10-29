import { Buffer } from "node:buffer";
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
  return createHash("sha256").update(`${GATEWAY_AUTH_CONTEXT}:${botToken}`).digest("hex");
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
        authorization: `Bearer ${anonKey}`,
        "x-ce-gateway-auth": gatewayAuth,
      },
      body: JSON.stringify({
        method: request.method,
        path: `${target.pathname}${target.search}`,
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
    async gatekeeperGetLock() {
      return ensureData(await db.from("gatekeeper_locks")
        .select("locked,locked_by,locked_at")
        .eq("id", true)
        .maybeSingle());
    },
    async gatekeeperSetLock({ locked, by, at }) {
      return ensureData(await db.from("gatekeeper_locks")
        .upsert({ id: true, locked: Boolean(locked), locked_by: by ?? null, locked_at: at, reason: "telegram /gate lock" })
        .select("locked,locked_by,locked_at")
        .single());
    },
    async gatekeeperFindApproval(kind, target) {
      return ensureData(await db.from("gatekeeper_approvals")
        .select("id,kind,target,status")
        .eq("kind", kind)
        .eq("target", target)
        .in("status", ["EXECUTING", "EXECUTED"])
        .limit(1)
        .maybeSingle());
    },
    async gatekeeperStartApproval({ kind, target, approverId, commandText, at }) {
      // The partial unique index on (kind,target) is the hard idempotency guard.
      return ensureData(await db.from("gatekeeper_approvals")
        .insert({ kind, target, approver_telegram_id: approverId ?? null, command_text: commandText ?? null, requested_at: at, status: "EXECUTING" })
        .select("id")
        .single());
    },
    async gatekeeperFinalizeApproval(id, { status, result, detail, at }) {
      return ensureData(await db.from("gatekeeper_approvals")
        .update({ status, result: result ?? null, detail: detail ?? null, updated_at: at })
        .eq("id", id)
        .select("id,status")
        .single());
    },
    async gatekeeperRecordDecision({ state, decision, detail, at }) {
      return ensureData(await db.from("gatekeeper_approvals")
        .insert({
          kind: state?.kind ?? null,
          target: state?.target ?? null,
          approver_telegram_id: state?.approverId ?? null,
          command_text: state?.commandText ?? null,
          requested_at: at,
          status: decision,
          detail: detail ?? null,
        })
        .select("id")
        .single());
    },
    async getOperatorByTelegramId(telegramUserId) {
      return ensureData(await db.from("admins")
        .select("id,name,role,is_active")
        .eq("telegram_user_id", String(telegramUserId))
        .eq("is_active", true)
        .maybeSingle());
    },
    async getLatestDeskRate() {
      return ensureData(await db.from("rates")
        .select("sell_rate,created_at")
        .gt("sell_rate", 0)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle());
    },
    async insertDeskRate(adminId, sellRate, marketRate) {
      return ensureData(await db.from("rates")
        .insert({ sell_rate: sellRate, market_usdt_rate: marketRate, set_by_admin_id: adminId })
        .select("sell_rate,market_usdt_rate,created_at")
        .single());
    },
    async listPinnedBanksForDate(dateKey) {
      return ensureData(await db.from("bank_accounts")
        .select("id,label,bank_name,account_number,pinned_for_date")
        .eq("pinned_for_date", dateKey)
        .order("updated_at", { ascending: false })
        .limit(20));
    },
    async listBankAccountsForPin() {
      return ensureData(await db.from("bank_accounts")
        .select("id,label,bank_name,account_number,pinned_for_date")
        .order("updated_at", { ascending: false })
        .limit(50));
    },
    async pinBankForDate(id, dateKey) {
      return ensureData(await db.from("bank_accounts")
        .update({ pinned_for_date: dateKey, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id,label,bank_name,account_number,pinned_for_date")
        .single());
    },
    async unpinBankForDate(id, dateKey) {
      return ensureData(await db.from("bank_accounts")
        .update({ pinned_for_date: null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("pinned_for_date", dateKey)
        .select("id,label,bank_name,account_number,pinned_for_date")
        .maybeSingle());
    },
    async findIntakeDuplicate(fingerprint) {
      const pending = ensureData(await db.from("pending_slips")
        .select("id,ledger_ref,status,thb_in,should_send,desk_rate,mkt_rate,bank,account_masked,pin_match,tx_id,slip_fingerprint")
        .eq("slip_fingerprint", fingerprint)
        .limit(1)
        .maybeSingle());
      if (pending) return { source: "pending_slips", ...pending };
      const transaction = ensureData(await db.from("transactions")
        .select("id,ledger_ref,status,thb_amount,expected_usdt,slip_fingerprint")
        .eq("slip_fingerprint", fingerprint)
        .limit(1)
        .maybeSingle());
      return transaction ? { source: "transactions", ...transaction } : null;
    },
    async createPendingSlip(row) {
      const result = await db.from("pending_slips")
        .insert(row)
        .select("id,ledger_ref,status,thb_in,should_send,desk_rate,mkt_rate,bank,account_masked,pin_match,ocr_confidence,tx_id,slip_fingerprint,note")
        .single();
      if (!result.error) return { ...result.data, duplicate: false };
      if (result.error.code === "23505") {
        const existing = ensureData(await db.from("pending_slips")
          .select("id,ledger_ref,status,thb_in,should_send,desk_rate,mkt_rate,bank,account_masked,pin_match,ocr_confidence,tx_id,slip_fingerprint,note")
          .eq("slip_fingerprint", row.slip_fingerprint)
          .limit(1)
          .maybeSingle());
        if (existing) return { ...existing, duplicate: true };
      }
      throw asRepositoryError(result.error, "PENDING_SLIP_CREATE_FAILED");
    },
    async updatePendingSlip(id, patch) {
      return ensureData(await db.from("pending_slips")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id,ledger_ref,status,thb_in,should_send,desk_rate,mkt_rate,bank,account_masked,pin_match,ocr_confidence,tx_id,slip_fingerprint,note")
        .single());
    },
    async getPendingSlipForApproval(id) {
      return ensureData(await db.from("pending_slips")
        .select("id,chat_id,ledger_ref,status,thb_in,should_send,pin_match,tx_id")
        .eq("id", id)
        .maybeSingle());
    },
    async rejectVerifiedPendingSlip(id, chatId, telegramUserId) {
      const rows = ensureData(await db.from("pending_slips")
        .update({ status: "REJECTED", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("chat_id", chatId)
        .eq("status", "VERIFIED")
        .is("tx_id", null)
        .select("id"));
      return Array.isArray(rows) && rows.length === 1;
    },
    async promotePendingSlip(pendingId, adminId, roomName) {
      const data = ensureData(await db.rpc("ce_promote_pending_slip", {
        p_pending_id: pendingId,
        p_admin_id: adminId,
        p_room_name: roomName || null,
      }));
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.tx_id) throw asRepositoryError({ message: "PROMOTION_RETURNED_NO_TRANSACTION" }, "PROMOTION_FAILED");
      return row;
    },
    async listOpsTransactions(limit = 1000) {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 1000, 1000));
      return ensureData(await db.from("transactions")
        .select("type,status,thb_amount,expected_usdt,sent_usdt,delta_usdt,room_name,bank_match_result,is_stale_slip,is_reversed,ledger_ref,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(safeLimit));
    },
    async listOpsPendingSlips(limit = 100) {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 100));
      return ensureData(await db.from("pending_slips")
        .select("short_ref,ledger_ref,status,thb_in,should_send,desk_rate,mkt_rate,bank,account_masked,pin_match,ocr_confidence,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(safeLimit));
    },
    async listOpsRates() {
      return ensureData(await db.from("rates")
        .select("sell_rate,market_usdt_rate,created_at")
        .gt("sell_rate", 0)
        .order("created_at", { ascending: false })
        .limit(1));
    },
    async listOpsOpenCycles() {
      return ensureData(await db.from("vault_cycles")
        .select("cycle_number,status,limit_thb,created_at")
        .eq("status", "OPEN")
        .order("created_at", { ascending: false })
        .limit(1));
    },
    async listOpsBankAccounts() {
      return ensureData(await db.from("bank_accounts")
        .select("label,bank_name,account_number,current_balance")
        .order("updated_at", { ascending: false })
        .limit(100));
    },
    async listOpsOpenExceptions() {
      return ensureData(await db.from("settlement_exceptions")
        .select("status,exception_type,created_at")
        .eq("status", "OPEN")
        .order("created_at", { ascending: false })
        .limit(100));
    },
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
