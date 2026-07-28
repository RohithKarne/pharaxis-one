#!/usr/bin/env bash
#
# e2e-stack.sh — a MIMS stack that serves the TEST database, alongside the
# developer's own dev stack rather than instead of it.
#
# Why this exists: the browser suites log in as fixtures that only exist in
# pharaxis_mims_test. The dev backend serves pharaxis_mims_dev, so every login
# was rejected and 46 tests failed for a reason that had nothing to do with the
# code. Seeding those fixtures into dev would put test accounts in the database
# demos come from, so instead this runs a second, parallel stack:
#
#     dev   backend :3000  ->  pharaxis_mims_dev    frontend :5173   (untouched)
#     e2e   backend :3001  ->  pharaxis_mims_test   frontend :5273
#
# The test console points its MIMS suites at :5273 and never touches :5173.
#
#   ./scripts/e2e-stack.sh start | stop | status
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIMS_DIR="$REPO_ROOT/apps/mims"
RUN_DIR="$REPO_ROOT/.e2e-stack"

BACKEND_PORT=3001
FRONTEND_PORT=5273
TEST_DB=pharaxis_mims_test

mkdir -p "$RUN_DIR"

port_pid() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1; }

wait_for() {   # wait_for <url> <seconds>
  local url=$1 secs=$2 i=0
  while [ "$i" -lt "$secs" ]; do
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$url" 2>/dev/null)
    [ -n "$code" ] && [ "$code" != "000" ] && return 0
    i=$((i + 1)); sleep 1
  done
  return 1
}

start() {
  # Never take over the dev stack's ports. If something already holds ours,
  # say so rather than starting a second copy that fights over the database.
  for p in "$BACKEND_PORT" "$FRONTEND_PORT"; do
    if [ -n "$(port_pid "$p")" ]; then
      echo "Port $p is already in use (pid $(port_pid "$p")). Run '$0 stop' first."
      return 1
    fi
  done

  echo "Starting e2e backend on :$BACKEND_PORT against $TEST_DB ..."
  ( cd "$MIMS_DIR" && \
    MYSQL_DATABASE="$TEST_DB" \
    PORT="$BACKEND_PORT" \
    NODE_ENV=development \
    CORS_ALLOWED_ORIGINS="http://localhost:$FRONTEND_PORT,http://127.0.0.1:$FRONTEND_PORT" \
    nohup node --env-file=.env backend/server.js > "$RUN_DIR/backend.log" 2>&1 < /dev/null & \
    echo $! > "$RUN_DIR/backend.pid" )

  if ! wait_for "http://localhost:$BACKEND_PORT/api/health" 45; then
    echo "Backend did not come up. Last lines of $RUN_DIR/backend.log:"; tail -15 "$RUN_DIR/backend.log"; return 1
  fi
  echo "  backend healthy"

  echo "Starting e2e frontend on :$FRONTEND_PORT proxying to :$BACKEND_PORT ..."
  ( cd "$MIMS_DIR/frontend" && \
    MIMS_DEV_PORT="$FRONTEND_PORT" \
    MIMS_API_PROXY="http://127.0.0.1:$BACKEND_PORT" \
    nohup npm run dev > "$RUN_DIR/frontend.log" 2>&1 < /dev/null & \
    echo $! > "$RUN_DIR/frontend.pid" )

  if ! wait_for "http://localhost:$FRONTEND_PORT/mims/" 45; then
    echo "Frontend did not come up. Last lines of $RUN_DIR/frontend.log:"; tail -15 "$RUN_DIR/frontend.log"; return 1
  fi
  echo "  frontend healthy"
  status
}

stop() {
  # Kill by port rather than by stored pid: npm spawns vite as a child, so the
  # recorded pid is the wrapper and killing it alone leaves the real listener up.
  for p in "$FRONTEND_PORT" "$BACKEND_PORT"; do
    local pid; pid=$(port_pid "$p")
    if [ -n "$pid" ]; then
      echo "Stopping :$p (pid $pid)"
      kill "$pid" 2>/dev/null
      sleep 1
      [ -n "$(port_pid "$p")" ] && kill -9 "$(port_pid "$p")" 2>/dev/null
    fi
  done
  rm -f "$RUN_DIR"/*.pid
  echo "e2e stack stopped. The dev stack on :3000/:5173 was not touched."
}

status() {
  printf '%-26s %-8s %s\n' 'SERVICE' 'PORT' 'STATE'
  for row in "e2e backend  ($TEST_DB):$BACKEND_PORT" "e2e frontend:$FRONTEND_PORT" \
             "dev backend  (dev db):3000" "dev frontend:5173"; do
    local name=${row%:*} port=${row##*:}
    printf '%-26s %-8s %s\n' "$name" "$port" \
      "$([ -n "$(port_pid "$port")" ] && echo up || echo down)"
  done
}

case "${1:-status}" in
  start)  start ;;
  stop)   stop ;;
  status) status ;;
  *) echo "usage: $0 {start|stop|status}"; exit 1 ;;
esac
