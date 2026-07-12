-- CE VAULT patch v4: Performance (ตาม Supabase Postgres best practices)
-- paste ใน Supabase SQL Editor > Run (idempotent) — รันหลัง patch-v2/v3
-- อ้างอิง rules: schema-foreign-key-indexes, query-composite-indexes,
--                query-partial-indexes, query-missing-indexes

-- 1) FK indexes (Postgres ไม่สร้างให้อัตโนมัติ — JOIN/CASCADE เร็วขึ้น 10-100x)
create index if not exists idx_tx_bank_account
  on public.transactions (bank_account_id)
  where bank_account_id is not null;          -- partial: ข้าม NULL ประหยัดพื้นที่

create index if not exists idx_rates_set_by
  on public.rates (set_by_admin_id)
  where set_by_admin_id is not null;

-- 2) Composite + partial index สำหรับสถิติผู้รับรายวัน
--    query: where receiver_id = ? and created_at >= <start of day>
--    (equality ก่อน, range หลัง ตาม leftmost-prefix rule)
create index if not exists idx_tx_receiver_created
  on public.transactions (receiver_id, created_at)
  where receiver_id is not null;

-- 3) getLatestRates: order by created_at desc limit 1 — ทุกธุรกรรมเรียกใช้
create index if not exists idx_rates_created_at
  on public.rates (created_at desc);

-- 4) Ledger รายวันกรอง type + ช่วงเวลา (เผื่อ dashboard เฟสหน้า filter ตาม type)
create index if not exists idx_tx_type_created
  on public.transactions (type, created_at desc);

-- 5) จำกัด scope ของ RLS policies ให้ชัด (แทน default ที่ apply ทุก role)
--    service_role bypass RLS อยู่แล้ว — ระบุ to anon, authenticated เพื่อความชัดเจน
drop policy if exists "anon can read admins" on public.admins;
drop policy if exists "anon can read bank_accounts" on public.bank_accounts;
drop policy if exists "anon can read transactions" on public.transactions;
drop policy if exists "anon can read rates" on public.rates;
drop policy if exists "receivers anon read" on public.receivers;

create policy "anon can read admins"        on public.admins        for select to anon, authenticated using (true);
create policy "anon can read bank_accounts" on public.bank_accounts for select to anon, authenticated using (true);
create policy "anon can read transactions"  on public.transactions  for select to anon, authenticated using (true);
create policy "anon can read rates"         on public.rates         for select to anon, authenticated using (true);
create policy "receivers anon read"         on public.receivers     for select to anon, authenticated using (true);

-- 6) วัดผล: ดู index ที่ไม่ถูกใช้ภายหลังด้วย
-- select relname, indexrelname, idx_scan from pg_stat_user_indexes order by idx_scan;
