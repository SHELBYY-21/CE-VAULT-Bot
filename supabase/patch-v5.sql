-- ============================================================
-- CE VAULT patch v5 — Unified Deal workflow (THB slip + USDT confirm)
-- paste ใน Supabase SQL Editor > Run (idempotent, backward-compatible)
-- ============================================================

-- 1) transactions: คอลัมน์ใหม่สำหรับ "ดีลเดียวจบ" (ทั้งหมด nullable → ธุรกรรมเก่าไม่กระทบ)
alter table public.transactions add column if not exists buy_rate        numeric(20,4);  -- THB / USDT (คำนวณอัตโนมัติ)
alter table public.transactions add column if not exists room_name       text;           -- ห้อง/กลุ่ม (Sell Rate มาจากห้องนี้)
alter table public.transactions add column if not exists ocr_confidence  numeric(6,2);   -- ความมั่นใจ OCR สลิป THB (0-100)
alter table public.transactions add column if not exists usdt_network    text;           -- TRC20 / ERC20 / BEP20 ...
alter table public.transactions add column if not exists usdt_txid       text;           -- hash ธุรกรรม USDT
alter table public.transactions add column if not exists usdt_image_url  text;           -- สกรีนช็อตโอน USDT
alter table public.transactions add column if not exists receiver_name   text;           -- ชื่อผู้รับ (denormalized เพื่อ ledger)
alter table public.transactions add column if not exists receiver_bank   text;
alter table public.transactions add column if not exists receiver_last4  text;
alter table public.transactions add column if not exists ledger_ref      text;           -- Ledger ID ที่แสดง (#CE-YYYYMMDD-XXXX)

-- index FK receiver_id (best practice: FK ต้องมี index) + ledger_ref สำหรับค้นย้อนหลัง
create index if not exists idx_tx_receiver  on public.transactions (receiver_id);
create index if not exists idx_tx_ledgerref on public.transactions (ledger_ref);

-- 2) bot_sessions: เก็บ pending deal ระหว่างรอ USDT
alter table public.bot_sessions add column if not exists pending_usdt    numeric;
alter table public.bot_sessions add column if not exists usdt_network    text;
alter table public.bot_sessions add column if not exists usdt_txid       text;
alter table public.bot_sessions add column if not exists usdt_image_url  text;
alter table public.bot_sessions add column if not exists ocr_conf        numeric(6,2);
alter table public.bot_sessions add column if not exists ledger_ref      text;

-- 3) chat_settings: ชื่อห้อง (room label) — Sell Rate = fixed_rate (มีอยู่แล้วจาก patch-v2)
alter table public.chat_settings add column if not exists room_name text;
