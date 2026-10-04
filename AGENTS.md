# CE VAULT — Agent Instructions (Menu-first)

Product: Thai-first Telegram finance operations bot. Next.js 16 webhook at `app/api/telegram/webhook/route.ts`; Firestore/Storage are the source of truth. `bot/` is a local bridge only.

## Invariants
1. `/ce`, `/start`, `/menu`, `/help` open one concise inline menu. Do not reset pending sessions when navigating.
2. Keep chat-specific settings isolated by Telegram `chat_id`. No placeholder financial data.
3. OCR/extracted data is not a confirmed receipt. A ledger write (`RECORDED`) is not reconciled settlement (`SETTLED`).
4. Never deduct an opening security deposit again per cycle. Snapshot exchange rates for transactions when implementing the new engine.
5. Bank `pinned_for_date` in existing app code is NOT proof of a native Telegram pinned message. Do not claim sync until events, permissions and reconciliation exist.
6. Never silently mutate balances, delete ledger rows, expose secrets, or deploy as part of a UI-only task.
7. Prefer one visible menu and inline callbacks over unsolicited stickers/status message floods. Do not change financial logic to satisfy a visual redesign.

## Before merging
```bash
npm ci && npm run typecheck && npm run lint && npm test && npm run build
```
Run E2E when environment supports it. Inspect checks; distinguish CI from live Telegram integration testing. Production must use one update-consumption mode (webhook OR long-poll).

Backup baseline: `archive/pre-menu-first-20260929`. Legacy experiments remain in Git history and archive rather than being automatically merged.
