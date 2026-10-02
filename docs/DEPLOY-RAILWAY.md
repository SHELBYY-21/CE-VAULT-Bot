# CE VAULT — Railway Deployment Runbook

Production runs on **Railway** as a single Docker web service (Next.js: Telegram webhook + Firestore ledger + dashboard). This runbook replaces the retired Render / Netlify / Firebase App Hosting configs (removed from `main` on 2026-09-29).

## หา Public Domain (สำคัญที่สุด)
1. เข้า https://railway.com → login
2. เลือก project CE VAULT → คลิก service ตัว web (Docker)
3. ทางลัด: แท็บ **Variables** → หา `RAILWAY_PUBLIC_DOMAIN` (Railway ใส่ให้อัตโนมัติเมื่อมี public domain)
4. หรือ: แท็บ **Settings** → **Networking** → **Public Domain** (ถ้ายังไม่มี กด **Generate Domain**)
5. URL จะมีรูปแบบ `https://<name>-xxxx.up.railway.app` — ใช้ตัวนี้เป็น `APP_URL`

## Env ที่ต้องมีใน Railway (ใส่ใน Railway Variables เท่านั้น — ห้าม commit)
- `BOT_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `API_SECRET`, `TELEGRAM_WEBHOOK_SECRET`
- `APP_URL` = https://<railway-public-domain>
- `CE_AUTO_WEBHOOK=1` ให้ `scripts/render-start.mjs` ลงทะเบียน webhook อัตโนมัติ (getMe → setWebhook → getWebhookInfo) — เปิดหลังจาก `/api/health` ผ่านแล้วเท่านั้น
- `ADMIN_TELEGRAM_IDS`, `NOTIFY_CHAT_ID`, และ optional `GROK_API_KEY`, `DEFAULT_MARKET_RATE`
- หมายเหตุ: `RAILWAY_PUBLIC_DOMAIN` ถูกใช้เป็น fallback ของ `APP_URL` ใน startup script

## ตรวจสอบหลัง deploy
1. `GET https://<railway-domain>/api/live` → 200 (liveness แยกจาก DB)
2. `GET https://<railway-domain>/api/health` → 200 + `db: ok` (Firestore)
3. `GET https://<railway-domain>/api/health/supabase` → probe read-only (ไม่เกี่ยวกับ cutover)
4. ใน Telegram: ส่ง `/ping` ที่บอท → ต้องตอบ "CE VAULT ONLINE"; `/ce` → เมนูห้อง
5. ถ้าไม่ตอบ: เช็ค logs หา `[CE Bot] Token validated` / `webhook active` แล้วยืนยันว่า webhook ชี้ URL Railway

## ความปลอดภัย
- Railway auto-deploy ตาม push ไป main — CI ของ GitHub ไม่ใช่ gate ของ Railway ให้รอ CI เขียวก่อน push ของสำคัญ
- ห้ามใส่ credentials ใน GitHub commits/docs — ใส่ใน Railway Variables เท่านั้น
- ห้ามเปิด consumer อื่นแข่งกับ webhook (`bot/` bridge สำหรับ dev เท่านั้น)
- Empire Desk (chatgpt.site): อัปเดต script src และ `window.CE_DESK_STATUS_URL` ให้ชี้ Railway domain

## สิ่งที่ถูกลบออกจาก repo (2026-09-29)
`render.yaml`, `docs/DEPLOY-RENDER.md`, `apphosting.yaml`, `netlify.toml`, `netlify/functions/day-cut-cron.ts`
