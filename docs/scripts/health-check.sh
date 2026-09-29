#!/usr/bin/env bash
#
# health-check.sh — is everything we run locally actually up?
#
#     ./docs/scripts/health-check.sh
#
# Both products run only on this machine, so until now we learned one was down
# when someone opened it. This only reads — it starts, stops and writes nothing —
# and prints one line per service, then exits 1 if anything is down.
#
#     MIMS       backend :3000 (/api/health)   frontend :5173
#     CP Portal  backend :4000 (/api/health)   frontend :5174
#     MySQL      127.0.0.1:3306
#
# Ports can be overridden. Where an app already reads a variable for its own
# port, the same name is used here:
#     MIMS_PORT  MIMS_DEV_PORT  CP_PORT  CP_FRONTEND_PORT  MYSQL_HOST  MYSQL_PORT
set -uo pipefail

MIMS_PORT="${MIMS_PORT:-3000}"
MIMS_DEV_PORT="${MIMS_DEV_PORT:-5173}"
CP_PORT="${CP_PORT:-4000}"
CP_FRONTEND_PORT="${CP_FRONTEND_PORT:-5174}"
MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"

DOWN=0
TOTAL=0

c_red()  { printf '\033[31m%s\033[0m\n' "$1"; }
c_grn()  { printf '\033[32m%s\033[0m\n' "$1"; }

up()   { TOTAL=$((TOTAL + 1)); c_grn "  ✓ $(printf '%-19s' "$1") up    $2"; }
down() { TOTAL=$((TOTAL + 1)); DOWN=$((DOWN + 1)); c_red "  ✗ $(printf '%-19s' "$1") DOWN  $2"; }

# A backend is up only when /api/health answers 200 AND says its database is
# fine. CP Portal answers 200 even when its database is unreachable and puts
# the failure in the body, so the body is checked, not just the status code.
check_backend() {  # check_backend <label> <port> <text the body must contain>
  local label=$1 port=$2 want=$3 out code body
  out=$(curl -s --max-time 3 -w $'\n%{http_code}' "http://localhost:$port/api/health" 2>/dev/null)
  code=${out##*$'\n'}
  body=${out%$'\n'*}
  if [ -z "$code" ] || [ "$code" = "000" ]; then
    down "$label" "— nothing answering on :$port"
  elif [ "$code" != "200" ]; then
    down "$label" "— /api/health on :$port returned $code"
  elif [[ "$body" != *"$want"* ]]; then
    down "$label" "— running on :$port but its database check failed"
  else
    up "$label" "(:$port, database ok)"
  fi
}

check_frontend() {  # check_frontend <label> <port> <path>
  local label=$1 port=$2 path=$3 code
  code=$(curl -s -o /dev/null --max-time 3 -w '%{http_code}' "http://localhost:$port$path" 2>/dev/null)
  if [ -z "$code" ] || [ "$code" = "000" ]; then
    down "$label" "— nothing answering on :$port"
  elif [ "$code" -ge 500 ]; then
    down "$label" "— $path on :$port returned $code"
  else
    up "$label" "(:$port)"
  fi
}

# mysqladmin ping exits 0 whenever the server is running, even if it refuses
# these (absent) credentials, so no password is needed. Without mysqladmin,
# fall back to whether the port accepts a connection at all.
check_mysql() {
  local admin
  admin=$(command -v mysqladmin || echo /usr/local/mysql/bin/mysqladmin)
  if [ -x "$admin" ]; then
    if "$admin" --connect-timeout=3 -h "$MYSQL_HOST" -P "$MYSQL_PORT" ping >/dev/null 2>&1; then
      up "MySQL" "($MYSQL_HOST:$MYSQL_PORT)"
    else
      down "MySQL" "— not answering on $MYSQL_HOST:$MYSQL_PORT"
    fi
  elif (exec 3<>"/dev/tcp/$MYSQL_HOST/$MYSQL_PORT") 2>/dev/null; then
    up "MySQL" "($MYSQL_HOST:$MYSQL_PORT, port open; mysqladmin not found)"
  else
    down "MySQL" "— nothing listening on $MYSQL_HOST:$MYSQL_PORT"
  fi
}

echo "── Local health ──"
check_backend  "MIMS backend"      "$MIMS_PORT" '"db":"ok"'
check_frontend "MIMS frontend"     "$MIMS_DEV_PORT" /mims/
check_backend  "CP Portal backend" "$CP_PORT" '"db":{"status":"ok"'
check_frontend "CP Portal frontend" "$CP_FRONTEND_PORT" /
check_mysql

echo
if [ "$DOWN" -gt 0 ]; then
  c_red "$DOWN of $TOTAL down."
  exit 1
fi
c_grn "All $TOTAL up."
