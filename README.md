# CE VAULT / YOUNGBOSS LIVE

Production source is now materialized and reviewable in `appsrc/`.

## Canonical architecture

- Frontend: Vite
- API/runtime: Express on Node.js 22
- Database: Supabase
- Telegram: webhook + signed callback flow
- Production host: Render
- Runtime bootstrap: `scripts/start.mjs`
- Health: `/api/v1/health`
- Telegram status: `/api/v1/telegram/status`

## Source of truth

`appsrc/` is the canonical application source. Normal builds must compile and test this directory directly.

The original user-provided Manus export remains preserved losslessly under `.manus-source/parts/` as a recovery archive only. `scripts/bootstrap.mjs` and the patch scripts are retained temporarily for migration history and recovery; they are no longer part of the normal `npm run build` path.

## Commands

```bash
npm run build
npm start
```

`npm run build` installs the locked `appsrc` dependencies, runs contract checks, tests, and the Vite production build. `npm start` keeps the production runtime bootstrap for Supabase Vault secret loading, Telegram webhook verification/self-healing, outbox dispatch, and then starts `appsrc/server/index.mjs`.

Previous production source remains preserved on `backup/pre-manus-2026-10-04`.
