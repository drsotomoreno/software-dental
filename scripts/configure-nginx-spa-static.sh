#!/usr/bin/env bash
# Configura Nginx para servir dist/ en rutas SPA y proxy solo /api/ + /socket.io/.
# Desactiva otros vhosts con el mismo server_name para evitar "conflicting server name".
set -euo pipefail

DIST_ROOT="${1:-}"
PORT="${2:-3000}"

if [[ -z "$DIST_ROOT" || ! -f "$DIST_ROOT/index.html" ]]; then
  echo "Usage: $0 /path/to/dist [port]" >&2
  exit 2
fi
DIST_ROOT="$(cd "$DIST_ROOT" && pwd)"

shopt -s nullglob
CANDIDATES=(
  /etc/nginx/sites-enabled/*
  /etc/nginx/conf.d/*.conf
)

# Preferir el vhost que ya menciona el dominio (nginx gana por orden alfabético).
PRIMARY=""
CONFLICTS=()
for cand in "${CANDIDATES[@]}"; do
  [[ -f "$cand" ]] || continue
  base="$(basename "$cand")"
  [[ "$base" == *.bak* ]] && continue
  if grep -qE 'mihistoriadental\.com|software-dental' "$cand" 2>/dev/null; then
    if [[ -z "$PRIMARY" ]]; then
      PRIMARY="$cand"
    else
      CONFLICTS+=("$cand")
    fi
  fi
done

if [[ -z "$PRIMARY" ]]; then
  for cand in \
    /etc/nginx/sites-enabled/mihistoriadental \
    /etc/nginx/sites-enabled/mihistoriadental.com \
    /etc/nginx/sites-enabled/software-dental \
    /etc/nginx/sites-enabled/default
  do
    if [[ -f "$cand" ]]; then PRIMARY="$cand"; break; fi
  done
fi
if [[ -z "$PRIMARY" || ! -f "$PRIMARY" ]]; then
  echo "NGINX_CONF_NOT_FOUND" >&2
  exit 1
fi

# Desactivar vhosts duplicados (dejan de cargarse).
for other in "${CONFLICTS[@]+"${CONFLICTS[@]}"}"; do
  [[ -f "$other" ]] || continue
  disabled="${other}.disabled-spa-$(date +%Y%m%d%H%M%S)"
  sudo mv "$other" "$disabled"
  echo "NGINX_DISABLED_CONFLICT=$disabled"
done

BACKUP="${PRIMARY}.bak-spa-static-$(date +%Y%m%d%H%M%S)"
sudo cp -a "$PRIMARY" "$BACKUP"
echo "NGINX_BACKUP=$BACKUP"
echo "NGINX_CONF=$PRIMARY"
echo "DIST_ROOT=$DIST_ROOT PORT=$PORT"

# Certificados: buscar en el primario o en cualquier conf/letsencrypt.
SSL_CERT="$(grep -E '^\s*ssl_certificate\s+' "$PRIMARY" | head -1 | awk '{print $2}' | tr -d ';' || true)"
SSL_KEY="$(grep -E '^\s*ssl_certificate_key\s+' "$PRIMARY" | head -1 | awk '{print $2}' | tr -d ';' || true)"
if [[ -z "$SSL_CERT" || -z "$SSL_KEY" ]]; then
  for cand in "${CANDIDATES[@]}" "$BACKUP" /etc/nginx/sites-enabled/*.disabled-spa-* /etc/nginx/sites-enabled/*.bak-spa-static-*; do
    [[ -f "$cand" ]] || continue
    SSL_CERT="$(grep -E '^\s*ssl_certificate\s+' "$cand" | head -1 | awk '{print $2}' | tr -d ';' || true)"
    SSL_KEY="$(grep -E '^\s*ssl_certificate_key\s+' "$cand" | head -1 | awk '{print $2}' | tr -d ';' || true)"
    [[ -n "$SSL_CERT" && -n "$SSL_KEY" ]] && break
  done
fi
if [[ -z "$SSL_CERT" || -z "$SSL_KEY" ]]; then
  if [[ -f /etc/letsencrypt/live/mihistoriadental.com/fullchain.pem ]]; then
    SSL_CERT="/etc/letsencrypt/live/mihistoriadental.com/fullchain.pem"
    SSL_KEY="/etc/letsencrypt/live/mihistoriadental.com/privkey.pem"
  elif [[ -f /etc/letsencrypt/live/www.mihistoriadental.com/fullchain.pem ]]; then
    SSL_CERT="/etc/letsencrypt/live/www.mihistoriadental.com/fullchain.pem"
    SSL_KEY="/etc/letsencrypt/live/www.mihistoriadental.com/privkey.pem"
  fi
fi
SERVER_NAMES="$(grep -E '^\s*server_name\s+' "$PRIMARY" | head -1 | sed 's/server_name//;s/;//' | xargs || true)"
[[ -n "$SERVER_NAMES" ]] || SERVER_NAMES="www.mihistoriadental.com mihistoriadental.com"

if [[ -z "$SSL_CERT" || -z "$SSL_KEY" ]]; then
  echo "NGINX_SSL_CERTS_MISSING" >&2
  exit 1
fi
echo "SSL_CERT=$SSL_CERT"

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
  echo "    listen 443 ssl;"
  echo "    listen [::]:443 ssl;"
  echo "    http2 on;"
  echo "    server_name $SERVER_NAMES;"
  echo "    ssl_certificate $SSL_CERT;"
  echo "    ssl_certificate_key $SSL_KEY;"
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
  echo "        add_header X-MHD-Static \"nginx-dist\" always;"
  echo "    }"
  echo "}"
} > "$TMP"

sudo cp "$TMP" "$PRIMARY"
rm -f "$TMP"
sudo nginx -t
sudo systemctl reload nginx
echo "NGINX_SPA_STATIC_OK"
