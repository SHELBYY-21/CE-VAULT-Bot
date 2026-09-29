# CE VAULT fresh start (no Firestore history import)

Target project: iuaaviivkumvzbdmpzty.

- New operational ledger begins at an explicitly recorded cutover timestamp. Do not import old Firestore transactions, outstanding balances, IDs, or prior totals.
- Do not delete Firestore, as it is historical backup only.
- Existing Supabase transactions must be inspected and archived/isolated before declaring the new ledger empty; never silently mix them with new transactions.
- The Telegram webhook, transaction service, bank, receiver, session, settings, dashboard and reports currently include Firestore code. All must use one Supabase repository before DATABASE_PROVIDER=supabase is enabled in production.
- Existing Supabase schema includes transactions, admins, bank_accounts, rates, bot_sessions and chat_settings. Column differences require explicit mapping (e.g. chat_settings.sell_rate vs Firestore fixed_rate).
- Financial writes must use idempotency constraints and atomic SQL transactions; deny writes on DB error and do not fall back to Firestore.
- Use only server-side SUPABASE_SECRET_KEY (or pre-existing lowercase supabase_secret_key). Never send it to browser. Public publishable key is for RLS-scoped operations only.
- Gate: authenticated runtime readiness, ledger isolation, new transaction create/edit/reversal tests, duplicate slip rejection, Telegram webhook smoke, dashboard parity, npm ci/typecheck/lint/test/build/E2E, Railway health.
- This branch only prepares a server-only Supabase client and readiness function; it does NOT claim complete cutover.

## Applied Supabase migrations (2026-09-30)
- bot_sessions: slip_date, slip_time, slip_last4, slip_bank, slip_receiver_name columns.
- bank_accounts: pinned_for_date date column and index.
- receivers: partial unique index on non-null account_hash.
- ce_upsert_receiver_on_deposit RPC: service-role-only atomic upsert; uses advisory transaction lock on ledger_ref and ce_receiver_applied_ledgers (unique ledger_ref) to make repeated receiver updates idempotent. This RPC updates receiver statistics only: it is NOT a replacement for an atomic financial transaction/ledger RPC.
- No test deposits inserted. Existing Supabase transactions (2 at verification) must remain isolated from the fresh production ledger.

## Cutover blocker
The operational src/lib/transactions.ts and webhook still call Firestore. Do not set DATABASE_PROVIDER=supabase or deploy the mixed-provider branch to production until all financial write/read/edit/delete paths use a single Supabase transaction boundary, including admin holdings, bank balances, receiver stats and duplicate prevention. Run CI and end-to-end tests first.
