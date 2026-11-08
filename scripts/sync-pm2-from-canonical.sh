#!/usr/bin/env bash
# Copia el árbol canónico al cwd de PM2 conservando .env.
# Evita servir un server.js viejo cuando el segundo clone no puede hacer reset.
set -euo pipefail

CANONICAL="${1:?Falta el directorio canónico}"
TARGET="${2:?Falta el directorio destino PM2}"

if [ ! -f "$CANONICAL/server.js" ] || [ ! -d "$CANONICAL/dist" ]; then
  echo "El canónico no tiene server.js o dist/: $CANONICAL" >&2
  exit 1
fi

mkdir -p "$TARGET"
# .env y logs locales se quedan; el resto del runtime sale del build bueno.
tar -C "$CANONICAL" \
  --exclude .env \
  --exclude node_modules \
  --exclude dist \
  --exclude .git \
  --exclude '*.log' \
  -cf - . | tar -C "$TARGET" -xf -

rm -rf "$TARGET/dist"
cp -a "$CANONICAL/dist" "$TARGET/dist"

(
  cd "$TARGET"
  npm install --omit=dev
)

echo "Sincronizado $TARGET ← $CANONICAL"
grep -o 'assets/index-[^"]*' "$TARGET/dist/index.html" || true
