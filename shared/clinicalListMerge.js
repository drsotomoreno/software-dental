/**
 * Fusión idempotente de listas clínicas.
 * La misma lista unida consigo misma 1 o 5.000 veces conserva un elemento por id.
 * Sin id, la clave es fecha + concepto + valor. Un duplicado exacto (mismo
 * contenido, otro id) no vuelve a entrar: así el presupuesto inflado colapsa.
 */

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function clinicalItemFingerprint(item, parts) {
  if (!item || typeof item !== 'object') return ''
  return parts
    .map((part) => text(String(item[part] ?? '')).toLowerCase())
    .join('|')
}

/**
 * @param {unknown} items
 * @param {{
 *   fingerprint: (item: object) => string,
 *   prefer?: (previous: object, incoming: object) => object,
 *   collapseExact?: boolean,
 * }} options
 */
export function dedupeClinicalItems(items, options) {
  const prefer = options.prefer || ((previous, incoming) => ({ ...previous, ...incoming }))
  const collapseExact = options.collapseExact !== false
  const byKey = new Map()
  const fingerprintOwner = new Map()

  for (const item of asArray(items)) {
    if (!item || typeof item !== 'object') continue
    const id = text(item.id)
    const fingerprint = text(options.fingerprint(item))
    const idKey = id ? `id:${id}` : ''

    if (idKey && byKey.has(idKey)) {
      byKey.set(idKey, prefer(byKey.get(idKey), item))
      continue
    }

    if (collapseExact && fingerprint && fingerprintOwner.has(fingerprint)) {
      const ownerKey = fingerprintOwner.get(fingerprint)
      const previous = byKey.get(ownerKey)
      if (previous) byKey.set(ownerKey, prefer(previous, item))
      continue
    }

    const key = idKey || (fingerprint ? `fp:${fingerprint}` : '')
    if (!key) continue
    const previous = byKey.get(key)
    byKey.set(key, previous ? prefer(previous, item) : item)
    if (collapseExact && fingerprint && !fingerprintOwner.has(fingerprint)) {
      fingerprintOwner.set(fingerprint, key)
    }
  }

  return [...byKey.values()]
}
