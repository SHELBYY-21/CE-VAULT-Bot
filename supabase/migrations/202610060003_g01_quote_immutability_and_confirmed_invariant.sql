-- CE VAULT G-01 hardening: immutable transaction quotes and lifetime confirmation completeness.
-- Proposal only. Apply after 202610060001 and 202610060002 with explicit approval.

begin;

create or replace function public.ce_guard_transaction_rate_quote_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.transaction_id is distinct from old.transaction_id
    or new.cycle_id is distinct from old.cycle_id
    or new.rate_snapshot_id is distinct from old.rate_snapshot_id
    or new.rate_version is distinct from old.rate_version
    or new.rate_value is distinct from old.rate_value
    or new.expected_usdt is distinct from old.expected_usdt
    or new.rounding_policy_version is distinct from old.rounding_policy_version
    or new.effective_at is distinct from old.effective_at
    or new.expires_at is distinct from old.expires_at
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '23514',
      message = 'TRANSACTION_RATE_QUOTE_IMMUTABLE';
  end if;

  if old.status = 'ACTIVE' and new.status = 'ACTIVE' then
    if new.superseded_at is distinct from old.superseded_at
      or new.confirmed_at is distinct from old.confirmed_at
    then
      raise exception using
        errcode = '23514',
        message = 'TRANSACTION_RATE_QUOTE_IMMUTABLE';
    end if;
    return new;
  end if;

  if old.status = 'ACTIVE' and new.status = 'SUPERSEDED' then
    if new.superseded_at is null
      or new.confirmed_at is distinct from old.confirmed_at
    then
      raise exception using
        errcode = '23514',
        message = 'TRANSACTION_RATE_QUOTE_SUPERSEDE_INVALID';
    end if;
    return new;
  end if;

  if old.status = 'ACTIVE' and new.status = 'CONFIRMED' then
    if new.confirmed_at is null
      or new.superseded_at is distinct from old.superseded_at
    then
      raise exception using
        errcode = '23514',
        message = 'TRANSACTION_RATE_QUOTE_CONFIRM_INVALID';
    end if;
    return new;
  end if;

  if old.status = 'ACTIVE' and new.status = 'EXPIRED' then
    if now() < old.expires_at
      or new.superseded_at is distinct from old.superseded_at
      or new.confirmed_at is distinct from old.confirmed_at
    then
      raise exception using
        errcode = '23514',
        message = 'TRANSACTION_RATE_QUOTE_EXPIRE_INVALID';
    end if;
    return new;
  end if;

  if old.status = 'ACTIVE' and new.status = 'CANCELLED' then
    if new.superseded_at is distinct from old.superseded_at
      or new.confirmed_at is distinct from old.confirmed_at
    then
      raise exception using
        errcode = '23514',
        message = 'TRANSACTION_RATE_QUOTE_CANCEL_INVALID';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
    or new.superseded_at is distinct from old.superseded_at
    or new.confirmed_at is distinct from old.confirmed_at
  then
    raise exception using
      errcode = '23514',
      message = 'TRANSACTION_RATE_QUOTE_TERMINAL';
  end if;

  return new;
end
$$;

revoke all on function public.ce_guard_transaction_rate_quote_immutable() from public, anon, authenticated;

drop trigger if exists trg_transaction_rate_quote_immutable on public.transaction_rate_quotes;
create trigger trg_transaction_rate_quote_immutable
before update on public.transaction_rate_quotes
for each row execute function public.ce_guard_transaction_rate_quote_immutable();

alter table public.transactions
  drop constraint if exists transactions_confirmed_snapshot_complete;

alter table public.transactions
  add constraint transactions_confirmed_snapshot_complete
  check (
    (
      confirmed_at is null
      and status <> 'CONFIRMED'
    )
    or (
      confirmed_at is not null
      and rate_snapshot_id is not null
      and rate_version is not null
      and confirmed_rate is not null
      and confirmed_rate > 0
      and expected_usdt is not null
      and expected_usdt > 0
      and rounding_policy_version is not null
      and confirmation_idempotency_key is not null
      and confirmed_quote_id is not null
    )
  ) not valid;

commit;

-- Validate only after legacy compatibility/backfill review returns zero incompatible rows:
-- alter table public.transactions validate constraint transactions_confirmed_snapshot_complete;
