#!/usr/bin/env bash
#
# start-scanner.sh — make sure the virus scanner is running before the portal starts. (CPPM-44)
#
# Run automatically before `npm run dev` and `npm start` in apps/cp-portal/backend
# (the predev / prestart scripts), so every way of starting the portal starts the
# scanner too — including docs/scripts/dev-all.sh.
#
#   - clamd (the scanner) is started if nothing is listening on its port.
#   - freshclam (the virus-list updater) is started in daemon mode if it is not already
#     running; it refreshes the list through the day (12 checks a day by default), and
#     clamd picks up a new list on its own within ten minutes.
#
# Both keep running after the portal stops, like any local service. This never stops the
# portal from starting: without a scanner the portal still runs, holds portal attachments
# and refuses admin uploads, and the admin screens say so.
#
# Local only (SOP §38.12). Nothing here changes how the Mac starts up.

set -uo pipefail

PORT="${CLAMAV_PORT:-3310}"
CONF_DIR="${CLAMAV_CONF_DIR:-/opt/homebrew/etc/clamav}"

listening() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; }

CLAMD="$(command -v clamd || echo /opt/homebrew/sbin/clamd)"
FRESHCLAM="$(command -v freshclam || echo /opt/homebrew/bin/freshclam)"
if [ ! -x "$CLAMD" ] || [ ! -x "$FRESHCLAM" ]; then
  echo "[scanner] ClamAV is not installed — attachments will be held and admin uploads refused. See apps/cp-portal/README.md."
  exit 0
fi

if ! pgrep -x freshclam >/dev/null 2>&1; then
  if "$FRESHCLAM" --config-file="$CONF_DIR/freshclam.conf" --daemon --quiet; then
    echo "[scanner] virus-list updater started"
  else
    echo "[scanner] could not start the virus-list updater — the list will not refresh until it runs"
  fi
fi

if listening; then
  echo "[scanner] already running on port $PORT"
  exit 0
fi

if ! "$CLAMD" --config-file="$CONF_DIR/clamd.conf"; then
  echo "[scanner] could not start clamd — attachments will be held and admin uploads refused until it runs"
  exit 0
fi
for _ in $(seq 1 60); do
  if listening; then echo "[scanner] running on port $PORT"; exit 0; fi
  sleep 1
done
echo "[scanner] started but not answering yet — held attachments are rescanned once it is up"
exit 0
