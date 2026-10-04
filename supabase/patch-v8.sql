-- ============================================================
-- CE VAULT patch v8 — สถานะดีลสำหรับลูกค้า (customer order status)
-- paste ใน Supabase SQL Editor > Run (idempotent)
-- 3 สถานะ: ocr_success -> waiting_admin -> completed
-- default = 'waiting_admin' (แถวเดิมทั้งหมด = ดีลจบแล้ว ตีความเป็น completed ในแอป
--   แต่ตั้ง default เป็น waiting_admin สำหรับแถวใหม่ที่บอทสร้างหลัง OCR ผ่าน)
--
-- NOTE (Firebase): runtime ปัจจุบันใช้ Firestore — ค่า status ชุดเดียวกัน
--   ถูก enforce ใน src/types/transactions.ts + setTransactionStatus()
--   และมี composite index status+created_at ใน firestore.indexes.json
-- ============================================================
alter table public.transactions
  add column if not exists status text not null default 'waiting_admin';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_status_check'
  ) then
    alter table public.transactions
      add constraint transactions_status_check
      check (status in ('ocr_success', 'waiting_admin', 'completed'));
  end if;
end $$;

-- index สำหรับ query ตามสถานะ + เวลา
create index if not exists idx_tx_status_created
  on public.transactions (status, created_at desc);
