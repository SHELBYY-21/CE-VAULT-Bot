-- CE VAULT patch v3: Receiver History
-- paste ใน Supabase SQL Editor > Run (idempotent)
create table if not exists public.receivers (
  id                   uuid primary key default gen_random_uuid(),
  account_hash         text not null unique,      -- ตัวระบุหลัก: sha256(bank|last4) — อัปเกรดเป็นเลขเต็มได้ภายหลัง
  bank                 text,
  receiver_name        text,
  account_last4        text not null,
  total_transactions   integer      not null default 0,
  total_amount_thb     numeric(20,2) not null default 0,
  total_usdt           numeric(20,4) not null default 0,
  max_amount_thb       numeric(20,2) not null default 0,
  last_amount_thb      numeric(20,2) not null default 0,
  first_transaction_at timestamptz,
  last_transaction_at  timestamptz,
  last_ledger_ref      text,
  status               text not null default 'normal',   -- normal | trusted | blacklist
  created_at           timestamptz not null default now()
);
create index if not exists receivers_last4_idx on public.receivers (account_last4);
alter table public.receivers enable row level security;
drop policy if exists "receivers anon read" on public.receivers;
create policy "receivers anon read" on public.receivers for select using (true);

-- ผูกธุรกรรมกับผู้รับ (nullable — ธุรกรรมเก่าไม่มีก็ได้)
alter table public.transactions add column if not exists receiver_id uuid references public.receivers(id);

-- เก็บชื่อผู้รับที่ OCR อ่านได้ระหว่างรอยืนยัน
alter table public.bot_sessions add column if not exists slip_receiver_name text;
