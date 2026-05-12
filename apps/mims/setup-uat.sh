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
  npm install -g pm2
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
npm install --omit=dev
npm run build
echo "   ✓ Frontend built"

# ── Start MIMS via PM2 ───────────────────────────────────────────────────────
echo ""
echo "→ Starting MIMS via PM2..."
cd "$SCRIPT_DIR"
pm2 start ecosystem.config.local.js
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
