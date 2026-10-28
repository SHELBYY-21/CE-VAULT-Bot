-- CE VAULT GATEKEEPER — approval audit schema (MVP)
-- Spec: docs/GATEKEEPER.md. Applying this migration goes through the
-- migration approval gate itself; this PR only ships the file.

-- One row per approval attempt. Status lifecycle:
--   EXECUTING -> EXECUTED | FAILED
-- Refusals recorded without lifecycle: DENIED_NOT_AUTHORIZED,
-- REJECTED_UNRECOGNIZED, REJECTED_NOT_IMPLEMENTED.
create table if not exists public.gatekeeper_approvals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('pr', 'migration', 'settle')),
  target text not null,
  approver_telegram_id bigint,
  command_text text,
  requested_at timestamptz not null default now(),
  status text not null,
  result jsonb,
  detail text,
  constraint gatekeeper_approvals_status_check
    check (status in (
      'EXECUTING', 'EXECUTED', 'FAILED',
      'DENIED_NOT_AUTHORIZED', 'REJECTED_UNRECOGNIZED', 'REJECTED_NOT_IMPLEMENTED'
    ))
);

-- INVARIANT: one active-or-completed approval per (kind, target).
-- DENIED/REJECTED attempts never consume the slot.
create unique index if not exists gatekeeper_approvals_active_target
  on public.gatekeeper_approvals (kind, target)
  where status in ('EXECUTING', 'EXECUTED');

create index if not exists gatekeeper_approvals_requested_at_idx
  on public.gatekeeper_approvals (requested_at desc);

-- Singleton lock row (id = true).
create table if not exists public.gatekeeper_locks (
  id boolean primary key default true check (id),
  locked boolean not null default false,
  locked_by bigint,
  locked_at timestamptz,
  reason text
);

insert into public.gatekeeper_locks (id, locked, locked_by, locked_at)
values (true, false, null, null)
on conflict (id) do nothing;

-- service_role only: no anon/authenticated grants on approval audit data.
