-- CE VAULT patch v2: เก็บ slip extract ครบชุด + เรตต่อกลุ่ม + edit tracking
-- paste ใน Supabase SQL Editor > Run
alter table public.bot_sessions
  add column if not exists slip_date        text,
  add column if not exists slip_time        text,
  add column if not exists slip_last4       text,
  add column if not exists slip_bank        text,
  add column if not exists editing_tx_id    uuid;

create table if not exists public.chat_settings (
  chat_id     bigint primary key,
  fixed_rate  numeric(20,4),
  updated_at  timestamptz not null default now()
);
alter table public.chat_settings enable row level security;
