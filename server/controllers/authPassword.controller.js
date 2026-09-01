import { config } from '../config.js'
import { sendPasswordResetEmail } from '../services/mailer.js'
import {
  createPasswordResetToken,
  resetPasswordWithToken,
} from '../services/subscriptionAuthStore.js'

const GENERIC_FORGOT_MESSAGE =
  'Si el correo está registrado, enviaremos un enlace para restablecer la contraseña. Revise su bandeja de entrada.'

export async function forgotPassword(req, res) {
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
      }
    }

    return res.json({ success: true, ok: true, message: GENERIC_FORGOT_MESSAGE })
  } catch (error) {
    console.error('[Auth] Error en /auth/forgot-password:', error)
    return res.json({ success: true, ok: true, message: GENERIC_FORGOT_MESSAGE })
  }
}

export async function resetPassword(req, res) {
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
}
