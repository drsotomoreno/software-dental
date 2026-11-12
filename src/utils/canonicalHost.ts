/** Origen canónico de producción: unifica localStorage / OAuth / sesión. */
export const CANONICAL_PRODUCTION_ORIGIN = 'https://www.mihistoriadental.com'
export const CANONICAL_PRODUCTION_HOST = 'www.mihistoriadental.com'
export const APEX_PRODUCTION_HOST = 'mihistoriadental.com'

/**
 * Si la app carga en el apex sin www, redirige a www conservando ruta y query.
 * Evita que la sesión (localStorage) se divida entre ambos hosts.
 * @returns true si se disparó la redirección (no montar React en este host).
 */
export function redirectApexToCanonicalWww(): boolean {
  if (typeof window === 'undefined') return false
  const { hostname, pathname, search, hash } = window.location
  if (hostname !== APEX_PRODUCTION_HOST) return false
  const target = `${CANONICAL_PRODUCTION_ORIGIN}${pathname}${search}${hash}`
  window.location.replace(target)
  return true
}
