# Telegram webhook 503 incident — 2026-10-06

## Status

Open. Production dashboard and health endpoints are online, but Telegram deliveries to the Railway compatibility webhook are returning HTTP 503.

## Evidence

- Railway `CE-VAULT-Bot` is online and `/api/v1/health` returns HTTP 200.
- Telegram delivered repeated `POST /api/telegram/webhook` requests to Railway and received HTTP 503 before PR #95 was merged.
- Runtime logs on Railway report `sandbox safety=disabled`.
- The generated runtime rejects the Telegram webhook with HTTP 503 when repository, Telegram configuration, or sandbox safety is not ready.
- Render `ce-vault-menu-first` booted with `sandbox safety=locked` and verified the canonical webhook successfully.
- Render showed no request traffic during the later interval when Telegram deliveries were landing on Railway.
- `scripts/start.mjs` chooses its webhook target from `RENDER_EXTERNAL_URL` and logs `Canonical Render webhook verified` without proving the receiver is ready first.

## Root cause

Webhook ownership/readiness mismatch. Railway can register a target while its own Telegram receiver is not eligible to process updates. The platform-specific `RENDER_EXTERNAL_URL` variable is also present on Railway, so the target can be ambiguous while logs still label it as Render.

## Immediate recovery

Stage Railway `RENDER_EXTERNAL_URL=https://ce-vault-menu-first.onrender.com`, then deploy only after explicit approval. Keep pending Telegram updates and do not use `drop_pending_updates=true`.

## Follow-up hardening

1. Probe the receiver with the configured Telegram webhook secret before any `setWebhook` call and require HTTP 200.
2. Gate automatic webhook mutation behind an explicit enable flag.
3. Prefer one explicit canonical origin variable instead of a platform-named variable.
4. Log the canonical host, not the full URL or any secret.
5. Verify `getWebhookInfo`, pending-update drain, and 5xx rate after cutover.

## Safety boundary

Do not change the live Telegram webhook target until the staged Railway change is approved and the Render receiver is confirmed healthy.
