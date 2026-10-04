# CE VAULT — Firestore → Supabase primary cutover

Target: iuaaviivkumvzbdmpzty. Do not delete or mutate Firestore until reconciliation and rollback validation complete.

## Verified baseline
- Supabase project is ACTIVE_HEALTHY; RLS is enabled on existing operational tables.
- Supabase currently contains admins=2, transactions=2, bank_accounts=1, receivers=0, rates=6 (counts at initial audit; not evidence of complete migration).
- The live transaction, Telegram, sessions, bank, receiver and dashboard code still uses Firebase Admin / Firestore.
- Railway production has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY but does NOT list SUPABASE_SECRET_KEY or Firebase credential variables in the connected variable inventory. Never put a privileged key in NEXT_PUBLIC_*.
- A working browser Supabase client alone does not switch the operational data store.

## Required gates before cutover
1. Securely provision SUPABASE_SECRET_KEY to the Railway service, only as server-side variable. Verify read/write access to expected schema and RLS/advisors. Do not commit it.
2. Establish authenticated, read-only Firestore export access. Capture consistent snapshot of all collections, subcollections, IDs, references and Storage object metadata. Record counts, money totals and timestamp cut-off. Store encrypted backup separately.
3. Map Firebase documents to Postgres columns, especially Firestore IDs vs UUID PKs, Telegram IDs, chat settings, sessions, transaction/receiver/bank FKs, audit logs, decimal amounts, statuses, rates, and image URLs. Keep a legacy-ID mapping table. No guessed IDs.
4. Import idempotently into staging, then reconcile per-collection counts and per-currency exact-decimal totals, duplicate slip fingerprints, ledger refs, references, status histories and permissions. Existing Supabase rows must not be overwritten silently.
5. Implement a repository layer and replace every operational Firestore call (transactions, banks, botSessions, receivers, webhook, dashboard, reports, scheduled jobs). Financial writes must be atomic in Postgres transactions/RPC, with idempotency keys. No unsafe dual-write.
6. Quiesce Firestore writes at a defined cut-off, capture delta, reimport and reconcile. Switch DATABASE_PROVIDER=supabase only when readiness checks pass; fail closed if secret/connection is missing. Keep Firestore read-only backup.
7. Run npm ci, typecheck, lint, test, build, E2E and live Telegram/webhook smoke tests; compare balances/ledger before and after. Roll back provider switch on mismatch.

Current status: migration preparation only; no data copied, no production provider switch.
