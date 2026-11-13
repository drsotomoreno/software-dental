#!/usr/bin/env bash
# Configura Nginx para servir dist/ en rutas SPA y proxy solo /api/ + /socket.io/.
set -euo pipefail

DIST_ROOT="${1:-}"
PORT="${2:-3000}"

if [[ -z "$DIST_ROOT" || ! -f "$DIST_ROOT/index.html" ]]; then
  echo "Usage: $0 /path/to/dist [port]" >&2
  exit 2
fi
DIST_ROOT="$(cd "$DIST_ROOT" && pwd)"

CONF=""
for cand in \
  /etc/nginx/sites-enabled/mihistoriadental \
  /etc/nginx/sites-enabled/mihistoriadental.com \
  /etc/nginx/sites-enabled/default \
  /etc/nginx/conf.d/mihistoriadental.conf
do
  if [[ -f "$cand" ]]; then CONF="$cand"; break; fi
done
if [[ -z "$CONF" ]]; then
  CONF="$(ls /etc/nginx/sites-enabled/* 2>/dev/null | head -1 || true)"
fi
if [[ -z "$CONF" || ! -f "$CONF" ]]; then
  echo "NGINX_CONF_NOT_FOUND" >&2
  exit 1
fi

BACKUP="${CONF}.bak-spa-static-$(date +%Y%m%d%H%M%S)"
sudo cp -a "$CONF" "$BACKUP"
echo "NGINX_BACKUP=$BACKUP"
echo "NGINX_CONF=$CONF"
echo "DIST_ROOT=$DIST_ROOT PORT=$PORT"

# Escribir conf completa conservando certificados si existen en el archivo actual.
SSL_CERT="$(grep -E '^\s*ssl_certificate\s+' "$CONF" | head -1 | awk '{print $2}' | tr -d ';' || true)"
SSL_KEY="$(grep -E '^\s*ssl_certificate_key\s+' "$CONF" | head -1 | awk '{print $2}' | tr -d ';' || true)"
SERVER_NAMES="$(grep -E '^\s*server_name\s+' "$CONF" | head -1 | sed 's/server_name//;s/;//' | xargs || true)"
[[ -n "$SERVER_NAMES" ]] || SERVER_NAMES="www.mihistoriadental.com mihistoriadental.com"

TMP="$(mktemp)"
{
  echo "# Generado por configure-nginx-spa-static.sh — SPA estática + proxy API"
  echo "server {"
  echo "    listen 80;"
  echo "    listen [::]:80;"
  echo "    server_name $SERVER_NAMES;"
  echo "    return 301 https://\$host\$request_uri;"
  echo "}"
  echo ""
  echo "server {"
  echo "    listen 443 ssl http2;"
  echo "    listen [::]:443 ssl http2;"
  echo "    server_name $SERVER_NAMES;"
  if [[ -n "$SSL_CERT" && -n "$SSL_KEY" ]]; then
    echo "    ssl_certificate $SSL_CERT;"
    echo "    ssl_certificate_key $SSL_KEY;"
  fi
  echo "    client_max_body_size 150m;"
  echo ""
  echo "    location /api/ {"
  echo "        proxy_pass http://127.0.0.1:${PORT};"
  echo "        proxy_http_version 1.1;"
  echo "        proxy_set_header Host \$host;"
  echo "        proxy_set_header X-Real-IP \$remote_addr;"
  echo "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
  echo "        proxy_set_header X-Forwarded-Proto \$scheme;"
  echo "        proxy_read_timeout 120s;"
  echo "        client_max_body_size 150m;"
  echo "    }"
  echo ""
  echo "    location /socket.io/ {"
  echo "        proxy_pass http://127.0.0.1:${PORT};"
  echo "        proxy_http_version 1.1;"
  echo "        proxy_set_header Upgrade \$http_upgrade;"
  echo "        proxy_set_header Connection \"upgrade\";"
  echo "        proxy_set_header Host \$host;"
  echo "        proxy_set_header X-Real-IP \$remote_addr;"
  echo "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
  echo "        proxy_set_header X-Forwarded-Proto \$scheme;"
  echo "        proxy_read_timeout 120s;"
  echo "    }"
  echo ""
  echo "    location / {"
  echo "        root ${DIST_ROOT};"
  echo "        try_files \$uri \$uri/ /index.html;"
  echo "    }"
  echo "}"
} > "$TMP"

sudo cp "$TMP" "$CONF"
rm -f "$TMP"
sudo nginx -t
sudo systemctl reload nginx
echo "NGINX_SPA_STATIC_OK"
