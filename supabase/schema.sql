-- ============================================================
-- CE VAULT — Supabase Schema ฉบับสมบูรณ์ (idempotent)
-- ใช้กับโปรเจกต์ใหม่: paste ทั้งไฟล์ใน Supabase Dashboard > SQL Editor > Run ครั้งเดียวจบ
-- ============================================================

-- 1) admins (แอดมินหลายคน + เหรียญตกค้าง) — auto-register จากบอท
create table if not exists public.admins (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  telegram_user_id bigint unique not null,
  holding_usdt     numeric(20,2) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 2) bank_accounts (บัญชีธนาคาร + ยอด THB)
create table if not exists public.bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  label           text not null,
  bank_name       text not null,
  account_number  text,
  current_balance numeric(20,2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 3) transactions (type เป็น text + check ให้เข้ากับโค้ด)
create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references public.admins(id),
  bank_account_id uuid references public.bank_accounts(id),
  type            text not null check (type in ('THB_DEPOSIT','USDT_SEND')),
  thb_amount      numeric(20,2) not null default 0,
  usdt_amount     numeric(20,2) not null default 0,
  sell_rate       numeric(20,4) not null default 0,
  cost_per_unit   numeric(20,4) not null default 0,
  sell_value_thb  numeric(20,2) not null default 0,
  net_profit_thb  numeric(20,2) not null default 0,
  profit_percent  numeric(20,4) not null default 0,
  expected_usdt   numeric(20,2) not null default 0,
  fee_usdt        numeric(20,2) not null default 0,
  fee_percent     numeric(20,4) not null default 0,
  note            text,
  slip_image_url  text,
  status          text not null default 'waiting_admin' check (status in ('ocr_success', 'waiting_admin', 'completed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_tx_created_at on public.transactions (created_at desc);
create index if not exists idx_tx_admin on public.transactions (admin_id);

-- 3.1) status ธุรกรรม (รองรับ DB เดิมที่สร้างก่อนมีคอลัมน์นี้)
alter table public.transactions
  add column if not exists status text not null default 'waiting_admin';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_status_check'
  ) then
    alter table public.transactions
      add constraint transactions_status_check
      check (status in ('ocr_success', 'waiting_admin', 'completed'));
  end if;
end $$;

create index if not exists idx_tx_status_created
  on public.transactions (status, created_at desc);

-- 4) rates (เรตขาย/ตลาด ตั้งผ่านบอท /rate)
create table if not exists public.rates (
  id               uuid primary key default gen_random_uuid(),
  sell_rate        numeric(20,4) not null,
  market_usdt_rate numeric(20,4) not null,
  set_by_admin_id  uuid references public.admins(id),
  created_at       timestamptz not null default now()
);

-- 5) bot_sessions (สถานะสนทนา + ยอดที่ OCR อ่านได้) — service role เท่านั้น
create table if not exists public.bot_sessions (
  chat_id          bigint not null,
  telegram_user_id bigint not null,
  state            text not null,          -- 'AWAITING_NAME' | 'AWAITING_AMOUNT'
  pending_type     text,                   -- 'THB_DEPOSIT' | 'USDT_SEND'
  slip_url         text,
  caption          text,
  ocr_thb          numeric,
  updated_at       timestamptz not null default now(),
  primary key (chat_id, telegram_user_id)
);

-- 6) RPC atomic บวก/ลบยอด
create or replace function public.increment_bank_balance(p_bank_id uuid, p_amount numeric)
returns numeric language plpgsql as $$
declare v numeric;
begin
  update public.bank_accounts set current_balance = current_balance + p_amount
  where id = p_bank_id returning current_balance into v;
  return v;
end;$$;

create or replace function public.adjust_admin_holding(p_admin_id uuid, p_amount numeric)
returns numeric language plpgsql as $$
declare v numeric;
begin
  update public.admins set holding_usdt = holding_usdt + p_amount
  where id = p_admin_id returning holding_usdt into v;
  return v;
end;$$;

-- 7) Realtime บน transactions + admins (ให้แดชบอร์ด Live)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='transactions') then
    alter publication supabase_realtime add table public.transactions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='admins') then
    alter publication supabase_realtime add table public.admins;
  end if;
end$$;

-- 8) RLS — anon อ่านได้ (แดชบอร์ด), เขียนผ่าน service role เท่านั้น
alter table public.admins        enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.transactions  enable row level security;
alter table public.rates         enable row level security;
alter table public.bot_sessions  enable row level security;  -- ไม่มี policy = service role only

drop policy if exists "anon can read admins" on public.admins;
drop policy if exists "anon can read bank_accounts" on public.bank_accounts;
drop policy if exists "anon can read transactions" on public.transactions;
drop policy if exists "anon can read rates" on public.rates;

create policy "anon can read admins"        on public.admins        for select using (true);
create policy "anon can read bank_accounts" on public.bank_accounts for select using (true);
create policy "anon can read transactions"  on public.transactions  for select using (true);
create policy "anon can read rates"         on public.rates         for select using (true);

-- 9) Storage bucket สำหรับสลิป (public)
insert into storage.buckets (id, name, public)
values ('slips', 'slips', true)
on conflict (id) do nothing;

-- 10) บัญชีธนาคารตัวอย่าง (แก้ทีหลังได้)
insert into public.bank_accounts (label, bank_name, account_number, current_balance)
select 'กสิกร - หลัก', 'KBANK', 'xxx-x-xxxxx-x', 0
where not exists (select 1 from public.bank_accounts);
