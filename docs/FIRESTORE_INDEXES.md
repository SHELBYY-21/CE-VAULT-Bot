# Firestore composite indexes (ต้องสร้างใน Console ครั้งเดียว)

ไฟล์ `firestore.indexes.json` มี index ครบแล้ว แต่ service account ของโปรเจกต์
**ไม่มีสิทธิ์สร้าง index** — ให้เจ้าของโปรเจกต์กดลิงก์ด้านล่าง (ล็อกอิน Google ที่เป็น Owner)

## จำเป็นสำหรับบอท Telegram (chat ledger)

1. `transactions`: `chat_id` ASC + `created_at` ASC  
   https://console.firebase.google.com/v1/r/project/ce88-95911/firestore/indexes?create_composite=Ck9wcm9qZWN0cy9jZTg4LTk1OTExL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy90cmFuc2FjdGlvbnMvaW5kZXhlcy9fEAEaCwoHY2hhdF9pZBABGg4KCmNyZWF0ZWRfYXQQARoMCghfX25hbWVfXxAB

2. `transactions`: `status` ASC + `created_at` DESC (เทียบ `idx_tx_status_created` ใน patch-v8)  
   สร้างจาก Console → Firestore → Indexes → Add composite  
   Collection: `transactions` · Fields: `status` Ascending, `created_at` Descending

3. ดูทั้งหมดใน Console:  
   https://console.firebase.google.com/project/ce88-95911/firestore/indexes

หรือจากเครื่องที่มีสิทธิ์ Owner:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=./.firebase-sa.json   # ถ้า SA มีสิทธิ์ Datastore Index Admin
npx firebase-tools deploy --only firestore:indexes --project ce88-95911
```

> โค้ดบอทมี **fallback ในหน่วยความจำ** แล้ว — ใช้งานได้แม้ index ยังไม่พร้อม  
> แต่ควรสร้าง index เพื่อความเร็วเมื่อข้อมูลโต

## Postgres (legacy Supabase)

SQL เดียวกันอยู่ที่ `supabase/patch-v8.sql` — วางใน SQL Editor แล้ว Run