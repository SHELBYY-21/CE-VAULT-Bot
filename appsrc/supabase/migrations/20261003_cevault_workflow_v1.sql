-- CE VAULT v1 sandbox workflow foundation. Additive only; no existing production table is altered.

create sequence if not exists public.workflow_job_public_ref_seq start with 1000;

create table if not exists public.ce_vault_runtime_config (
  id text primary key default 'singleton' check (id = 'singleton'),
  sandbox_enabled boolean not null default true,
  live_settlement boolean not null default false check (live_settlement = false),
  live_settlement_enabled boolean not null default false check (live_settlement_enabled = false),
  updated_at timestamptz not null default now()
);

insert into public.ce_vault_runtime_config (id, sandbox_enabled, live_settlement, live_settlement_enabled)
values ('singleton', true, false, false)
on conflict (id) do nothing;

create table if not exists public.workflow_jobs (
  id uuid primary key default gen_random_uuid(),
  public_ref text not null unique default ('YB-SBX-' || lpad(nextval('public.workflow_job_public_ref_seq')::text, 4, '0')),
  state text not null default 'IDLE' check (state in (
    'IDLE', 'SCANNING', 'OCR_EXTRACTING', 'VERIFYING', 'NEED_CONFIRMATION', 'PROCESSING',
    'WAITING', 'SETTLING', 'COMPLETED', 'FAILED', 'DUPLICATE', 'TIMEOUT'
  )),
  state_version bigint not null default 1 check (state_version > 0),
  transaction_type text not null default 'SANDBOX_JOB',
  amount numeric(38,18),
  currency text not null default 'THB' check (currency ~ '^[A-Z]{3}$'),
  worker text not null default 'INTAKE-01',
  summary text not null default 'Sandbox job created',
  correlation_id text not null unique default gen_random_uuid()::text,
  telegram_chat_id bigint,
  telegram_message_id bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  terminal_at timestamptz,
  check (amount is null or amount >= 0),
  check ((state in ('COMPLETED', 'FAILED', 'DUPLICATE', 'TIMEOUT')) = (terminal_at is not null))
);

create table if not exists public.job_events (
  id bigint generated always as identity primary key,
  event_id uuid not null unique default gen_random_uuid(),
  job_id uuid not null references public.workflow_jobs(id) on delete restrict,
  event_type text not null check (event_type in ('job.created.v1', 'job.state_changed.v1', 'job.telegram_card.v1', 'job.callback_rejected.v1')),
  from_state text,
  to_state text,
  command_code text,
  actor_type text not null default 'SYSTEM',
  actor_id text,
  request_id text,
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  check (from_state is null or from_state in ('IDLE', 'SCANNING', 'OCR_EXTRACTING', 'VERIFYING', 'NEED_CONFIRMATION', 'PROCESSING', 'WAITING', 'SETTLING', 'COMPLETED', 'FAILED', 'DUPLICATE', 'TIMEOUT')),
  check (to_state is null or to_state in ('IDLE', 'SCANNING', 'OCR_EXTRACTING', 'VERIFYING', 'NEED_CONFIRMATION', 'PROCESSING', 'WAITING', 'SETTLING', 'COMPLETED', 'FAILED', 'DUPLICATE', 'TIMEOUT'))
);

create table if not exists public.outbox_messages (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('workflow.job.created.v1', 'workflow.job.state_changed.v1', 'telegram.card.refresh.v1')),
  aggregate_id uuid not null references public.workflow_jobs(id) on delete restrict,
  payload jsonb not null,
  dedupe_key text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING', 'DISPATCHED', 'FAILED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  dispatched_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.command_idempotency (
  job_id uuid not null references public.workflow_jobs(id) on delete restrict,
  idempotency_key text not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (job_id, idempotency_key)
);

create table if not exists public.telegram_callback_tokens (
  reference text primary key check (reference ~ '^[A-Za-z0-9_-]{6,11}$'),
  job_id uuid not null references public.workflow_jobs(id) on delete restrict,
  action text not null check (action in ('REFRESH', 'DETAILS', 'CONFIRM_PROCESS', 'RECHECK', 'AUDIT')),
  nonce_hash text not null,
  binding_digest text not null,
  chat_id bigint not null,
  message_id bigint not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists workflow_jobs_state_updated_idx on public.workflow_jobs (state, updated_at desc);
create index if not exists workflow_jobs_created_idx on public.workflow_jobs (created_at desc);
create index if not exists job_events_job_occurred_idx on public.job_events (job_id, occurred_at desc);
create index if not exists job_events_occurred_idx on public.job_events (occurred_at desc);
create index if not exists outbox_pending_available_idx on public.outbox_messages (available_at, created_at) where status = 'PENDING';
create index if not exists telegram_callback_tokens_pending_idx on public.telegram_callback_tokens (expires_at) where consumed_at is null;

alter table public.ce_vault_runtime_config enable row level security;
alter table public.workflow_jobs enable row level security;
alter table public.job_events enable row level security;
alter table public.outbox_messages enable row level security;
alter table public.command_idempotency enable row level security;
alter table public.telegram_callback_tokens enable row level security;

create or replace function public.ce_vault_assert_sandbox()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.ce_vault_runtime_config;
begin
  select * into cfg from public.ce_vault_runtime_config where id = 'singleton';
  if not found or cfg.sandbox_enabled is not true or cfg.live_settlement is not false or cfg.live_settlement_enabled is not false then
    raise exception 'CE_VAULT_SANDBOX_GUARD_FAILED' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.ce_vault_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select case p_from
    when 'IDLE' then p_to in ('SCANNING')
    when 'SCANNING' then p_to in ('OCR_EXTRACTING', 'FAILED', 'TIMEOUT')
    when 'OCR_EXTRACTING' then p_to in ('VERIFYING', 'FAILED', 'DUPLICATE')
    when 'VERIFYING' then p_to in ('NEED_CONFIRMATION', 'FAILED', 'DUPLICATE')
    when 'NEED_CONFIRMATION' then p_to in ('PROCESSING', 'TIMEOUT')
    when 'PROCESSING' then p_to in ('WAITING', 'SETTLING', 'FAILED', 'TIMEOUT')
    when 'WAITING' then p_to in ('PROCESSING', 'SETTLING', 'FAILED', 'TIMEOUT')
    when 'SETTLING' then p_to in ('COMPLETED', 'FAILED', 'TIMEOUT')
    else false
  end;
$$;

create or replace function public.create_sandbox_workflow_job(
  p_transaction_type text,
  p_amount numeric default null,
  p_currency text default 'THB',
  p_worker text default 'INTAKE-01',
  p_summary text default 'Sandbox job created',
  p_correlation_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.workflow_jobs;
  created_event public.job_events;
begin
  perform public.ce_vault_assert_sandbox();
  if coalesce(length(trim(p_transaction_type)), 0) = 0 then
    raise exception 'TRANSACTION_TYPE_REQUIRED' using errcode = '22023';
  end if;
  insert into public.workflow_jobs (transaction_type, amount, currency, worker, summary, correlation_id, metadata)
  values (trim(p_transaction_type), p_amount, upper(p_currency), coalesce(nullif(trim(p_worker), ''), 'INTAKE-01'), coalesce(nullif(trim(p_summary), ''), 'Sandbox job created'), coalesce(p_correlation_id, gen_random_uuid()::text), coalesce(p_metadata, '{}'::jsonb))
  returning * into job;
  insert into public.job_events (job_id, event_type, to_state, command_code, actor_type, payload)
  values (job.id, 'job.created.v1', job.state, 'SANDBOX_CREATE', 'SYSTEM', jsonb_build_object('public_ref', job.public_ref, 'state_version', job.state_version))
  returning * into created_event;
  insert into public.outbox_messages (topic, aggregate_id, payload, dedupe_key)
  values ('workflow.job.created.v1', job.id, jsonb_build_object('event_id', created_event.event_id, 'job_id', job.id, 'public_ref', job.public_ref, 'state', job.state, 'state_version', job.state_version), 'job.created:' || job.id::text);
  return jsonb_build_object('job_id', job.id, 'public_ref', job.public_ref, 'state', job.state, 'state_version', job.state_version, 'event_id', created_event.event_id);
end;
$$;

create or replace function public.transition_workflow_job(
  p_job_id uuid,
  p_expected_version bigint,
  p_to_state text,
  p_command_code text,
  p_idempotency_key text,
  p_request_hash text,
  p_actor_type text default 'SYSTEM',
  p_actor_id text default null,
  p_request_id text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.workflow_jobs;
  prior public.command_idempotency;
  event_row public.job_events;
  response_payload jsonb;
  previous_state text;
begin
  perform public.ce_vault_assert_sandbox();
  select * into prior from public.command_idempotency where job_id = p_job_id and idempotency_key = p_idempotency_key;
  if found then
    if prior.request_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    return prior.response || jsonb_build_object('idempotent_replay', true);
  end if;

  select * into job from public.workflow_jobs where id = p_job_id for update;
  if not found then raise exception 'JOB_NOT_FOUND' using errcode = 'P0002'; end if;
  if job.state_version <> p_expected_version then raise exception 'STATE_VERSION_STALE' using errcode = 'P0001'; end if;
  if job.state in ('COMPLETED', 'FAILED', 'DUPLICATE', 'TIMEOUT') then raise exception 'TERMINAL_STATE_IMMUTABLE' using errcode = 'P0001'; end if;
  if p_command_code = 'CONFIRM_PROCESS' and not (job.state = 'NEED_CONFIRMATION' and p_to_state = 'PROCESSING') then
    raise exception 'CONFIRM_PROCESS_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if p_command_code not in ('CONFIRM_PROCESS', 'SANDBOX_ADVANCE') then raise exception 'COMMAND_NOT_ALLOWED' using errcode = 'P0001'; end if;
  if not public.ce_vault_transition_allowed(job.state, p_to_state) then raise exception 'INVALID_STATE_TRANSITION' using errcode = 'P0001'; end if;
  previous_state := job.state;

  update public.workflow_jobs
  set state = p_to_state,
      state_version = state_version + 1,
      updated_at = now(),
      terminal_at = case when p_to_state in ('COMPLETED', 'FAILED', 'DUPLICATE', 'TIMEOUT') then now() else null end
  where id = job.id
  returning * into job;

  insert into public.job_events (job_id, event_type, from_state, to_state, command_code, actor_type, actor_id, request_id, idempotency_key, payload)
  values (job.id, 'job.state_changed.v1', previous_state, job.state, p_command_code, p_actor_type, p_actor_id, p_request_id, p_idempotency_key, coalesce(p_payload, '{}'::jsonb))
  returning * into event_row;

  response_payload := jsonb_build_object('job_id', job.id, 'public_ref', job.public_ref, 'state', job.state, 'state_version', job.state_version, 'event_id', event_row.event_id, 'idempotent_replay', false);
  insert into public.command_idempotency (job_id, idempotency_key, request_hash, response)
  values (job.id, p_idempotency_key, p_request_hash, response_payload);
  insert into public.outbox_messages (topic, aggregate_id, payload, dedupe_key)
  values ('workflow.job.state_changed.v1', job.id, response_payload, 'state:' || job.id::text || ':' || job.state_version::text);
  return response_payload;
end;
$$;

create or replace function public.claim_telegram_callback(
  p_reference text,
  p_nonce_hash text,
  p_binding_digest text
)
returns table (reference text, job_id uuid, action text, chat_id bigint, message_id bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.telegram_callback_tokens t
  set consumed_at = now()
  where t.reference = p_reference
    and t.nonce_hash = p_nonce_hash
    and t.binding_digest = p_binding_digest
    and t.consumed_at is null
    and t.expires_at > now()
  returning t.reference, t.job_id, t.action, t.chat_id, t.message_id;
end;
$$;

create or replace function public.claim_pending_outbox_messages(p_limit integer default 25)
returns table (id uuid, topic text, aggregate_id uuid, payload jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select m.id from public.outbox_messages m
    where m.status = 'PENDING' and m.available_at <= now()
    order by m.created_at asc
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.outbox_messages m
  set status = 'DISPATCHED', claimed_at = now(), dispatched_at = now(), attempt_count = attempt_count + 1
  from picked
  where m.id = picked.id
  returning m.id, m.topic, m.aggregate_id, m.payload;
end;
$$;

revoke all on table public.ce_vault_runtime_config, public.workflow_jobs, public.job_events, public.outbox_messages, public.command_idempotency, public.telegram_callback_tokens from anon, authenticated;
revoke execute on function public.ce_vault_assert_sandbox() from public, anon, authenticated;
revoke execute on function public.create_sandbox_workflow_job(text, numeric, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.transition_workflow_job(uuid, bigint, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.claim_telegram_callback(text, text, text) from public, anon, authenticated;
revoke execute on function public.claim_pending_outbox_messages(integer) from public, anon, authenticated;
grant execute on function public.ce_vault_assert_sandbox() to service_role;
grant execute on function public.create_sandbox_workflow_job(text, numeric, text, text, text, text, jsonb) to service_role;
grant execute on function public.transition_workflow_job(uuid, bigint, text, text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.claim_telegram_callback(text, text, text) to service_role;
grant execute on function public.claim_pending_outbox_messages(integer) to service_role;
