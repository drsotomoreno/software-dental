#!/usr/bin/env bash
# Actualiza mihistoriadental.com en la EC2 sin apagar nginx.
# Ejecutar DENTRO de la instancia, en el clon del repo:
#   bash scripts/deploy-ec2.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/mihistoriadental}"
cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "Falta $APP_DIR/.env con DATABASE_URL (RDS), PORT y NODE_ENV=production." >&2
  exit 1
fi

echo "---- Código ----"
git remote get-url origin
git status --short --branch
git fetch origin main
git add -A
git reset --hard origin/main

echo "---- Dependencias y build (el proceso actual sigue sirviendo) ----"
npm install
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}"
npm run build
grep -o 'assets/index-[^"]*' dist/index.html || true

restart_pm2() {
  local name="$1"
  if pm2 describe "$name" >/dev/null 2>&1; then
    pm2 restart "$name" --update-env
    return 0
  fi
  return 1
}

echo "---- Reinicio PM2 ----"
if restart_pm2 mihistoriadental; then
  :
elif restart_pm2 software-dental; then
  :
else
  pm2 restart all --update-env
fi
pm2 save
sudo systemctl reload nginx
pm2 status
echo "Listo. Socket.IO queda en el mismo dominio, ruta /socket.io."
