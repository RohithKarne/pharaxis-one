#!/bin/bash
# setup-uat.sh — One-time setup for the local UAT machine
#
# Run this ONCE on the UAT machine to get everything ready.
# After this, use deploy.sh for all future updates.
#
# Prerequisites:
#   - Node.js 20+ and npm installed
#   - MySQL 8.0 running locally
#   - Git installed and repo cloned
#   - Redis running (brew services start redis  OR  sudo service redis start)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MIMS UAT Machine — First-Time Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Check ecosystem config exists ────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/ecosystem.config.local.js" ]; then
  echo ""
  echo "❌  ecosystem.config.local.js not found — are you in the right directory?"
  exit 1
fi
echo "✓ ecosystem.config.local.js found (env vars configured inside)"

# ── Install PM2 globally ──────────────────────────────────────────────────────
echo ""
echo "→ Installing PM2 globally..."
if ! command -v pm2 &>/dev/null; then
  sudo npm install -g pm2
  echo "   ✓ PM2 installed"
else
  echo "   ✓ PM2 already installed ($(pm2 --version))"
fi

# ── Install backend dependencies ──────────────────────────────────────────────
echo ""
echo "→ Installing backend dependencies..."
cd "$SCRIPT_DIR"
npm install --omit=dev
echo "   ✓ Done"

# ── Install frontend dependencies + build ─────────────────────────────────────
echo ""
echo "→ Building frontend..."
cd "$SCRIPT_DIR/frontend"
npm install          # needs devDeps (vite) to build
npm run build
echo "   ✓ Frontend built"

# ── Write UAT env file for the backend process ───────────────────────────────
# PM2 v7 doesn't auto-detect ecosystem.config.local.js — we start the server
# directly and load env vars via Node's built-in --env-file flag.
cat > "$SCRIPT_DIR/backend/.env.uat" <<'ENVEOF'
NODE_ENV=production
PORT=4001
HOST=::

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=devuser
MYSQL_PASSWORD=devpass
MYSQL_DATABASE=pharaxis_mims_uat
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=mims-uat-local-jwt-secret-change-before-external-use
SESSION_CACHE_TTL_SECONDS=60
SMTP_CONNECT_TIMEOUT_MS=15000
IMAP_CONNECT_TIMEOUT_MS=10000
IMAP_SOCKET_TIMEOUT_MS=30000
EMAIL_WORKER_POLL_MS=15000
EMAIL_WORKER_BATCH_SIZE=5
WORKFLOW_CACHE_TTL_SECONDS=300
MIMS_FRONTEND_BASE_URL=http://localhost:4001/mims
MIMS_BACKEND_BASE_URL=http://localhost:4001
MIMS_ALLOWED_FRONTEND_ORIGINS=http://localhost:4001,http://127.0.0.1:4001,http://192.168.0.145:4001
BOOTSTRAP_SUPERADMIN_EMAIL=superadmin@pharaxis.local
BOOTSTRAP_SUPERADMIN_PASSWORD=MimsUAT@2026!
REGRESSION_EMAIL=rohithreddy480@gmail.com
REGRESSION_PASSWORD=Rohith@UAT2026!
ENVEOF
echo "   ✓ backend/.env.uat written"

# ── Start MIMS via PM2 ───────────────────────────────────────────────────────
echo ""
echo "→ Starting MIMS UAT via PM2..."
pm2 delete mims-uat 2>/dev/null || true
pm2 start "$SCRIPT_DIR/backend/server.js" \
  --name        mims-uat \
  --cwd         "$SCRIPT_DIR/backend" \
  --node-args   "--env-file=$SCRIPT_DIR/backend/.env.uat" \
  --max-memory-restart 400M \
  --restart-delay 3000 \
  --merge-logs \
  --log-date-format "YYYY-MM-DD HH:mm:ss"
pm2 save

echo ""
echo "→ Configuring PM2 to auto-start on boot..."
echo "   (If this asks you to run a sudo command, run it as instructed)"
pm2 startup || true

# ── Seed Novartis-Demo org ────────────────────────────────────────────────────
echo ""
read -p "→ Seed Novartis demo org now? (recommended for first setup) [y/N]: " SEED_CONFIRM
if [[ "$SEED_CONFIRM" =~ ^[Yy]$ ]]; then
  echo "   Seeding Novartis-Demo org... (this may take 30–60 seconds)"
  cd "$SCRIPT_DIR"
  node backend/scripts/seed-novartis-full-scope.js
  echo "   ✓ Novartis-Demo org seeded"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ UAT machine ready!"
echo ""
echo "  MIMS is running at:  http://${LOCAL_IP}:4000"
echo "  PM2 status:          pm2 status"
echo "  PM2 logs:            pm2 logs mims-uat"
echo ""
echo "  Share this URL with the team on your local network."
echo "  For future deploys: bash deploy.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
