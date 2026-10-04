# Receiver Intelligence

Instant counterparty profile for Assistant + Live Message.

## Assistant

| Input | Response |
| --- | --- |
| `3376` or `SCB 3376` | Receiver Intelligence card |
| `/receiver 3376` | same |
| `วันนี้กำไรเท่าไร` | Today profit / volume immediately |

```
Receiver
SCB
3376

History
52

Volume
฿1.28M

Risk
LOW
```

## On slip (Live Message)

Shown immediately after last4 is known:

```
Receiver Intelligence
Receiver       SCB •3376
Transactions   52
Volume         ฿1.2M
Last           2 hrs ago
Risk           LOW
Duplicate      No
```

## Known account fast-path

If `total_transactions >= 1`:

- Fill bank / name from DB when OCR misses them
- Relax OCR confidence gate (amount is enough)
- Skip cold “new pin” friction — go to **Waiting** with profile loaded
- Caption last4 (`3376` in photo caption) shows intel **before** full OCR finishes

## Code

| Path | Role |
| --- | --- |
| `src/lib/receiverIntel.ts` | risk · volume · relative time · NL parsers |
| `src/lib/liveMessage.ts` | `receiverIntelCard` · `intelBlock` · `liveIntelVerified` |
| `app/api/telegram/webhook/route.ts` | wire Assistant + slip |
