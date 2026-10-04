# CE Mascot Brand Assets — Avatar + Banner ("One Mascot")

อ้างอิงกฎหลักใน `docs/mascot-motion-lock.md`: มาสคอตต้องเป็นคนเดียวกันทุกพื้นผิว —
animation WEBM, bot avatar, banner — ห้าม fork ตัวละคร

ไฟล์นี้คือคู่มือ migrate avatar + banner ของบอทจากตัว NOVA เก่า
(`scripts/render-brand-assets.mjs`) ไปเป็นหุ่นมงกุฎทอง CE mascot ตัวใหม่

## สคริปต์

`scripts/render-mascot-brand.mjs` — render 2 ไฟล์ จาก `scripts/ce-mascot.mjs`
(single source of truth เดียวกับ animation WEBM):

| ไฟล์ output | ขนาด | ใช้ที่ไหน |
|---|---|---|
| `assets/brand/avatar-512.png` | 512×512 | bot profile photo |
| `assets/brand/banner-1200x630.png` | 1200×630 | README / pinned post / social |

สคริปต์เขียนทับไฟล์เดิม (drop-in) — PNG NOVA เก่ายังกู้คืนได้จาก git history
และสคริปต์ NOVA (`render-brand-assets.mjs`) ยังอยู่ครบไว้ใช้ rollback

## ขั้นตอน

```bash
npm i -D sharp
node scripts/render-mascot-brand.mjs
```

ตรวจผลลัพธ์ใน terminal (ต้องขึ้น `avatar-512.png ... bytes (512x512)` และ
`banner-1200x630.png ... bytes (1200x630)` — ถ้าขนาดพิกเซลไม่ตรง สคริปต์จะ exit 1 เอง)

จากนั้น:

1. Commit PNG ใหม่เข้า repo (binary ต้องทำบนเครื่อง local — CI ไม่เรนเดอร์ให้)
2. ตั้ง avatar ให้บอท 1 ใน 2 ทาง:
   - `@BotFather` → `/setuserpic` → อัปโหลด `assets/brand/avatar-512.png`
   - หรือ `BOT_TOKEN=... node scripts/set-bot-avatar.mjs`
     (อย่าใส่ token ในไฟล์/commit — ใส่ผ่าน env ตอนรันเท่านั้น)
3. แนบ banner ใน README หรือโพสต์ปักหมุดตามชอบ

## กติกา

- แก้ท่า/สี/หน้ามาสคอต: แก้ที่ `scripts/ce-mascot.mjs` จุดเดียว
  แล้วรัน `render-mascot-brand.mjs` + `render-mascot-webm.mjs` ใหม่ทั้งคู่
  เพื่อให้ทุกพื้นผิวตรงกันเสมอ
- อย่าแก้ PNG ด้วยมือ — ให้ render ใหม่จากสคริปต์เสมอ
