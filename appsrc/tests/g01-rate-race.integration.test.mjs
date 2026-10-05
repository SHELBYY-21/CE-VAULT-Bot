import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  FinancialConflictError,
  createG01FinancialEngine,
} from "../server/financial/g01-rate-race.mjs";

const databaseUrl = process.env.G01_TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migration1 = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/202610060001_g01_rate_race_condition.sql"),
  "utf8",
);
const migration2 = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/202610060002_g01_confirmed_snapshot_lifetime_guard.sql"),
  "utf8",
);

let sql;
let engine;
let actorId;

function futureIso(ms = 60_000) {
  return new Date(Date.now() + ms).toISOString();
}

function pastIso(ms = 60_000) {
  return new Date(Date.now() - ms).toISOString();
}

async function expectCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => error instanceof FinancialConflictError && error.code === code,
  );
}

async function seedActor() {
  actorId = randomUUID();
  await sql`
    insert into public.admins (id, name, role, is_active)
    values (${actorId}::uuid, 'G01 Tester', 'admin', true)
  `;
}

async function seedCycle(status = "OPEN") {
  const id = randomUUID();
  await sql`
    insert into public.vault_cycles (id, cycle_number, status, limit_thb, created_by)
    values (${id}::uuid, 1, ${status}, 1000000::numeric, ${actorId}::uuid)
  `;
  return id;
}

async function seedTransaction(cycleId, status = "ocr_success", thbAmount = "10000.00") {
  const id = randomUUID();
  await sql`
    insert into public.transactions (
      id, admin_id, type, status, thb_amount, expected_usdt, confirmed_by, cycle_id
    ) values (
      ${id}::uuid, ${actorId}::uuid, 'THB_DEPOSIT', ${status}, ${thbAmount}::numeric,
      0::numeric, null, ${cycleId}::uuid
    )
  `;
  return id;
}

async function publish(cycleId, rateValue, expiresAt = futureIso()) {
  return engine.publishRateSnapshot({
    cycleId,
    actorId,
    currencyPair: "THB/USDT",
    rateValue,
    effectiveAt: pastIso(1000),
    expiresAt,
    requestId: `rate-${randomUUID()}`,
  });
}

async function quote(transactionId, expectedTransactionStatus = "ocr_success", quoteExpiresAt = futureIso()) {
  return engine.createOrRequote({
    transactionId,
    actorId,
    requestId: `quote-${randomUUID()}`,
    quoteExpiresAt,
    expectedTransactionStatus,
  });
}

async function confirm(transactionId, quoteId, idempotencyKey = `confirm-${randomUUID()}`) {
  return engine.confirmTransaction({
    transactionId,
    quoteId,
    idempotencyKey,
    actorId,
    requestId: `request-${randomUUID()}`,
  });
}

before(async () => {
  if (!enabled) return;
  sql = postgres(databaseUrl, { max: 10, prepare: false });

  await sql.unsafe(`
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role; exception when duplicate_object then null; end $$;

    drop extension if exists pgcrypto cascade;
    drop schema if exists public cascade;
    create schema public;
    grant all on schema public to postgres;
    grant usage on schema public to anon, authenticated, service_role;
    create extension pgcrypto with schema public;

    create table public.admins (
      id uuid primary key,
      name text not null,
      role text,
      is_active boolean default true
    );

    create table public.vault_cycles (
      id uuid primary key,
      cycle_number integer not null,
      status text not null default 'OPEN',
      limit_thb numeric not null,
      created_by uuid,
      created_at timestamptz not null default now(),
      closed_by uuid,
      closed_at timestamptz,
      new_cycle_request_id text
    );

    create table public.transactions (
      id uuid primary key,
      admin_id uuid not null references public.admins(id),
      type text not null,
      status text default 'ocr_success',
      thb_amount numeric not null default 0,
      expected_usdt numeric not null default 0,
      confirmed_by uuid references public.admins(id),
      cycle_id uuid references public.vault_cycles(id),
      updated_at timestamptz not null default now()
    );

    create table public.audit_logs (
      id uuid primary key default gen_random_uuid(),
      operator_id uuid,
      action text not null,
      transaction_id uuid,
      cycle_id uuid,
      previous_status text,
      new_status text,
      request_id text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      entity_type text,
      entity_id text,
      actor_type text,
      actor_id text,
      outcome text,
      idempotency_key text,
      previous_state jsonb,
      next_state jsonb
    );
  `);

  await sql.unsafe(migration1);
  await sql.unsafe(migration2);

  engine = createG01FinancialEngine({
    databaseUrl,
    allowedPublishRoles: ["admin"],
    allowedQuoteRoles: ["admin"],
    allowedConfirmRoles: ["admin"],
    roundingPolicy: { version: "USDT-v1", scale: 6, mode: "HALF_UP" },
    sqlOptions: { max: 10 },
  });
});

beforeEach(async () => {
  if (!enabled) return;
  await sql.unsafe(`
    truncate table public.transaction_rate_quotes,
      public.transactions,
      public.rate_snapshots,
      public.vault_cycles,
      public.audit_logs,
      public.admins restart identity cascade;
  `);
  await seedActor();
});

after(async () => {
  if (engine) await engine.close();
  if (sql) await sql.end({ timeout: 5 });
});

test("integration: rate changes during OCR, quote binds only the explicit current snapshot", { skip: !enabled }, async () => {
  const cycleId = await seedCycle();
  const transactionId = await seedTransaction(cycleId);
  const first = await publish(cycleId, "34.50");
  const second = await publish(cycleId, "34.75");
  const createdQuote = await quote(transactionId);

  assert.notEqual(createdQuote.rate_snapshot_id, first.id);
  assert.equal(createdQuote.rate_snapshot_id, second.id);
  assert.equal(String(createdQuote.rate_value), "34.750000000000");

  const history = await sql`
    select id, status from public.rate_snapshots
    where cycle_id = ${cycleId}::uuid
    order by version
  `;
  assert.deepEqual(history.map((row) => row.status), ["SUPERSEDED", "ACTIVE"]);
});

test("integration: rate changes while operator quote is open -> REQUOTE_REQUIRED and old quote history survives", { skip: !enabled }, async () => {
  const cycleId = await seedCycle();
  const transactionId = await seedTransaction(cycleId);
  await publish(cycleId, "34.50");
  const oldQuote = await quote(transactionId);
  await publish(cycleId, "34.80");

  await expectCode(confirm(transactionId, oldQuote.id), "REQUOTE_REQUIRED");

  const requoted = await quote(transactionId, "QUOTED");
  assert.notEqual(requoted.id, oldQuote.id);
  const history = await sql`
    select id, status from public.transaction_rate_quotes
    where transaction_id = ${transactionId}::uuid
    order by created_at, id
  `;
  assert.deepEqual(history.map((row) => row.status), ["SUPERSEDED", "ACTIVE"]);

  const audit = await sql`
    select action from public.audit_logs
    where transaction_id = ${transactionId}::uuid
    order by created_at, id
  `;
  assert.ok(audit.some((row) => row.action === "TRANSACTION_REQUOTED"));
});

test("integration: rate expires before confirm -> QUOTE_EXPIRED", { skip: !enabled }, async () => {
  const cycleId = await seedCycle();
  const transactionId = await seedTransaction(cycleId);
  await publish(cycleId, "34.50", futureIso(5000));
  const createdQuote = await quote(transactionId, "ocr_success", futureIso(1000));
  await sql`select pg_sleep(1.15)`;

  await expectCode(confirm(transactionId, createdQuote.id), "QUOTE_EXPIRED");
});

test("integration: two concurrent confirm requests with different keys produce one success and one conflict", { skip: !enabled }, async () => {
  const cycleId = await seedCycle();
  const transactionId = await seedTransaction(cycleId);
  await publish(cycleId, "34.50");
  const createdQuote = await quote(transactionId);

  const outcomes = await Promise.allSettled([
    confirm(transactionId, createdQuote.id, `A-${randomUUID()}`),
    confirm(transactionId, createdQuote.id, `B-${randomUUID()}`),
  ]);

  const fulfilled = outcomes.filter((item) => item.status === "fulfilled");
  const rejected = outcomes.filter((item) => item.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, "CONFIRMATION_CONFLICT");

  const rows = await sql`
    select count(*)::int as count from public.audit_logs
    where transaction_id = ${transactionId}::uuid
      and action = 'TRANSACTION_CONFIRMED_WITH_RATE_SNAPSHOT'
  `;
  assert.equal(rows[0].count, 1);
});

test("integration: retrying the same idempotency key returns the original confirmed result", { skip: !enabled }, async () => {
  const cycleId = await seedCycle();
  const transactionId = await seedTransaction(cycleId);
  await publish(cycleId, "34.50");
  const createdQuote = await quote(transactionId);
  const key = `same-${randomUUID()}`;

  const first = await confirm(transactionId, createdQuote.id, key);
  const replay = await confirm(transactionId, createdQuote.id, key);

  assert.equal(first.transaction_id, replay.transaction_id);
  assert.equal(first.confirmation_idempotency_key, key);
  assert.equal(replay.confirmation_idempotency_key, key);
  assert.equal(replay.idempotent_replay, true);

  const rows = await sql`
    select count(*)::int as count from public.audit_logs
    where transaction_id = ${transactionId}::uuid
      and action = 'TRANSACTION_CONFIRMED_WITH_RATE_SNAPSHOT'
  `;
  assert.equal(rows[0].count, 1);
});

test("integration: cycle close holding the row lock wins over confirm -> CYCLE_NOT_OPEN", { skip: !enabled }, async () => {
  const cycleId = await seedCycle();
  const transactionId = await seedTransaction(cycleId);
  await publish(cycleId, "34.50");
  const createdQuote = await quote(transactionId);

  let releaseClose;
  let lockedResolve;
  const locked = new Promise((resolve) => { lockedResolve = resolve; });
  const release = new Promise((resolve) => { releaseClose = resolve; });

  const closer = sql.begin("isolation level serializable read write", async (tx) => {
    await tx`select id from public.vault_cycles where id = ${cycleId}::uuid for update`;
    await tx`update public.vault_cycles set status = 'CLOSED', closed_at = now() where id = ${cycleId}::uuid`;
    lockedResolve();
    await release;
  });

  await locked;
  const confirmation = confirm(transactionId, createdQuote.id, `close-race-${randomUUID()}`);
  releaseClose();
  await closer;
  await expectCode(confirmation, "CYCLE_NOT_OPEN");
});

test("integration: direct confirmed rate mutation is blocked for life, even after status advances", { skip: !enabled }, async () => {
  const cycleId = await seedCycle();
  const transactionId = await seedTransaction(cycleId);
  await publish(cycleId, "34.50");
  const createdQuote = await quote(transactionId);
  await confirm(transactionId, createdQuote.id, `immutable-${randomUUID()}`);

  await assert.rejects(
    sql`update public.transactions set confirmed_rate = 99::numeric where id = ${transactionId}::uuid`,
    (error) => error.code === "23514" && /CONFIRMED_FINANCIAL_SNAPSHOT_IMMUTABLE/.test(error.message),
  );

  await sql`update public.transactions set status = 'SETTLED' where id = ${transactionId}::uuid`;

  await assert.rejects(
    sql`update public.transactions set expected_usdt = 1::numeric where id = ${transactionId}::uuid`,
    (error) => error.code === "23514" && /CONFIRMED_FINANCIAL_SNAPSHOT_IMMUTABLE/.test(error.message),
  );
});
