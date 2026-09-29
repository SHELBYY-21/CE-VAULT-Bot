# QA — E2E Real-Status Report (2026-09-29)

> GitBook QA record. สรุปสถานะ "การทดสอบจริง" vs "การทดสอบแบบ boundary/mock"
> หลังเหตุการณ์ false-green Playwright E2E (run 36629497925).

## Incident: false-green E2E
- Run `36629497925` reported **success** while Playwright was actually **6 failed / 2 passed**.
- Root causes:
  1. `playwright.config.ts` had no `baseURL`/`webServer` → relative requests raised `Invalid URL`.
  2. `.github/workflows/test.yml` ran E2E with `continue-on-error: true`, masking every failure.

## Fixes (PR #79 — `fix/e2e-real-status-20260930`)
- Playwright now boots an isolated Next.js dev server on `127.0.0.1:3000` with a synthetic `TELEGRAM_WEBHOOK_SECRET`. An explicit `PLAYWRIGHT_BASE_URL` override remains for trusted environments only — never production finance.
- CI fails on genuine E2E failures (`continue-on-error` removed), installs browser system deps, uploads the Playwright report artifact.
- The always-green pseudo test (`should parse Thai slip text correctly`) was removed: it never touched the application. Thai slip parsing is owned by `src/lib/__tests__/parseSlipText.test.ts`.
- Honest suite size after cleanup: **3 real boundary checks × 2 browsers = 6** (not 8).

## Verification matrix — what is actually tested

| Check | Layer | Real vs boundary | Notes |
|---|---|---|---|
| Unsigned webhook rejected (401) | E2E (PR #79) | Real route logic, isolated dev server | Synthetic secret; no live Telegram |
| Dashboard redirects anonymous → `/login` | E2E | Real fail-closed session boundary | |
| `/api/dashboard/data` returns 401 anonymous | E2E | Real fail-closed API boundary | |
| Thai slip text parsing | Unit (`parseSlipText.test.ts`) | Real function | Not an E2E concern |
| Rate writes reject non-finite values | Unit (`rateGuard.test.ts`) | Real function | Added by this PR |
| CI validate / security / lint / unit / build | CI | Real | `npm audit` is `continue-on-error` (soft gate) |
| Supabase integration (`lock-and-test`) | CI | Lock/typecheck/lint/test/build only | No live Supabase DB in CI |
| Sticker WEBM assets | Unit (`stickers-webm.test.ts`) | 12 committed `.webm` ≤ 256 KB + ffprobe VP9/512/alpha | |

## Explicitly NOT verified (do not claim otherwise)
- **No live Telegram production test.** No signed webhook update has been sent through the real bot in CI. A live smoke test (staging chat + real secret) is still required before any production claim.
- **Supabase cutover not started.** The operational data store remains Firestore; all gates in `SUPABASE_PRIMARY_CUTOVER.md` remain unmet. `/api/health/supabase` is a read-only probe, not a cutover.
- **Mascot motion assets.** `assets/mascot/*.webm` are rendered locally (`scripts/render-mascot-webm.mjs`) and are not committed; Telegram upload + `WEBM_*_FILE_ID` env configuration is manual and unverified in production. Motion degrades silently to static stickers; `CE_MOTION_FX=0` disables it.

## Known remaining issues (tracked)
1. `app/api/telegram/webhook/route.ts` (~L437): `Number(process.env.DEFAULT_MARKET_RATE) ?? 34.8` — `Number()` never returns null/undefined, so the fallback is dead and a missing env var produces `NaN`. This PR adds the ledger-layer guard (`insertRate` fails closed). The route-level `??` cleanup still needs a local edit (the file exceeds safe remote-fetch size).
2. Lint warnings in `route.ts`: unused imports `toPersistedSlipUrl`, `notifyReady`, unused function `presentDealConfirm` — same file, same constraint.
3. `ci.yml` `security` job: `npm audit` uses `continue-on-error: true` — a soft gate; decide intentionally whether it should block.
4. `test.yml` on `main` still contains the false-green `continue-on-error: true` until PR #79 merges.

## Production data & credentials
- No production variables, Firestore/Supabase data, webhook secrets, or Telegram runtime logic were modified. The guard only rejects non-finite rate writes (fail closed).
