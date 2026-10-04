-- CE VAULT security patch (review before applying to the intended production project).
-- Audit: the original SELECT policies below granted anon/authenticated USING (true),
-- exposing finance/admin/bank/receiver rows through the Supabase Data API.
-- WARNING: direct browser/anon reads of these tables will stop working.
-- Migrate such reads behind a verified server session and server-only DB key FIRST.
-- This file is review-only until the target Supabase project is confirmed.
-- Public market/sell rates remain readable; no ledger rows or balances are changed.
BEGIN;

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon can read admins" ON public.admins;
DROP POLICY IF EXISTS "anon can read bank_accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "anon can read transactions" ON public.transactions;
DROP POLICY IF EXISTS "receivers anon read" ON public.receivers;
DROP POLICY IF EXISTS "bot_metrics_select" ON public.bot_metrics;

-- Defense in depth. Service-role/backend access is unchanged.
REVOKE SELECT ON public.admins, public.bank_accounts, public.transactions,
  public.receivers, public.bot_metrics FROM anon, authenticated;

COMMIT;

-- Verification (no financial data returned):
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('admins','bank_accounts','transactions','receivers','bot_metrics')
ORDER BY tablename, policyname;
