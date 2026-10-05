create table if not exists public.telegram_updates (
  update_id bigint primary key,
  claimed_at timestamptz not null default now()
);

alter table public.telegram_updates add column if not exists claimed_at timestamptz not null default now();

create index if not exists telegram_updates_claimed_idx on public.telegram_updates (claimed_at desc);

alter table public.telegram_updates enable row level security;
revoke all on table public.telegram_updates from anon, authenticated;
