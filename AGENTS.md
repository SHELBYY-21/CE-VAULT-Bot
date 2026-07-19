# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
Single product ("CE VAULT" — a USDT⇄THB arbitrage ledger). One Next.js 16 app at the
repo root hosts BOTH the realtime dashboard AND the Telegram bot (as an API webhook at
`app/api/telegram/webhook`). `bot/` is only an optional local dev bridge (long-poll →
local webhook) plus an API smoke test — it is NOT the production bot. Backing store is
Supabase (Postgres + Realtime + Storage). Setup steps are documented in `README.md` (Thai).

### Standard commands (see `package.json`)
- Dev server: `npm run dev` (Next.js on port 3000; `/` redirects to `/dashboard`).
- "Lint"/typecheck: `npm run typecheck` (`tsc --noEmit`). There is NO ESLint config and NO
  unit/integration test framework in this repo.
- Bot API smoke test (the only test harness): `cd bot && npm run test:api` — hits
  `/api/health`, `/api/transactions/thb-deposit`, `/api/transactions/usdt-send`. Requires the
  dev server running and `bot/.env` with `TEST_TELEGRAM_ID` set to an existing `admins` row.

### Running end-to-end requires a local Supabase (non-obvious)
The dashboard and all API routes need Supabase. There is no hosted project wired up, so run
Supabase locally with the Supabase CLI (`supabase start`), which needs Docker. Docker + the
Supabase CLI are NOT restored by the update script — start them yourself in the session:
- Start Docker daemon: `sudo dockerd` (daemon must use `fuse-overlayfs` + iptables-legacy in
  this VM; `/etc/docker/daemon.json` also sets `features.containerd-snapshotter=false` which is
  required for fuse-overlayfs on Docker 29).
- `supabase start` (config is committed at `supabase/config.toml`). Get keys/URL with
  `supabase status -o json` (use the legacy `ANON_KEY` / `SERVICE_ROLE_KEY` JWTs — the app
  reads `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`).

### Applying the schema — GOTCHA
`supabase/schema.sql` + `patch-v2..v8.sql` are meant to be pasted into the hosted SQL Editor. If
you instead apply them via `psql`/`docker exec` as the `postgres` role, the `anon`,
`authenticated`, `service_role` roles do NOT get table privileges automatically, so every query
fails with `permission denied for table ...`. After loading the SQL, run once:
```
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to anon, authenticated, service_role;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;
grant all privileges on all functions in schema public to anon, authenticated, service_role;
```
Then seed with `node scripts/setup-db.mjs` (reads `.env.local`; creates the `slips` bucket +
a seed admin with `telegram_user_id=6049267196` + a bank account) and verify with
`node scripts/verify-db.mjs`.

### Env files (gitignored — recreate each session)
- Root `.env.local`: at minimum `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (from `supabase status`), plus `APP_URL=http://localhost:3000`.
  Leave `API_SECRET` blank in dev to disable the `x-api-key` check on write API routes.
  `BOT_TOKEN` can be a placeholder unless testing real Telegram delivery.
- `bot/.env`: `API_BASE_URL=http://localhost:3000`, `TEST_TELEGRAM_ID=6049267196`,
  `API_SECRET` matching `.env.local`.

### API GOTCHA
`POST /api/transactions/thb-deposit` only validates `adminTelegramId` + `usdtAmount`, but the
profit calc needs `marketUsdtRate` (and `sellRate`) too. Calling it without `marketUsdtRate`
throws `null value in column "net_profit_thb"`. This is expected — the real Telegram/webhook
path fills rates automatically via `getLatestRates()`. When calling the route directly, pass
`marketUsdtRate` and `sellRate` (see `bot/src/test-api.ts` for a correct payload).

### External services
Market rate is fetched live from Binance TH (public, no key) and degrades to `rates` table /
ENV defaults if unreachable. OCR (Grok/OCR.space) and Circle on-chain are optional and no-op
without keys.
