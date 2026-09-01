import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { config } from '../config.js'
import {
  confirmSubscriptionPayment,
  createPasswordResetToken,
  ensureSuperAdmin,
  isMasterCredentials,
  loginSubscriptionUser,
  MASTER_EMAIL,
  registerSubscriptionUser,
  resetPasswordWithToken,
  resolveSubscriptionSession,
} from '../services/subscriptionAuthStore.js'
import { sendPasswordResetEmail } from '../services/mailer.js'

function masterUserPayload(user) {
  return {
    id: user?.id ?? 'superadmin-master',
    nombre: user?.nombre ?? config.superAdmin.nombre,
    email: MASTER_EMAIL,
    rol: 'superadmin',
    estado_pago: 'exento',
    fecha_vencimiento: null,
  }
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
        console.error('[Auth] Login maestro: store falló, se otorga sesión de respaldo', masterError)
        result = { ok: false }
      }

      const user = masterUserPayload(result.user)
      const token = result.token || randomBytes(32).toString('hex')

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
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: isSuperAdmin ? 'superadmin' : user.rol,
        estado_pago: isSuperAdmin ? 'exento' : user.estado_pago,
        fecha_vencimiento: user.fecha_vencimiento,
      },
      rol: isSuperAdmin ? 'superadmin' : user.rol,
      expiresAt: result.expiresAt,
      unlimitedAccess: isSuperAdmin || result.unlimitedAccess === true,
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

router.post('/auth/forgot-password', async (req, res) => {
  const genericMessage =
    'Si el correo está registrado, enviaremos un enlace para restablecer la contraseña. Revise su bandeja de entrada.'

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const email = String(body.email ?? '').trim().toLowerCase()

    if (!email) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'El correo electrónico es obligatorio.',
      })
    }

    const result = await createPasswordResetToken(email)

    if (result.created && result.token) {
      const resetUrl = `${config.appPublicUrl}/reset-password?token=${encodeURIComponent(result.token)}`
      try {
        await sendPasswordResetEmail({ to: result.email, resetUrl })
      } catch (mailError) {
        console.error('[Auth] No se pudo enviar el correo de recuperación', mailError)
        return res.status(500).json({
          success: false,
          ok: false,
          error: 'No se pudo enviar el correo. Intente de nuevo más tarde.',
        })
      }
    }

    return res.json({ success: true, ok: true, message: genericMessage })
  } catch (error) {
    console.error('[Auth] Error en /auth/forgot-password:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo procesar la solicitud.',
    })
  }
})

router.post('/auth/reset-password', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const token = String(body.token ?? '').trim()
    const newPassword = String(body.newPassword ?? body.password ?? '')

    const result = await resetPasswordWithToken({ token, newPassword })

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        ok: false,
        error: result.error,
      })
    }

    return res.json({
      success: true,
      ok: true,
      message: 'Contraseña actualizada. Ya puede iniciar sesión.',
    })
  } catch (error) {
    console.error('[Auth] Error en /auth/reset-password:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo actualizar la contraseña.',
    })
  }
})

router.get('/sesion', async (req, res) => {
  try {
    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    const session = await resolveSubscriptionSession(token)

    if (!session) {
      return res.status(401).json({ success: false, ok: false, error: 'Sesión inválida o expirada.' })
    }

    if (!session.active) {
      return res.status(402).json({
        success: false,
        ok: false,
        error: 'La suscripción no está activa o el pago ha vencido.',
        estado_pago: session.estado_pago,
        requiresPayment: true,
        user: session.user,
      })
    }

    return res.json({
      success: true,
      ok: true,
      user: session.user,
      rol: session.user.rol,
      expiresAt: session.expiresAt,
      unlimitedAccess: session.unlimitedAccess === true,
    })
  } catch (error) {
    console.error('[Auth] Error en /sesion:', error)
    return res.status(500).json({ success: false, ok: false, error: 'No se pudo validar la sesión.' })
  }
})

export default router
