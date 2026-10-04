#!/usr/bin/env bash
# Waits for the Firebase Firestore emulator to be reachable, seeds it (idempotent),
# then starts the Next.js dev server. Run as a Cloud Agent terminal after the
# "emulators" terminal has started.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Waiting for Firestore emulator on 127.0.0.1:8080 ..."
for i in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:8080/"; then
    echo "==> Firestore emulator is up"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "!! Firestore emulator did not become ready in time" >&2
    exit 1
  fi
  sleep 2
done

echo "==> Seeding emulator data (idempotent)"
npm run db:setup || true

echo "==> Starting Next.js dev server on http://localhost:3000"
exec npm run dev
