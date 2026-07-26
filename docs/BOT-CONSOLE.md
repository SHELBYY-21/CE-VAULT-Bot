# CE VAULT Bot — FinTech Operations Console

Telegram responses are designed as an **operations console**, not a chatbot.

## Design language

- Dark OLED hierarchy (typography + monospace — Telegram cannot paint `#05050A`)
- One message = one card
- Status rail with a single glowing step:

```
○ RECEIVED
○ OCR VERIFIED
● WAITING USDT
○ SETTLED
```

- Cards: `RECEIVE` · `OCR` · `CONFIRM` · `SUCCESS` · `HISTORY` · `ERROR` · `EDIT` · `DELETE`
- Buttons: Confirm / Edit / Cancel (English, minimal)

## Header

```
CE VAULT
Secure Ledger
CONFIRM
Ledger  #CE-YYYYMMDD-XXXX
────────────────
```

## Modules

| File | Role |
| --- | --- |
| `src/lib/botConsole.ts` | Tokens, status rail, metrics, card shell |
| `src/lib/botUi.ts` | Card builders (same exports as before) |

## Palette (web / brand)

| Token | Hex |
| --- | --- |
| Primary | `#05050A` |
| Surface | `#101114` |
| Gold | `#E5C04A` |
| Cyan | `#00F0FF` |
| Success | `#00D26A` |
| Warning | `#FFB800` |
| Danger | `#FF4D4F` |
