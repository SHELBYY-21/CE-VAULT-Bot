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
