#!/usr/bin/env sh
set -eu

PIPELINE="${PADDLE_PIPELINE:-PaddleOCR-VL-1.6}"
DEVICE="${PADDLE_DEVICE:-cpu}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8080}"

echo "[CE OCR] starting PaddleOCR-VL-1.6 via paddleocr==3.6.0 pipeline=${PIPELINE} device=${DEVICE} port=${PORT}"

exec paddlex --serve \
  --pipeline "${PIPELINE}" \
  --device "${DEVICE}" \
  --host "${HOST}" \
  --port "${PORT}"
