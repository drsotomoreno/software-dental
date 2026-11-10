import {
  createEmailVerification,
  discardPendingEmailVerification,
  markEmailOtpDeliveredByWhatsApp,
  verifyEmailAndRegister,
} from '../services/subscriptionAuthStore.js'
import {
  assertWhatsAppSendAllowed,
  commitWhatsAppSend,
  sendAuthenticationOtp,
  WHATSAPP_OTP_TTL_MS,
  normalizeWhatsAppRecipient,
} from '../services/metaWhatsappOtp.service.js'
import { checkPhoneOtp, deletePhoneOtp, savePhoneOtp } from '../services/phoneOtpStore.js'
import { voidSendWelcomeWhatsAppInBackground } from '../services/whatsapp.service.js'

function formatColombiaMobile(phone) {
  const digits = normalizeWhatsAppRecipient(phone)
  const local = digits.slice(2)
  if (local.length !== 10) return digits ? `+${digits}` : ''
  return `+57 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
}

export async function requestRegisterCode(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const email = String(body.email ?? '').trim().toLowerCase()
    const phoneInput = normalizeWhatsAppRecipient(body.phone_number ?? body.phone)
    if (!phoneInput) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'Indique un celular colombiano válido (+57), por ejemplo 3001234567.',
      })
    }
    const allowance = assertWhatsAppSendAllowed(phoneInput)
    if (!allowance.ok) {
      return res.status(allowance.status).json({
        success: false,
        ok: false,
        error: allowance.error,
      })
    }

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
    const phone = normalizeWhatsAppRecipient(result.phone_number)
    if (!recipient || recipient !== email || !phone) {
      await discardPendingEmailVerification(recipient || email)
      return res.status(500).json({
        success: false,
        ok: false,
        error: 'No se pudo determinar el celular de destino del registro.',
      })
    }

    const expiresAt = new Date(Date.now() + WHATSAPP_OTP_TTL_MS).toISOString()
    const stored = await savePhoneOtp({
      phone,
      email: recipient,
      code: result.code,
      expiresAt,
      attempts: 0,
    })
    if (!stored.ok) {
      await discardPendingEmailVerification(recipient)
      return res.status(503).json({
        success: false,
        ok: false,
        error: 'No se pudo guardar el código de WhatsApp. Intente de nuevo.',
      })
    }

    const sent = await sendAuthenticationOtp({ to: phone, code: result.code })
    if (!sent.ok) {
      if (sent.kind !== 'network' && sent.kind !== 'not_configured' && sent.kind !== 'otp') {
        commitWhatsAppSend(phone)
      }
      await deletePhoneOtp(phone)
      await discardPendingEmailVerification(recipient)
      return res.status(sent.status || 502).json({
        success: false,
        ok: false,
        error: sent.error,
      })
    }

    const marked = await markEmailOtpDeliveredByWhatsApp(recipient, expiresAt)
    if (!marked.ok) {
      await deletePhoneOtp(phone)
      await discardPendingEmailVerification(recipient)
      return res.status(503).json({
        success: false,
        ok: false,
        error: 'No se pudo confirmar el código de WhatsApp. Intente de nuevo.',
      })
    }

    commitWhatsAppSend(phone)
    const visiblePhone = formatColombiaMobile(phone)
    return res.json({
      success: true,
      ok: true,
      email: recipient,
      phone_number: phone,
      message: `Enviamos un código de 6 dígitos por WhatsApp al ${visiblePhone}. Escríbalo sin espacios. Si pide otro, use el más reciente.`,
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
 * Valida el OTP que el usuario recibió por WhatsApp y marca el registro como verificado.
 * Cuerpo: { phone_number, code }. El correo queda ligado al OTP guardado al enviarlo.
 */
export async function verifyWhatsAppRegistration(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const phone = normalizeWhatsAppRecipient(body.phone_number ?? body.phone)
    const code = String(body.code ?? '').replace(/\D/g, '').slice(0, 6)
    const emailHint = String(body.email ?? '').trim().toLowerCase()

    if (!phone) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'Indique un celular colombiano válido (+57), por ejemplo 3001234567.',
      })
    }

    const check = await checkPhoneOtp(phone, code)
    if (!check.ok) {
      return res.status(check.status).json({
        success: false,
        ok: false,
        error: check.error,
      })
    }

    const pendingEmail = String(check.record?.email || '').trim().toLowerCase()
    if (!pendingEmail) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'No hay un registro pendiente para este celular. Solicite un código nuevo.',
      })
    }
    if (emailHint && emailHint !== pendingEmail) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'El celular no corresponde al correo de este registro.',
      })
    }

    const result = await verifyEmailAndRegister({
      email: pendingEmail,
      code,
      password: body.password,
      phone_number: phone,
      whatsappVerified: true,
    })

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        ok: false,
        error: result.error,
      })
    }

    await deletePhoneOtp(phone)
    const user = result.user
    res.status(201).json({
      success: true,
      ok: true,
      whatsapp_verified: true,
      message: 'Celular verificado por WhatsApp. Cuenta creada. La bienvenida se envía en segundo plano.',
      user,
    })

    voidSendWelcomeWhatsAppInBackground({
      userId: user?.id,
      email: user?.email || pendingEmail,
      phoneNumber: phone,
      nombre: user?.nombre || body.nombre,
    })
  } catch (error) {
    console.error('[Auth] Error en /auth/register/whatsapp/verify:', error)
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        ok: false,
        error: 'No se pudo verificar el código de WhatsApp.',
      })
    }
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
        'Celular verificado por WhatsApp. Cuenta creada. La bienvenida se envía en segundo plano.',
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
