import Decimal from "decimal.js";
import postgres from "postgres";

const SERIALIZATION_SQLSTATE = "40001";
const MAX_SERIALIZATION_RETRIES = 3;
const RETRY_BASE_MS = 25;
const RETRY_JITTER_MS = 20;

export class FinancialConflictError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "FinancialConflictError";
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new FinancialConflictError(code, message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nonEmpty(value, code) {
  const text = String(value ?? "").trim();
  if (!text) fail(code);
  return text;
}

function decimalValue(value, code, { positive = false } = {}) {
  const text = nonEmpty(value, code);
  let parsed;
  try {
    parsed = new Decimal(text);
  } catch {
    fail(code);
  }
  if (!parsed.isFinite()) fail(code);
  if (positive && !parsed.gt(0)) fail(code);
  return parsed;
}

const ROUNDING_MODES = Object.freeze({
  DOWN: Decimal.ROUND_DOWN,
  HALF_UP: Decimal.ROUND_HALF_UP,
  HALF_EVEN: Decimal.ROUND_HALF_EVEN,
});

export function createRoundingPolicy({ version, scale, mode }) {
  const policyVersion = nonEmpty(version, "ROUNDING_POLICY_VERSION_REQUIRED");
  const decimalPlaces = typeof scale === "number" ? scale : Number.parseInt(String(scale ?? ""), 10);
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 12) {
    fail("ROUNDING_POLICY_SCALE_INVALID");
  }
  const normalizedMode = nonEmpty(mode, "ROUNDING_POLICY_MODE_REQUIRED").toUpperCase();
  const decimalMode = ROUNDING_MODES[normalizedMode];
  if (decimalMode == null) fail("ROUNDING_POLICY_MODE_INVALID");
  return Object.freeze({ version: policyVersion, scale: decimalPlaces, mode: normalizedMode, decimalMode });
}

export function calculateExpectedUsdt(thbAmount, rateValue, policy) {
  const thb = decimalValue(thbAmount, "THB_AMOUNT_INVALID", { positive: true });
  const rate = decimalValue(rateValue, "RATE_VALUE_INVALID", { positive: true });
  return thb.div(rate).toDecimalPlaces(policy.scale, policy.decimalMode).toFixed(policy.scale);
}

export async function withSerializableRetry(beginTransaction, work, options = {}) {
  const maxRetries = options.maxRetries ?? MAX_SERIALIZATION_RETRIES;
  const random = options.random ?? Math.random;
  const wait = options.wait ?? sleep;
  let retries = 0;

  while (true) {
    try {
      return await beginTransaction(work);
    } catch (error) {
      if (error?.code !== SERIALIZATION_SQLSTATE || retries >= maxRetries) throw error;
      const backoff = RETRY_BASE_MS * (2 ** retries);
      const jitter = Math.floor(random() * RETRY_JITTER_MS);
      retries += 1;
      await wait(backoff + jitter);
    }
  }
}

function normalizeRoles(value, code) {
  const roles = Array.isArray(value) ? value : String(value ?? "").split(",");
  const normalized = roles.map((role) => String(role).trim().toLowerCase()).filter(Boolean);
  if (!normalized.length) fail(code);
  return new Set(normalized);
}

async function assertActorCapability(tx, actorId, allowedRoles, capability) {
  const id = nonEmpty(actorId, "ACTOR_ID_REQUIRED");
  const rows = await tx`
    select id, role, is_active
    from public.admins
    where id = ${id}::uuid
    for share
  `;
  const actor = rows[0];
  if (!actor || actor.is_active !== true) fail("ACTOR_NOT_AUTHORIZED");
  if (!allowedRoles.has(String(actor.role ?? "").trim().toLowerCase())) {
    fail("ACTOR_CAPABILITY_DENIED", capability);
  }
  return actor;
}

function confirmedResult(row, replay = false) {
  return Object.freeze({
    transaction_id: row.id,
    status: row.status,
    rate_snapshot_id: row.rate_snapshot_id,
    rate_version: row.rate_version,
    confirmed_rate: row.confirmed_rate == null ? null : String(row.confirmed_rate),
    expected_usdt: row.expected_usdt == null ? null : String(row.expected_usdt),
    rounding_policy_version: row.rounding_policy_version,
    confirmed_at: row.confirmed_at,
    confirmation_idempotency_key: row.confirmation_idempotency_key,
    confirmed_quote_id: row.confirmed_quote_id,
    idempotent_replay: replay,
  });
}

function json(value) {
  return JSON.stringify(value);
}

export function createG01FinancialEngine({
  databaseUrl,
  allowedPublishRoles,
  allowedQuoteRoles,
  allowedConfirmRoles,
  roundingPolicy,
  sqlOptions = {},
}) {
  const connectionString = nonEmpty(databaseUrl, "DATABASE_URL_REQUIRED");
  const publishRoles = normalizeRoles(allowedPublishRoles, "RATE_PUBLISH_ROLES_REQUIRED");
  const quoteRoles = normalizeRoles(allowedQuoteRoles, "RATE_QUOTE_ROLES_REQUIRED");
  const confirmRoles = normalizeRoles(allowedConfirmRoles, "RATE_CONFIRM_ROLES_REQUIRED");
  const policy = createRoundingPolicy(roundingPolicy);
  const sql = postgres(connectionString, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ...sqlOptions,
  });

  const beginSerializable = (work) => sql.begin("isolation level serializable read write", work);

  async function publishRateSnapshot(input) {
    const cycleId = nonEmpty(input.cycleId, "CYCLE_ID_REQUIRED");
    const actorId = nonEmpty(input.actorId, "ACTOR_ID_REQUIRED");
    const currencyPair = nonEmpty(input.currencyPair, "CURRENCY_PAIR_REQUIRED");
    const requestId = nonEmpty(input.requestId, "REQUEST_ID_REQUIRED");
    const rate = decimalValue(input.rateValue, "RATE_VALUE_INVALID", { positive: true }).toFixed(12);
    const effectiveAt = nonEmpty(input.effectiveAt, "RATE_EFFECTIVE_AT_REQUIRED");
    const expiresAt = nonEmpty(input.expiresAt, "RATE_EXPIRES_AT_REQUIRED");

    return withSerializableRetry(beginSerializable, async (tx) => {
      await assertActorCapability(tx, actorId, publishRoles, "rate.publish");

      const [cycle] = await tx`
        select id, status
        from public.vault_cycles
        where id = ${cycleId}::uuid
        for update
      `;
      if (!cycle) fail("CYCLE_NOT_FOUND");
      if (cycle.status !== "OPEN") fail("CYCLE_NOT_OPEN");

      const active = await tx`
        select id, version, status
        from public.rate_snapshots
        where cycle_id = ${cycleId}::uuid and status = 'ACTIVE'
        for update
      `;

      if (active[0]) {
        await tx`
          update public.rate_snapshots
          set status = 'SUPERSEDED', superseded_at = now()
          where id = ${active[0].id}::uuid and status = 'ACTIVE'
        `;
      }

      const inserted = await tx`
        insert into public.rate_snapshots (
          cycle_id, currency_pair, rate_value, status,
          effective_at, expires_at, created_by
        ) values (
          ${cycleId}::uuid, ${currencyPair}, ${rate}::numeric, 'ACTIVE',
          ${effectiveAt}::timestamptz, ${expiresAt}::timestamptz, ${actorId}::uuid
        )
        returning id, cycle_id, version, currency_pair, rate_value, status,
                  effective_at, expires_at, created_by, created_at
      `;
      const snapshot = inserted[0];

      await tx`
        insert into public.audit_logs (
          operator_id, action, cycle_id, request_id, metadata,
          entity_type, entity_id, actor_type, actor_id, outcome
        ) values (
          ${actorId}::uuid, 'RATE_SNAPSHOT_PUBLISHED', ${cycleId}::uuid, ${requestId},
          ${json({
            new_rate_snapshot_id: snapshot.id,
            new_rate_version: snapshot.version,
            superseded_rate_snapshot_id: active[0]?.id ?? null,
          })}::jsonb,
          'rate_snapshot', ${String(snapshot.id)}, 'OPERATOR', ${actorId}, 'SUCCESS'
        )
      `;

      return { ...snapshot, rate_value: String(snapshot.rate_value) };
    });
  }

  async function createOrRequote(input) {
    const transactionId = nonEmpty(input.transactionId, "TRANSACTION_ID_REQUIRED");
    const actorId = nonEmpty(input.actorId, "ACTOR_ID_REQUIRED");
    const requestId = nonEmpty(input.requestId, "REQUEST_ID_REQUIRED");
    const quoteExpiresAt = nonEmpty(input.quoteExpiresAt, "QUOTE_EXPIRES_AT_REQUIRED");
    const expectedStatus = nonEmpty(input.expectedTransactionStatus, "EXPECTED_TRANSACTION_STATUS_REQUIRED");

    return withSerializableRetry(beginSerializable, async (tx) => {
      const [transaction] = await tx`
        select id, status, cycle_id, thb_amount, confirmation_idempotency_key
        from public.transactions
        where id = ${transactionId}::uuid
        for update
      `;
      if (!transaction) fail("TRANSACTION_NOT_FOUND");
      if (transaction.confirmation_idempotency_key) fail("TRANSACTION_ALREADY_CONFIRMED");
      if (transaction.status !== expectedStatus) fail("TRANSACTION_STATE_CONFLICT");

      await assertActorCapability(tx, actorId, quoteRoles, "rate.quote");

      const [cycle] = await tx`
        select id, status
        from public.vault_cycles
        where id = ${transaction.cycle_id}::uuid
        for update
      `;
      if (!cycle) fail("CYCLE_NOT_FOUND");
      if (cycle.status !== "OPEN") fail("CYCLE_NOT_OPEN");

      const [rate] = await tx`
        select id, cycle_id, version, currency_pair, rate_value, status,
               effective_at, expires_at,
               (now() >= effective_at and now() < expires_at) as in_window
        from public.rate_snapshots
        where cycle_id = ${cycle.id}::uuid and status = 'ACTIVE'
        for update
      `;
      if (!rate) fail("REQUOTE_REQUIRED");
      if (rate.status !== "ACTIVE" || rate.in_window !== true) fail("QUOTE_EXPIRED");

      const [window] = await tx`
        select (${quoteExpiresAt}::timestamptz > now()) as after_now,
               (${quoteExpiresAt}::timestamptz <= ${rate.expires_at}::timestamptz) as before_rate_expiry
      `;
      if (!window?.after_now || !window?.before_rate_expiry) fail("QUOTE_EXPIRY_INVALID");

      const expectedUsdt = calculateExpectedUsdt(String(transaction.thb_amount), String(rate.rate_value), policy);

      const oldQuotes = await tx`
        select id
        from public.transaction_rate_quotes
        where transaction_id = ${transaction.id}::uuid and status = 'ACTIVE'
        for update
      `;
      if (oldQuotes.length) {
        await tx`
          update public.transaction_rate_quotes
          set status = 'SUPERSEDED', superseded_at = now()
          where transaction_id = ${transaction.id}::uuid and status = 'ACTIVE'
        `;
      }

      const inserted = await tx`
        insert into public.transaction_rate_quotes (
          transaction_id, cycle_id, rate_snapshot_id, rate_version, rate_value,
          expected_usdt, rounding_policy_version, status,
          effective_at, expires_at, created_by
        ) values (
          ${transaction.id}::uuid, ${cycle.id}::uuid, ${rate.id}::uuid, ${rate.version}, ${String(rate.rate_value)}::numeric,
          ${expectedUsdt}::numeric, ${policy.version}, 'ACTIVE',
          now(), ${quoteExpiresAt}::timestamptz, ${actorId}::uuid
        )
        returning id, transaction_id, cycle_id, rate_snapshot_id, rate_version,
                  rate_value, expected_usdt, rounding_policy_version, status,
                  effective_at, expires_at, created_at
      `;
      const quote = inserted[0];

      const updated = await tx`
        update public.transactions
        set status = 'QUOTED', updated_at = now()
        where id = ${transaction.id}::uuid and status = ${expectedStatus}
        returning id
      `;
      if (updated.length !== 1) fail("TRANSACTION_STATE_CONFLICT");

      await tx`
        insert into public.audit_logs (
          operator_id, action, transaction_id, cycle_id,
          previous_status, new_status, request_id, metadata,
          entity_type, entity_id, actor_type, actor_id, outcome
        ) values (
          ${actorId}::uuid,
          ${oldQuotes.length ? "TRANSACTION_REQUOTED" : "TRANSACTION_QUOTED"},
          ${transaction.id}::uuid, ${cycle.id}::uuid,
          ${transaction.status}, 'QUOTED', ${requestId},
          ${json({
            quote_id: quote.id,
            rate_snapshot_id: quote.rate_snapshot_id,
            rate_version: quote.rate_version,
            rounding_policy_version: policy.version,
            superseded_quote_ids: oldQuotes.map((item) => item.id),
          })}::jsonb,
          'transaction_quote', ${String(quote.id)}, 'OPERATOR', ${actorId}, 'SUCCESS'
        )
      `;

      return { ...quote, rate_value: String(quote.rate_value), expected_usdt: String(quote.expected_usdt) };
    });
  }

  async function confirmTransaction(input) {
    const transactionId = nonEmpty(input.transactionId, "TRANSACTION_ID_REQUIRED");
    const quoteId = nonEmpty(input.quoteId, "QUOTE_ID_REQUIRED");
    const idempotencyKey = nonEmpty(input.idempotencyKey, "IDEMPOTENCY_KEY_REQUIRED");
    const actorId = nonEmpty(input.actorId, "ACTOR_ID_REQUIRED");
    const requestId = nonEmpty(input.requestId, "REQUEST_ID_REQUIRED");

    return withSerializableRetry(beginSerializable, async (tx) => {
      const [transaction] = await tx`
        select id, status, cycle_id, thb_amount,
               rate_snapshot_id, rate_version, confirmed_rate, expected_usdt,
               rounding_policy_version, confirmed_at,
               confirmation_idempotency_key, confirmed_quote_id
        from public.transactions
        where id = ${transactionId}::uuid
        for update
      `;
      if (!transaction) fail("TRANSACTION_NOT_FOUND");

      if (transaction.confirmation_idempotency_key === idempotencyKey) {
        return confirmedResult(transaction, true);
      }
      if (transaction.confirmation_idempotency_key) fail("CONFIRMATION_CONFLICT");

      await assertActorCapability(tx, actorId, confirmRoles, "rate.confirm");

      const [cycle] = await tx`
        select id, status
        from public.vault_cycles
        where id = ${transaction.cycle_id}::uuid
        for update
      `;
      if (!cycle) fail("CYCLE_NOT_FOUND");
      if (cycle.status !== "OPEN") fail("CYCLE_NOT_OPEN");

      const rows = await tx`
        select
          q.id as quote_id,
          q.transaction_id,
          q.cycle_id as quote_cycle_id,
          q.rate_snapshot_id,
          q.rate_version as quote_rate_version,
          q.rate_value as quote_rate_value,
          q.expected_usdt as quote_expected_usdt,
          q.rounding_policy_version as quote_rounding_policy_version,
          q.status as quote_status,
          q.effective_at as quote_effective_at,
          q.expires_at as quote_expires_at,
          r.cycle_id as rate_cycle_id,
          r.version as rate_version,
          r.rate_value,
          r.status as rate_status,
          r.effective_at as rate_effective_at,
          r.expires_at as rate_expires_at,
          (now() >= q.effective_at and now() < q.expires_at) as quote_in_window,
          (now() >= r.effective_at and now() < r.expires_at) as rate_in_window
        from public.transaction_rate_quotes q
        join public.rate_snapshots r on r.id = q.rate_snapshot_id
        where q.id = ${quoteId}::uuid
        for update of q, r
      `;
      const selected = rows[0];
      if (!selected || selected.transaction_id !== transaction.id) fail("REQUOTE_REQUIRED");
      if (selected.quote_cycle_id !== cycle.id || selected.rate_cycle_id !== cycle.id) fail("REQUOTE_REQUIRED");
      if (selected.quote_status !== "ACTIVE") fail("REQUOTE_REQUIRED");
      if (selected.rate_status !== "ACTIVE") fail("REQUOTE_REQUIRED");
      if (!selected.quote_in_window || !selected.rate_in_window) fail("QUOTE_EXPIRED");
      if (String(selected.quote_rate_version) !== String(selected.rate_version)) fail("REQUOTE_REQUIRED");
      if (!new Decimal(String(selected.quote_rate_value)).eq(String(selected.rate_value))) fail("REQUOTE_REQUIRED");
      if (selected.quote_rounding_policy_version !== policy.version) fail("REQUOTE_REQUIRED");

      const expectedUsdt = calculateExpectedUsdt(String(transaction.thb_amount), String(selected.rate_value), policy);
      if (!new Decimal(expectedUsdt).eq(String(selected.quote_expected_usdt))) fail("REQUOTE_REQUIRED");

      const updatedRows = await tx`
        update public.transactions
        set status = 'CONFIRMED',
            rate_snapshot_id = ${selected.rate_snapshot_id}::uuid,
            rate_version = ${selected.rate_version},
            confirmed_rate = ${String(selected.rate_value)}::numeric,
            expected_usdt = ${expectedUsdt}::numeric,
            rounding_policy_version = ${policy.version},
            confirmed_at = now(),
            confirmation_idempotency_key = ${idempotencyKey},
            confirmed_quote_id = ${selected.quote_id}::uuid,
            confirmed_by = ${actorId}::uuid,
            updated_at = now()
        where id = ${transaction.id}::uuid
          and status in ('QUOTED','AWAITING_CONFIRMATION')
          and confirmation_idempotency_key is null
        returning id, status, rate_snapshot_id, rate_version, confirmed_rate,
                  expected_usdt, rounding_policy_version, confirmed_at,
                  confirmation_idempotency_key, confirmed_quote_id
      `;
      if (updatedRows.length !== 1) fail("CONFIRMATION_CONFLICT");
      const confirmed = updatedRows[0];

      const quoteUpdated = await tx`
        update public.transaction_rate_quotes
        set status = 'CONFIRMED', confirmed_at = ${confirmed.confirmed_at}::timestamptz
        where id = ${selected.quote_id}::uuid and status = 'ACTIVE'
        returning id
      `;
      if (quoteUpdated.length !== 1) fail("REQUOTE_REQUIRED");

      await tx`
        insert into public.audit_logs (
          operator_id, action, transaction_id, cycle_id,
          previous_status, new_status, request_id, metadata,
          entity_type, entity_id, actor_type, actor_id, outcome,
          idempotency_key, previous_state, next_state
        ) values (
          ${actorId}::uuid, 'TRANSACTION_CONFIRMED_WITH_RATE_SNAPSHOT',
          ${transaction.id}::uuid, ${cycle.id}::uuid,
          ${transaction.status}, 'CONFIRMED', ${requestId},
          ${json({
            quote_id: selected.quote_id,
            rate_snapshot_id: selected.rate_snapshot_id,
            rate_version: selected.rate_version,
            rounding_policy_version: policy.version,
          })}::jsonb,
          'transaction', ${String(transaction.id)}, 'OPERATOR', ${actorId}, 'SUCCESS',
          ${idempotencyKey},
          ${json({ status: transaction.status })}::jsonb,
          ${json({
            status: "CONFIRMED",
            rate_snapshot_id: selected.rate_snapshot_id,
            rate_version: selected.rate_version,
            confirmed_rate: String(selected.rate_value),
            expected_usdt: expectedUsdt,
            rounding_policy_version: policy.version,
          })}::jsonb
        )
      `;

      return confirmedResult(confirmed, false);
    });
  }

  return Object.freeze({
    policy,
    publishRateSnapshot,
    createOrRequote,
    confirmTransaction,
    async close() {
      await sql.end({ timeout: 5 });
    },
  });
}

export function g01ConfigFromEnv(env = process.env) {
  return {
    databaseUrl: env.DATABASE_URL,
    allowedPublishRoles: env.CE_RATE_PUBLISH_ROLES,
    allowedQuoteRoles: env.CE_RATE_QUOTE_ROLES,
    allowedConfirmRoles: env.CE_RATE_CONFIRM_ROLES,
    roundingPolicy: {
      version: env.CE_ROUNDING_POLICY_VERSION,
      scale: env.CE_USDT_DECIMAL_PLACES,
      mode: env.CE_USDT_ROUNDING_MODE,
    },
  };
}
