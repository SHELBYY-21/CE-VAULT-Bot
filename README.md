# CE VAULT / YOUNGBOSS LIVE — Manus source deployment

This branch deploys the user-provided Manus export (`cevault.zip`) as the production source.
The original source is stored losslessly as Base64 archive parts under `.manus-source/parts/` and reconstructed during the Render build.

- Runtime: Vite + Express
- Database: Supabase
- Telegram: webhook + signed callback flow
- Health: `/api/v1/health`
- Telegram status: `/api/v1/telegram/status`

Previous production source is preserved on `backup/pre-manus-2026-10-04`.
