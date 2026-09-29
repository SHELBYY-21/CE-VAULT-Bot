# CE VAULT · Make Telegram reply live on Render

## Runtime contract
Render hosts one Next.js Web Service. Its `npm run start` launches `scripts/render-start.mjs`, which starts Next.js and, **only when CE_AUTO_WEBHOOK=1**, validates the configured bot through Telegram `getMe`, validates local webhook authentication, registers the HTTPS endpoint without dropping queued updates, verifies `getWebhookInfo`, and installs basic command labels. This process runs at runtime, never during `next build`. Logs show only validation status / numeric bot ID, never tokens.

The historical GitHub `Bot 24h` scheduled long-poll runner is retired; it must not delete the Render webhook or compete for updates. A job that was already running before retirement may need to finish or be manually cancelled.

## Required Render secrets / configuration
- `BOT_TOKEN`: **one** current Telegram token matching the intended numeric bot ID.
- `TELEGRAM_WEBHOOK_SECRET`: 1–256 chars, `A-Z a-z 0-9 _ -`; used in Telegram `secret_token`.
- `API_SECRET`: separate server-only key for authenticated API operations and optional manual webhook setup.
- `APP_URL=https://ce-vault-menu-first.onrender.com`
- `CE_AUTO_WEBHOOK=1` enables safe runtime registration.
- `CE_MOTION_FX=0` keeps the UI quiet.
- `ADMIN_TELEGRAM_IDS`, `NOTIFY_CHAT_ID` are Telegram numeric IDs.

**Until Firestore service-account credentials are independently validated**, set `CE_BOT_MENU_ONLY=1`: the bot replies to `/start`, `/ce`, `/menu`, `/help`, `/ping`, `/status`, `/id` and inline navigation, but blocks OCR, transaction recording and financial commands. It never fabricates balances. This is deliberately limited interaction, not finance production readiness.

For full transaction functionality, add a *fresh* `FIREBASE_SERVICE_ACCOUNT_JSON` securely to Render, verify `GET /api/health` returns `200` with `db: ok`, set `CE_BOT_MENU_ONLY=0` and redeploy. Bootstrap requires database health before setting the webhook when full mode is enabled. Do not post service-account credentials in GitHub commits or frontend code.

## Smoke test
1. Inspect the latest Render deploy logs for `[CE Bot] Token validated` and `[CE Bot] Render webhook active`. If it reports HTTP 401 on getMe, rotate/replace the single `BOT_TOKEN` — the previously shared alternate token names are not used automatically.
2. Open the intended Telegram bot. Send `/ping`, expect CE VAULT ONLINE and a reply from the bot.
3. Send `/ce`, expect one compact inline menu. Tap Help, Home and other actions; when Firebase is not ready, financial buttons must say unavailable rather than claim results.
4. Send `/id`, confirm chat/user IDs for access configuration.
5. Once Firebase is enabled, test read-only `/ledger` in a controlled group before **any** write or real slip. Check the actual Telegram pinned message separately.
6. On Render Free, idle suspension may delay incoming webhook delivery. Select a non-sleeping plan with approved cost before relying on the bot for timely production operations.

The manual `POST /api/telegram/set-webhook` requires `x-api-key: API_SECRET`. The old public GET with secret query string is disabled. Telegram updates are never intentionally discarded during activation.

**Safety:** `RECORDED` is not verified `SETTLED`. Financial calculations and existing Firestore ledger logic are not modified in this change.
