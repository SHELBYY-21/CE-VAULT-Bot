# Live Message V3

Deal updates use **one Telegram message**. The first state sends once; every later state edits the same message so the chat stays clean.

The primary rendering path uses Telegram **Rich Messages** when available and falls back to HTML text on the same transport contract.

```
Receiving
   ↓
OCR
   ↓
Match
   ↓
Recorded
   ↓
Waiting
   ↓
Done
```

## Semantic rule

**RECORDED ≠ SETTLED**

- **RECORDED / IN** means the THB-side transaction has been recorded.
- **WAITING / WAIT** means USDT or the next verified completion event is still pending.
- **SETTLED / DONE** is reserved for a real closing event. A THB record alone must never render as DONE.

## Rules

1. **One deal = one Live Message.** Do not emit progress spam during the deal pipeline.
2. Use `upsertLive(chatId, live_message_id, …)`: first call sends, later calls edit.
3. Store `live_message_id` on `bot_sessions` for the source Next.js path. The generated Render runtime keeps the message id for the active webhook request and edits the same scan card into its final intake state.
4. Status and next action belong at the top of the card.
5. Normal checks stay compact. Errors expand only the failing evidence.
6. Full account data may be shown only when it comes from a real `bank_accounts.account_number` source. If OCR has only last4, keep last4.
7. Rich-message failure falls back to HTML text. A rendering failure must not change financial logic.
8. Buttons are allowed only when the action exists. Copy buttons are presentation-only and do not mutate state.
9. `DONE` is forbidden unless a settlement/completion event actually occurred.

## Telegram Bot API baseline

The implementation targets Telegram Bot API 10.3 capabilities while retaining a text fallback:

- `sendRichMessage`
- `editMessageText` with `rich_message`
- rich tables/details
- copy buttons
- styled buttons where applicable
- `link_preview_options` instead of the legacy `disable_web_page_preview`

Do not depend on Rich Messages for correctness; they are a presentation layer.

## Code

| Path | Role |
| --- | --- |
| `src/lib/telegram.ts` | Rich send/edit transport + HTML fallback |
| `src/lib/liveMessage.ts` | Source Live Message states and cards |
| `src/lib/botSessions.ts` | Persistent `live_message_id` |
| `app/api/telegram/webhook/route.ts` | Source photo / record / settlement path |
| `runtime-patches/live-intake.mjs` | Generated-runtime V3 formatters |
| `runtime-patches/server-intake-helpers.txt` | Generated-runtime one-message intake lifecycle |
| `scripts/patch-live-intake.mjs` | Installs V3 transport into generated Render runtime |

## Flow

1. Slip photo → send **OCR / Receiving** once.
2. Edit same message while OCR completes.
3. Match account/date/rate.
4. If a THB transaction is stored, render **RECORDED**, never DONE.
5. Render **WAITING** while USDT/final completion is outstanding.
6. Only a real outgoing/completion event may render **DONE / SETTLED**.

Commands such as `/rate`, `/pin`, `/status` may still send their own standalone messages; the one-message rule applies to the deal pipeline.
