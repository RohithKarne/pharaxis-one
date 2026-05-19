#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI is required."
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh auth is not valid. Run: gh auth login -h github.com"
  exit 1
fi

REMOTE_URL="$(git remote get-url origin)"
OWNER_REPO="${REMOTE_URL#https://github.com/}"
OWNER_REPO="${OWNER_REPO%.git}"

if [[ "$OWNER_REPO" != */* ]]; then
  echo "ERROR: Could not derive owner/repo from origin remote."
  exit 1
fi

REQUIRED_CHECKS_JSON="${REQUIRED_CHECKS_JSON:-[]}"
STRICT_STATUS_CHECKS="${STRICT_STATUS_CHECKS:-true}"

PAYLOAD="$(mktemp)"
cat >"$PAYLOAD" <<JSON
{
  "required_status_checks": {
    "strict": ${STRICT_STATUS_CHECKS},
    "contexts": ${REQUIRED_CHECKS_JSON}
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_linear_history": false,
  "lock_branch": false,
  "allow_fork_syncing": true
}
JSON

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/${OWNER_REPO}/branches/main/protection" \
  --input "$PAYLOAD" >/dev/null

rm -f "$PAYLOAD"

cat <<EOF
Branch protection applied to ${OWNER_REPO}:main

Required checks payload:
${REQUIRED_CHECKS_JSON}

Note:
- if checks were left as [], add exact GitHub check names after the first full CI run
- rerun this script with:
  REQUIRED_CHECKS_JSON='["MIMS CI / ci","QMS CI / ci","Vault CI / ci","CP Portal CI / ci","AI-Agent CI / ci"]' ./scripts/github/apply-main-branch-protection.sh
EOF
