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

ENVIRONMENTS=(
  "mims-prod"
  "qms-prod"
  "vault-prod"
  "cp-portal-prod"
  "ai-agent-prod"
)

create_or_update_environment() {
  local env_name="$1"
  local payload
  payload="$(mktemp)"
  cat >"$payload" <<'JSON'
{
  "wait_timer": 0,
  "prevent_self_review": true,
  "deployment_branch_policy": {
    "protected_branches": false,
    "custom_branch_policies": true
  }
}
JSON

  gh api \
    --method PUT \
    -H "Accept: application/vnd.github+json" \
    "repos/${OWNER_REPO}/environments/${env_name}" \
    --input "$payload" >/dev/null

  rm -f "$payload"
}

ensure_main_branch_policy() {
  local env_name="$1"
  local policies
  policies="$(gh api -H "Accept: application/vnd.github+json" "repos/${OWNER_REPO}/environments/${env_name}/deployment-branch-policies" 2>/dev/null || echo '{"branch_policies":[]}' )"
  if echo "$policies" | rg -q '"name"\s*:\s*"main"'; then
    echo "Policy already exists for ${env_name}: main"
    return 0
  fi

  gh api \
    --method POST \
    -H "Accept: application/vnd.github+json" \
    "repos/${OWNER_REPO}/environments/${env_name}/deployment-branch-policies" \
    -f name=main \
    -f type=branch >/dev/null
}

echo "Repo: ${OWNER_REPO}"
for env_name in "${ENVIRONMENTS[@]}"; do
  echo "Creating/updating environment: ${env_name}"
  create_or_update_environment "$env_name"
  ensure_main_branch_policy "$env_name"
done

echo "Triggering label sync workflow"
gh workflow run sync-labels.yml >/dev/null

cat <<'EOF'
Bootstrap complete.

Still manual:
- copy production deploy secrets into each GitHub environment
- assign environment reviewers per product
- apply branch protection with exact required checks
EOF
