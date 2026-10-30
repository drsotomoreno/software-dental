import { verifyKioskToken } from '../utils/kioskJwt.js'

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

/**
 * Autorización estricta de modo kiosco:
 * - Solo POST
 * - JWT Bearer con role === "kiosk"
 * - Expone `req.clinicId` y `req.kiosk` para el controlador
 */
export function requireKioskAuth(req, res, next) {
  if (req.method !== 'POST') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'El modo kiosco solo admite peticiones POST.',
    })
  }

  const token = bearerToken(req)
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'No autorizado',
      message: 'Falta el token Bearer de kiosco.',
    })
  }

  let claims
  try {
    claims = verifyKioskToken(token)
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'No autorizado',
      message: error?.message || 'Token de kiosco inválido.',
      code: error?.code,
    })
  }

  if (claims.role !== 'kiosk') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'El token no tiene rol de kiosco.',
    })
  }

  if (!claims.clinicId) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'El token de kiosco no incluye clinicId.',
    })
  }

  req.clinicId = claims.clinicId
  req.kiosk = {
    role: claims.role,
    clinicId: claims.clinicId,
    claims,
  }
  return next()
}
