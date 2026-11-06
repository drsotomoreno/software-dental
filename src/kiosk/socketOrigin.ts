/**
 * Origen de Socket.IO.
 * En EC2 el navegador abre https://www.mihistoriadental.com y el socket
 * usa ese mismo dominio. No hay localhost fijo en el bundle de producción.
 * VITE_SOCKET_URL solo si el API vive en otro host.
 */
export function resolveSocketOrigin(): string | undefined {
  const configured = import.meta.env.VITE_SOCKET_URL
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim().replace(/\/$/, '')
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return undefined
}
