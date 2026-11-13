#!/usr/bin/env bash
# Comprueba en la instancia que el kiosco y Socket.IO quedaron vivos.
# Sale != 0 si el sitio volvería a mostrar 404 / timeout de firma.
set -euo pipefail

PORT="${1:-3000}"
BASE="http://127.0.0.1:${PORT}"
fail=0

check() {
  local name="$1"
  local url="$2"
  local expect_re="$3"
  local code
  code=$(curl -sS -o /tmp/mhd-smoke-body.txt -w "%{http_code}" --max-time 15 "$url" || echo "000")
  if [[ ! "$code" =~ $expect_re ]]; then
    echo "FALLA $name → HTTP $code (esperado /$expect_re/) $url"
    head -c 400 /tmp/mhd-smoke-body.txt 2>/dev/null || true
    echo
    fail=1
  else
    echo "OK $name → HTTP $code"
  fi
}

echo "---- Smoke post-deploy en $BASE ----"

# Ruta de QR de tableta: sin sesión debe ser 401, nunca 404.
check "kiosk lan-link" "$BASE/api/v1/kiosk/lan-link" "401"

# Respaldo HTTP de firma: GET → 403 (solo POST); 404 = server viejo.
check "kiosk signature (GET)" "$BASE/api/v1/kiosk/signature" "403"

# Socket.IO engine.io handshake por polling.
check "socket.io polling" "$BASE/socket.io/?EIO=4&transport=polling" "200"

# El index servido por Express debe existir.
check "frontend index" "$BASE/" "200"

# SPA clínica: /pacientes debe servir el index (200). 502/504 = upstream caído/lento.
check "frontend /pacientes" "$BASE/pacientes" "200"
check "frontend /pacientes/:id" "$BASE/pacientes/458" "200"

# HEAD rápido (Nginx → Node): no debe colgarse.
head_code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 8 -I "$BASE/pacientes/458" || echo 000)
if [[ "$head_code" != "200" ]]; then
  echo "FALLA HEAD /pacientes/458 → HTTP $head_code"
  fail=1
else
  echo "OK HEAD /pacientes/458 → HTTP $head_code"
fi

if [ "$fail" -ne 0 ]; then
  echo "Smoke falló: el proceso reiniciado no tiene el API/socket del kiosco." >&2
  exit 1
fi

echo "Smoke OK: kiosco API + Socket.IO + /pacientes listos."
