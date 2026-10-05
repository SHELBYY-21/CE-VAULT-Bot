import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/202610060002_g01_confirmed_snapshot_lifetime_guard.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

test("confirmed financial snapshot remains immutable after later status transitions", () => {
  assert.match(migration, /old\.confirmed_at is not null/i);
  assert.match(migration, /new\.confirmed_rate is distinct from old\.confirmed_rate/i);
  assert.match(migration, /new\.expected_usdt is distinct from old\.expected_usdt/i);
  assert.match(migration, /new\.rounding_policy_version is distinct from old\.rounding_policy_version/i);
  assert.match(migration, /CONFIRMED_FINANCIAL_SNAPSHOT_IMMUTABLE/i);
  assert.doesNotMatch(migration, /old\.status\s*=\s*'CONFIRMED'/i);
});
