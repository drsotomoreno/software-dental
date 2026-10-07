/**
 * Bitácora del intercambio con el MUV.
 * Registra la operación y el resultado, sin el Bearer ni el XML en Base64.
 */

const SECRET_KEY = /authorization|token|clave|password|secret|client_secret|xmlfevfile/i

/**
 * @param {unknown} value
 * @param {string} [key]
 * @returns {unknown}
 */
export function redactMuvValue(value, key = '') {
  if (SECRET_KEY.test(key)) {
    if (typeof value === 'string') return `[omitido ${value.length} caracteres]`
    return '[omitido]'
  }
  if (Array.isArray(value)) return value.map((item) => redactMuvValue(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, redactMuvValue(childValue, childKey)]),
    )
  }
  return value
}

/**
 * @param {{ write?: (line: string) => void, now?: () => Date }} [options]
 */
export function createMuvAuditLogger(options = {}) {
  const write = options.write ?? ((line) => {
    console.info(`[muv] ${line}`)
  })
  const now = options.now ?? (() => new Date())

  return {
    /**
     * @param {Record<string, unknown>} event
     */
    record(event) {
      const entry = redactMuvValue({
        at: now().toISOString(),
        ...event,
      })
      write(JSON.stringify(entry))
    },
  }
}
