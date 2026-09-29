# CE VAULT · ENV inventory (Menu-first)

Based on source-code and workflow references. This is **not** a confirmed list of GitHub Secrets already stored, which this connection cannot enumerate.

## Keep one value for each required runtime name
- `BOT_TOKEN`: only one rotated Telegram token; remove alternate variable names from CE VAULT environment.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: server-only Firestore credentials; managed `GOOGLE_APPLICATION_CREDENTIALS` is an alternative in supported hosts.
- `API_SECRET`: authenticated APIs; rotate exposed value.
- `TELEGRAM_WEBHOOK_SECRET`: configured Telegram webhook secret; match the secret sent to Telegram.
- `APP_URL`: actual deployed HTTPS origin.
- `ADMIN_TELEGRAM_IDS`: numeric administrator IDs.
- `NOTIFY_CHAT_ID`: read by current notifier; `OPS_CHAT_ID` is not read.
- `GROK_API_KEY`: primary vision OCR if enabled.

## Keep existing Firebase public app configuration
`NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET` are referenced by the existing Next.js/Firestore application. The public identifiers are not replacements for server-side credentials.

## Optional, only when needed
`OCR_AUTO_MIN` (defaults to 90), `OCR_SPACE_API_KEY` (implemented fallback), `GROK_MODEL`, `DEFAULT_MARKET_RATE`, `DEFAULT_SELL_RATE`, `DEFAULT_BANK_ACCOUNT_ID`, `FEE_WARNING_THRESHOLD`, `CIRCLE_API_KEY`, `ENTITY_SECRET`, `CE_MOTION_FX`. Emulator host variables are for local development only.

## Exclude from CE VAULT runtime
`Bot_token`, `TELEGRAM_bot_SECRET`, `OPS_CHAT_ID`, `TYPHOON_API_KEY`, `AKSONOCR_API_KEY`, `EASYSLIP_ACCESS_TOKEN`, `DASHBOARD_SESSION_SECRET`, `DASHBOARD_PIN`, `SESSION_SECRET`, `NEXT_PUBLIC_SUPABASE_URL1`, `POSTGRES_HOST`, `DIRECT_URL`, `postgresql`, `SUPABASE_DB_PASSWORD`, `Supabase`, `VITE_CLERK_PUBLISHABLE_KEY`, `Github_access_token`, `Github_access_token2`, `Vercel_key`, `V0_api_key`, `composio_api_key`, `grok_access_token`.

Do **not** delete credentials belonging to other products merely because CE VAULT does not use them. A placeholder like `CE_VAULT_PII_ENCRYPTION_KEY=random` is not a valid production encryption key.

## Important actions
1. Rotate credentials posted in a chat before putting replacements in a secret manager.
2. Compare names in [Repository Actions Secrets](https://github.com/SHELBYY-21/CE-VAULT-Bot/settings/secrets/actions) and the actual hosting environment; never commit real values.
3. Decide on one Telegram delivery mode: hosted webhook **or** the legacy scheduled `Bot 24h` long polling. The legacy workflow calls `deleteWebhook` and disrupts a hosted webhook. It also has plaintext `workflow_dispatch` credential inputs; do not use those fields for sensitive keys.
4. Confirm `getMe` and, for webhook mode, `getWebhookInfo` without exposing token text. Smoke-test `/ce` in a controlled chat.
5. Code backup `archive/pre-menu-first-20260929` is **not** a Firestore backup.
