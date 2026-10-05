-- CE VAULT G-01 Rate Race Condition
-- Additive migration proposal only. DO NOT apply to production without explicit approval.
-- Financial values use NUMERIC. No FLOAT/REAL/DOUBLE PRECISION.

begin;

create sequence if not exists public.rate_snapshot_version_seq as bigint;

create table if not exists public.rate_snapshots (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.vault_cycles(id),
  version bigint not null default nextval('public.rate_snapshot_version_seq'),
  currency_pair text not null,
  rate_value numeric(30,12) not null check (rate_value > 0),
  status text not null check (status in ('ACTIVE','SUPERSEDED','REVOKED')),
  effective_at timestamptz not null,
  expires_at timestamptz not null,
  created_by uuid not null references public.admins(id),
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > effective_at),
  check ((status <> 'SUPERSEDED') or superseded_at is not null),
  check ((status <> 'REVOKED') or revoked_at is not null)
);

create unique index if not exists uq_rate_snapshots_one_active_per_cycle
  on public.rate_snapshots (cycle_id)
  where status = 'ACTIVE';

create unique index if not exists uq_rate_snapshots_cycle_version
  on public.rate_snapshots (cycle_id, version);

create index if not exists idx_rate_snapshots_cycle_created
  on public.rate_snapshots (cycle_id, created_at desc);

create table if not exists public.transaction_rate_quotes (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id),
  cycle_id uuid not null references public.vault_cycles(id),
  rate_snapshot_id uuid not null references public.rate_snapshots(id),
  rate_version bigint not null,
  rate_value numeric(30,12) not null check (rate_value > 0),
  expected_usdt numeric(30,12) not null check (expected_usdt > 0),
  rounding_policy_version text not null,
  status text not null check (status in ('ACTIVE','SUPERSEDED','EXPIRED','CONFIRMED','CANCELLED')),
  effective_at timestamptz not null,
  expires_at timestamptz not null,
  created_by uuid not null references public.admins(id),
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  confirmed_at timestamptz,
  check (expires_at > effective_at)
);

create unique index if not exists uq_transaction_rate_quotes_one_active
  on public.transaction_rate_quotes (transaction_id)
  where status = 'ACTIVE';

create index if not exists idx_transaction_rate_quotes_history
  on public.transaction_rate_quotes (transaction_id, created_at desc);

alter table public.transactions
  add column if not exists rate_snapshot_id uuid references public.rate_snapshots(id),
  add column if not exists rate_version bigint,
  add column if not exists confirmed_rate numeric(30,12),
  add column if not exists rounding_policy_version text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmation_idempotency_key text,
  add column if not exists confirmed_quote_id uuid references public.transaction_rate_quotes(id);

create unique index if not exists uq_transactions_confirmation_idempotency_key
  on public.transactions (confirmation_idempotency_key)
  where confirmation_idempotency_key is not null;

-- NOT VALID allows an additive rollout before any explicit legacy backfill/cutover.
-- Validate only after compatibility queries show every CONFIRMED row satisfies the invariant.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and conname = 'transactions_confirmed_snapshot_complete'
  ) then
    alter table public.transactions
      add constraint transactions_confirmed_snapshot_complete
      check (
        status <> 'CONFIRMED'
        or (
          rate_snapshot_id is not null
          and rate_version is not null
          and confirmed_rate is not null
          and confirmed_rate > 0
          and expected_usdt is not null
          and expected_usdt > 0
          and rounding_policy_version is not null
          and confirmed_at is not null
          and confirmation_idempotency_key is not null
          and confirmed_quote_id is not null
        )
      ) not valid;
  end if;
end
$$;

create or replace function public.ce_guard_confirmed_financial_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'CONFIRMED' and (
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

create or replace function public.ce_guard_rate_snapshot_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cycle_id is distinct from old.cycle_id
    or new.version is distinct from old.version
    or new.currency_pair is distinct from old.currency_pair
    or new.rate_value is distinct from old.rate_value
    or new.effective_at is distinct from old.effective_at
    or new.expires_at is distinct from old.expires_at
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '23514',
      message = 'RATE_SNAPSHOT_IMMUTABLE';
  end if;

  if old.status = 'ACTIVE' and new.status = 'ACTIVE' then
    if new.superseded_at is distinct from old.superseded_at
      or new.revoked_at is distinct from old.revoked_at
    then
      raise exception using
        errcode = '23514',
        message = 'RATE_SNAPSHOT_IMMUTABLE';
    end if;
    return new;
  end if;

  if old.status = 'ACTIVE' and new.status = 'SUPERSEDED' then
    if new.superseded_at is null
      or new.revoked_at is distinct from old.revoked_at
    then
      raise exception using
        errcode = '23514',
        message = 'RATE_SNAPSHOT_SUPERSEDE_INVALID';
    end if;
    return new;
  end if;

  if old.status = 'ACTIVE' and new.status = 'REVOKED' then
    if new.revoked_at is null
      or new.superseded_at is distinct from old.superseded_at
    then
      raise exception using
        errcode = '23514',
        message = 'RATE_SNAPSHOT_REVOKE_INVALID';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
    or new.superseded_at is distinct from old.superseded_at
    or new.revoked_at is distinct from old.revoked_at
  then
    raise exception using
      errcode = '23514',
      message = 'RATE_SNAPSHOT_TERMINAL';
  end if;

  return new;
end
$$;

revoke all on function public.ce_guard_rate_snapshot_immutable() from public, anon, authenticated;

drop trigger if exists trg_transactions_confirmed_financial_snapshot on public.transactions;
create trigger trg_transactions_confirmed_financial_snapshot
before update on public.transactions
for each row execute function public.ce_guard_confirmed_financial_snapshot();

drop trigger if exists trg_rate_snapshot_immutable on public.rate_snapshots;
create trigger trg_rate_snapshot_immutable
before update on public.rate_snapshots
for each row execute function public.ce_guard_rate_snapshot_immutable();

-- New financial snapshot tables are server-only by default.
alter table public.rate_snapshots enable row level security;
alter table public.transaction_rate_quotes enable row level security;
revoke all on table public.rate_snapshots from anon, authenticated;
revoke all on table public.transaction_rate_quotes from anon, authenticated;
revoke all on sequence public.rate_snapshot_version_seq from anon, authenticated;

grant select, insert, update on table public.rate_snapshots to service_role;
grant select, insert, update on table public.transaction_rate_quotes to service_role;
grant usage, select on sequence public.rate_snapshot_version_seq to service_role;

commit;

-- Post-apply validation plan (run read-only before VALIDATE CONSTRAINT):
-- select id from public.transactions
-- where status = 'CONFIRMED' and (
--   rate_snapshot_id is null or rate_version is null or confirmed_rate is null
--   or expected_usdt is null or expected_usdt <= 0
--   or rounding_policy_version is null or confirmed_at is null
--   or confirmation_idempotency_key is null or confirmed_quote_id is null
-- );
--
-- Only after the result is empty:
-- alter table public.transactions validate constraint transactions_confirmed_snapshot_complete;
