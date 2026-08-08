#!/usr/bin/env bash
# รันบนเครื่องคุณ (มี gh login + สิทธิ์ secrets) เพื่อใส่ Secrets ให้ Bot 24h
# ถ้าไม่มีสิทธิ์ secrets: ใช้ Actions → Bot 24h → Run workflow แล้ววาง input แทน
#   (ดู scripts/print-bot-24h-inputs.sh)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${1:-SHELBYY-21/CE-VAULT-Bot}"

need() { [[ -f "$1" ]] || { echo "missing $1"; exit 1; }; }
need "$ROOT/.env.local"
need "$ROOT/.firebase-sa.json"

echo "Setting secrets on $REPO …"
gh secret set BOT_TOKEN -R "$REPO" < <(grep '^BOT_TOKEN=' "$ROOT/.env.local" | cut -d= -f2-)
gh secret set FIREBASE_SERVICE_ACCOUNT_JSON -R "$REPO" < "$ROOT/.firebase-sa.json"
if grep -q '^GROK_API_KEY=.\+' "$ROOT/.env.local"; then
  gh secret set GROK_API_KEY -R "$REPO" < <(grep '^GROK_API_KEY=' "$ROOT/.env.local" | cut -d= -f2-)
fi
if grep -q '^API_SECRET=.\+' "$ROOT/.env.local"; then
  gh secret set API_SECRET -R "$REPO" < <(grep '^API_SECRET=' "$ROOT/.env.local" | cut -d= -f2-)
fi
echo "Done. Open Actions → Bot 24h → Run workflow"
echo "https://github.com/${REPO}/actions/workflows/bot-24h.yml"
