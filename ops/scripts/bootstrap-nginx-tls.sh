#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: $0 <domain> <email> [repo_root]"
  exit 1
fi

DOMAIN="$1"
EMAIL="$2"
REPO_ROOT="${3:-/home/ubuntu/pharaxis}"
TEMPLATE_PATH="$REPO_ROOT/ops/nginx/pharaxis-one.conf.template"
TARGET_PATH="/etc/nginx/sites-available/pharaxis-one.conf"

if [ ! -f "$TEMPLATE_PATH" ]; then
  echo "Missing template: $TEMPLATE_PATH"
  exit 1
fi

sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx

sudo mkdir -p /var/www/certbot
sudo mkdir -p /var/www/pharaxis/{vault,qms,cp-portal,mims,ai-agent}

sed "s/__DOMAIN__/$DOMAIN/g" "$TEMPLATE_PATH" | sudo tee "$TARGET_PATH" >/dev/null
sudo ln -sfn "$TARGET_PATH" /etc/nginx/sites-enabled/pharaxis-one.conf
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx \
  --non-interactive \
  --agree-tos \
  --redirect \
  --email "$EMAIL" \
  -d "$DOMAIN"

sudo nginx -t
sudo systemctl reload nginx

echo "Nginx + TLS active for https://$DOMAIN"
echo "Next: sync frontend dist folders into /var/www/pharaxis/<app>/ and run smoke checks."
