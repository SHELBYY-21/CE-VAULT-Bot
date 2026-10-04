# Live Message

Deal updates use **one Telegram message**. After the first `sendMessage`, every phase is `editMessage()` only — the chat stays clean.

```
Receiving...
    ↓
OCR
    ↓
Verified
    ↓
Waiting
    ↓
Settled
```

## Rules

1. **ห้ามส่งข้อความใหม่** during a deal (no progress spam, no stickers on this path)
2. **ใช้ `editMessage()` ตลอด** via `upsertLive(chatId, live_message_id, …)`
3. Store `live_message_id` on `bot_sessions`
4. Commands (`/rate`, `/pin`, …) may still send their own messages — only the **deal pipeline** is Live

## Code

| Path | Role |
| --- | --- |
| `src/lib/liveMessage.ts` | Rail + cards + `upsertLive` |
| `src/lib/botSessions.ts` | `live_message_id` |
| `app/api/telegram/webhook/route.ts` | Photo / settle path |

## Flow

1. THB slip photo → send **Receiving...** (once)
2. Edit → **OCR** while Vision runs
3. Edit → **Verified** with amount / bank / confidence
4. Pin match → edit → **Settled**; else → **Waiting**
5. USDT proof or `+amount` / `-13.6U` → edit → **Settled**
