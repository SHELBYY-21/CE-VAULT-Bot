# CE VAULT — Database 2.0

เลิกเก็บแบบ “เอกสารเดียวกองรวม” — แยก domain ตามตารางด้านล่าง  
**Webhook ยังอ่านจาก collection เดิม** และ dual-write เข้า v2 โดยอัตโนมัติ

## Domains

| Domain | Collection | Role |
| --- | --- | --- |
| **Staff** | `staff` (+ legacy `admins`) | Operators / Telegram identity |
| **Receiver** | `receivers` | Last4 counterparty + history |
| **Transaction** | `transactions` | Slim deal events (`schema_version: 2`) |
| **Ledger** | `ledger_entries` | Event-sourced balance deltas |
| **Room** | `rooms` (+ legacy `chat_settings`) | Group sell rate + day cut |
| **DailyRate** | `daily_rates` (+ legacy `rates`) | Sell / market rate history |
| **OCR** | `ocr_runs` | Thai slip OCR artifacts |
| **Images** | `images` (+ Storage `slips/`) | Slip / USDT proof metadata |
| **AuditLog** | `audit_logs` | Create / edit / delete trail |
| **Wallet** | `wallets` | Staff USDT / bank THB balances |
| **Settlement** | `settlements` | USDT out / chain proof |
| **Analytics** | `analytics_daily` | Daily room rollups |

Ephemeral (not a domain table): `bot_sessions`

## Compat map

| Legacy | v2 |
| --- | --- |
| `admins` | `staff` (same doc id) |
| `chat_settings` | `rooms` |
| `rates` | `daily_rates` |
| holding / bank balance mutators | also → `ledger_entries` + `wallets` |

## Dual-write path

```
recordDeal / recordIncoming / recordOutgoing
  → transactions (legacy fields kept)
  → ocr_runs · images · settlements
  → ledger_entries · wallets
  → analytics_daily · audit_logs
  → tag schema_version: 2 + staff_id / room_id
```

Failures in v2 writes are logged (`[db2:…]`) and **never** fail the Telegram hot path.

## Code

| Path | Purpose |
| --- | --- |
| `src/lib/db/schema.ts` | Collection names + TypeScript docs |
| `src/lib/db/write.ts` | Dual-write helpers |
| `src/lib/db/index.ts` | Public export |

## Verify

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run db:setup
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run db:verify
```

`db:verify` lists both legacy and Database 2.0 collections.
