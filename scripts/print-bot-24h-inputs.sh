#!/usr/bin/env bash
# พิมพ์ค่าสำหรับวางใน Actions → Bot 24h → Run workflow (ไม่เขียนลงไฟล์)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
need() { [[ -f "$1" ]] || { echo "missing $1"; exit 1; }; }
need "$ROOT/.env.local"
need "$ROOT/.firebase-sa.json"

TOKEN="$(grep '^BOT_TOKEN=' "$ROOT/.env.local" | cut -d= -f2-)"
SA="$(node -e "process.stdout.write(JSON.stringify(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))))" "$ROOT/.firebase-sa.json")"

echo "=== วางในช่อง bot_token ==="
echo "$TOKEN"
echo
echo "=== วางในช่อง firebase_sa_json (หนึ่งบรรทัด) ==="
echo "$SA"
echo
echo "แล้วเปิด: https://github.com/SHELBYY-21/CE-VAULT-Bot/actions/workflows/bot-24h.yml"
