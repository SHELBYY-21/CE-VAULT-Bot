#!/usr/bin/env bash
# รัน Next.js + Telegram long-poll bridge แบบ restart อัตโนมัติ (สำหรับ VPS)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

: "${BOT_TOKEN:?ตั้ง BOT_TOKEN ใน .env.local}"

export APP_URL="${APP_URL:-http://127.0.0.1:3000}"
export LOCAL_WEBHOOK_URL="${LOCAL_WEBHOOK_URL:-http://127.0.0.1:3000/api/telegram/webhook}"
export API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3000}"

echo "[run-24h] building…"
npm run build

# ใช้ long-poll ในเครื่อง — ลบ webhook เก่า
curl -fsS "https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook?drop_pending_updates=true" || true
echo

restart_child() {
  local name=$1
  shift
  while true; do
    echo "[run-24h] start $name"
    "$@" || true
    echo "[run-24h] $name exited — restart in 3s"
    sleep 3
  done
}

restart_child next npm run start -- --hostname 0.0.0.0 --port 3000 &
for i in $(seq 1 60); do
  curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1 && break
  sleep 1
done

(cd bot && npm ci --omit=dev >/dev/null 2>&1 || npm install)
restart_child bridge bash -lc 'cd bot && npx ts-node src/index.ts' &

echo "[run-24h] running (Ctrl+C to stop)"
wait
