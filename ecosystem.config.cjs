/**
 * Proceso de producción en la instancia AWS EC2.
 * Los secretos (DATABASE_URL de RDS, RESEND_API_KEY, MinSalud) viven en
 * el .env de la máquina o en el entorno de PM2. No van en este archivo.
 *
 * Arranque inicial: pm2 start ecosystem.config.cjs && pm2 save
 * Despliegue:       bash scripts/deploy-ec2.sh
 */
module.exports = {
  apps: [
    {
      name: 'software-dental',
      script: 'server.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
