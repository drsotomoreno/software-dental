/**
 * Autorización multi-tenant + God Mode.
 * Claims esperados: { id, clinica_id, is_superadmin, rol }
 */
import {
  isLikelyJwt,
  verifySessionToken,
} from '../utils/sessionJwt.js'
import {
  isSuperAdminUser,
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

function clinicIdOfUser(user) {
  if (!user) return null
  if (isSuperAdminUser(user)) return null
  return String(user.clinicId || user.clinica_id || user.id || '') || null
}

function claimsFromSessionUser(user, sid) {
  const isSuper = isSuperAdminUser(user)
  return {
    id: String(user.id),
    clinica_id: isSuper ? null : clinicIdOfUser(user),
    is_superadmin: isSuper,
    rol: isSuper ? 'superadmin' : String(user.rol || 'odontologo'),
    sid: sid || undefined,
    email: user.email || undefined,
  }
}

function requestedClinicaId(req) {
  return (
    req.body?.clinica_id ||
    req.body?.clinicId ||
    req.query?.clinica_id ||
    req.query?.clinicId ||
    req.params?.clinica_id ||
    req.params?.clinicId ||
    req.headers['x-clinic-id'] ||
    req.headers['x-clinica-id'] ||
    null
  )
}

/** 1. Validar identidad (JWT de sesión o token opaco legacy). */
export async function verificarToken(req, res, next) {
  const token = bearerToken(req)
  if (!token) {
    return res.status(403).json({
      success: false,
      ok: false,
      error: 'Acceso denegado. Token no proporcionado.',
    })
  }

  try {
    if (isLikelyJwt(token)) {
      const decoded = verifySessionToken(token)
      req.user = decoded
      req.authToken = token
      return next()
    }

    const session = await resolveSubscriptionSession(token, sessionHintFromRequest(req))
    if (!session?.user) {
      return res.status(401).json({
        success: false,
        ok: false,
        error: 'Token inválido o expirado.',
      })
    }

    req.user = claimsFromSessionUser(session.user, token)
    req.authToken = token
    req.authSession = session
    return next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      ok: false,
      error: 'Token inválido o expirado.',
      code: error?.code,
    })
  }
}

/**
 * 2. Aislamiento multi-tenant con BYPASS del Superadministrador.
 * Si is_superadmin: acceso a cualquier clinica_id.
 * Si no: solo la clínica del token.
 */
export function aislarClinica(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      ok: false,
      error: 'Token inválido o expirado.',
    })
  }

  if (req.user.is_superadmin) {
    return next()
  }

  const clinicaSolicitada = requestedClinicaId(req)
  const propia = req.user.clinica_id == null ? null : String(req.user.clinica_id)

  if (!clinicaSolicitada || !propia || propia !== String(clinicaSolicitada)) {
    return res.status(403).json({
      success: false,
      ok: false,
      error:
        'Violación de seguridad. No tienes permisos para acceder a los datos de esta sede.',
    })
  }

  return next()
}

/** 3. Rutas exclusivas del panel global (God Mode). */
export function soloSuperAdmin(req, res, next) {
  if (!req.user?.is_superadmin) {
    return res.status(403).json({
      success: false,
      ok: false,
      error:
        'Acceso restringido. Esta acción es exclusiva para la administración global de mihistoriadental.com.',
    })
  }
  return next()
}

export default { verificarToken, aislarClinica, soloSuperAdmin }
