/**
 * Origen de Socket.IO para tableta y PC clínico.
 * En producción: mismo dominio que la página (https://www.mihistoriadental.com).
 * En LAN: mismo host/IP por el que abrió la tableta (p. ej. 192.168.x.x).
 * VITE_SOCKET_URL solo si el API vive en otro host.
 * Nunca se incrusta localhost en el bundle de producción.
 */
export function resolveSocketOrigin(): string {
  const configured = import.meta.env.VITE_SOCKET_URL
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim().replace(/\/$/, '')
  }

  if (typeof window !== 'undefined' && window.location) {
    if (window.location.origin && window.location.origin !== 'null') {
      return window.location.origin
    }
    const { protocol, hostname, port } = window.location
    const host = port ? `${hostname}:${port}` : hostname
    return `${protocol}//${host}`
  }

  return ''
}
