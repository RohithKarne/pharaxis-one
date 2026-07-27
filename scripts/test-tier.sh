#!/usr/bin/env bash
#
# test-tier.sh — tiered test runner for the Pharaxis One monorepo.
#
# Tiers exist because a full browser regression needs servers and a seeded
# database (minutes), while syntax and unit checks take seconds. Running
# everything on every change is what caused the previous suite to be ignored
# and then abandoned.
#
#   tier1  ~seconds   syntax + backend unit tests        — run at task completion
#   tier2  ~minutes   browser smoke for one app          — run before "done"
#   tier3  ~10-15min  full browser regression, all apps  — run before Gate 2
#
# Usage:
#   scripts/test-tier.sh tier1 [app]
#   scripts/test-tier.sh tier2 mims
#   scripts/test-tier.sh tier3
#
# Tier 2 and 3 require a seeded test database. See apps/mims/backend/tests/seed-e2e.js.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIER="${1:-tier1}"
APP="${2:-all}"

ALL_APPS=(cp-portal mims vault qms ai-agent)

# Tests must never run against a dev database — they seed, mutate and delete.
# Each app is pinned to its own *_test schema here.
test_db_for() {
  case "$1" in
    mims)      echo "pharaxis_mims_test" ;;
    cp-portal) echo "pharaxis_cp_portal_test" ;;
    vault)     echo "pharaxis_vault_test" ;;
    ai-agent)  echo "pharaxis_ai_agent_test" ;;
    *)         echo "" ;;                 # qms is Postgres — uses DATABASE_URL
  esac
}
FAILED=()
RAN=0

c_red()  { printf '\033[31m%s\033[0m\n' "$1"; }
c_grn()  { printf '\033[32m%s\033[0m\n' "$1"; }
c_dim()  { printf '\033[2m%s\033[0m\n' "$1"; }

apps_to_run() {
  if [ "$APP" = "all" ]; then printf '%s\n' "${ALL_APPS[@]}"; else echo "$APP"; fi
}

# Run an npm script only if it is actually defined, so a missing script is
# reported as skipped rather than silently counting as a pass.
run_if_defined() {
  local dir="$1" script="$2" label="$3" db="${4:-}"
  [ -f "$dir/package.json" ] || { c_dim "  – $label: no package.json"; return 0; }
  if ! node -e "process.exit(require('$dir/package.json').scripts?.['$script'] ? 0 : 1)" 2>/dev/null; then
    c_dim "  – $label: no '$script' script defined"
    return 0
  fi
  RAN=$((RAN + 1))
  if (cd "$dir" && MYSQL_DATABASE="${db:-${MYSQL_DATABASE:-}}" NODE_ENV=test npm run --silent "$script" >/dev/null 2>&1); then
    c_grn "  ✓ $label"
  else
    c_red "  ✗ $label"
    FAILED+=("$label")
  fi
}

tier1() {
  echo "── Tier 1: syntax + unit ──"
  for app in $(apps_to_run); do
    local dir="$REPO_ROOT/apps/$app"
    [ -d "$dir" ] || continue
    local db; db="$(test_db_for "$app")"
    run_if_defined "$dir" "test:static" "$app static" "$db"
    run_if_defined "$dir" "test"        "$app unit"   "$db"
    run_if_defined "$dir/frontend" "test" "$app frontend unit" "$db"
  done
}

tier2() {
  echo "── Tier 2: browser smoke ──"
  if [ "$APP" = "all" ]; then
    c_red "Tier 2 needs a specific app: scripts/test-tier.sh tier2 mims"
    exit 2
  fi
  local dir="$REPO_ROOT/apps/$APP"
  RAN=$((RAN + 1))
  if (cd "$dir" && npm run --silent test:e2e -- --grep "smoke|renders|loads" 2>&1 | tail -20); then
    c_grn "  ✓ $APP browser smoke"
  else
    c_red "  ✗ $APP browser smoke"
    FAILED+=("$APP browser smoke")
  fi
}

tier3() {
  echo "── Tier 3: full browser regression ──"
  for app in $(apps_to_run); do
    local dir="$REPO_ROOT/apps/$app"
    [ -d "$dir" ] || continue
    run_if_defined "$dir" "test:e2e" "$app e2e"
  done
}

case "$TIER" in
  tier1) tier1 ;;
  tier2) tier2 ;;
  tier3) tier3 ;;
  *) echo "Unknown tier '$TIER'. Use tier1, tier2 or tier3."; exit 2 ;;
esac

echo
if [ ${#FAILED[@]} -gt 0 ]; then
  c_red "FAILED (${#FAILED[@]} of $RAN): ${FAILED[*]}"
  exit 1
fi
c_grn "All $RAN checks passed."
