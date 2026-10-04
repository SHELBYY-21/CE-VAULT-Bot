# CE EMPIRE Mascot Motion Lock v1.0

**Official mascot:** the crowned navy/gold CE robot from the user-supplied
reference — metallic silver/navy body, gold crown + shoulder armor, cyan
illuminated eyes (`#00D4FF`), gold CE chest plate, cyan energy halo.
**Source generator:** `scripts/ce-mascot.mjs` (single source of truth).
**Renderer:** `scripts/render-mascot-webm.mjs`.
**Visual preview:** `docs/design/mascot-preview.html` (open in a browser —
inline port of the same generator, keep both in sync when editing).

The mascot must stay visually consistent across **every** animation and the
bot avatar/banner. Do not fork the character per surface.

## Telegram WEBM contract

Per <https://core.telegram.org/stickers/webm-vp9-encoding>:

| Requirement | Value |
|---|---|
| Container / codec | WEBM · VP9 (`yuva420p`, `alpha_mode=1` tag) |
| Size | 512 px (square canvas, transparent background) |
| Duration | 2.4 s loop (spec max 3 s) |
| FPS | 20 (spec max 30) |
| File size | ≤ 256 KB (validated after encode) |
| Audio | none |
| Delivery | upload as video sticker → store returned `file_id` in env → `sendSticker(file_id)` |

Motion is **optional presentation only**: fire-and-forget, never blocks or
replaces the text reply, and a missing/invalid `file_id` degrades silently to
the static sticker. Never show success motion before the event is verified.

## The 8 canonical states

| Asset | StickerState (env key) | Expression | Motion storyboard |
|---|---|---|---|
| `hi.webm` | WELCOME (`WEBM_WELCOME_FILE_ID`) | happy | แขนขวาโบกทักทาย (−25° ± 35° สี่จังหวะ/ลูป) + ประกายทองสองจุด |
| `scan.webm` | PROCESSING (`WEBM_PROCESSING_FILE_ID`) | focused | สองแขนชี้ไปข้างหน้า ถือสลิปธนาคาร เส้นสแกนเขียวเลื่อนลงตลอดการ์ด |
| `wait.webm` | WAITING (`WEBM_WAITING_FILE_ID`) | happy | นาฬิกาเรืองแสงขวางตัว เข็มสั้นวน 1 รอบ เข็มยาว 3 รอบ ต่อลูป |
| `work.webm` | QUEUE (`WEBM_QUEUE_FILE_ID`) | focused | คอนโซลทอง progress bar เขียววิ่ง 0→100% + วงเฟือง cyan หมุน |
| `success.webm` | SUCCESS (`WEBM_SUCCESS_FILE_ID`) | closed | คอนเฟตติ 4 สีตกจากฟ้า + วงเช็คเขียว |
| `alert.webm` | ERROR (`WEBM_ERROR_FILE_ID`) / RETRY (`WEBM_RETRY_FILE_ID`) | wide | สามเหลี่ยมเตือนแดงสั่น 10 จังหวะ/ลูป หุ่นสั่นตามเบา ๆ |
| `done.webm` | OCR_DONE (`WEBM_OCR_DONE_FILE_ID`) / THANK_YOU (`WEBM_THANK_YOU_FILE_ID`) | closed | เหรียญทองเช็คเต้นเบา ๆ (±8% สเกล) + ประกาย |
| `idle.webm` | — (ambient only) | happy | หายใจช้า (bob ±3.5px) กระพริบตาท้ายลูป ฮาโล cyan เต้นเบา ๆ |

ทุกสถานะมี idle bob กลาง ๆ (±6px) และกระพริบตา (happy → closed ที่ t > 0.92)
เพื่อให้ตัวละคร "มีชีวิต" โดยไม่ใช้เอฟเฟกต์รุนแรง — ตามหลัก controlled motion

`MASCOT_WEBM_ASSETS` และ `STICKER_STATE_MASCOT` ใน `src/config/stickers.ts`
คือแผนที่ canonical ของการจับคู่นี้ (`IDLE` จงใจไม่ผูกกับ moment ใด เพราะ
เป็นลูป ambient ห้ามส่งแบบไม่ได้ร้องขอ)

## Rendering & validation

```bash
npm i -D sharp                 # ต้องมี sharp + ffmpeg-static (มีอยู่แล้วใน devDependencies)
node scripts/render-mascot-webm.mjs
```

ผลลัพธ์: `assets/mascot/{hi,scan,wait,work,success,alert,done,idle}.webm`
สคริปต์ตรวจทุกไฟล์: ≤ 256 KB เสมอ และถ้ามี `ffprobe` จะตรวจเพิ่ม vp9 / 512px /
alpha / duration ให้ด้วย — ไฟล์ใดไม่ผ่านสคริปต์จะ exit 1

## Upload & configuration

1. เปิดแชทกับ **@Stickers** ใน Telegram → สร้าง video sticker set ใหม่
2. อัปโหลดแต่ละ `assets/mascot/*.webm` (หรือใช้ `createNewStickerSet` +
   `addStickerToSet` ผ่าน Bot API ด้วย `WEBM` sticker type)
3. ส่งสติกเกอร์นั้นถึงบอท (หรือใช้ `getStickerSet`) แล้วคัดลอก `file_id`
   (ขึ้นต้นด้วย `CAACAg…`)
4. ใส่ค่าใน `.env.local` ตามคีย์ในตารางข้างต้น — ไม่ต้อง hardcode ในซอร์ส
5. ระบบจะใช้ motion อัตโนมัติผ่าน `getWebmMotionSticker() || getSticker()`
   และ fallback เป็นสติกเกอร์นิ่งถ้าไม่ได้ตั้งค่า

ไม่มี bot token หรือ secret ใดอยู่ใน asset หรือสคริปต์ ห้าม commit `.env.local`

## Non-goals

- ไม่แก้ financial logic, webhook transport, OCR thresholds หรือสถานะ transaction
- ไม่ส่ง animation โดยไม่มีเหตุการณ์จริง (ไม่มี success ก่อน settlement ยืนยันแล้ว)
- อย่าใช้ DevMotion export ตรง ๆ โดยไม่ผ่านการตรวจสเปก WEBM ก่อน
