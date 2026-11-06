import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const allowedHosts = [
  'www.mihistoriadental.com',
  'mihistoriadental.com',
  '.mihistoriadental.com',
  '.onrender.com',
]

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // La tableta entra por la IP LAN (192.168.x.x); el chequeo de host de Vite la bloqueaba.
    allowedHosts: true,
    watch: {
      usePolling: true,
      ignored: ['**/src/data/dane-*.json'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: true,
    allowedHosts,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
