#!/usr/bin/env bash
set -euo pipefail

for p in 3145 3146; do
  pids="$(lsof -ti tcp:"$p" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    kill -9 $pids
  fi
done
