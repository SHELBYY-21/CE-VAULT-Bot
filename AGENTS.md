# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
Single product ("CE VAULT" — a USDT⇄THB arbitrage ledger). One Next.js 16 app at the
repo root hosts BOTH the realtime dashboard AND the Telegram bot (as an API webhook at
`app/api/telegram/webhook`). `bot/` is only an optional local dev bridge (long-poll →
local webhook) plus an API smoke test — it is NOT the production bot. Backing store is
**Firebase** (Cloud Firestore + Storage). Local dev uses the Firebase Emulator Suite
(`demo-ce-vault`). Legacy SQL under `supabase/` is historical only and not used at runtime.

### Standard commands (see `package.json`)
- Firebase emulators: `npm run emulators` (Firestore `:8080`, Storage `:9199`, UI `:4000`).
- Seed / verify: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run db:setup` then `npm run db:verify`.
- Dev server: `npm run dev` (Next.js on port 3000; `/` redirects to `/dashboard`).
  Requires emulator env vars from `.env.local` (see below).
- Typecheck: `npm run typecheck` (`tsc --noEmit`).
- Lint: `npm run lint` (ESLint 9 flat config). Keep ESLint pinned to v9.
- Format: `npm run format` / `npm run format:check` (Prettier).
- Unit tests: `npm test` (Vitest) — pure logic in `src/lib/{profit,fees,amounts}.ts`.
- CI: `.github/workflows/ci.yml` runs typecheck + lint + test + build.
- Bot API smoke test: `cd bot && npm run test:api` — needs dev server + seed admin
  `telegram_user_id=6049267196`.
- Bot webhook can be exercised by POSTing simulated Telegram update JSON to
  `/api/telegram/webhook` (secret check skipped when `API_SECRET` /
  `TELEGRAM_WEBHOOK_SECRET` are unset).

### Running end-to-end (Firebase Emulator)
1. `npm run emulators`
2. Ensure `.env.local` has emulator hosts + `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=1`
   (copy from `.env.local.example`).
3. `npm run db:setup` then `npm run db:verify`
4. `npm run dev` → open the app root (port 3000); `/` redirects to `/dashboard`

### Production Firebase
- Create a Firebase project, enable Firestore + Storage.
- Deploy rules: `firestore.rules`, `storage.rules`, indexes in `firestore.indexes.json`.
- Set web config `NEXT_PUBLIC_FIREBASE_*` and server `FIREBASE_SERVICE_ACCOUNT_JSON`
  (stringified service account). Remove `FIRESTORE_EMULATOR_HOST` /
  `FIREBASE_STORAGE_EMULATOR_HOST` / `NEXT_PUBLIC_USE_FIREBASE_EMULATOR`.

### Env files (gitignored — recreate each session)
- Root `.env.local`: Firebase web + project ids, emulator hosts for local, plus
  set the app public origin env var for local Next. Leave `API_SECRET` blank in dev.
- `bot/.env`: set bot API base URL to the Next origin and a seed Telegram test user id.

### API GOTCHA
`POST /api/transactions/thb-deposit` only validates `adminTelegramId` + `usdtAmount`, but the
profit calc needs `marketUsdtRate` (and `sellRate`) too. When calling the route directly, pass
`marketUsdtRate` and `sellRate` (see `bot/src/test-api.ts`).

### External services
Market rate is fetched live from Binance TH (public, no key) and degrades to `rates` /
ENV defaults if unreachable. OCR (Grok/OCR.space) and Circle on-chain are optional.
