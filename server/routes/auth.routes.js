import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { config } from '../config.js'
import { forgotPassword, resetPassword } from '../controllers/authPassword.controller.js'
import { requestRegisterCode, verifyRegisterCode } from '../controllers/authRegister.controller.js'
import { getMailSettings, updateMailSettings } from '../controllers/authMailSettings.controller.js'
import {
  choosePaidPlan,
  getSubscriptionStatus,
  requestRethusTrial,
} from '../controllers/subscription.controller.js'
import {
  changeOwnPassword,
  confirmSubscriptionPayment,
  ensureSuperAdmin,
  isMasterCredentials,
  listAllSubscriptionUsers,
  loginSubscriptionUser,
  issueMasterSessionToken,
  MASTER_EMAIL,
  registerSubscriptionUser,
  resolveSubscriptionSession,
  sessionHintFromRequest,
  updateSubscriptionProfile,
} from '../services/subscriptionAuthStore.js'

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

router.post('/registro', async (req, res) => {
  try {
    await ensureSuperAdmin()

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const nombre = String(body.nombre ?? '').trim() || email.split('@')[0] || 'Usuario'

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'Correo y contraseña son obligatorios.',
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'La contraseña debe tener al menos 6 caracteres.',
      })
    }

    const result = await registerSubscriptionUser({ nombre, email, password })

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        ok: false,
        error: result.error,
      })
    }

    return res.status(201).json({
      success: true,
      ok: true,
      message: 'Registro exitoso. Realice el pago para activar su acceso.',
      user: result.user,
    })
  } catch (error) {
    console.error('[Auth] Error en /registro:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo completar el registro. Intente de nuevo.',
    })
  }
})

router.post('/login', async (req, res) => {
  try {
    await ensureSuperAdmin()

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'Correo y contraseña son obligatorios.',
      })
    }

    if (isMasterCredentials(email, password)) {
      let result
      try {
        result = await loginSubscriptionUser({ email, password })
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

    const result = await loginSubscriptionUser({ email, password })

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
    const isSuperAdmin = email === MASTER_EMAIL || user?.rol === 'superadmin'

    return res.json({
      success: true,
      ok: true,
      token: result.token,
      user: isSuperAdmin
        ? { ...user, rol: 'superadmin', estado_pago: 'exento', email: user.email }
        : user,
      rol: isSuperAdmin ? 'superadmin' : user.rol,
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
router.get('/auth/mail-settings', getMailSettings)
router.put('/auth/mail-settings', updateMailSettings)
router.get('/subscription', getSubscriptionStatus)
router.post('/subscription/trial', requestRethusTrial)
router.post('/subscription/plan', choosePaidPlan)

router.get('/admin/users', async (req, res) => {
  try {
    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    const session = await resolveSubscriptionSession(token, sessionHintFromRequest(req))
    if (!session?.user) {
      return res.status(401).json({ success: false, ok: false, error: 'Sesión inválida.' })
    }
    const email = String(session.user.email ?? '').toLowerCase()
    const rol = String(session.user.rol ?? '').toLowerCase()
    if (email !== MASTER_EMAIL && rol !== 'superadmin' && rol !== 'admin') {
      return res.status(403).json({ success: false, ok: false, error: 'Solo el administrador puede ver los usuarios.' })
    }
    const users = await listAllSubscriptionUsers()
    return res.json({ success: true, ok: true, users })
  } catch (error) {
    console.error('[Auth] Error en GET /admin/users:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo listar los usuarios.' })
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
    })
  } catch (error) {
    console.error('[Auth] Error en /sesion:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo validar la sesión.' })
  }
})

export default router
