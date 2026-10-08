# CE Settlement `delta_usdt` Convention (canonical)

> Canonical answer to issue #127. This file is the single source of truth for the sign convention of `delta_usdt`.

## Decision

```
delta_usdt = expected_usdt − sent_usdt
```

**Positive = USDT still owed to the customer (DUE).**

| Case | expected | sent | delta_usdt | Meaning |
|---|---|---|---|---|
| Just recorded (unpaid) | 36.850746 | 0 | **+36.850746** | DUE 36.85 |
| Partial send | 36.850746 | 10.000000 | **+26.850746** | remaining DUE |
| Exact settle | 36.850746 | 36.850746 | **0** | settled |
| Over-send | 36.850746 | 40.000000 | **−3.149254** | credit owed to desk |

## Why this direction (and not `sent − expected`)

- It matches the deployed production SQL (`ce_promote_pending_slip`) and **every historical row already written**. The opposite convention would require migrating production settlement history, which issue #127 explicitly forbids.
- Positive-is-owed reads naturally on the ops board: the DUE column is the raw `delta_usdt`, no negation layer.
- Monotonic: the number decreases toward zero as USDT is sent. Zero means settled. Negative means overpaid.

## Consumer inventory (2026-10-08, verified by code search)

- Writer (exactly one): `supabase/20261006_live_intake.sql` — `ce_promote_pending_slip` sets `sent_usdt = 0`, `delta_usdt = v_expected` at record time.
- Reader (exactly one): `scripts/patch-ops-board.mjs` — renders `delta_usdt` directly as the DUE column.
- TypeScript consumers: **none** found (`deltaUsdt` / `delta_usdt` absent from `src/`).

## Rules for future code

1. Any settlement / completion code MUST compute owed amount as `expected_usdt − sent_usdt` and write it to `delta_usdt` — never `sent − expected`.
2. `scripts/delta-usdt-convention.test.mjs` (build-gated) fails the build if a second writer appears with a conflicting formula, or if the ops board starts negating `delta_usdt`.
3. The settlement RPC (DUE engine, still to come) must include deterministic cases for: unpaid, partial send, exact match, over-send — before `live_settlement_enabled` can be turned on.

## Out of scope (unchanged by this decision)

- No modification to production settlement or historical records (per issue #127 constraints).
- No behavioral change: this PR only adds documentation + a source-invariant test.
