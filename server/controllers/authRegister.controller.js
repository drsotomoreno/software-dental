import { describeMailError, sendVerificationCodeEmail } from '../services/mailer.js'
import {
  createEmailVerification,
  verifyEmailAndRegister,
} from '../services/subscriptionAuthStore.js'

export async function requestRegisterCode(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const email = String(body.email ?? '').trim().toLowerCase()
    const result = await createEmailVerification({
      nombre: body.nombre,
      email,
      password: body.password,
    })

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        ok: false,
        error: result.error,
      })
    }

    const recipient = String(result.email || email).trim().toLowerCase()
    if (!recipient || recipient !== email) {
      return res.status(500).json({
        success: false,
        ok: false,
        error: 'No se pudo determinar el correo de destino del registro.',
      })
    }

    try {
      await sendVerificationCodeEmail({ to: recipient, email: recipient, code: result.code })
    } catch (mailError) {
      console.error(
        '[Auth] No se pudo enviar el código de verificación',
        JSON.stringify(
          {
            email: recipient,
            message: mailError?.message,
            causeMessage: mailError?.cause?.message,
            cause: mailError?.cause,
            stack: mailError?.stack,
          },
          null,
          2,
        ),
      )
      return res.status(503).json({
        success: false,
        ok: false,
        error: describeMailError(mailError),
      })
    }

    return res.json({
      success: true,
      ok: true,
      email: recipient,
      message: `Enviamos un código de 6 dígitos a ${recipient}. Escríbalo seguido, sin espacios. Si llega más de un correo, use el más reciente.`,
    })
  } catch (error) {
    console.error('[Auth] Error en /auth/register/request-code:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo iniciar el registro.',
    })
  }
}

export async function verifyRegisterCode(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await verifyEmailAndRegister({
      email: String(body.email ?? '').trim().toLowerCase(),
      code: body.code,
      password: body.password,
    })

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
      message: 'Correo verificado. Cuenta creada. Inicie sesión para continuar.',
      user: result.user,
    })
  } catch (error) {
    console.error('[Auth] Error en /auth/register/verify:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo verificar el código.',
    })
  }
}
