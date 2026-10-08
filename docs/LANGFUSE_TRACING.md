# Langfuse Skill + Privacy-First Tracing (CE VAULT)

Status: **repository skill installed on feature branch; staging integration prepared; no cloud traces confirmed**. Nothing is deployed. The source has not shown an active LLM model call, so the initial real app span is a safe `dispatch-outbox` operational unit, **not** a fabricated LLM generation.

## Agent Skill

Official skill copied under `.agents/skills/langfuse/` from [langfuse/skills](https://github.com/langfuse/skills) (MIT license, license copied). For future upgrades run `npx skills add langfuse/skills --skill langfuse` on a development machine with approval, inspect upstream diffs, and apply as PR. Do not run arbitrary GitHub code on production.

## Staging-only setup

1. Use the existing [Langfuse Cloud EU](https://cloud.langfuse.com) project. **Rotate any secret key previously shared in a chat or issue:** create a replacement key in Project Settings > API Keys and revoke the former key. Never share the replacement key in a chat, PR, log, or repository. No Langfuse secret has been added to this code.
2. Use `observability/.env.staging.example` as a names-only template. Enter replacement values **server-side, in an isolated staging environment secret manager only**, not in `.env.staging.example`, GitHub Actions variables, or the production Render service:
   - `CE_LANGFUSE_TRACING_ENABLED=true`
   - `CE_LANGFUSE_ENV=staging`
   - `NODE_ENV=development` (tracer refuses `production`)
   - `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`
   - `LANGFUSE_BASE_URL=https://cloud.langfuse.com` (choose your project's actual region)
3. On a **staging-only runner** with no production Telegram token, Supabase service role key or payment access, install isolated dependencies: `npm install --prefix observability`. Do not commit `observability/node_modules`. Do not start the full CE VAULT application as a staging smoke because its boot process can register a Telegram webhook or start a real outbox dispatcher.
4. Run `node --test observability/langfuse.test.mjs` and existing build/test suite.
5. Run `node observability/smoke.mjs` in staging. This sends a synthetic `agent-task` observation without triggering Telegram or financial operations. Confirm one trace with only approved `workflow`, `result`, `environment` fields, then fetch and audit it against [best practices](https://langfuse.com/docs/observability/best-practices). A successful local command is not proof of remote receipt.
6. For real LLM calls, instrument the actual OpenAI/LangChain/Vercel AI SDK generation site when identified. Do not log raw prompts, bank data, Telegram chats, OCR contents, payment data, secrets, or internal chain-of-thought. Capture model and token usage only with a vetted SDK wrapper and redaction controls.

## Tracing contract

- One observation per unit: `dispatch-outbox`; result enumerated `ok` / `error`.
- Only manually created Langfuse spans exported; Express/DB/http SDK spans filtered.
- Strict input/output/metadata mask allowlists only safe enums; no user/session identifiers or payload values.
- Fail-open: if SDK or network unavailable, business workflows continue unchanged.
- Disabled unless explicitly enabled in staging; no production export even when keys are present.
- `shutdown()` flushes when the process exits.
- Review Cloud data residency, access, retention, budget and sensitive-data policy before any live enablement.

## Limitations

- Isolated npm dependencies must be installed in the staging runner; not bundled into the normal CE VAULT build. Root `package-lock.json` unchanged.
- A Langfuse Cloud EU endpoint and key pair were supplied in chat, but the secret must be rotated and the new pair stored in a staging-only secret manager. No hosting-side key was set, no key authentication or live tracing was performed, and no trace receipt is confirmed.
- Previous source is materialized from Manus archive at build time; this integration targets the stable `scripts/start.mjs` outbox dispatcher only.
