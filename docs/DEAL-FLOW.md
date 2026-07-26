# CE VAULT — Deal flow (Live + Confirmation)

```
THB slip photo
  → Live Card editMessage (RECEIVED → OCR → …)
  → OCR card (confidence · last4 · receiver history · ledger · sell rate)
  → state WAITING_USDT

USDT proof / -13.6U / bare amount
  → Confirmation Card (editMessage)
       Buy Rate = THB ÷ USDT
       Sell Rate = room /setrate (daily)
  → Confirm → SUCCESS (same Live Card)
```

## Checklist

| Feature | Status |
| --- | --- |
| OCR Thai slip | `analyzeSlip` (Grok → OCR.space) |
| OCR Confidence | Live OCR + Confirm cards |
| Receiver History | Last4 DB → `receiverBrief` on cards |
| Last4 Database | `receivers` + pin banks |
| Ledger ID | Stable `ledger_ref` across Live → Confirm → Settle |
| Buy Rate auto | `THB ÷ USDT` in Confirm / `recordDeal` |
| Sell Rate daily | `/setrate` room rate |
| Confirmation Card | Confirm · Edit · Cancel |
| Live Card | `editMessage` via `live_message_id` |

## Shortcuts (unchanged)

- `+500B` alone → THB inbound commit (no Confirmation)
- `-13.6U` with no open THB deal → USDT outbound commit
- `+500B -13.6U` → Confirmation
