# CE VAULT — Render Deployment Runbook

The deployment is a **single Next.js Node Web Service** backed by existing Firebase (Firestore + Storage). The Render Blueprint is `render.yaml`. It does **not** create a new PostgreSQL/Supabase database, process the `bot/` local bridge, or set Telegram webhook automatically.

## Preflight / migration
1. Revoke and rotate any credentials previously pasted into chat. Never use GitHub workflow_dispatch plaintext inputs for secrets.
2. Import [the Blueprint](https://dashboard.render.com/blueprint/new?repo=https://github.com/SHELBYY-21/CE-VAULT-Bot) only after `render.yaml` is merged into `main`.
3. Select the correct workspace. The Blueprint uses a free **staging** plan; free services may sleep and are not suitable as a reliable always-on Telegram production endpoint. Before cutover, select a non-sleeping plan and approve the resulting cost.
4. Supply each `sync: false` variable securely in Render Dashboard: `BOT_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `API_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `APP_URL` (the *actual* Render HTTPS origin), `ADMIN_TELEGRAM_IDS`, `NOTIFY_CHAT_ID`, and optionally `GROK_API_KEY` (if not using Vision).
5. During initial setup, Render may need `APP_URL` after it assigns the onrender.com host. Set it after creation and redeploy. Preserve the active Firebase project and data.
6. Verify the deployment and `GET /api/health` returns HTTP 200 with `db: ok`. Check Render deploy/runtime logs. Test `/ce` only after production webhook cutover.
7. **Cutover only after deployment is healthy**: stop/disable GitHub Actions `Bot 24h` scheduler and any other competing long-poll consumers. This workflow calls Telegram `deleteWebhook`, so enabling it after Render setup breaks webhook delivery. Do not drop pending updates.
8. Set Telegram webhook with the new bot token, HTTPS `https://<render-host>/api/telegram/webhook`, and `secret_token` matching `TELEGRAM_WEBHOOK_SECRET`; verify `getWebhookInfo`. Avoid printing any token or putting it in logs/committed URLs.
9. After the rollout is verified, change `autoDeployTrigger: off` to `checksPass` as an explicit follow-up. Keep a rollback path to the earlier deployment and a separate **Firestore data backup** (Git branches only back up source code).

## Build/runtime
- Build: `npm ci && npm run build`
- Start: `npm run start -- --hostname 0.0.0.0 --port $PORT`
- Health: `/api/health` (checks connectivity to Firebase)
- Node 22, Render Singapore
- `CE_MOTION_FX=0` for clean menu-first chat presentation.

Do not migrate to Supabase/Postgres by copying old connection strings; current production code uses Firebase. Do not start the dev long-poll bridge on Render.
