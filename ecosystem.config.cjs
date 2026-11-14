/**
 * PM2 — mihistoriadental.com (EC2 t3.micro ≈ 1 GB RAM).
 * Heap V8 acotado a 450 MB; reinicio preventivo al superar ~520 MB RSS.
 *
 * Uso: pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'software-dental',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=450',
      max_memory_restart: '520M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
