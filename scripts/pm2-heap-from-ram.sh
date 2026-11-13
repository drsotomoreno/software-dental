#!/usr/bin/env bash
# Imprime heap MB = 70% RAM física, acotado a [512, 1536] (nunca 4096 en t3 pequeña).
set -euo pipefail
MEM_MB="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
HEAP=$((MEM_MB * 70 / 100))
if [[ "$HEAP" -gt 1536 ]]; then HEAP=1536; fi
if [[ "$HEAP" -lt 512 ]]; then HEAP=512; fi
echo "$HEAP"
