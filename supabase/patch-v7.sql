-- ============================================================
-- CE VAULT patch v7 — แยกห้อง (per-room): ผูก chat_id ทุกธุรกรรม
-- paste ใน Supabase SQL Editor > Run (idempotent)
-- แก้ปัญหา "กำไรมั่ว" — แต่ละห้อง (กลุ่มเทเลแกรม) เห็นเฉพาะยอดของตัวเอง
-- ============================================================
alter table public.transactions add column if not exists chat_id bigint;

-- index สำหรับดึงยอดต่อห้อง (chat_id + เวลา)
create index if not exists idx_tx_chat         on public.transactions (chat_id);
create index if not exists idx_tx_chat_created on public.transactions (chat_id, created_at desc);
