# CE VAULT / YOUNGBOSS LIVE

Sandbox-only operator dashboard and workflow API for the frozen CE VAULT v1 contract.

## Run

```bash
npm install
npm run dev
```

The development server listens on `PORT` (default `3000`) and serves the dashboard, server-owned API, SSE activity stream, and Telegram adapter.

## Production runtime

The Docker runtime builds the dashboard and starts `node server/index.mjs`. The container health
path is `GET /api/v1/health`; it is unauthenticated and reports safe capability status only.
Telegram accepts both webhook paths:

- `/api/v1/telegram/webhook`
- `/api/telegram/webhook` (compatibility path for the currently registered bot webhook)

Runtime secrets are server-only: `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_CALLBACK_SECRET`, and the sandbox safety flags. No live
settlement/provider credentials are accepted by the application.

## Contract surface

- Exact 12 canonical states are defined once in `src/main.js`.
- Canonical flow is `SCAN → OCR → VERIFY → CONFIRM → PROCESS → SETTLEMENT → DONE`.
- Terminal records remain immutable in the UI model.
- `LIVE_SETTLEMENT_ENABLED` is hard-coded to `false`.
- Mobile layout activates at `<=767px`; the desktop layout remains a separate baseline.

## Checks

```bash
node scripts/check-contract.mjs
npm run build
```

For the sandbox integration checks:

```bash
npm run simulate:callback
npm run check
```
