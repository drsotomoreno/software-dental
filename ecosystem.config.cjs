/**
 * PM2 — mihistoriadental.com (EC2 t3.micro ≈ 1 GB RAM).
 * Heap V8 = 70% RAM física, acotado a [512, 1536] (misma fórmula que
 * scripts/pm2-heap-from-ram.sh). Reinicio preventivo ~100 MB sobre el heap
 * para evitar FATAL "Reached heap limit" / Nginx 502.
 *
 * Uso: pm2 start ecosystem.config.cjs
 */
const fs = require('fs')

function heapMbFromRam() {
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8')
    const match = meminfo.match(/MemTotal:\s+(\d+)/)
    if (match) {
      let heap = Math.floor((Number(match[1]) / 1024) * 0.7)
      if (heap > 1536) heap = 1536
      if (heap < 512) heap = 512
      return heap
    }
  } catch {
    // Dev Windows / sin /proc
  }
  return 700
}

const HEAP_MB = heapMbFromRam()
const MAX_MEMORY_RESTART = `${HEAP_MB + 100}M`

module.exports = {
  apps: [
    {
      name: 'software-dental',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: `--max-old-space-size=${HEAP_MB}`,
      max_memory_restart: MAX_MEMORY_RESTART,
      kill_timeout: 8_000,
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: `--max-old-space-size=${HEAP_MB}`,
      },
    },
  ],
}
