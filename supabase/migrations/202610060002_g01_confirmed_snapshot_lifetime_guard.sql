-- CE VAULT G-01 follow-up: keep confirmed financial snapshot immutable for life.
-- Proposal only. Apply only after 202610060001_g01_rate_race_condition.sql and explicit approval.

begin;

create or replace function public.ce_guard_confirmed_financial_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.confirmed_at is not null and (
    new.rate_snapshot_id is distinct from old.rate_snapshot_id
    or new.rate_version is distinct from old.rate_version
    or new.confirmed_rate is distinct from old.confirmed_rate
    or new.expected_usdt is distinct from old.expected_usdt
    or new.rounding_policy_version is distinct from old.rounding_policy_version
    or new.confirmed_at is distinct from old.confirmed_at
    or new.confirmation_idempotency_key is distinct from old.confirmation_idempotency_key
    or new.confirmed_quote_id is distinct from old.confirmed_quote_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'CONFIRMED_FINANCIAL_SNAPSHOT_IMMUTABLE';
  end if;

  return new;
end
$$;

revoke all on function public.ce_guard_confirmed_financial_snapshot() from public, anon, authenticated;

commit;
