#!/usr/bin/env bash
# Actualiza mihistoriadental.com en la EC2 sin apagar nginx.
# Ejecutar DENTRO de la instancia:
#   bash scripts/deploy-ec2.sh
set -euo pipefail

CANONICAL="${APP_DIR:-/var/www/mihistoriadental}"
cd "$CANONICAL"

if [[ ! -f .env ]]; then
  echo "Falta $CANONICAL/.env con DATABASE_URL (RDS), PORT y NODE_ENV=production." >&2
  exit 1
fi

echo "---- Código ----"
git remote get-url origin
git status --short --branch
git fetch origin main
git add -A
git reset --hard origin/main
chmod +x scripts/*.sh 2>/dev/null || true

echo "---- Dependencias y build ----"
npm install
# Evitar 502: primero construir con PM2 en línea. Solo si OOM, pausar y reintentar.
echo "---- Build (PM2 en línea) ----"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"
if ! npm run build; then
  echo "Build falló; reintento liberando RAM (PM2 pause breve)."
  pm2 stop all || true
  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
  npm run build || { pm2 restart all --update-env || true; exit 1; }
fi
grep -o 'assets/index-[^"]*' dist/index.html || true

echo "---- Sincronizar cwd de PM2 (evita server.js viejo) ----"
pm2 jlist | node -e 'let raw="";process.stdin.on("data",d=>raw+=d);process.stdin.on("end",()=>{const apps=JSON.parse(raw);const seen=new Set();for(const app of apps){const cwd=app.pm2_env&&app.pm2_env.pm_cwd;if(cwd&&!seen.has(cwd)){seen.add(cwd);console.log(cwd);}}});' > /tmp/pm2-cwds.txt

while IFS= read -r dir; do
  [ -n "$dir" ] || continue
  if [ "$dir" = "$CANONICAL" ]; then
    continue
  fi
  if [ -f "$dir/server.js" ] && [ -f "$dir/package.json" ]; then
    bash "$CANONICAL/scripts/sync-pm2-from-canonical.sh" "$CANONICAL" "$dir"
  fi
done < /tmp/pm2-cwds.txt

echo "---- Reinicio PM2 ----"
if pm2 describe mihistoriadental >/dev/null 2>&1; then
  pm2 restart mihistoriadental --update-env
elif pm2 describe software-dental >/dev/null 2>&1; then
  pm2 restart software-dental --update-env
else
  pm2 restart all --update-env
fi
pm2 save
sleep 3
sudo systemctl reload nginx || true

PORT="$(grep -E '^PORT=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
PORT="${PORT:-3000}"
bash "$CANONICAL/scripts/post-deploy-smoke.sh" "$PORT"

pm2 status
echo "Listo. Socket.IO en /socket.io · firma kiosco con ack liviano + HTTP /api/v1/kiosk/signature."
