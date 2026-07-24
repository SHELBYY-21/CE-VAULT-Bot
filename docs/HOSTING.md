# Hosting — ไม่ใช้ Vercel

CE VAULT **ไม่ deploy บน Vercel** (บัญชี Vercel ถูกบล็อก / ไม่เหมาะกับ long-poll bot)

ใช้หนึ่งในทางเลือกนี้แทน:

| ทางเลือก | ใช้เมื่อ | URL สาธารณะ |
|---|---|---|
| **A. GitHub Actions + Cloudflare tunnel** | แนะนำตอนนี้ (ฟรี, ไม่ต้อง VPS) | `*.trycloudflare.com` หมุนทุก ~5 ชม. |
| **B. Docker บน VPS** | ต้องการโดเมนคงที่ 24/7 | โดเมนของคุณ |
| **C. Firebase App Hosting** | เปิด Blaze แล้ว | `*.hosted.app` จาก Firebase |

---

## A) แนะนำ: Dashboard 24h (Cloudflare)

1. ตั้ง secrets: `FIREBASE_SERVICE_ACCOUNT_JSON` (+ `BOT_TOKEN` / `API_SECRET` ถ้ามี)
2. Actions → **[Dashboard 24h](../../actions/workflows/dashboard-24h.yml)** → **Run workflow**
3. เปิด issue **CE VAULT Dashboard URL** — มีลิงก์ `/dashboard` ล่าสุด

บอท: Actions → **[Bot 24h](../../actions/workflows/bot-24h.yml)** (long-poll Telegram)

```bash
# คัดลอกค่าไปวางใน Run workflow
bash scripts/print-bot-24h-inputs.sh
```

## B) Docker / VPS

```bash
docker compose up -d --build
# หรือ
npm run prod:24h
```

ตั้ง `APP_URL=https://your-domain` แล้วเรียก  
`/api/telegram/set-webhook?secret=<API_SECRET>`

## C) Firebase App Hosting (Blaze)

1. เปิดบิลลิ่งโปรเจกต์ `ce88-95911`
2. ตั้ง secrets ตาม [`apphosting.yaml`](../apphosting.yaml)
3. Deploy จาก Firebase Console → App Hosting

---

## ถอด Vercel ออกจาก GitHub (สำคัญ)

ถ้า PR โชว์ **Vercel — fail / Account is blocked**:

1. เปิด https://github.com/SHELBYY-21/CE-VAULT-Bot/settings/installations  
2. หา **Vercel** → Configure → **Uninstall** (หรือ Suspend)  
3. Settings → Branches → ถ้ามี required status `Vercel` ให้เอาออก  
4. Refresh PR — จะไม่ติดเช็ก Vercel อีก

CI ของ repo ใช้แค่ workflow **CI** (`validate` + `security`) — ไม่พึ่ง Vercel
