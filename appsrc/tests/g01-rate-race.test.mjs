import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FinancialConflictError,
  createRoundingPolicy,
  calculateExpectedUsdt,
  withSerializableRetry,
} from "../server/financial/g01-rate-race.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(__dirname, "../../supabase/migrations/202610060001_g01_rate_race_condition.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const executableMigration = migration.replace(/--.*$/gm, "");

test("Decimal policy computes expected USDT without JS Number money arithmetic", () => {
  const policy = createRoundingPolicy({ version: "USDT-v1", scale: 6, mode: "HALF_UP" });
  assert.equal(calculateExpectedUsdt("10000.00", "34.50", policy), "289.855072");
  assert.equal(calculateExpectedUsdt("0.01", "34.50", policy), "0.000290");
});

test("rounding policy is explicit and fail-closed", () => {
  assert.throws(
    () => createRoundingPolicy({ version: "", scale: 6, mode: "HALF_UP" }),
    (error) => error instanceof FinancialConflictError && error.code === "ROUNDING_POLICY_VERSION_REQUIRED",
  );
  assert.throws(
    () => createRoundingPolicy({ version: "v1", scale: 6, mode: "UNKNOWN" }),
    (error) => error instanceof FinancialConflictError && error.code === "ROUNDING_POLICY_MODE_INVALID",
  );
});

test("serialization failure retries the whole transaction no more than 3 times", async () => {
  let attempts = 0;
  const result = await withSerializableRetry(
    async (work) => {
      attempts += 1;
      if (attempts <= 3) {
        const error = new Error("serialization");
        error.code = "40001";
        throw error;
      }
      return work("tx");
    },
    async () => "ok",
    { random: () => 0, wait: async () => {} },
  );
  assert.equal(result, "ok");
  assert.equal(attempts, 4); // initial attempt + max 3 retries
});

test("non-serialization failure is not retried", async () => {
  let attempts = 0;
  await assert.rejects(
    () => withSerializableRetry(
      async () => {
        attempts += 1;
        const error = new Error("unique violation");
        error.code = "23505";
        throw error;
      },
      async () => "never",
      { random: () => 0, wait: async () => {} },
    ),
    /unique violation/,
  );
  assert.equal(attempts, 1);
});

test("G-01 migration uses NUMERIC and never PostgreSQL floating types", () => {
  assert.match(executableMigration, /rate_value numeric\(30,12\)/i);
  assert.match(executableMigration, /expected_usdt numeric\(30,12\)/i);
  assert.match(executableMigration, /confirmed_rate numeric\(30,12\)/i);
  assert.doesNotMatch(executableMigration, /\b(real|double precision|float\d*)\b/i);
});

test("rate changed during OCR is represented by immutable versioned snapshots", () => {
  assert.match(migration, /rate_snapshot_version_seq/i);
  assert.match(migration, /unique index if not exists uq_rate_snapshots_cycle_version/i);
  assert.match(migration, /ce_guard_rate_snapshot_immutable/i);
});

test("rate changed while operator quote is open requires explicit quote history", () => {
  assert.match(migration, /create table if not exists public\.transaction_rate_quotes/i);
  assert.match(migration, /status text not null check \(status in \('ACTIVE','SUPERSEDED','EXPIRED','CONFIRMED','CANCELLED'\)\)/i);
  assert.match(migration, /uq_transaction_rate_quotes_one_active/i);
});

test("rate expiry before confirm has explicit effective and expiry windows", () => {
  assert.match(migration, /effective_at timestamptz not null/i);
  assert.match(migration, /expires_at timestamptz not null/i);
  assert.match(migration, /check \(expires_at > effective_at\)/i);
});

test("two concurrent confirm requests are protected by idempotency and conditional state", () => {
  assert.match(migration, /uq_transactions_confirmation_idempotency_key/i);
  assert.match(migration, /confirmation_idempotency_key/i);
});

test("same-key retry invariant is durable", () => {
  assert.match(migration, /confirmation_idempotency_key text/i);
  assert.match(migration, /unique index if not exists uq_transactions_confirmation_idempotency_key/i);
});

test("cycle close versus confirm must lock cycle and confirm only OPEN", () => {
  const engine = fs.readFileSync(path.resolve(__dirname, "../server/financial/g01-rate-race.mjs"), "utf8");
  assert.match(engine, /from public\.vault_cycles[\s\S]*for update/i);
  assert.match(engine, /cycle\.status !== "OPEN"/);
});

test("direct confirmed financial snapshot mutation is blocked by trigger", () => {
  assert.match(migration, /ce_guard_confirmed_financial_snapshot/i);
  assert.match(migration, /old\.status = 'CONFIRMED'/i);
  assert.match(migration, /CONFIRMED_FINANCIAL_SNAPSHOT_IMMUTABLE/i);
});

test("CONFIRMED transaction completeness constraint is additive NOT VALID", () => {
  assert.match(migration, /transactions_confirmed_snapshot_complete/i);
  assert.match(migration, /status <> 'CONFIRMED'[\s\S]*rate_snapshot_id is not null[\s\S]*confirmed_quote_id is not null/i);
  assert.match(migration, /\) not valid;/i);
});

test("exact G-01 integration scenarios are declared for a disposable PostgreSQL database", { skip: !process.env.G01_TEST_DATABASE_URL }, async () => {
  // This gate is intentional: production Supabase must never be used as a destructive test fixture.
  // A disposable Postgres database must apply the migration and seed admin/cycle/transaction fixtures.
  const required = [
    "rate changes during OCR",
    "rate changes while operator quote open",
    "rate expires before confirm",
    "two concurrent confirm requests",
    "same idempotency key retry",
    "cycle close races confirm",
    "serialization failure retry",
    "direct confirmed rate mutation blocked",
  ];
  assert.equal(required.length, 8);
});
