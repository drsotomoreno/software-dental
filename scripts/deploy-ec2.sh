#!/usr/bin/env bash
# Despliegue en la instancia AWS EC2.
# Antes, desde la máquina de desarrollo: git push.
# Luego, por SSH, en el clone del repositorio:
#   bash scripts/deploy-ec2.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_NAME="${PM2_APP_NAME:-software-dental}"

git pull --ff-only
npm install
npm run build

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start ecosystem.config.cjs
fi

pm2 save
echo "Despliegue listo: pm2 status ${APP_NAME}"
