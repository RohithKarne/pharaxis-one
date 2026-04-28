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
  "!**/backend/storage/**"
  "!**/*.sql"
  "!**/*.sql.gz"
  "!scripts/security-scan.sh"
)

FAILURES=0
RG_GLOBS=()
for g in "${EXCLUDES[@]}"; do
  RG_GLOBS+=(--glob "$g")
done

scan() {
  local title="$1"
  local pattern="$2"
  echo "→ $title"
  if rg -n -S --hidden "${RG_GLOBS[@]}" -e "$pattern" "$ROOT_DIR"; then
    echo "✗ $title"
    FAILURES=$((FAILURES + 1))
  else
    echo "✓ $title"
  fi
}

scan_pcre() {
  local title="$1"
  local pattern="$2"
  echo "→ $title"
  if rg -n -P --hidden "${RG_GLOBS[@]}" -e "$pattern" "$ROOT_DIR"; then
    echo "✗ $title"
    FAILURES=$((FAILURES + 1))
  else
    echo "✓ $title"
  fi
}

echo "Running MIMS security scan in: $ROOT_DIR"

# Disallow known historical weak hardcoded credentials.
scan "Hardcoded weak/default credentials" "Manager@123|Regression@System123|devpass"

# Disallow secrets in URL query strings.
scan "Token/key in URL query strings" "\\?token=|[?&](access_token|auth_token|api[_-]?key|jwt|token)="

# Detect common key/token leaks.
scan "OpenAI key pattern" "sk-[A-Za-z0-9]{20,}"
scan "AWS access key pattern" "AKIA[0-9A-Z]{16}"
scan "Google API key pattern" "AIza[0-9A-Za-z\\-_]{35}"
scan "Private key block" "BEGIN [A-Z ]*PRIVATE KEY"
scan "Slack token pattern" "xox[baprs]-[A-Za-z0-9-]{10,}"

# Detect DSN credentials embedded in code/config strings.
scan_pcre "Credentialed DB URLs" "(mysql|postgres(?:ql)?|mongodb(?:\\+srv)?):\\/\\/[^\\s'\\\"]+:[^\\s'\\\"]+@"

# Detect suspicious direct secret assignments while allowing placeholders.
scan_pcre "Suspicious inline secret assignments" "(?i)\\b(api[_-]?key|secret|token|password)\\b\\s*[:=]\\s*['\\\"](?!(__SET_|replace_with_|your_|example|dummy|test|mock))[A-Za-z0-9_\\-\\/.=:@+]{10,}['\\\"]"

if [[ "$FAILURES" -gt 0 ]]; then
  echo "Security scan failed with $FAILURES finding group(s)."
  exit 1
fi

echo "Security scan passed."
