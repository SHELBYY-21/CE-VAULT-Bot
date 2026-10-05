# CE VAULT — Agent Instructions

Product: Thai-first finance operations system with a Vite frontend, Express runtime, Supabase persistence, and Telegram webhook operations.

## Canonical source

- `appsrc/` is the production application source of truth.
- `scripts/start.mjs` is the production runtime bootstrap and then launches `appsrc/server/index.mjs`.
- `.manus-source/parts/` is recovery history only. Do not regenerate `appsrc/` from it during normal coding or builds.
- `scripts/bootstrap.mjs` and `scripts/patch-*.mjs` are temporary migration/recovery tooling. Do not use them to overwrite canonical source changes.
- Production host is Render unless an explicit migration task says otherwise.
- Supabase is the canonical operational datastore for the current runtime.

## Invariants

1. OCR or extracted slip data is not a confirmed receipt. A recorded workflow event is not reconciled settlement.
2. Keep sandbox safety locked unless a task explicitly authorizes a reviewed production settlement change. `CE_VAULT_SANDBOX=true`, `LIVE_SETTLEMENT=false`, and `LIVE_SETTLEMENT_ENABLED=false` are the safe baseline.
3. Preserve idempotency, expected-version checks, signed Telegram callbacks, duplicate update protection, and the outbox delivery model.
4. Never silently mutate balances, delete financial records, expose secrets, or weaken webhook/callback verification.
5. Keep Telegram state isolated by chat/user binding where applicable. Do not introduce placeholder financial data into production flows.
6. Do not change financial logic to satisfy a visual redesign.
7. Production must have one canonical Telegram webhook target. Do not add a competing long-poll consumer.
8. Keep secrets in environment variables or Supabase Vault. Never commit service-role keys, bot tokens, callback secrets, or webhook secrets.
9. Runtime source and Git diff must stay aligned. Do not reintroduce build-time source rewriting as the normal deployment path.

## Before merging

From repository root:

```bash
npm ci
npm run build
```

`npm run build` installs locked `appsrc` dependencies and runs contract checks, tests, and the Vite production build.

When a change touches Telegram or Supabase integration, also verify the relevant live or staging boundary separately. CI success is not evidence that a real Telegram update or production Supabase write was exercised.

Backup baseline before the Manus migration remains `backup/pre-manus-2026-10-04`.
