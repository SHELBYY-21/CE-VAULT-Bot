# Production Path — Single Source of Truth

สถานะ: 🔴 ACTIVE P0 — ใช้ทุกครั้งก่อนแตะ production ระบบใด ๆ ของ CE VAULT

## Canonical Path (เส้นเดียวเท่านั้น)

```
GitHub main (SHELBYY-21/CE-VAULT-Bot)
  → Render (ce-vault-menu-first, region singapore)
  → Runtime: npm start → scripts/start.mjs → appsrc/server/index.mjs
  → Supabase (iuaaviivkumvzbdmpzty — Realtime Fintech Operations Platform)
```

## กติกาบังคับ (policy-as-code)

1. **ห้ามมีเส้นคู่ขนาน** — Railway, Vercel, Netlify และ service อื่นทุกตัวไม่มี production authority ห้าม deliver production จากที่อื่น
2. **ห้าม push ตรงเข้า main** — ทุกการเปลี่ยนแปลงผ่าน branch (vibe/*, manus/*, chatgpt/*) → PR → review → merge
3. **CI gates เป็นเงื่อนไข merge** — build ต้องผ่านโดยไม่ mutate/reconstruct source, ต้องมี appsrc/ ครบ, tests ผ่าน (หลัง canonical appsrc migration)
4. **Health check เป็น deployment gate** — Render healthCheckPath ต้องตอบ 200 และตรวจ DB connectivity ถึงถือว่า deploy สำเร็จ
5. **Production write / migration ต้องมี approval** — "Approved migration" (ประตูของ EMPEROR เท่านั้น)
6. **Money movement ทำโดยมนุษย์เท่านั้น** — automation/AI ใด ๆ ไม่มีสิทธิ์เคลื่อนเงิน

## ตัวแปรสภาพแวดล้อม production

| ตัวแปร | ค่าที่ถูกต้อง |
|---|---|
| Supabase project | iuaaviivkumvzbdmpzty (ตัวเดียว; bqivoprdyskbxbnmbfct = N8N ห้ามใช้) |
| BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET | มีเฉพาะ production |
| Preview services | ห้ามมี BOT_TOKEN/TELEGRAM_WEBHOOK_SECRET (กันแย่ง webhook) |

การแก้ไขไฟล์นี้ = การแก้ production rules และต้องผ่าน PR + approval เช่นเดียวกับโค้ด
