#!/bin/bash
# deploy.sh — Local UAT/Prod deploy script for MIMS
#
# Run this on the UAT machine whenever Varun pushes to the production branch.
# Usage: bash deploy.sh
#
# Prerequisites on the UAT machine:
#   - Node.js 20+, npm, PM2 installed globally (npm i -g pm2)
#   - Git repo cloned at this path
#   - .env file present in apps/mims/ (copy from .env.example, fill in values)
#   - MySQL running with mims_uat database created
#   - PM2 started once: pm2 start ecosystem.config.local.js

set -e  # exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"  # Pharaxis-One root

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MIMS UAT/Prod Deploy — $(date '+%Y-%m-%d %H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Pull latest from production branch ────────────────────────────────
echo ""
echo "→ [1/5] Pulling latest from production branch..."
cd "$REPO_ROOT"
git fetch origin
git checkout production
git pull origin production
echo "   ✓ Code up to date"

# ── Step 2: Install backend dependencies ──────────────────────────────────────
echo ""
echo "→ [2/5] Installing backend dependencies..."
cd "$SCRIPT_DIR"
npm install --omit=dev
echo "   ✓ Backend dependencies installed"

# ── Step 3: Build frontend ────────────────────────────────────────────────────
echo ""
echo "→ [3/5] Building frontend..."
cd "$FRONTEND_DIR"
npm install          # needs devDeps (vite) to build
npm run build
echo "   ✓ Frontend built → frontend/dist/"

# ── Step 4: Smoke test gate ───────────────────────────────────────────────────
# Run smoke tests against the currently running UAT server before replacing it.
# If any test fails, the deploy is blocked — the old version stays live.
echo ""
echo "→ [4/6] Running smoke test gate..."
cd "$SCRIPT_DIR"

SMOKE_FAILED=0
SMOKE_TESTS=(
  "backend/tests/smoke-sprint14-g12.js"
  "backend/tests/smoke-sprint14-g13.js"
)

for test in "${SMOKE_TESTS[@]}"; do
  if [ -f "$test" ]; then
    echo "   Running $test ..."
    if ! node "$test" > /tmp/mims-smoke-output.txt 2>&1; then
      echo "   ✗ FAILED: $test"
      cat /tmp/mims-smoke-output.txt | tail -20
      SMOKE_FAILED=1
    else
      echo "   ✓ PASSED: $test"
    fi
  fi
done

if [ "$SMOKE_FAILED" -eq 1 ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ❌ Deploy BLOCKED — smoke tests failed!"
  echo "  The running UAT server is unchanged."
  echo "  Fix the failing tests and redeploy."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
echo "   ✓ All smoke tests passed — proceeding with deploy"

# ── Step 5: Restart MIMS via PM2 ─────────────────────────────────────────────
echo ""
echo "→ [5/6] Restarting MIMS via PM2..."
cd "$SCRIPT_DIR"
if pm2 describe mims-uat > /dev/null 2>&1; then
  pm2 restart mims-uat
else
  pm2 start "$SCRIPT_DIR/backend/server.js" \
    --name        mims-uat \
    --cwd         "$SCRIPT_DIR/backend" \
    --node-args   "--env-file=$SCRIPT_DIR/backend/.env.uat" \
    --max-memory-restart 400M \
    --restart-delay 3000 \
    --merge-logs \
    --log-date-format "YYYY-MM-DD HH:mm:ss"
fi
echo "   ✓ MIMS restarted"

# ── Step 6: Status check ──────────────────────────────────────────────────────
echo ""
echo "→ [6/6] Status check..."
sleep 2  # give PM2 a moment to settle
pm2 status mims-uat

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Deploy complete!"
echo ""
echo "  Access MIMS at:  http://$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost):4001"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
