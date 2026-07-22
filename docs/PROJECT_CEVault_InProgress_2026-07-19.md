# CE VAULT — Project Dashboard

> **สถานะ:** 🟢 In Progress — Production Live
> **ธีม/สไตล์:** Dark cyberpunk fintech · มาสคอต NOVA (เขียว `#00E676` / ฟ้า `#00D8FF` / ทอง `#F4C542`)
> **ประเภท:** Telegram Bot (webhook) + Next.js Admin Dashboard
> **อัปเดตล่าสุด:** 19 กรกฎาคม 2569
> **ผู้ดูแล:** razen7 (ร่วมกับ Claude Code)

## สารบัญ
- [Project](#project)
- [Current Status](#current-status)
- [Features & Roadmap](#features--roadmap)
- [Tech Stack](#tech-stack)
- [Phase Prompts](#phase-prompts)
- [Architecture](#architecture)
- [Quick Reference](#quick-reference)
- [Changelog](#changelog)
- [Notes & Recommendations](#notes--recommendations)

---

## Project

| Name | Type | Theme | Primary Goal | Secondary Goal |
|---|---|---|---|---|
| CE VAULT | Telegram Bot + Admin Dashboard | Dark cyberpunk fintech, มาสคอต NOVA | ลูกค้าแลก THB↔USDT ผ่านบอทได้เอง ปลอดภัย รวดเร็ว 24/7 | แอดมินติดตามกำไร/holding/ธุรกรรมแบบเรียลไทม์ |

---

## Current Status

| Priority | รายการ | สถานะ |
|---|---|---|
| 🔴 High | `BOT_TOKEN` เคยถูกพิมพ์ในแชทตรงๆ และหลุดเข้าไฟล์ `.env.local.example` / `bot/.env.example` (พบและแก้กลับเป็น placeholder แล้วในเซสชันนี้) | **แนะนำ:** ถ้ากังวลว่าเคยรั่วสู่ที่อื่น ให้ revoke/regenerate ผ่าน @BotFather → `/revoke` แล้วตั้งค่าใหม่ใน env ของโฮสต์เท่านั้น |
| 🟠 Medium | Sticker pack 12 states เรนเดอร์เป็น WEBM จริงแล้ว (`assets/stickers/`) แต่ยังไม่ได้ publish ขึ้น Telegram | รอชื่อ pack (เช่น `ce_vault_nova_by_CEboi88bot`) + คำยืนยัน แล้วรัน `createNewStickerSet`/`addStickerToSet` ผ่าน Bot API |
| 🟠 Medium | Avatar/Banner เรนเดอร์เป็น PNG จริงแล้ว (`assets/brand/`) แต่ยังไม่ได้อัปโหลดขึ้นบอทจริง | ต้องทำมือผ่าน @BotFather → `/setuserpic` (ไม่มี Bot API ให้ตั้ง avatar ให้บอทตัวเองได้) |
| 🟡 Low | สถานะ `ocr_success` มีอยู่ในโค้ด/การ์ดแล้วแต่บอทไม่เคยเซ็ตจริง (แถวถูกสร้างตอนจบดีลเลย = ข้าม state นี้ไปที่ `waiting_admin`) | ต้องแก้ bot flow ให้สร้างแถว transaction ตั้งแต่ตอน OCR ผ่าน (ชื่อ+เลขบัญชี 4 ตัวท้ายตรง) ก่อนรอแอดมิน |
| 🟢 Done | อัปเกรด Next.js 14.2 → 16.2, React 18 → 19.2 | Build เขียว, deploy แล้ว |
| 🟢 Done | Rebrand ทั้งแอปเป็นพาเลท NOVA (เขียว/ฟ้า/ทอง) | ยืนยันสดในเบราว์เซอร์แล้ว — ไม่เหลือ indigo/violet เดิม |
| 🟢 Done | หน้าสถานะลูกค้า `/status/[id]` realtime (3 states) | ทดสอบ flow เต็มกับ Supabase จริงแล้ว (waiting→completed เด้งสดไม่ต้อง reload) |
| 🟢 Done | ปุ่ม "ส่ง USDT แล้ว" ในแดชบอร์ดแอดมิน | อัปเดต `status='completed'` ได้จริง |
| 🟢 Done | Circle SCP/Developer-Controlled Wallets scaffolding | มีไว้เผื่ออนาคต (`/api/circle/health`) — ยังไม่ได้ต่อใช้งานจริง |

---

## Features & Roadmap

**Phase 1 — Core Exchange Bot** ✅
- รับสลิป → OCR อ่านยอด → บันทึกดีล THB/USDT → คำนวณกำไร/ค่าธรรมเนียม
- แดชบอร์ดแอดมิน: กำไรรวม, ค่าฟีเฉลี่ย, เรตตลาด (Binance TH), holding ต่อแอดมิน, ธุรกรรมล่าสุดแบบเรียลไทม์

**Phase 2 — Customer Order Status** ✅
- คอลัมน์ `status` (`ocr_success` / `waiting_admin` / `completed`)
- หน้า `/status/[id]` แบบ public เห็นเฉพาะยอด USDT (ไม่เห็นกำไร/ค่าฟี) realtime ผ่าน Supabase

**Phase 3 — Brand System** ✅
- มาสคอตต้นฉบับ **NOVA** (ไม่อ้างอิงคาแรกเตอร์ลิขสิทธิ์)
- Rebrand token กลาง (`globals.css`) ทั่วแอป
- Render จริง: avatar 512×512, banner 1200×630, sticker 12 states (WEBM + alpha)

**Phase 4 — Go-Live Assets** 🔥 (ถัดไป)
- อัปโหลด avatar ผ่าน @BotFather
- Publish sticker pack ขึ้น Telegram จริง
- ต่อ `ocr_success` เข้า bot flow จริง

**Phase 5 — Settlement Integration** (อนาคต)
- ต่อ Circle SCP/Developer-Controlled Wallets เข้ากับ flow จริง (ตอนนี้ scaffold ไว้เฉยๆ)

---

## Tech Stack

| Component | Technology | Notes |
|---|---|---|
| Framework | Next.js 16.2 (App Router, Turbopack) | อัปเกรดจาก 14.2 แล้ว |
| Language | TypeScript | strict mode |
| UI | React 19.2 + Tailwind + CSS custom properties | โทน dark cyberpunk |
| Database | Supabase Postgres | RLS + Realtime (`transactions`, `admins`, `bank_accounts`) |
| Bot | Telegram Bot API (webhook) | `app/api/telegram/webhook` — ไม่มี process polling แยก |
| Hosting | (self-host / Node host ที่รองรับ Next.js) | ตั้ง webhook ไปที่ `/api/telegram/webhook` |
| Asset pipeline | `sharp` + `ffmpeg-static` | เรนเดอร์ SVG → PNG/WEBM แบบ headless ไม่ง้อเครื่องมือภายนอก |
| Optional | Circle SCP / Developer-Controlled Wallets | scaffold ไว้ ยังไม่ผูกใช้งานจริง |

---

## Phase Prompts

```prompt
[PHASE 4 - PUBLISH STICKERS] เผยแพร่ sticker pack 12 states ขึ้น Telegram จริง

ปัญหา/งานที่ต้องแก้:
- ไฟล์ WEBM 12 ตัวพร้อมแล้วใน assets/stickers/ (512x512, VP9+alpha, ผ่านสเปก Telegram)
- ยังไม่เคยเรียก Bot API เพื่อสร้าง sticker set จริง

สิ่งที่ต้องเพิ่ม:
- สคริปต์อ่าน BOT_TOKEN จาก process.env (ห้าม hardcode)
- เรียก createNewStickerSet ด้วยไฟล์แรก แล้ว addStickerToSet ที่เหลือ 11 ไฟล์
- ตั้งชื่อ pack รูปแบบ <name>_by_<BotUsername> ตามข้อกำหนด Telegram

ข้อกำหนดสำคัญ:
- คงฟังก์ชันเดิมไว้ครบ ห้ามแก้ไฟล์ webm ที่มีอยู่
- ต้องขอ confirm ก่อนยิง API จริง (เป็นการ publish สู่สาธารณะ)

ช่วยวางแผนก่อน แล้วค่อยเขียนโค้ดให้สมบูรณ์
```

**Expected Output:**
- สคริปต์ `scripts/publish-stickers.mjs` รันสำเร็จ พิมพ์ลิงก์ pack (`t.me/addstickers/<name>`)
- เปิดลิงก์แล้วเห็นสติ๊กเกอร์ครบ 12 ตัวจริงบน Telegram

```prompt
[PHASE 4 - OCR SUCCESS STATE] ให้บอทเซ็ต status='ocr_success' จริงตอน OCR ผ่าน

ปัญหา/งานที่ต้องแก้:
- ตอนนี้แถว transaction ถูกสร้างตอนจบดีลเลย (finalizeDeal) ข้าม state ocr_success ไปเลย
- ลูกค้าไม่เคยเห็นการ์ด "🔍 กำลังตรวจสอบสลิป... ✅ OCR สำเร็จ" จริง

สิ่งที่ต้องเพิ่ม:
- สร้างแถว transaction ตั้งแต่ OCR ยืนยันชื่อผู้รับ+เลขบัญชี 4 ตัวท้ายตรง (status='ocr_success')
- ส่งลิงก์ /status/<id> ให้ลูกค้าทันทีตรงจุดนี้ (ไม่ต้องรอจบดีล)
- ตอนแอดมินกดยืนยัน ให้ UPDATE แถวเดิมเป็น waiting_admin แทนการ INSERT ใหม่

ข้อกำหนดสำคัญ:
- คงฟังก์ชันเดิมไว้ครบ (recordDeal, sendLedger, sticker flow เดิมต้องทำงานต่อได้)
- ห้ามให้ดีลหายถ้า UPDATE ไม่เจอแถว (fallback เป็น INSERT เหมือนเดิม)

ช่วยวางแผนก่อน แล้วค่อยเขียนโค้ดให้สมบูรณ์
```

**Expected Output:**
- ลูกค้าเห็นการ์ด ocr_success จริงก่อนแอดมินยืนยัน
- Progress bar หน้า /status/[id] ไล่ครบ 3 ขั้นจริง (ไม่ข้ามขั้นเหมือนตอนนี้)

---

## Architecture

```mermaid
flowchart LR
    C[ลูกค้า] -->|ส่งสลิป| TG[Telegram]
    TG -->|webhook| API["/api/telegram/webhook (Next.js)"]
    API -->|OCR + บันทึกดีล| DB[(Supabase Postgres)]
    DB -->|realtime| STATUS["/status/[id] (ลูกค้า)"]
    DB -->|realtime| DASH["/dashboard (แอดมิน)"]
    ADMIN[แอดมิน] -->|กด ส่ง USDT แล้ว| DASH
    DASH -->|POST /api/transactions/[id]/complete| DB
    API -->|sendMessage/sticker/brandCard| TG
```

---

## Quick Reference

| ต้องการทำอะไร | คำสั่ง/ที่อยู่ |
|---|---|
| Deploy production | build/host Next.js บนโฮสต์ของคุณ แล้ว `setWebhook` ไปที่ `APP_URL/api/telegram/webhook` |
| รัน migration สถานะ | `supabase/patch-v8.sql` ผ่าน Supabase SQL Editor |
| เรนเดอร์ brand assets ใหม่ | `node scripts/render-brand-assets.mjs` |
| เรนเดอร์ sticker ใหม่ | `node scripts/render-stickers.mjs` |
| รัน dev เต็ม (bot + dashboard) | `npm run dev` + `cd bot && npm run dev` (dev-bridge) |
| Typecheck | `npm run typecheck` (แทน `next lint` ที่ถูกถอดใน v16) |

---

## Changelog

| วันที่ | Commit | การเปลี่ยนแปลง |
|---|---|---|
| 19 ก.ค. 2569 | `ef9d2c0` | Render avatar/banner PNG + 12 sticker WEBM จริง (sharp + ffmpeg) |
| 19 ก.ค. 2569 | `eb2fc23` | Rebrand ทั้งแอปเป็นพาเลท NOVA (เขียว/ฟ้า/ทอง) |
| 19 ก.ค. 2569 | `2a006a2` | Customer order-status flow: คอลัมน์ status, หน้า realtime, ปุ่ม complete |
| 19 ก.ค. 2569 | `4691af7` | Circle SCP scaffolding + `/api/circle/health` |
| 19 ก.ค. 2569 | `3360196` | อัปเกรด Next.js 14.2→16.2, React 18→19.2 |
| 19 ก.ค. 2569 | `352c891` | แก้ build: ถอด dotenv import ที่ไม่จำเป็นออกจาก sticker config |

---

## Notes & Recommendations

- **ความปลอดภัย (สำคัญ):** bot token ถูกพิมพ์ตรงในแชท 2 ครั้งในเซสชันนี้ และเคยหลุดเข้าไฟล์ example — แก้กลับเป็น placeholder แล้ว แต่**แนะนำให้ revoke token เดิมผ่าน @BotFather แล้วตั้งค่าใหม่ใน env ของโฮสต์เท่านั้น** อย่าพิมพ์ credential ลงแชทหรือไฟล์ในโปรเจกต์อีก
- **ความคาดหวังเรื่องคุณภาพภาพ:** sticker/avatar ที่เรนเดอร์ไว้เป็น 2D flat vector (SVG→PNG/WEBM) คุณภาพดีและใช้งานได้จริงทันที แต่ไม่ใช่ระดับ "3D anime Pixiv quality" ตามสเปกต้นฉบับ — ถ้าต้องการระดับนั้นต้องใช้ image-generation model ภายนอกกับ prompt ที่เตรียมไว้แล้ว (ดู artifact "NOVA Sticker Brief" ก่อนหน้า)
- **ก่อน publish sticker pack:** เป็นการกระทำที่มองเห็นได้สาธารณะบน Telegram (ผูกกับ username บอท) — ต้องขอ confirm ชื่อ pack ก่อนเรียก API เสมอ
- **RLS:** อ่าน `transactions` แบบ anon (สำหรับหน้า `/status/[id]`) เปิดไว้แล้ว — อย่าลืมว่า select ต้องจำกัดคอลัมน์ (ไม่ select `*`) เพื่อไม่ให้กำไร/ค่าฟีหลุดไปหน้า public
