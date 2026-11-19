#!/usr/bin/env bash
# Despliegue seguro — blindaje clínico (5 pilares) en EC2 3.23.2.186 + RDS.
# Ejecutar desde la sesión SSH en el directorio del proyecto (ajustar APP_DIR).
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/software-dental}"
DATA_DIR="${DATA_DIR:-$APP_DIR/server/data}"
PM2_APP="${PM2_APP:-software-dental}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
STAMP="$(date +%Y%m%d_%H%M%S)"

cd "$APP_DIR"

echo "==> [1/6] Respaldo fechado de clinical-sync.json"
if [[ -f "$DATA_DIR/clinical-sync.json" ]]; then
  cp -a "$DATA_DIR/clinical-sync.json" "$DATA_DIR/clinical-sync.json.bak.$STAMP"
  ls -lh "$DATA_DIR/clinical-sync.json.bak.$STAMP"
else
  echo "ADVERTENCIA: no existe $DATA_DIR/clinical-sync.json — continúo sin backup de ese archivo."
fi

echo "==> [2/6] Migración SQL clinical_audit_logs (idempotente) contra RDS"
if [[ -f "$APP_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$APP_DIR/.env"
  set +a
fi

MIG="$APP_DIR/server/db/migrations/20261118180000_clinical_audit_logs.sql"
if [[ -n "${DATABASE_URL:-}" ]]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIG"
elif [[ -n "${PGHOST:-}" && -n "${PGDATABASE:-}" ]]; then
  export PGPASSWORD="${PGPASSWORD:-${PG_PASSWORD:-}}"
  psql -h "$PGHOST" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" -d "$PGDATABASE" \
    -v ON_ERROR_STOP=1 -f "$MIG"
else
  echo "ADVERTENCIA: sin DATABASE_URL/PG*; la app aplicará la migración en el primer INSERT (best-effort)."
fi

echo "==> [3/6] git pull"
git fetch --all --prune
git pull --ff-only

echo "==> [4/6] Dependencias + build de producción"
npm ci --omit=dev || npm install --omit=dev
npm run build

echo "==> [5/6] Reinicio PM2 limpio"
pm2 restart "$PM2_APP" --update-env
sleep 3
pm2 logs "$PM2_APP" --lines 30 --nostream

echo "==> [6/6] Healthcheck"
curl -fsS "$HEALTH_URL" | head -c 500
echo
echo "OK — despliegue clinical shield $STAMP"
