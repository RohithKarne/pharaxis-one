#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

EXCLUDES=(
  "!**/node_modules/**"
  "!**/dist/**"
  "!**/build/**"
  "!**/test-results/**"
  "!**/playwright-report/**"
  "!**/.cache/**"
  "!**/backend/uploads/**"
  "!**/backend/storage/**"
  "!**/*.sql"
  "!scripts/security-scan.sh"
)

FAILURES=0
WARNINGS=0
RG_GLOBS=()
for g in "${EXCLUDES[@]}"; do
  RG_GLOBS+=(--glob "$g")
done

scan_fail() {
  local title="$1"
  local pattern="$2"
  echo "-> $title"
  if rg -n -S --hidden "${RG_GLOBS[@]}" -e "$pattern" "$ROOT_DIR"; then
    echo "FAIL: $title"
    FAILURES=$((FAILURES + 1))
  else
    echo "OK: $title"
  fi
}

scan_fail_pcre() {
  local title="$1"
  local pattern="$2"
  echo "-> $title"
  if rg -n -P --hidden "${RG_GLOBS[@]}" -e "$pattern" "$ROOT_DIR"; then
    echo "FAIL: $title"
    FAILURES=$((FAILURES + 1))
  else
    echo "OK: $title"
  fi
}

scan_warn() {
  local title="$1"
  local pattern="$2"
  echo "-> $title"
  if rg -n -S --hidden "${RG_GLOBS[@]}" -e "$pattern" "$ROOT_DIR"; then
    echo "WARN: $title"
    WARNINGS=$((WARNINGS + 1))
  else
    echo "OK: $title"
  fi
}

echo "Running CP Portal security scan in: $ROOT_DIR"

scan_fail "Token/key in URL query strings" "\\?token=|[?&](access_token|auth_token|api[_-]?key|jwt|token)="
scan_fail "OpenAI key pattern" "sk-[A-Za-z0-9]{20,}"
scan_fail "AWS access key pattern" "AKIA[0-9A-Z]{16}"
scan_fail "Google API key pattern" "AIza[0-9A-Za-z\\-_]{35}"
scan_fail "Private key block" "BEGIN [A-Z ]*PRIVATE KEY"
scan_fail "Slack token pattern" "xox[baprs]-[A-Za-z0-9-]{10,}"
scan_fail_pcre "Credentialed DB URLs" "(mysql|postgres(?:ql)?|mongodb(?:\\+srv)?):\\/\\/[^\\s'\\\"]+:[^\\s'\\\"]+@"
scan_fail_pcre "Suspicious inline secret assignments" "(?i)\\b(api[_-]?key|secret|token|password)\\b\\s*[:=]\\s*['\\\"](?!(__SET_|replace_with_|your_|example|dummy|test|mock|dev-|local-|cp-admin-insecure-dev-only|cp-portal-insecure-dev-only))[A-Za-z0-9_\\-\\/.=:@+]{16,}['\\\"]"

# Existing local-only bootstrap credentials are reported as warnings so the scan remains usable during development.
scan_warn "Local development default credentials" "Admin@123|Test@1234|devpass"

if [[ "$FAILURES" -gt 0 ]]; then
  echo "Security scan failed with $FAILURES finding group(s) and $WARNINGS warning group(s)."
  exit 1
fi

echo "Security scan passed with $WARNINGS warning group(s)."
