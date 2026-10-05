# CE VAULT Agent Security v2

## Goal

Let agents complete reversible engineering and operations work with minimal human interruption while preventing silent production, financial, credential, and ledger changes.

## Control plane

```text
YOUNGBOSS
  -> ChatGPT / Telegram / YOUNGBOSS OS
  -> Orchestrator (Hermes or equivalent)
  -> Role-specific worker
  -> Grith on Linux for coding-agent supervision
  -> Isolated workspace / container / VM
  -> GitHub branch + CI + preview verification
  -> Approval gateway for high-risk production changes
  -> Production
```

Grith supervises coding-agent process trees on Linux. Use it as an extra OS-level boundary, not as a sandbox replacement. Keep the worker unprivileged, isolate it from production credentials, and prefer `--workspace-only`.

## Worker roles

### DEV
Allowed without approval:

- inspect repository and code
- edit files on a non-main branch
- run lint, typecheck, tests and builds
- create commits and pull requests
- diagnose failures and retry reversible fixes up to 3 times

Requires approval:

- merge/deploy when production impact exists
- production environment variables
- auth, RLS or database migrations

Never allowed:

- financial transfers
- wallet/private-key access
- direct production-secret export

### OPS
Allowed without approval:

- health checks
- read deployment status and logs
- inspect failures
- prepare rollback and remediation plans

Requires approval:

- production redeploy or rollback
- scaling/configuration changes
- domain/DNS mutation
- production secret or environment changes

### RESEARCH
Allowed without approval:

- documentation research
- API/library/MCP comparison
- implementation recommendations
- compatibility and security review

No production credentials or write access.

### FINANCE_ANALYST
Allowed without approval:

- THB/USDT calculations
- reconciliation checks
- anomaly/duplicate detection
- summaries and risk flags

Strictly read-only. It never transfers money, sends USDT, changes balances, deletes ledger rows, or signs transactions.

## Risk classes

### AUTO
Use for reversible or read-only work:

- source inspection
- branch code edits
- test/build/lint/typecheck
- docs
- read-only logs/status
- preview checks
- pull-request creation

### APPROVAL
Prepare fully, then ask once:

- production deployment
- database migration
- RLS/auth/permission changes
- production environment variables
- DNS/domain changes
- destructive production DB operations
- major dependency upgrades with wide runtime impact

Approval request must include:

1. intended action
2. evidence/checks passed
3. affected services/data
4. rollback plan
5. known uncertainty

### BLOCK
Never delegate to an autonomous worker:

- money/USDT transfer
- wallet signing/private keys
- manual ledger or balance mutation
- export of production secrets
- disabling audit/security controls
- force-push to main
- bypassing mandatory approval gates

## Grith usage

First-time Linux setup:

```bash
curl -fsSL https://grith.ai/install | sh
grith init
```

Supervised sessions:

```bash
grith exec --workspace-only codex
grith exec --workspace-only claude
```

Use the wrapper in this repository when available:

```bash
scripts/grith-agent.sh codex
scripts/grith-agent.sh claude
```

Important properties:

- fail closed if the matching local Grith daemon is unavailable
- workspace-only removes access outside the project/worktree scope
- queued operations need a human decision in interactive sessions
- non-interactive sessions should fail safe rather than silently allow ambiguous actions

## Communication boundary

Coding agents should not send Telegram, email, or arbitrary webhooks directly.

Preferred flow:

```text
Worker -> structured result -> Orchestrator -> Telegram/UI
```

This reduces exfiltration channels and keeps one auditable messaging authority.

## CE VAULT financial boundary

AI may calculate, compare, flag and recommend. Financial execution is outside the autonomous worker boundary.

```text
AI analysis
  -> proposed action
  -> human approval
  -> dedicated transaction authority
  -> execution
  -> audit log
```

## Failure recovery

For reversible failures:

1. diagnose
2. attempt a targeted fix
3. rerun verification
4. repeat up to 3 total attempts
5. stop and report root cause if still failing

Never use blind retry loops. Preserve successful work and the last known-good state.

## Completion evidence

An agent may say `DONE` only when it reports:

- branch/commit or PR
- files changed
- checks executed
- pass/fail result
- production state if verified
- remaining unverified external dependencies

A CI pass is not proof that Telegram, Supabase, Railway, Render, Vercel or any other live integration is healthy unless that live integration was checked directly.
