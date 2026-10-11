# CE VAULT — Agent Instructions (Menu-first)

Product: Thai-first Telegram finance operations bot. Next.js 16 webhook at `app/api/telegram/webhook/route.ts`; Firestore/Storage are the source of truth. `bot/` is a local bridge only.

## Invariants
1. `/ce`, `/start`, `/menu`, `/help` open one concise inline menu. Do not reset pending sessions when navigating.
2. Keep chat-specific settings isolated by Telegram `chat_id`. No placeholder financial data.
3. OCR/extracted data is not a confirmed receipt. A ledger write (`RECORDED`) is not reconciled settlement (`SETTLED`).
4. Never deduct an opening security deposit again per cycle. Snapshot exchange rates for transactions when implementing the new engine.
5. Bank `pinned_for_date` in existing app code is NOT proof of a native Telegram pinned message. Do not claim sync until events, permissions and reconciliation exist.
6. Never silently mutate balances, delete ledger rows, expose secrets, or deploy as part of a UI-only task.
7. Prefer one visible menu and inline callbacks over unsolicited stickers/status message floods. Do not change financial logic to satisfy a visual redesign.

## Agent Security v2
Execution is classified before work starts:

- **AUTO**: read-only inspection, including production board/display data; code edits on a branch; lint/typecheck/test/build; documentation; log analysis; dependency research; preview-safe verification; and pull-request creation.
- **APPROVAL**: production deployment, production environment-variable changes, database migrations, RLS/auth/permission changes, destructive database operations, DNS/domain changes, and major dependency upgrades with broad runtime impact.
- **BLOCK**: money or USDT transfer, wallet/private-key access, manual ledger/balance mutation, production secret export, audit-log disabling, force-push to `main`, or bypassing required security controls.

Production board access is AUTO when the context is genuinely read-only and has no mutation/signing capability. This includes display balances, ledger/transaction rows, account display metadata, exchange rates, and operational status. Do not treat read access as permission to call write endpoints, export secrets, or execute transactions.

Role boundaries:

- `DEV`: code, tests, build, PR only.
- `OPS`: logs, health, deployment status, diagnostics, and read-only production board inspection. Production mutation requires approval.
- `RESEARCH`: docs, APIs, libraries, MCP research. No production credentials.
- `FINANCE_ANALYST`: production board/ledger/transaction reads, calculations, reconciliation checks, anomaly detection, summaries. Read-only. Never executes transfers or ledger mutations.

When running Codex, Claude Code, or another coding agent on Linux, prefer Grith supervision with a workspace fence, for example `grith exec --workspace-only codex` or `grith exec --workspace-only claude`. Grith is an additional enforcement layer, not a replacement for containers/VMs, least-privilege credentials, database authorization, or human approval for high-risk actions.

Operational rules:

1. Work on a branch. Do not write directly to `main` for agent-authored changes.
2. Retry reversible failures at most 2 times. Then stop, report root cause, and preserve the last known-good state.
3. Do not read or copy production secrets unless the task explicitly requires a human-approved secret operation.
4. Do not give coding agents direct Telegram/email/webhook send capability. Return structured results to the orchestrator instead.
5. Production actions require one explicit approval after code, tests, rollback plan, and evidence are ready.
6. Every completion claim must include evidence: changed files, checks run, result, and any unverified live dependency.

Machine-readable policy: `ops/agent-control-policy.json`.
Detailed operating model: `docs/AGENT_SECURITY_V2.md`.

## Before merging
```bash
npm ci && npm run typecheck && npm run lint && npm test && npm run build
```
Run E2E when environment supports it. Inspect checks; distinguish CI from live Telegram integration testing. Production must use one update-consumption mode (webhook OR long-poll).

Backup baseline: `archive/pre-menu-first-20260929`. Legacy experiments remain in Git history and archive rather than being automatically merged.

## CE VAULT Agent Execution Contract (2026-10-10)
**Source of truth:** `ops/agent-control-policy.json` (draft until merged). Existing financial, auth, and production approval gates remain stricter where applicable.

- **Intent first:** distinguish questions, proposals and explicit execution. A question such as "ตัวนี้ดีไหม" does not authorize installation or writes.
- **Before action:** confirm repository, branch, workspace, permission scope, pre-existing changes, expected outcome and how completion will be verified. Choose the smallest reversible change; do not expand scope.
- **Autonomous branch work:** read project files, edit isolated non-protected `agent/` branches, perform safe sandbox checks and project-local dependency installs after license/install-script inspection, commit, push branch and open PR; never assume provider rights merely because this file grants task-level permission.
- **Approval before:** PR merge, default/protected push, release/deploy, destruction, production DB writes/migrations, security/permission changes, system-wide installs, paid services, external data/message sharing, major stack migrations, production env/secrets and externally sending automation activation.
- **Never delegate:** money/USDT transfer, wallet signing, ledger/balance mutation, production secret export, disabling audit controls, or approval bypass.
- **Run limits:** max 20 tool calls, max 2 retries per operation, max 15 minutes for an agent run; stop immediately on suspected secret exposure or when the limits cannot be met. Do not retry without new diagnostic evidence.
- **During work:** use small verifiable batches, record optional improvements separately, stop if another person's changes may be impacted. Do not auto-clean or reset a shared workspace. Roll back only changes introduced by this task.
- **Definition of done:** scope and requested outcome satisfied; review diff and possible secrets; run relevant tests; verify PR/commit when requested; label remaining live checks UNVERIFIED. Commit success is not production readiness.
- **Report:** Thai-first and brief. Clearly distinguish DONE / PROPOSED / NOT VERIFIED; include actual branch, changed files, tests, failures and real commit SHA/PR URL where available. Never fabricate evidence.

These rules guide human/agent decisions; they do not independently install a sandbox, grant scopes or enforce runtime quotas.
