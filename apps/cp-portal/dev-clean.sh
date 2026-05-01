#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

for p in 4000 5174; do
  pids="$(lsof -ti tcp:"$p" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    kill -9 $pids
  fi
done

(cd backend && npm run dev) &
BACK_PID=$!
(cd frontend && npm run dev) &
FRONT_PID=$!

cleanup() {
  kill "$BACK_PID" "$FRONT_PID" 2>/dev/null || true
}
trap cleanup INT TERM

wait "$BACK_PID" "$FRONT_PID"
