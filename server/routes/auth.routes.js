import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { config } from '../config.js'
import { forgotPassword, resetPassword } from '../controllers/authPassword.controller.js'
import {
  confirmWhatsAppClickToChat,
  requestRegisterCode,
  verifyRegisterCode,
  verifyWhatsAppRegistration,
} from '../controllers/authRegister.controller.js'
import { getMailSettings, updateMailSettings } from '../controllers/authMailSettings.controller.js'
import {
  buyTitularMessagePackage,
  buyTitularPlan,
  choosePaidPlan,
  getSubscriptionStatus,
  getTitularProducts,
  requestRethusTrial,
} from '../controllers/subscription.controller.js'
import {
  changeOwnPassword,
  confirmOwnPassword,
  confirmSubscriptionPayment,
  createClinicUser,
  deleteClinicUser,
  ensureSuperAdmin,
  isMasterCredentials,
  deleteSubscriptionUserByEmail,
  listAllSubscriptionUsers,
  listClinicUsers,
  loginSubscriptionUser,
  issueMasterSessionToken,
  MASTER_EMAIL,
  rememberProfessionalDocument,
  resetClinicUserPassword,
  resolveSubscriptionSession,
  sessionHintFromRequest,
  updateClinicUser,
  updateSubscriptionProfile,
  updateUserWhatsAppFields,
} from '../services/subscriptionAuthStore.js'
import {
  aislarClinica,
  soloSuperAdmin,
  verificarToken,
} from '../middleware/tenantAuth.middleware.js'

function masterUserPayload(user) {
  const base = user
    ? {
        ...user,
        id: user.id,
        nombre: user.nombre ?? config.superAdmin.nombre,
        email: MASTER_EMAIL,
        rol: 'superadmin',
        estado_pago: 'exento',
        fecha_vencimiento: null,
      }
    : {
        id: 'superadmin-master',
        nombre: config.superAdmin.nombre,
        email: MASTER_EMAIL,
        rol: 'superadmin',
        estado_pago: 'exento',
        fecha_vencimiento: null,
      }
  return base
}

const router = Router()

router.post('/registro', requestRegisterCode)

router.post('/login', async (req, res) => {
  try {
    await ensureSuperAdmin()

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const email = String(body.email ?? '').trim().toLowerCase()
    const documentNumber = String(body.documentNumber ?? body.documento ?? '').replace(/\D/g, '')
    const password = String(body.password ?? '')
    const hasEmail = Boolean(email.includes('@') && email)
    const hasDocument = documentNumber.length >= 6

    if (!password || (!hasEmail && !hasDocument)) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'Indique su número de documento (cédula) o el correo del titular, y su contraseña.',
      })
    }

    if (hasEmail && isMasterCredentials(email, password)) {
      let result
      try {
        result = await loginSubscriptionUser({ email, documentNumber, password })
      } catch (masterError) {
        console.error('[Auth] Login maestro: store falló, se otorga sesión persistida de respaldo', masterError)
        result = { ok: false }
      }

      if (!result?.ok || !result.token) {
        result = await issueMasterSessionToken(result?.token)
      }

      const user = masterUserPayload(result.user)
      const token = result.token

      return res.json({
        success: true,
        ok: true,
        token,
        user,
        rol: 'superadmin',
        expiresAt: result.expiresAt ?? null,
        unlimitedAccess: true,
        requiresPayment: false,
      })
    }

    const result = await loginSubscriptionUser({ email, documentNumber, password })

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        ok: false,
        error: result.error,
        estado_pago: result.estado_pago,
        requiresPayment: result.requiresPayment ?? false,
        user: result.user,
      })
    }

    const user = result.user
    // God Mode solo por correo maestro. Nunca por user.rol === 'superadmin'.
    const isSuperAdmin = email === MASTER_EMAIL && String(user?.email || '').toLowerCase() === MASTER_EMAIL

    if (user?.rol === 'superadmin' && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        ok: false,
        error: 'Sesión rechazada: privilegio de superadministrador no autorizado.',
      })
    }

    return res.json({
      success: true,
      ok: true,
      token: result.token,
      user: isSuperAdmin
        ? { ...user, rol: 'superadmin', estado_pago: 'exento', email: MASTER_EMAIL }
        : { ...user, rol: user.rol === 'superadmin' ? 'admin' : user.rol },
      rol: isSuperAdmin ? 'superadmin' : user.rol === 'superadmin' ? 'admin' : user.rol,
      expiresAt: result.expiresAt,
      unlimitedAccess: isSuperAdmin || result.unlimitedAccess === true,
      requiresSubscription: isSuperAdmin ? false : result.requiresSubscription === true,
    })
  } catch (error) {
    console.error('[Auth] Error en /login:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo iniciar sesión. Verifique que el servidor esté activo.',
    })
  }
})

router.post('/confirmar-pago', async (req, res) => {
  try {
    const authHeader = req.headers.authorization ?? ''
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const { email } = body

    const result = await confirmSubscriptionPayment({
      email,
      token: bearerToken,
      planId: body.planId || body.plan,
      hint: sessionHintFromRequest(req),
    })

    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }

    return res.json({
      success: true,
      ok: true,
      message: 'Pago confirmado. Suscripción activa por 30 días.',
      token: result.token,
      user: result.user,
      rol: result.user.rol,
      expiresAt: result.expiresAt,
    })
  } catch (error) {
    console.error('[Auth] Error en /confirmar-pago:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo confirmar el pago.',
    })
  }
})

router.post('/auth/forgot-password', forgotPassword)
router.post('/auth/reset-password', resetPassword)
router.post('/auth/register/request-code', requestRegisterCode)
router.post('/auth/register/verify', verifyRegisterCode)
router.post('/auth/register/whatsapp/verify', verifyWhatsAppRegistration)
router.post('/auth/register/whatsapp/confirm', confirmWhatsAppClickToChat)
router.get('/auth/mail-settings', getMailSettings)
router.put('/auth/mail-settings', updateMailSettings)
router.get('/subscription', getSubscriptionStatus)
router.get('/subscription/account', getTitularProducts)
router.post('/subscription/account/plan', buyTitularPlan)
router.post('/subscription/account/package', buyTitularMessagePackage)
router.post('/subscription/trial', requestRethusTrial)
router.post('/subscription/plan', choosePaidPlan)

router.get('/admin/users', verificarToken, soloSuperAdmin, async (req, res) => {
  try {
    const users = await listAllSubscriptionUsers()
    return res.json({ success: true, ok: true, users })
  } catch (error) {
    console.error('[Auth] Error en GET /admin/users:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo listar los usuarios.' })
  }
})

/** Borrado total de una cuenta de registro (pruebas / limpieza comercial). */
router.delete('/admin/users/by-email/:email', verificarToken, soloSuperAdmin, async (req, res) => {
  try {
    const email = decodeURIComponent(String(req.params.email || '')).trim().toLowerCase()
    const result = await deleteSubscriptionUserByEmail(email)
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json({
      success: true,
      ok: true,
      message: `Cuenta eliminada: ${result.email}`,
      email: result.email,
      id: result.id,
    })
  } catch (error) {
    console.error('[Auth] Error en DELETE /admin/users/by-email:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo eliminar la cuenta.',
    })
  }
})

/** Confirmación manual: el Superadmin marca el WhatsApp como recibido/verificado. */
router.post('/admin/users/:id/whatsapp-verify', verificarToken, soloSuperAdmin, async (req, res) => {
  try {
    const result = await updateUserWhatsAppFields({
      userId: req.params.id,
      email: req.body?.email,
      whatsapp_verified: true,
      whatsapp_status: 'verified',
    })
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json({
      success: true,
      ok: true,
      is_verified: true,
      whatsapp_verified: true,
      user: result.user,
    })
  } catch (error) {
    console.error('[Auth] Error en POST /admin/users/:id/whatsapp-verify:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo marcar el WhatsApp como verificado.',
    })
  }
})

/** Ejemplo de ruta con aislamiento de sede (bypass automático si is_superadmin). */
router.get(
  '/admin/clinicas/:clinica_id/ping',
  verificarToken,
  aislarClinica,
  (req, res) => {
    res.json({
      success: true,
      ok: true,
      clinica_id: req.params.clinica_id,
      actor: {
        id: req.user.id,
        is_superadmin: req.user.is_superadmin,
        rol: req.user.rol,
      },
    })
  },
)

router.get('/clinic/users', async (req, res) => {
  try {
    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    const result = await listClinicUsers({ token, hint: sessionHintFromRequest(req) })
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json({ success: true, ok: true, users: result.users, seats: result.seats })
  } catch (error) {
    console.error('[Auth] Error en GET /clinic/users:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo listar el equipo de la clínica.' })
  }
})

async function inviteClinicUser(req, res) {
  try {
    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await createClinicUser({
      token,
      hint: sessionHintFromRequest(req),
      member: body,
    })
    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        ok: false,
        error: result.error,
        seats: result.seats,
      })
    }
    return res.status(201).json({
      success: true,
      ok: true,
      message: result.message,
      user: result.user,
      seats: result.seats,
    })
  } catch (error) {
    console.error(`[Auth] Error en POST ${req.path}:`, error)
    return res.status(500).json({ success: false, ok: false, error: 'Error interno del servidor' })
  }
}

router.post('/clinic/users', inviteClinicUser)
router.post('/users/invite', inviteClinicUser)

router.put('/clinic/users/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await updateClinicUser({
      token,
      hint: sessionHintFromRequest(req),
      userId: req.params.id,
      patch: body,
    })
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json({ success: true, ok: true, user: result.user })
  } catch (error) {
    console.error('[Auth] Error en PUT /clinic/users/:id:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo actualizar el colaborador.' })
  }
})

router.put('/clinic/users/:id/password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await resetClinicUserPassword({
      token,
      hint: sessionHintFromRequest(req),
      userId: req.params.id,
      newPassword: body.password ?? body.newPassword,
    })
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json({ success: true, ok: true })
  } catch (error) {
    console.error('[Auth] Error en PUT /clinic/users/:id/password:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo asignar la contraseña.' })
  }
})

router.delete('/clinic/users/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    const result = await deleteClinicUser({
      token,
      hint: sessionHintFromRequest(req),
      userId: req.params.id,
    })
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json({ success: true, ok: true, seats: result.seats })
  } catch (error) {
    console.error('[Auth] Error en DELETE /clinic/users/:id:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo eliminar el colaborador.' })
  }
})

router.post('/profile/confirm-password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await confirmOwnPassword({
      token,
      password: body.password,
      hint: sessionHintFromRequest(req),
    })
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json({ success: true, ok: true })
  } catch (error) {
    console.error('[Auth] Error en POST /profile/confirm-password:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo confirmar la contraseña.',
    })
  }
})

router.put('/profile/password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await changeOwnPassword({
      token,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      hint: sessionHintFromRequest(req),
    })
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json({ success: true, ok: true })
  } catch (error) {
    console.error('[Auth] Error en PUT /profile/password:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo actualizar la contraseña.',
    })
  }
})

router.put('/profile/document', async (req, res) => {
  try {
    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await rememberProfessionalDocument({
      token,
      documentNumber: body.documentNumber,
      documentType: body.documentType,
      hint: sessionHintFromRequest(req, {
        userId: body.clientUserId,
        email: body.clientEmail,
      }),
    })
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json({ success: true, ok: true, user: result.user })
  } catch (error) {
    console.error('[Auth] Error en PUT /profile/document:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo guardar la cédula del profesional.',
    })
  }
})

router.put('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await updateSubscriptionProfile({
      token,
      patch: body,
      hint: sessionHintFromRequest(req, {
        userId: body.clientUserId,
        email: body.clientEmail,
      }),
    })
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json({ success: true, ok: true, user: result.user })
  } catch (error) {
    console.error('[Auth] Error en PUT /profile:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo guardar el perfil.',
    })
  }
})

router.put('/users/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await updateSubscriptionProfile({
      token,
      userId: req.params.id,
      patch: body,
      hint: sessionHintFromRequest(req),
    })
    if (!result.ok) {
      return res.status(result.status).json({ success: false, ok: false, error: result.error })
    }
    return res.json({ success: true, ok: true, user: result.user })
  } catch (error) {
    console.error('[Auth] Error en PUT /users/:id:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo guardar el usuario.',
    })
  }
})

router.get('/sesion', async (req, res) => {
  try {
    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    const session = await resolveSubscriptionSession(token, sessionHintFromRequest(req))

    if (!session) {
      return res.status(401).json({ success: false, ok: false, error: 'Sesión inválida o expirada.' })
    }

    return res.json({
      success: true,
      ok: true,
      user: session.user,
      rol: session.user.rol,
      expiresAt: session.expiresAt ?? null,
      unlimitedAccess: session.unlimitedAccess === true,
      requiresSubscription: session.requiresSubscription === true || session.active === false,
      active: session.active !== false,
      accessTier: session.accessTier ?? (session.active === false ? 'none' : undefined),
    })
  } catch (error) {
    console.error('[Auth] Error en /sesion:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo validar la sesión.' })
  }
})

export default router
