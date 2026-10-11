const SENSITIVE_KEY = /clave|password|secret|token|authorization|cert|passphrase|key/i

/**
 * @param {string} text
 * @param {string[]} secrets
 */
export function redactSecrets(text, secrets) {
  let output = text
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 4) {
      output = output.split(secret).join('[redactado]')
    }
  }
  return output
}

/**
 * @param {unknown} value
 * @param {string[]} secrets
 * @param {number} [depth]
 */
export function sanitizeDetails(value, secrets, depth = 0) {
  if (typeof value === 'string') {
    const redacted = redactSecrets(value, secrets)
    return redacted.length > 500 ? `${redacted.slice(0, 500)}…` : redacted
  }
  if (value == null || typeof value !== 'object') return value
  if (depth >= 4) return '[truncado]'
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => sanitizeDetails(item, secrets, depth + 1))
  }
  /** @type {Record<string, unknown>} */
  const output = {}
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? '[redactado]' : sanitizeDetails(item, secrets, depth + 1)
  }
  return output
}
