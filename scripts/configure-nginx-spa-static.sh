#!/usr/bin/env bash
# Configura Nginx para servir dist/ en rutas SPA y proxy solo /api/ + /socket.io/.
# - Preferir /var/www/.../dist (legible por www-data; /home/ubuntu suele ser 750).
# - Respaldos fuera de sites-enabled (nginx carga TODO lo que haya ahí, incl. .bak).
set -euo pipefail

DIST_ROOT="${1:-}"
PORT="${2:-3000}"

if [[ -z "$DIST_ROOT" || ! -f "$DIST_ROOT/index.html" ]]; then
  echo "Usage: $0 /path/to/dist [port]" >&2
  exit 2
fi

# Preferir dist canónico bajo /var/www si existe (permisos nginx).
if [[ -f /var/www/mihistoriadental/dist/index.html ]]; then
  DIST_ROOT="/var/www/mihistoriadental/dist"
fi
DIST_ROOT="$(cd "$DIST_ROOT" && pwd)"

# Asegurar lectura por www-data
sudo chmod -R a+rX "$DIST_ROOT" 2>/dev/null || true
# Si el dist está bajo /home, abrir solo execute en el path de recorrido
case "$DIST_ROOT" in
  /home/*)
    echo "WARN: dist bajo /home — abriendo +x en ancestros para www-data"
    d="$DIST_ROOT"
    while [[ "$d" != "/" && "$d" != "/home" ]]; do
      sudo chmod a+x "$d" 2>/dev/null || true
      d="$(dirname "$d")"
    done
    sudo chmod a+x /home 2>/dev/null || true
    # Abrir home del usuario (solo +x, no listado de otros)
    home_user="$(echo "$DIST_ROOT" | cut -d/ -f1-3)"
    sudo chmod a+x "$home_user" 2>/dev/null || true
    ;;
esac

BAK_DIR="/etc/nginx/bak-spa-static"
sudo mkdir -p "$BAK_DIR"

shopt -s nullglob
# Mover fuera de sites-enabled cualquier .bak / .disabled que nginx aún cargue
for junk in /etc/nginx/sites-enabled/*.bak* /etc/nginx/sites-enabled/*.disabled*; do
  [[ -e "$junk" ]] || continue
  dest="$BAK_DIR/$(basename "$junk")"
  sudo mv "$junk" "$dest"
  echo "NGINX_MOVED_JUNK=$dest"
done

CANDIDATES=(/etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf)

PRIMARY=""
CONFLICTS=()
for cand in "${CANDIDATES[@]}"; do
  [[ -f "$cand" ]] || continue
  base="$(basename "$cand")"
  [[ "$base" == *.bak* || "$base" == *.disabled* ]] && continue
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

for other in "${CONFLICTS[@]+"${CONFLICTS[@]}"}"; do
  [[ -f "$other" ]] || continue
  dest="$BAK_DIR/$(basename "$other").disabled-$(date +%Y%m%d%H%M%S)"
  sudo mv "$other" "$dest"
  echo "NGINX_DISABLED_CONFLICT=$dest"
done

BACKUP="$BAK_DIR/$(basename "$PRIMARY").bak-$(date +%Y%m%d%H%M%S)"
sudo cp -a "$PRIMARY" "$BACKUP"
echo "NGINX_BACKUP=$BACKUP"
echo "NGINX_CONF=$PRIMARY"
echo "DIST_ROOT=$DIST_ROOT PORT=$PORT"

SSL_CERT="$(grep -E '^\s*ssl_certificate\s+' "$PRIMARY" | head -1 | awk '{print $2}' | tr -d ';' || true)"
SSL_KEY="$(grep -E '^\s*ssl_certificate_key\s+' "$PRIMARY" | head -1 | awk '{print $2}' | tr -d ';' || true)"
if [[ -z "$SSL_CERT" || -z "$SSL_KEY" ]]; then
  for cand in "$BACKUP" "$BAK_DIR"/* /etc/letsencrypt/live/*/fullchain.pem; do
    [[ -e "$cand" ]] || continue
    if [[ "$cand" == *.pem ]]; then
      live_dir="$(dirname "$cand")"
      SSL_CERT="$live_dir/fullchain.pem"
      SSL_KEY="$live_dir/privkey.pem"
      break
    fi
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

# Smoke local: www-data debe poder leer index.html
if command -v sudo >/dev/null; then
  if sudo -u www-data test -r "$DIST_ROOT/index.html"; then
    echo "WWW_DATA_CAN_READ_DIST=yes"
  else
    echo "WWW_DATA_CAN_READ_DIST=no" >&2
    namei -l "$DIST_ROOT/index.html" || true
    exit 1
  fi
fi
echo "NGINX_SPA_STATIC_OK"
