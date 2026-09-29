# CE VAULT — Telegram Menu-first

A single Next.js 16 service provides the Telegram webhook, Firestore ledger, OCR and optional dashboard. **The Telegram menu is the primary user-facing entry point.**

## Main menu
Send `/ce`, `/start`, `/menu` or `/help` in a chat to open the same compact room menu:
- Today: room ledger/report.
- Receiving banks: existing pinned-for-date account settings (not yet a Telegram native-pin sync).
- Exchange rate: view THB/USDT for this room.
- Help: concise operational guide.
- Home: open menu again.

Existing transaction commands and OCR continue to work; opening the menu does not reset a pending deal. `RECORDED` is **not** proof of final settlement.

## Architecture
- `app/api/telegram/webhook/route.ts`: inbound Telegram updates and menu callbacks.
- `src/lib/telegram.ts`: Telegram API transport.
- `src/lib/botSessions.ts`: per-user sessions and per-chat settings.
- `src/lib/transactions.ts`: ledger operations.
- `src/lib/banks.ts`: bank registry (currently dated application-level pin).
- `src/lib/ceReplyTheme.ts`, `src/lib/liveMessage.ts`: message presentation.
- `app/dashboard`: secondary operational interface; not the Telegram home screen.
- `bot/`: optional local development bridge; not a second production bot.

## Quality gate
```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

## Safety and deployment
Use Firebase Firestore/Storage with `FIREBASE_SERVICE_ACCOUNT_JSON` only on the server. Configure `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` and the public HTTPS webhook origin on the host. Do not commit secrets. Only one production consumer should receive Telegram updates; avoid competing long-polling and webhook deployments. Backups are Git branches, **not** Firestore backups.

**Snapshot before the cleanup:** `archive/pre-menu-first-20260929` at `107e42237ef9dc776d50b7807902b2a5e9a77f36`.

### Next milestones (not yet implemented)
Native Telegram pin/unpin synchronization per room; daily cross-room bank-limit accounting from confirmed receipts; one-time security-deposit opening ledger; verified settlement transitions. None should be implied by the current menu.
