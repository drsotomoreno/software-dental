/** Manejador centralizado de errores Express. */
export function errorHandler(err, _req, res, _next) {
  const status = err.status ?? 500
  const message = err.message ?? 'Error interno del servidor'

  if (status >= 500) {
    console.error('[API]', err)
  }

  res.status(status).json({
    success: false,
    error: message,
    code: err.code,
    details: err.details,
  })
}
