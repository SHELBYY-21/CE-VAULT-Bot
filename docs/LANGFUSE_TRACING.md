# Langfuse Skill + Privacy-First Tracing (CE VAULT)

Status: **repository skill installed on feature branch; staging integration prepared; no cloud traces confirmed**. Nothing is deployed. The source has not shown an active LLM model call, so the initial real app span is a safe `dispatch-outbox` operational unit, **not** a fabricated LLM generation.

## Agent Skill

Official skill copied under `.agents/skills/langfuse/` from [langfuse/skills](https://github.com/langfuse/skills) (MIT license, license copied). For future upgrades run `npx skills add langfuse/skills --skill langfuse` on a development machine with approval, inspect upstream diffs, and apply as PR. Do not run arbitrary GitHub code on production.

## Staging-only setup

1. Create a [Langfuse Cloud](https://cloud.langfuse.com) free project for staging data, then get project API Keys from Settings (never paste into GitHub or chat).
2. Use private staging environment variables **server-side only**:
   - `CE_LANGFUSE_TRACING_ENABLED=true`
   - `CE_LANGFUSE_ENV=staging`
   - `NODE_ENV=development` (tracer refuses `production`)
   - `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`
   - `LANGFUSE_BASE_URL=https://cloud.langfuse.com` (choose your project's actual region)
3. On a **staging workspace**, install isolated dependencies: `npm install --prefix observability`. Do not commit `observability/node_modules`.
4. Run `node --test observability/langfuse.test.mjs` and existing build/test suite.
5. Execute one **synthetic** outbox event through staging (not a real financial event), check that one trace has root `dispatch-outbox` with only `workflow`, `result`, `environment`. Fetch the trace in Langfuse and compare with [best practices](https://langfuse.com/docs/observability/best-practices).
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
- No evidence of a Langfuse account/API keys or live traces, so cannot claim end-to-end tracing yet.
- Previous source is materialized from Manus archive at build time; this integration targets the stable `scripts/start.mjs` outbox dispatcher only.
