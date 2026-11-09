import { describeMailError, sendVerificationCodeEmail } from '../services/mailer.js'
import {
  createEmailVerification,
  verifyEmailAndRegister,
} from '../services/subscriptionAuthStore.js'
import { queueSendWelcomeWhatsAppInBackground } from '../services/whatsapp.service.js'

export async function requestRegisterCode(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const email = String(body.email ?? '').trim().toLowerCase()
    const result = await createEmailVerification({
      nombre: body.nombre,
      email,
      password: body.password,
      phone_number: body.phone_number ?? body.phone,
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
      phone_number: result.phone_number,
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

/**
 * Registro express: responde 201 al instante y dispara WhatsApp (Evolution) en setImmediate.
 */
export async function verifyRegisterCode(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await verifyEmailAndRegister({
      email: String(body.email ?? '').trim().toLowerCase(),
      code: body.code,
      password: body.password,
      phone_number: body.phone_number ?? body.phone,
    })

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        ok: false,
        error: result.error,
      })
    }

    const user = result.user
    // Respuesta inmediata: el envío de WhatsApp no bloquea el registro ni el redirect al Dashboard.
    res.status(201).json({
      success: true,
      ok: true,
      message:
        'Correo verificado. Cuenta creada. La bienvenida por WhatsApp se envía en segundo plano.',
      user,
    })

    voidSendWelcomeWhatsAppInBackground({
      userId: user?.id,
      email: user?.email,
      phoneNumber: user?.phone_number || user?.phone || body.phone_number || body.phone,
      nombre: user?.nombre || body.nombre,
    })
  } catch (error) {
    console.error('[Auth] Error en /auth/register/verify:', error)
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        ok: false,
        error: 'No se pudo verificar el código.',
      })
    }
  }
}
