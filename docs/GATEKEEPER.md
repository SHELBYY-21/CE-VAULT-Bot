# GATEKEEPER — CE VAULT Approval Gate (MVP)

> Module spec of the Empire Command Architecture. The GATEKEEPER converts a human Telegram command into a real action **plus an audit record**, and nothing else. It lives inside the CE VAULT runtime (`appsrc/server/gatekeeper.mjs`), not as a new service.

## Commands

The runtime already routes `/approve` to the slip-approval flow, so the gate lives under the **`/gate` namespace** — the two approval surfaces can never collide.

| Command | Meaning | Who |
|---|---|---|
| `/gate approve <PR>` (also `/gate <PR>`, `/gate #PR`) | Merge a pull request into `main` via GitHub API | Allowlisted approver only |
| `/gate approve migration <id>` (also `/gate migration <id>`) | Approve a DB migration (executor: later phase) | Allowlisted approver only |
| `/gate approve settle <id>` (also `/gate settle <id>`) | Approve a settlement run (executor: later phase) | Allowlisted approver only |
| `/gate lock` | Refuse all approvals (e.g. during a large settle) | Allowlisted approver only |
| `/gate unlock` | Re-allow approvals | Allowlisted approver only |
| `/gate status` (or bare `/gate`) | Show lock state | Anyone (read-only) |

## Security invariants (enforced in code, tests in `appsrc/tests/gatekeeper.test.mjs`)

1. **Audit before action.** An approval record is inserted into Supabase *before* the GitHub merge runs. If the audit write fails, the action is refused (`AUDIT_UNAVAILABLE`). No action without a record — ever.
2. **One approval per target.** `(kind, target)` is idempotent. A second `/approve` for the same PR is refused (`ALREADY_APPROVED`); the merge can never run twice.
3. **Allowlist only.** Approver identity = Telegram user ID matched against `CE_GATEKEEPER_TELEGRAM_IDS` (comma-separated). Anyone else: refused + audited (`DENIED_NOT_AUTHORIZED`).
4. **Lock blocks everything** except `/gatestatus` and `/unlock`.
5. **Failure is terminal.** A failed merge is recorded `FAILED` and never auto-retried.
6. **Inert by default.** With `CE_GATEKEEPER_TELEGRAM_IDS` unset the module refuses everything (`GATEKEEPER_DISABLED`) — safe to deploy before configuring.
7. **No money movement.** `settle`/`migration` executors are out of MVP scope; attempts are audited then refused (`NOT_IMPLEMENTED`). GATEKEEPER itself never moves money.

## Environment variables

All three can be set in Render **or** in the Supabase Vault (`ce_secret_get`); `scripts/start.mjs` loads them into the runtime env when unset.

| Var | Purpose |
|---|---|
| `CE_GATEKEEPER_TELEGRAM_IDS` | Comma-separated Telegram user IDs allowed to approve / lock / unlock |
| `GATEKEEPER_GITHUB_TOKEN` | Token used by the merge adapter (fine-grained, PR merge scope only) |
| `GATEKEEPER_REPO` | Repository slug for merges (default `SHELBYY-21/CE-VAULT-Bot`) |

The gate stays inert (`GATEKEEPER_DISABLED`) until `CE_GATEKEEPER_TELEGRAM_IDS` is present, and the merge adapter refuses to act without `GATEKEEPER_GITHUB_TOKEN` — every refusal is still audited.

## Supabase audit schema

`supabase/migrations/20261028000000_gatekeeper_approvals.sql` (shipped as a file; applying it goes through the migration approval gate itself — it is **not** applied by this PR).

- `gatekeeper_approvals` — one row per approval attempt: `kind`, `target`, `approver_telegram_id`, `command_text`, `requested_at`, `status` (`EXECUTING` → `EXECUTED`/`FAILED`; also `DENIED_NOT_AUTHORIZED`, `REJECTED_UNRECOGNIZED`, `REJECTED_NOT_IMPLEMENTED`), `result`, `detail`. Partial unique index enforces one active/completed approval per `(kind, target)`.
- `gatekeeper_locks` — singleton row holding the lock state, who set it, and when.

## Repository adapter contract (Phase 2 wiring)

The runtime must supply adapters to `createGatekeeper({ repository, github, clock, log })`:

```text
repository.getLock()                                  -> { locked, locked_by, locked_at }
repository.setLock({ locked, by, at })
repository.findApproval(kind, target)                 -> { id, status } | null
repository.startApproval({ kind, target, approverId, commandText, at }) -> approvalId
repository.finalizeApproval(approvalId, { status, result?, detail?, at })
repository.recordDecision({ state, decision, detail, at })   // best-effort audit trail
github.mergePullRequest(prNumber)                     -> result
```

## Phasing

- **Phase 1 (merged, PR #182):** module skeleton + full test coverage + audit schema file + this spec.
- **Phase 2 (this PR):** runtime wiring — `/gate` route in the Telegram command router, Supabase audit adapters on the repository, GitHub merge adapter, vault loading in `start.mjs`, runtime tests. Zero behavior until env vars are configured; the audit tables are not applied yet, so the gate fails closed (`AUDIT_UNAVAILABLE`) even if the allowlist is set.
- **Phase 3:** migration + settle executors, each behind its own `/gate approve` form; every action still audited before execution.

**Deployment order rule:** the gate system must be used on its own first PR — Phase 1 — before it is allowed to gate anything else.
