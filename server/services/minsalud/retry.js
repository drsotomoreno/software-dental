/**
 * Espera con retroceso exponencial y jitter acotado.
 * El intento 1 es el primer reintento (después del fallo inicial).
 *
 * @param {number} attempt Número de reintento, empezando en 1.
 * @param {{ baseMs: number, maxMs: number, random?: () => number }} policy
 */
export function backoffDelayMs(attempt, policy) {
  const random = policy.random ?? Math.random
  const exponent = Math.max(0, attempt - 1)
  const exponential = Math.min(policy.maxMs, policy.baseMs * 2 ** exponent)
  const jitter = Math.floor(exponential * 0.2 * random())
  return exponential + jitter
}

/**
 * Tope de intentos según el código HTTP.
 * 401 ambiguo: un solo reintento. 401/403 definitivos no llegan aquí
 * porque `retryable` es false. 5xx usa el máximo configurado.
 *
 * @param {import('./errors.js').MinsaludAuthError} error
 * @param {number} maxAttempts
 */
export function attemptsAllowed(error, maxAttempts) {
  if (error.httpStatus === 401 || error.httpStatus === 403) return Math.min(2, maxAttempts)
  return maxAttempts
}
