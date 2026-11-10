import {
  confirmWhatsAppActivationByToken,
  normalizeColombiaPhoneNumber,
  registerSubscriptionUser,
} from '../services/subscriptionAuthStore.js'
import {
  buildWhatsAppActivationLink,
  generateActivationToken,
  getCorporateWhatsAppNumber,
} from '../services/whatsappClickToChat.service.js'
import { voidSendWelcomeWhatsAppInBackground } from '../services/whatsapp.service.js'

/**
 * Registro express + Click-to-Chat.
 * Crea la cuenta con is_verified / whatsapp_verified = false y devuelve el enlace wa.me.
 */
export async function requestRegisterCode(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const email = String(body.email ?? '').trim().toLowerCase()
    const phone = normalizeColombiaPhoneNumber(body.phone_number ?? body.phone)

    if (!phone) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'Indique un celular colombiano válido (+57), por ejemplo 3001234567.',
      })
    }

    if (!getCorporateWhatsAppNumber()) {
      return res.status(503).json({
        success: false,
        ok: false,
        error:
          'Falta configurar WHATSAPP_BUSINESS_NUMBER (WhatsApp corporativo) en el servidor.',
      })
    }

    const activationToken = generateActivationToken(6)
    const link = buildWhatsAppActivationLink(activationToken)
    if (!link.ok) {
      return res.status(503).json({
        success: false,
        ok: false,
        error: link.error,
      })
    }

    const result = await registerSubscriptionUser({
      nombre: body.nombre,
      email,
      password: body.password,
      phone_number: phone,
      activation_token: activationToken,
    })

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        ok: false,
        error: result.error,
      })
    }

    const user = result.user
    const token = result.activation_token || activationToken
    const finalLink = buildWhatsAppActivationLink(token)
    if (!finalLink.ok) {
      return res.status(503).json({
        success: false,
        ok: false,
        error: finalLink.error,
      })
    }
    return res.status(result.resumed ? 200 : 201).json({
      success: true,
      ok: true,
      email: user.email,
      phone_number: phone,
      activation_token: token,
      whatsapp_url: finalLink.url,
      whatsapp_message: finalLink.message,
      is_verified: false,
      whatsapp_verified: false,
      resumed: Boolean(result.resumed),
      user,
      message: result.resumed
        ? 'Su cuenta ya existía sin activar. Abra WhatsApp y envíe el mensaje para verificar el celular.'
        : 'Cuenta creada. Abra WhatsApp y envíe el mensaje de activación para verificar su celular.',
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
 * Confirmación manual/simulada: el operador marca el token como recibido.
 * Cuerpo: { token } o { token, email }.
 */
export async function confirmWhatsAppClickToChat(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await confirmWhatsAppActivationByToken({
      token: body.token ?? body.code ?? body.activation_token,
      email: body.email,
    })

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        ok: false,
        error: result.error,
      })
    }

    const user = result.user
    res.json({
      success: true,
      ok: true,
      is_verified: true,
      whatsapp_verified: true,
      message: 'Cuenta activada. El celular quedó verificado por WhatsApp.',
      user,
    })

    voidSendWelcomeWhatsAppInBackground({
      userId: user?.id,
      email: user?.email,
      phoneNumber: user?.phone_number || user?.phone,
      nombre: user?.nombre,
    })
  } catch (error) {
    console.error('[Auth] Error en /auth/register/whatsapp/confirm:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo confirmar la activación por WhatsApp.',
    })
  }
}

/** @deprecated Preferir requestRegisterCode (Click-to-Chat). */
export async function verifyRegisterCode(req, res) {
  return confirmWhatsAppClickToChat(req, res)
}

/** @deprecated Preferir confirmWhatsAppClickToChat. */
export async function verifyWhatsAppRegistration(req, res) {
  return confirmWhatsAppClickToChat(req, res)
}
