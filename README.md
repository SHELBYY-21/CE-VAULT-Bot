# USDT Arbitrage — Telegram Bot + Next.js Dashboard

ระบบบันทึกสลิปโอน THB → แลก USDT ผ่าน Telegram พร้อมแดชบอร์ด Next.js + Supabase (Realtime)

## โครงสร้างโปรเจกต์

```
BOT/
├─ app/                                     # Next.js App Router
│  ├─ api/transactions/thb-deposit/route.ts # API เฟส 1 (ฝาก THB -> USDT)
│  ├─ api/transactions/usdt-send/route.ts   # API เฟส 2 (ส่ง USDT)
│  ├─ dashboard/page.tsx                     # แดชบอร์ด (Realtime)
│  ├─ dashboard/transactions/[id]/page.tsx   # หน้ารายละเอียด + ภาพสลิป
│  ├─ layout.tsx / page.tsx / globals.css
├─ src/
│  ├─ components/AverageFeeCard.tsx
│  ├─ components/TransactionsTable.tsx
│  ├─ lib/profit.ts / fees.ts                # ฟังก์ชันคำนวณ
│  ├─ lib/supabaseClient.ts / supabaseAdmin.ts
│  └─ types/transactions.ts                  # Interfaces กลาง
├─ supabase/schema.sql                       # SQL สร้างตาราง + RPC + RLS + bucket
├─ bot/                                      # Telegram Bot (แยกโปรเจกต์)
│  ├─ src/index.ts
│  ├─ package.json / tsconfig.json / .env.example
├─ package.json / tsconfig.json / tailwind.config.ts ...
```

---

## วิธีติดตั้งและรัน (ทำตามทีละข้อ)

### Step 1 — เตรียมโปรเจกต์ Next.js
โฟลเดอร์นี้เตรียมไฟล์ให้ครบแล้ว ข้ามการ `create-next-app` ได้เลย
> ถ้าอยากเริ่มจาก template ทางการ: `npx create-next-app@latest -e with-supabase` แล้วค่อยเอาไฟล์ในนี้ไปวางทับ

### Step 2 — Tailwind
ไฟล์ `tailwind.config.ts`, `postcss.config.js`, `app/globals.css` เตรียมไว้แล้ว (ไม่ต้องตั้งค่าเพิ่ม)

### Step 3 — ตั้งค่า Supabase
1. สร้างโปรเจกต์ที่ https://supabase.com → New project
2. เปิด **SQL Editor → New query** วางเนื้อหาไฟล์ [`supabase/schema.sql`](supabase/schema.sql) แล้วกด **Run**
   - จะได้ตาราง `admins`, `bank_accounts`, `transactions`, RPC, เปิด Realtime, สร้าง bucket `slips` และ seed แอดมินตัวอย่าง
3. แก้ `telegram_user_id` ของแอดมินให้เป็น ID จริง (ทัก **@userinfobot** ใน Telegram เพื่อดู ID ของคุณ)
   ```sql
   update admins set telegram_user_id = 123456789 where name = 'ADMIN A';
   ```

### Step 4 — ENV ของ Next.js
คัดลอก `.env.local.example` เป็น `.env.local` แล้วกรอกค่าจาก **Supabase → Project Settings → API**
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Step 5 — ไฟล์โค้ด
วางไว้ครบแล้วในโฟลเดอร์นี้ (types, lib, components, pages, API) ไม่ต้องทำอะไรเพิ่ม

### Step 6 — ติดตั้ง & รัน Dashboard
```bash
npm install
npm run dev
```
เปิด http://localhost:3000 → เด้งไป `/dashboard`

### Step 7 — สร้าง Telegram Bot
1. ทัก **@BotFather** → `/newbot` → ตั้งชื่อ → รับ **BOT_TOKEN** → ใส่ใน `.env.local` (`BOT_TOKEN=...`)
2. เพิ่มบอทเข้ากลุ่ม และปิด Privacy Mode ให้บอทเห็นทุกข้อความในกลุ่ม:
   `/setprivacy` → เลือกบอท → **Disable**

> **สถาปัตยกรรม v2:** บอทรันเป็น **Webhook ในตัว Next.js** (`app/api/telegram/webhook`) = ออนไลน์ 24/7 บน Vercel
> ไม่มีโปรเซสแยก · ทุกคนในกลุ่มใช้ได้ · ผู้ใช้ใหม่จะถูกถามชื่อก่อนใช้งาน (auto-register)

### Step 8 — รันในเครื่อง (dev)
Webhook ต้องมี public URL — ตอน dev ใช้ **dev bridge** (long-poll แล้ว forward เข้า webhook local) ได้เลย ไม่ต้องมี ngrok:
```bash
npm run dev                 # terminal 1 — Next.js (webhook อยู่ในนี้)

cd bot && npm install
npm run dev                 # terminal 2 — dev bridge (เห็น "🌉 CE VAULT dev bridge")
```

### Step 9 — Deploy ขึ้น Vercel (โปรดักชัน 24/7)
```bash
npm i -g vercel
vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add API_SECRET
vercel env add BOT_TOKEN
vercel env add APP_URL          # = https://<project>.vercel.app
vercel --prod
```

### Step 10 — เปิด webhook (ครั้งเดียว)
เปิด URL นี้ในเบราว์เซอร์ (แทนค่า secret ด้วย `API_SECRET`):
```
https://<project>.vercel.app/api/telegram/set-webhook?secret=<API_SECRET>
```
เห็น `{ "telegram": { "ok": true } }` = บอทออนไลน์ตลอดแล้ว ✅ (ปิด dev bridge ได้)

---

## ทดสอบการทำงาน
1. ทักบอท `/start` → ผู้ใช้ใหม่บอทจะ**ถามชื่อ** → พิมพ์ชื่อ → ลงทะเบียนอัตโนมัติ
2. ส่ง **รูปสลิป** 1 รูป → บอทตอบ "อัปโหลดสำเร็จ" (การ์ดธีม CE Vault)
3. พิมพ์ `5000 11` → บอทสรุปกำไร/ค่าธรรมเนียม + เหรียญตกค้าง + ปุ่มเปิดแดชบอร์ด
4. เฟส 2: ส่งรูป + แคปชัน `ส่ง usdt` แล้วพิมพ์ `11` → holding ลดลง
5. เปิด `/dashboard` เห็นรายการเด้งขึ้นแบบ Realtime

---

## 🤖 คำสั่งบอท & ฟีเจอร์
| คำสั่ง / การกระทำ | ผล |
|---|---|
| `/start`, `/help` | เมนู CE Vault (ผู้ใช้ใหม่ถูกถามชื่อก่อน) |
| ส่งรูปสลิป → พิมพ์ `11` | ฝาก THB → USDT (ยอด THB มาจาก OCR ถ้าอ่านได้) |
| ส่งรูป + แคปชัน `ส่ง usdt` → `11` | ส่ง USDT ออก (หัก holding) |
| `/rate` | ดูเรตปัจจุบัน (เรตตลาด = Binance TH real-time) |
| `/rate 35.5` | ตั้ง**เรตขายของเรา** (เรตตลาดอิง Binance TH อัตโนมัติ) |
| `/rate 35.5 34.8` | ตั้งเรตขาย + เรตตลาดเอง (override) |

**เรตตลาดจริง (market rate):** ดึงสดจาก **Binance TH** `GET https://api.binance.th/api/v1/ticker/price?symbol=USDTTHB` (public, cache 30 วิ) — ใช้คำนวณ Expected USDT / ค่าธรรมเนียม และโชว์บนแดชบอร์ด (`/api/market-rate`, อัปเดตทุก 30 วิ). ถ้า Binance TH ล่ม → fallback เรตในตาราง `rates` → ค่า ENV

**OCR อ่านยอดสลิป:** ตั้ง `OCR_SPACE_API_KEY` (ฟรีที่ https://ocr.space/ocrapi) → บอทอ่านยอด THB อัตโนมัติ แอดมินพิมพ์แค่ USDT. ถ้าไม่ตั้งคีย์/อ่านไม่ได้ → พิมพ์ `THB USDT` เองได้เสมอ

**แดชบอร์ด:** การ์ดสรุปกำไรรวม · Average Fee % · เรตปัจจุบัน · จำนวนธุรกรรม + รายการเหรียญตกค้างต่อแอดมิน (Realtime)

---

## 🔒 ป้องกัน API ด้วย Secret Key
API route ที่เขียนข้อมูล (`thb-deposit`, `usdt-send`) ตรวจ header `x-api-key` แล้ว

1. สร้างกุญแจ: `openssl rand -hex 32`
2. ใส่ค่าเดียวกันทั้ง 2 ที่:
   - `.env.local` (Next.js) → `API_SECRET=...`
   - `bot/.env` (บอท) → `API_SECRET=...`  ← บอทจะแนบ header ให้อัตโนมัติ
3. ตอน deploy Vercel: `vercel env add API_SECRET`
> ถ้าเว้น `API_SECRET` ว่าง = ปิดการตรวจ (ใช้เฉพาะ dev). โปรดักชันควรตั้งเสมอ

## 🧪 ทดสอบ API โดยไม่ต้องเปิด Telegram
```bash
cd bot
npm run test:api      # ยิง health + thb-deposit + usdt-send แล้วพิมพ์ผลลัพธ์
```
> ตั้ง `TEST_TELEGRAM_ID` ใน `bot/.env` ให้ตรงกับแอดมินในตาราง `admins`

## ⚡ Deploy เร็วสุด (ได้ลิงก์จริง)
**A) เปิด localhost เป็นลิงก์สาธารณะทันที** (เทสบอทจริงใน ~30 วิ)
```bash
npm run dev                 # terminal 1
npx ngrok http 3000         # terminal 2 -> ได้ https://xxxx.ngrok-free.app
```
เอา URL ใส่ `API_BASE_URL` + `DASHBOARD_URL` ใน `bot/.env`

**B) ขึ้น Vercel ถาวร** (region `sin1` สิงคโปร์ ตั้งไว้ใน `vercel.json` แล้ว)
```bash
npm i -g vercel
vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add API_SECRET
vercel --prod
```
API จะอยู่ที่ `https://<project>.vercel.app/api/transactions/thb-deposit`

---

## หมายเหตุด้านความปลอดภัย
- `SUPABASE_SERVICE_ROLE_KEY` และ `API_SECRET` ใช้เฉพาะฝั่ง server (API route + bot) — ห้ามใส่ใน client
- RLS เปิดอ่านสาธารณะ (select) เพราะเป็นเครื่องมือภายใน หากต้องการจำกัดสิทธิ์ ให้เพิ่ม Supabase Auth แล้วปรับ policy
- OCR อ่านยอดจากสลิปยังไม่รวมในเวอร์ชันนี้ (ใช้การพิมพ์ตัวเลขแทน) — ต่อยอดได้ด้วย Google Vision / Typhoon OCR ภายหลัง
