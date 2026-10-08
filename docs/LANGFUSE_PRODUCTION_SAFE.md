# Langfuse Production — bounded operational spans

**Change type:** additive only. Does not modify CE VAULT financial logic, Telegram webhook configuration, ledger, database, routes, or client/UI. Uses Node built-in `fetch` and `node:crypto` (no added dependencies).

## What is captured
- `start-ce-runtime` emitted when the server process is spawned (does not claim that health is green).
- `dispatch-ce-outbox` emitted on success/failure of existing delivery processing. No identifiers, request payloads, messages, account information, amounts, errors, or tool arguments.
- Static `environment=production`, `operation`, `result=ok|error` only.
- Rate-limited once per operation every 5 minutes; at most 2 in flight; requests time out at 2.5 seconds.
- Entirely **non-blocking**: does not wait for telemetry before completing real operations. Never retries business work due to telemetry.

**These are operational traces, not model/generation traces.** The current accessible source does not expose a confirmed LLM call site, so model, token and generation details are **not** claimed.

## Environment (Render backend only)
Add all of the following in Render's private environment/secret manager, **merge** rather than replace:
```
CE_LANGFUSE_TRACING_ENABLED=true
CE_LANGFUSE_ENV=production
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_PUBLIC_KEY=<private key from Langfuse project>
LANGFUSE_SECRET_KEY=<private key from Langfuse project>
```
`NODE_ENV=production` must be set in runtime (typically Render Node environment). Do not set browser `VITE_*` variables for the key. These are the **only** new secrets. Rotate any Langfuse key previously pasted into a chat and update Render securely.

## Rollback
1. Set `CE_LANGFUSE_TRACING_ENABLED=false` in Render (no data/backend/business-logic changes). This disables all future exports on restart.
2. If startup or delivery behaviour regresses, redeploy last known-good Render commit without telemetry using normal Render rollback. Confirm public health and webhook counters before resuming.
3. Do not force-push, reset the ledger, alter database RLS, or clear pending Telegram updates.

## Validation
```
node --test observability/production-otel.test.mjs
npm run build
```
For production, confirm (a) deploy live, (b) public `/api/v1/health` remains responsive, (c) a `start-ce-runtime` trace appears in Langfuse in `production` environment, and (d) no PII in the observation input/output. The external health monitor remains separate in private `ce-ai-tools-lab`.

Official guidance: https://langfuse.com/docs/observability/best-practices
