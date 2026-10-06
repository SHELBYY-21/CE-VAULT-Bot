# CE VAULT · Telegram on Render

## Canonical production owner
Telegram delivery has one production owner: the CE VAULT Render runtime.

The production startup contract is defined by the root `package.json`:

1. `scripts/refresh-telegram-webhook.mjs`
2. `scripts/start.mjs`

Legacy GitHub long polling and the Netlify recovery workflow are permanently disabled and must not be restored as parallel Telegram consumers.

## Runtime webhook contract
At startup, `refresh-telegram-webhook.mjs` resolves `BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` from the runtime environment, with Supabase Vault fallback when configured. It re-registers the canonical webhook with Telegram using:

- the Render origin from `RENDER_EXTERNAL_URL`, with the repository Render URL as fallback
- `/api/telegram/webhook`
- `drop_pending_updates: false`
- allowed updates: `message`, `edited_message`, `callback_query`

Re-registering the same webhook is intentional because Telegram `getWebhookInfo` does not reveal the registered secret token. This synchronizes Telegram with the secret held by the current runtime without logging the secret.

After the server starts, `scripts/start.mjs` maintains the canonical webhook. It verifies the target with `getWebhookInfo`, retries with bounded backoff, and checks delivery state periodically.

## Safe diagnostics
Runtime diagnostics must use the sanitized webhook projection only. Logs may include:

- `pending_update_count`
- `ip_address`
- `last_error_date`
- `last_error_message`
- `last_synchronization_error_date`
- `max_connections`
- `allowed_updates`

Logs must not include the webhook URL, bot token, webhook secret, query-string secrets, or other credentials.

A nonzero pending count or delivery error is diagnostic evidence only. Production is considered healthy only after runtime evidence shows delivery is working and the queue is not accumulating.

## Required runtime configuration
Required values are server-side only:

- `BOT_TOKEN` or `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`

For Supabase Vault fallback, the runtime also requires a valid Supabase server-side URL and secret/service-role credential capable of calling `ce_secret_get`.

`RENDER_EXTERNAL_URL` should be supplied by Render and is the preferred source for the public origin.

Do not commit credential values to GitHub and do not print them in logs.

## Production verification
Before declaring Telegram healthy, verify all of the following:

1. Render is running the intended current commit.
2. Startup logs show the webhook secret refresh succeeded or an equivalent successful registration event.
3. Runtime logs show the canonical Render webhook was verified.
4. Sanitized `getWebhookInfo` diagnostics show no new delivery error.
5. `pending_update_count` reaches `0` or remains `0` after test traffic.
6. Send a safe Telegram command such as `/ping` and confirm a real reply through the production webhook.
7. Repeat diagnostics after the test to confirm the queue is still draining normally.

Build and unit-test success alone is not proof of production webhook health.

## Failure handling
If the webhook cannot be verified:

1. Keep `drop_pending_updates: false`.
2. Confirm the Render service is running the expected commit.
3. Confirm the required runtime credentials are present without printing their values.
4. Inspect only sanitized `getWebhookInfo` diagnostics.
5. Check the current `last_error_message` and HTTP behavior of `/api/telegram/webhook`.
6. Do not activate a second polling consumer or repoint Telegram to Netlify/Railway as an automatic fallback.

If recovery requires a different production host, treat that as an explicit migration with a single owner, not an additional fallback consumer.

## Safety boundary
Webhook health does not prove financial settlement health. Telegram transport, OCR, ledger recording, and settlement verification remain separate operational states.
