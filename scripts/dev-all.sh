#!/usr/bin/env bash
#
# dev-all.sh — start both products locally with one command.
#
#     ./scripts/dev-all.sh
#
#     MIMS       backend :3000   frontend :5173
#     CP Portal  backend :4000   frontend :5174
#
# Each app is started through its OWN npm script rather than by repeating the
# command here, so this file does not drift from how each app expects to boot
# (MIMS loads its .env via --env-file; CP Portal runs under nodemon).
#
# MySQL must already be running. Ctrl-C stops everything this script started.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

port_pid() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1; }

# Refuse to start a second copy fighting over the same database, the same
# reason e2e-stack.sh checks first.
busy=""
for p in 3000 5173 4000 5174; do
  [ -n "$(port_pid "$p")" ] && busy="$busy $p"
done
if [ -n "$busy" ]; then
  echo "Already in use:$busy — stop those first (apps/mims/stop-ports.sh, or kill the port)."
  exit 1
fi

pids=()

run() {  # run <label> <dir> <npm-script>
  ( cd "$REPO_ROOT/$2" && npm run "$3" 2>&1 | sed "s/^/[$1] /" ) &
  pids+=($!)
}

shutdown() {
  echo ""
  echo "Stopping..."
  kill "${pids[@]}" 2>/dev/null
  for p in 5173 3000 5174 4000; do
    pid=$(port_pid "$p")
    [ -n "$pid" ] && kill "$pid" 2>/dev/null
  done
  exit 0
}
trap shutdown INT TERM

run mims       apps/mims               dev:all
run cp-backend apps/cp-portal/backend  dev
run cp-front   apps/cp-portal/frontend dev

echo "MIMS      -> http://localhost:5173  (api :3000)"
echo "CP Portal -> http://localhost:5174  (api :4000)"
echo "Ctrl-C stops both."
wait
