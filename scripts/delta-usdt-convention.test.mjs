import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Canonical convention (docs/settlement-delta-convention.md, issue #127):
//   delta_usdt = expected_usdt - sent_usdt  →  positive = USDT still owed (DUE).
// These tests pin the convention at the source level. No database required.

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const promoteSql = read('../supabase/20261006_live_intake.sql');
const opsBoard = read('../scripts/patch-ops-board.mjs');
const supabaseDir = join(new URL('../supabase', import.meta.url).pathname);

test('writer: ce_promote_pending_slip records positive-owed delta at record time', () => {
  // sent_usdt = 0 and delta_usdt = v_expected together encode: delta = expected - sent
  assert.match(promoteSql, /sent_usdt\s*=\s*0,/);
  assert.match(promoteSql, /delta_usdt\s*=\s*v_expected,/);
});

test('writer: no supabase file writes delta_usdt with the opposite (sent - expected) formula', () => {
  const files = readdirSync(supabaseDir).filter((f) => f.endsWith('.sql'));
  for (const f of files) {
    const sql = readFileSync(join(supabaseDir, f), 'utf8');
    // direct opposite-sign assignment (sent - expected) must never appear
    assert.doesNotMatch(sql, /delta_usdt\s*=\s*[^\n]*sent[^\n]*-[^\n]*expected/i, f);
  }
});

test('reader: ops board renders delta_usdt directly as DUE without negation', () => {
  assert.match(opsBoard, /delta_usdt:\s*String\(row\.delta_usdt/);
  // no negation/remapping layer is allowed between the column and the board
  assert.doesNotMatch(opsBoard, /-\s*row\.delta_usdt/);
  assert.doesNotMatch(opsBoard, /sent[^\n]*-[^\n]*expected/i);
});

test('typescript: no conflicting deltaUsdt consumer exists in src/', () => {
  const files = readdirSync(join(new URL('../src', import.meta.url).pathname), { recursive: true })
    .filter((f) => String(f).endsWith('.ts') && !String(f).endsWith('.d.ts'));
  for (const f of files) {
    const src = readFileSync(join(new URL('../src', import.meta.url).pathname, String(f)), 'utf8');
    // any JS-side delta recomputation must use the canonical formula, not sent - expected
    assert.doesNotMatch(src, /deltaUsdt\s*=\s*[^\n]*sent[^\n]*-[\s\S]{0,40}expected/i, f);
  }
});
