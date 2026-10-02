# Supabase Operational Cutover — 2026-10-02

> สรุปการย้ายระบบการเงินของ CE VAULT Bot จาก Firestore ไป Supabase ทั้งเส้นทาง (fresh start)
> ต่อจาก `docs/SUPABASE_FRESH_START.md` (PR #77) — PR นี้ปลดล็อก "Cutover blocker" ในเอกสารนั้น

## What changed (สรุประดับสูง)

- **Financial write ทุกเส้นทาง** ผ่าน Postgres RPC 3 ตัว (`ce_insert_transaction`, `ce_edit_transaction`, `ce_delete_transaction` ใน `supabase/patch-v10-operational-cutover.sql`):
  แถวธุรกรรม + เหรียญตกค้างแอดมิน (`admins.holding_usdt`) + ยอดบัญชีธนาคาร (`bank_accounts.current_balance`) เปลี่ยนใน **Postgres transaction เดียว** —
  error เกิดเมื่อไรยกเลิกทั้งชุด (deny on error) และ delta คำนวณจากแถวที่ถูก lock ไว้ (ไม่มี TOCTOU)
- `src/lib/firebaseAdmin.ts` กลายเป็น **Supabase-backed compatibility shim** (export `adminDb` แบบ collection().doc().get/set/update/delete + where/orderBy/limit) —
  `app/api/telegram/webhook/route.ts` เหมือนเดิมทุกไบต์โดยตั้งใจ (ไฟล์ใหญ่มาก แก้แบบ full rewrite ใน PR เดียวกันความเสี่ยงสูง)
  ตัว shim เรียก Supabase จริงใต้ดิน และ throw ทันทีถ้าเจอ method ที่ไม่รองรับ (runTransaction/batch ฯลฯ) — ไม่มี silent fallback
- Service อื่นเขียนใหม่ตรง ๆ บน Supabase: transactions (RPC), telegram (สลิป → bucket `slips`), notifier, botTools, receiverIntel
- API routes ทั้งหมดใช้ Supabase: health, status/[id], cron/day-cut, dashboard/data, empire-desk/status, export + หน้า dashboard/transactions/[id]
- `public/empire-desk-monitor.js`: เช็ค `value.db === true || value.firestore === true` (compat กับ monitor เก่าบนหน้า Empire Desk)
- ลบไฟล์ Firebase ที่ไม่ใช้แล้ว: firebase.json, .firebaserc, firestore.indexes.json, firestore.rules, storage.rules, src/lib/firebaseClient.ts,
  scripts/diag.mjs, scripts/setup-db.mjs, scripts/verify-db.mjs, scripts/cleanup-test.mjs, docs/FIRESTORE_INDEXES.md
- npm scripts ที่อ้าง Firebase ถูกลบ (firebase/firebase-admin ยังอยู่ใน package.json ชั่วคราว — ถอดพร้อม lockfile update ใน PR ถัดไป เพื่อไม่ให้ `npm ci` พัง)
- **Update (PR default-supabase)**: `DATABASE_PROVIDER` ไม่จำเป็นอีกต่อไป — unset หรือ `supabase` = ใช้ Supabase, `firebase` ยังถูกเคารพสำหรับ legacy, ค่าอื่น fail closed (`src/lib/databaseProvider.ts`)

## ขั้นตอนหลัง merge (ต้องทำตามลำดับ)

1. **รัน SQL ก่อนเปิดใช้** — Supabase Dashboard (project `iuaaviivkumvzbdmpzty`) → SQL Editor → วางและ Run `supabase/patch-v10-operational-cutover.sql` (idempotent):
   - เพิ่มคอลัมน์ `transactions.admins` (jsonb snapshot ชื่อสตาฟ — รักษารูปแบบ `admins?.name` ของเดิม)
   - ขยาย precision `usdt_amount`/`expected_usdt`/`fee_usdt`/`holding_usdt` → numeric(24,6)
   - สร้าง RPC atomic 3 ตัว
   - revoke EXECUTE ของทุก function ใน public schema จาก public/anon/authenticated (เหลือ service_role เท่านั้น)
   - **สถานะ: ทำแล้ว (2026-10-02)** — migration `patch_v10_operational_cutover` ถูก apply และตรวจสอบด้วย SQL แล้ว
2. **ตั้ง env บน Railway ไม่จำเป็นอีกต่อไป** — `DATABASE_PROVIDER` default เป็น `supabase` ในตัวโค้ดเองแล้ว (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` มีอยู่แล้ว) — merge เข้า main แล้ว Railway จะ redeploy อัตโนมัติ; ถ้าเคยตั้ง `DATABASE_PROVIDER` เป็นค่าอื่นไว้ ให้ลบหรือเปลี่ยนเป็น `supabase` (ค่าอื่นนอกเหนือจาก supabase/firebase จะ fail closed)
3. env อื่นที่ต้องมีอยู่แล้ว: `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `API_SECRET`, `APP_URL`, `CE_AUTO_WEBHOOK=1`, dashboard passphrase/session secret, `NOTIFY_CHAT_ID`

## ตรวจสอบหลัง deploy

- `GET /api/health` → `status:'ok'`, `db:'ok'`, `database:'supabase'`, version `4.0-supabase` และ `commit` = 12 ตัวแรกของ commit SHA ที่ deploy จริง (เทียบกับ main เพื่อยืนยันว่า deploy ไม่ตกรุ่น)
- `GET /api/health/supabase` → ok
- `GET /api/live` → มี field `commit` บอก commit SHA ของ deploy ปัจจุบัน
- ในกลุ่ม Telegram ของระบบจริง: `/ping` บอทตอบ, `/ledger` เลดเจอร์วันนี้, `/ce` สรุป, `/today` การ์ดยอด
- ดีลทดสอบจริง 1 รายการ: ฝาก → OCR → ยืนยัน → Mark Completed → แก้ไขยอด → ลบ (เช็ค holding กลับมาถูกต้องทุกขั้น)
- Dashboard: หน้าแรก + หน้ารายละเอียดธุรกรรมแสดงข้อมูลตรงกับ Telegram
- Empire Desk: สถานะ "Backend ออนไลน์ · ฐานข้อมูลเชื่อมต่อแล้ว"

## ข้อกำหนดสำคัญ

- **Firestore เดิมเก็บไว้เป็น read-only historical backup** — ห้ามลบ project/ข้อมูล จนกว่าจะยืนยันว่า Supabase ใช้งานจริงสมบูรณ์และข้อมูลสำคัญได้รับการ export แล้ว
- CI ของ repo เป็น unit/boundary test บน dev server แยก — **ไม่ใช่การพิสูจน์ production ใช้งานได้**;
  ต้อง smoke test จริงตามขั้นตอนด้านบนก่อนประกาศใช้งาน (ดู `docs/QA-E2E-REAL-STATUS.md`)
- Webhook route ถูกออกแบบให้ byte-identical โดยตั้งใจ — ถ้าจะแก้ในอนาคต แนะนำแปลงเป็น Supabase ตรง ๆ แล้วค่อยถอด shim `firebaseAdmin.ts`
