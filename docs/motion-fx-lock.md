# Motion FX Lock — CE EMPIRE bot motion layer

> Additive presentation layer บน Live Message funnel เดิม — ไม่แตะ business logic,
> การคำนวณการเงิน หรือ `app/api/telegram/webhook/route.ts` เลย

## หลักการ

1. **One funnel** — hook ที่ `upsertLive()` ใน `src/lib/liveMessage.ts` จุดเดียว
   (ทุก stage ของดีลไหลผ่าน funnel นี้อยู่แล้ว) — ไฟล์ webhook ใหญ่ไม่ถูกแตะ
2. **Text stays authoritative** — sticker หรือ effect ล้มเหลวไม่มีทางพังดีล
   (fire-and-forget + catch ทุก path)
3. **Honest motion** — OCR effect ใช้ glyph หมุน (◐ ◓) ไม่มีตัวเลข % ปลอม,
   ยอดจริงมาจาก OCR เท่านั้น (`ceOcrAmount`)
4. **Env-driven** — ใช้ `WEBM_*_FILE_ID` จาก `src/config/stickers.ts` เดิม
   + kill switch `CE_MOTION_FX=0`

## Stage → moment → mascot

| Live frame | ตรวจจาก | Moment | Mascot |
|---|---|---|---|
| liveReceiving | `<b>● Receiving...</b>` | PROCESSING | SCAN |
| liveOcr (MSG-01) | `◈ CE · OCR` | PROCESSING | SCAN + OCR effect |
| MSG-05 mismatch | `◈ CE · MISMATCH` | RETRY | ALERT |
| liveVerified / liveIntelVerified | `<b>● Verified</b>` | OCR_DONE | DONE |
| liveWaiting | `<b>● Waiting</b>` | WAITING | WAIT |
| liveSettled | `◈ CE · RECORDED ✓` | SUCCESS | SUCCESS |
| liveError (MSG-29) / MSG-03 | `◈ CE · ERROR` / `OCR ERROR` | ERROR | ALERT |

WELCOME (HI) ยังอยู่ที่ `/start` ตามเดิมใน webhook — ไม่ซ้ำกับ funnel นี้

## OCR progress effect

- เริ่มเมื่อ MSG-01 frame ถูก apply สำเร็จ (edit จริง ไม่ใช่ timer ลอย)
- 2 เฟรม ห่างกัน 700ms: `⏳ OCR ◐ กำลังสแกนสลิป...` → `⏳ OCR ◓ ตรวจจับยอดตัวเลข...`
- `motionGate()` ยกเลิก effect ก่อน stage ถัดไปถูก apply เสมอ — effect
  ไม่มีทางเขียนทับเฟรมใหม่
- ไม่แสดง % ความคืบหน้าปลอม — glyph เป็น decoration เท่านั้น

## ขอบเขตที่ยังไม่ต่อ (honest)

- ข้อความ direct send ใน webhook (MSG templates, `receiverIntelCard`,
  THANK_YOU, QUEUE) ยังไม่มี motion — ต้องแก้ route.ts ซึ่งใหญ่เกินกว่า
  จะแก้แบบปลอดภัยใน PR นี้
- Dedupe เป็น best-effort ต่อ server instance — serverless cold start
  อาจส่ง sticker ซ้ำได้ในกรณีที่ stage เดียวกันถูก apply สอง instance

## ทดสอบ

- `src/lib/__tests__/motionFx.test.ts` — moment mapping, dedupe, kill switch,
  OCR effect frames + cancellation (fake timers)
- ชุดทดสอบเดิม (`liveMessage.test.ts`) ไม่ถูกแตะ — builder ทุกตัวเหมือนเดิม
