/** Texto cuando Nginx responde 502/503/504 sin JSON de la API. */
export const DIAGNOSTIC_AID_DRIVE_GATEWAY_MESSAGE =
  'El archivo sigue en este equipo. El servidor no confirmó la subida a Google Drive. Use «Subir a Drive» para reintentar.'

/** PM2 tarda más de 2,5 s en volver a escuchar tras un reinicio. */
export const DIAGNOSTIC_AID_DRIVE_RETRY_MS = 8_000

export const GOOGLE_DRIVE_RECONNECT_REQUIRED = 'GOOGLE_DRIVE_RECONNECT_REQUIRED'

/**
 * Mensaje de fallo de POST /upload.
 * Si la API devolvió `error` en JSON, se muestra ese texto.
 * Un 502/503/504 sin JSON es el gateway: el binario local no se descarta.
 */
export function diagnosticAidDriveFailureMessage(status, body) {
  const codeName = body && typeof body === 'object' ? body.code : null
  if (codeName === GOOGLE_DRIVE_RECONNECT_REQUIRED) {
    const error = body && typeof body === 'object' ? body.error : null
    if (typeof error === 'string' && error.trim()) return error
    return 'Google Drive requiere reconexión. Use «Reconectar Google Drive» e intente de nuevo.'
  }
  const error = body && typeof body === 'object' ? body.error : null
  if (typeof error === 'string' && error.trim()) return error
  const code = Number(status) || 0
  if (code === 502 || code === 503 || code === 504) {
    return DIAGNOSTIC_AID_DRIVE_GATEWAY_MESSAGE
  }
  return `Error al subir a Google Drive (HTTP ${code}).`
}
