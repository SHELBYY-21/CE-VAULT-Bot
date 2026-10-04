# Netlify Cutover — 2026-10-02 (บันทึกประกอบ SUPABASE_CUTOVER_2026-10-02.md)

Production ย้ายจาก Railway มา **Netlify**: https://zesty-semolina-b169fc.netlify.app
(site id `e3392b5c-707f-4ab1-bdd7-37271dd092e2`, team `callmeboss722`, repo ตัวเดิม)

## สิ่งที่เปลี่ยนใน repo (PR เรียงตามเวลา)
- **PR #84**: `DATABASE_PROVIDER` default = supabase (ไม่ตั้งค่าก็ใช้ Supabase), health/live รายงาน `commit`
- **PR #85**: `next.config.js` ข้าม `output:'standalone'` เมื่อ `NETLIFY==='true'`
- **PR #86**: health/live fallback `COMMIT_REF?.slice(0,12)` (Netlify ให้ COMMIT_REF ตอน build)
- **PR #87** (netlify-coding[bot], เจ้าของ merge เอง): **Dashboard เปิดเป็นสาธารณะ** (ลบ passphrase login, layout guard และ auth ใน `/api/dashboard/data` — ตัดสินใจโดยเจ้าของ ยอมรับว่าใครมีลิงก์เห็นข้อมูลได้), การเขียน ledger ยังป้องกันด้วย session หรือ `x-api-key`, homepage redirect เป็น `/dashboard`
- **PR #88**: แก้ E2E ที่ fail จาก PR #87 — ตั้ง synthetic `API_SECRET` ใน `playwright.config.ts` webServer env ให้ anonymous write โดน 401 ตาม production posture (CI กลับมาเขียว 6/6)

## ข้อแตกต่างสำคัญจาก Railway
1. **ไม่มี auto-webhook**: `scripts/render-start.mjs` รันเฉพาะ `npm run start` ซึ่ง Netlify ไม่ได้ใช้ → `CE_AUTO_WEBHOOK=1` ไม่มีผล ต้องลงทะเบียน webhook เอง (ดูด้านล่าง)
2. **env เริ่มใช้เมื่อ build ใหม่เท่านั้น**: หลังแก้ env ใน Netlify UI ต้อง trigger deploy ใหม่เสมอ
3. **ไม่มี scheduler ในตัว**: cron เช่น day-cut ต้องเรียกจากภายนอก (n8n cron / cron-job.org) ด้วย `POST /api/cron/day-cut` + header `x-api-key: API_SECRET`

## ลงทะเบียน Telegram webhook (manual, ทำครั้งเดียวหลัง BOT_TOKEN ใช้ได้)
route `POST /api/telegram/set-webhook` ตรวจ `getMe` → `setWebhook` (secret_token = TELEGRAM_WEBHOOK_SECRET) → `getWebhookInfo` ให้ครบในตัว

```bash
curl -X POST https://zesty-semolina-b169fc.netlify.app/api/telegram/set-webhook \
  -H "x-api-key: <API_SECRET>"
```

สำเร็จ: `{"ok":true,"webhookUrl":"https://zesty-semolina-b169fc.netlify.app/api/telegram/webhook"}`
- `503 telegram_configuration_incomplete` → ตรวจ `BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET`/`APP_URL` (และ deploy ใหม่แล้วยัง)
- `503 invalid_bot_token` → โทเคนใช้ไม่ได้ (เคยเกิดตอน BOT_TOKEN ถูก revoke — ก็อปจาก Railway ใหม่หรือขอจาก @BotFather)
- `502` → Telegram ปฏิเสธ setWebhook

หลังตั้ง webhook ต้อง**ปิด Railway เก่า** (หรือเลิก webhook ทิศทางเดิม) เพื่อไม่ให้ update วิ่งสองที่

## ตรวจสอบสุขภาพ
- `GET /api/health` → `status:"ok", database:"supabase", db:"ok", commit:<COMMIT_REF>`
- `GET /api/health/supabase` → probe ตรงไป Supabase
- `GET /api/empire-desk/status` → `telegramWebhook:"not_verified"` คือยังไม่ได้ตั้ง webhook

## งานที่ยังค้าง (หลัง 2026-10-02)
- [ ] ก็อป `BOT_TOKEN` ที่ใช้ได้จาก Railway → Netlify env → redeploy
- [ ] รัน curl ตั้ง webhook ตามด้านบน → smoke test: `/ping`, `/ledger`, `/ce`, ดีลทดสอบ 1 รายการ (ฝาก→OCR→ยืนยัน→Mark Completed→แก้ยอด→ลบ)
- [ ] Empire Desk (chatgpt.site): อัปเดต `window.CE_DESK_STATUS_URL` → `https://zesty-semolina-b169fc.netlify.app/api/empire-desk/status`
- [ ] ตั้ง cron ภายนอกสำหรับ `/api/cron/day-cut`
- [ ] ก็อป `STICKER_*` / `WEBM_*` env (build log เตือนว่า file_ids ว่างอยู่)
- [ ] ลบ/archive site `ce-vault-bot-thtu` ที่ผูก repo เดิมซ้ำ, ปิด Railway service เก่าหลัง smoke test ผ่าน, ปิด GitHub Actions workflow "Dashboard 24h" ที่ยังผูก Firebase เก่า
- [ ] ลบ scratch branch `tmp/artifact-extract` ใน GitHub UI
- [ ] (อนาคต) ถอด dependency firebase/firebase-admin พร้อม lockfile, แปลง webhook route เรียก Supabase ตรง ๆ แล้วลบ adminDb shim
