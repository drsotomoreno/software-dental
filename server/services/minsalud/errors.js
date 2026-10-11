/**
 * Excepciones tipadas del cliente de autenticación FEV-RIPS / MUV.
 *
 * Guía de autenticación cliente-servidor (FEVRG02) y Manual API-Docker
 * FEVRM001 §8.1 LoginSISPRO. El manual SIIFA v1.0.2 §10 define 401, 403 y 500.
 */

/**
 * @typedef {'MINSALUD_AUTH_CONFIG'
 *   | 'MINSALUD_AUTH_UNAUTHORIZED'
 *   | 'MINSALUD_AUTH_FORBIDDEN'
 *   | 'MINSALUD_AUTH_UPSTREAM'
 *   | 'MINSALUD_AUTH_NETWORK'
 *   | 'MINSALUD_AUTH_INVALID_RESPONSE'} MinsaludAuthErrorCode
 */

export class MinsaludAuthError extends Error {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {MinsaludAuthErrorCode} [options.code]
   * @param {number} [options.httpStatus] Código devuelto por el Ministerio.
   * @param {number} [options.status] Código que ve Express si la excepción sube sin capturar.
   * @param {boolean} [options.retryable]
   * @param {number} [options.attempt]
   * @param {unknown} [options.details]
   * @param {number} [options.retryAfterMs]
   * @param {unknown} [options.cause]
   */
  constructor(message, options = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = new.target.name
    this.code = options.code ?? 'MINSALUD_AUTH_UPSTREAM'
    this.httpStatus = options.httpStatus
    this.status = options.status ?? 502
    this.retryable = options.retryable ?? false
    this.attempt = options.attempt
    this.details = options.details
    this.retryAfterMs = options.retryAfterMs
  }
}

export class MinsaludAuthConfigError extends MinsaludAuthError {
  /**
   * @param {string} message
   * @param {unknown} [details]
   */
  constructor(message, details) {
    super(message, {
      code: 'MINSALUD_AUTH_CONFIG',
      status: 500,
      retryable: false,
      details,
    })
  }
}

export class MinsaludAuthUnauthorizedError extends MinsaludAuthError {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {boolean} [options.retryable]
   * @param {unknown} [options.details]
   * @param {number} [options.httpStatus]
   */
  constructor(message, options = {}) {
    super(message, {
      code: 'MINSALUD_AUTH_UNAUTHORIZED',
      httpStatus: options.httpStatus ?? 401,
      retryable: options.retryable ?? false,
      details: options.details,
    })
  }
}

export class MinsaludAuthForbiddenError extends MinsaludAuthError {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {unknown} [options.details]
   * @param {boolean} [options.retryable]
   */
  constructor(message, options = {}) {
    super(message, {
      code: 'MINSALUD_AUTH_FORBIDDEN',
      httpStatus: 403,
      retryable: options.retryable ?? false,
      details: options.details,
    })
  }
}

export class MinsaludAuthUpstreamError extends MinsaludAuthError {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {number} [options.httpStatus]
   * @param {unknown} [options.details]
   * @param {number} [options.retryAfterMs]
   * @param {boolean} [options.retryable]
   */
  constructor(message, options = {}) {
    super(message, {
      code: 'MINSALUD_AUTH_UPSTREAM',
      httpStatus: options.httpStatus,
      retryable: options.retryable ?? true,
      details: options.details,
      retryAfterMs: options.retryAfterMs,
    })
  }
}

export class MinsaludAuthNetworkError extends MinsaludAuthError {
  /**
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(message, cause) {
    super(message, {
      code: 'MINSALUD_AUTH_NETWORK',
      retryable: true,
      cause,
    })
  }
}

export class MinsaludAuthInvalidResponseError extends MinsaludAuthError {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {boolean} [options.retryable]
   * @param {unknown} [options.details]
   * @param {number} [options.httpStatus]
   */
  constructor(message, options = {}) {
    super(message, {
      code: 'MINSALUD_AUTH_INVALID_RESPONSE',
      httpStatus: options.httpStatus,
      retryable: options.retryable ?? false,
      details: options.details,
    })
  }
}
