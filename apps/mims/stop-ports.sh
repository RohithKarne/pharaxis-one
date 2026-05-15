#!/usr/bin/env bash
set -euo pipefail

kill_pids() {
  local signal="$1"
  shift
  if [ "$#" -gt 0 ]; then
    kill "-$signal" "$@" 2>/dev/null || true
  fi
}

collect_app_pids() {
  ps -axo pid=,command= \
    | awk '
      /[n]odemon .*backend\/server\.js/ ||
      /[n]ode .*backend\/server\.js/ ||
      /[n]ode .*backend\/workers\/pollerProcess\.js/ ||
      /[n]ode .*backend\/workers\/schedulerProcess\.js/ ||
      /[c]oncurrently .*backend.*frontend/ ||
      /[v]ite .*--host|[v]ite$/ { print $1 }
    ' \
    | sort -u
}

app_pids="$(collect_app_pids || true)"
if [ -n "$app_pids" ]; then
  # Give the backend parent a chance to run graceful shutdown and stop workers.
  # shellcheck disable=SC2086
  kill_pids TERM $app_pids
  sleep 1
fi

for p in 3000 5173; do
  pids="$(lsof -ti tcp:"$p" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill_pids TERM $pids
  fi
done

sleep 1

remaining_pids="$(
  {
    collect_app_pids || true
    lsof -ti tcp:3000 2>/dev/null || true
    lsof -ti tcp:5173 2>/dev/null || true
  } | sort -u
)"

if [ -n "$remaining_pids" ]; then
  # shellcheck disable=SC2086
  kill_pids KILL $remaining_pids
fi
