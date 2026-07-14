-- CE VAULT patch v6 — "เริ่มวันใหม่" (day-cut ต่อห้อง)
-- paste ใน Supabase SQL Editor > Run (idempotent)
-- ยอดวันนี้จะนับจาก max(เที่ยงคืน, day_cut_at) → กดเริ่มวันใหม่ = ตั้ง day_cut_at = ตอนนี้
alter table public.chat_settings add column if not exists day_cut_at timestamptz;
