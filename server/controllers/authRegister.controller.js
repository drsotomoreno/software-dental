import { timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'
import {
  confirmWhatsAppActivationByToken,
  findRegistrationConflicts,
  hashPasswordSha256,
  issueSessionForStoredUser,
  normalizeColombiaPhoneNumber,
  registerSubscriptionUser,
  SUPERADMIN_EMAIL,
} from '../services/subscriptionAuthStore.js'
import {
  buildRegistrationVerificationLink,
  getCorporateWhatsAppNumber,
} from '../services/whatsappClickToChat.service.js'
import { describeMailError, sendVerificationCodeEmail } from '../services/mailer.js'
import {
  beginPendingCompletion,
  deletePendingRegistration,
  readPendingStatus,
  releasePendingCompletion,
  restorePendingRecord,
  rotatePendingEmailCode,
  savePendingRegistration,
  verifyPendingWhatsApp,
} from '../services/pendingRegistrationStore.js'
import {
  collectInboundMessages,
  extractWhatsAppCodes,
  inboundMessageText,
  senderDigitCandidates,
} from '../services/evolutionInbound.service.js'
import {
  checkWhatsAppNumberExists,
  voidSendWelcomeWhatsAppInBackground,
} from '../services/whatsapp.service.js'
import { FAKE_OR_INVALID_MOBILE_ERROR } from '../../shared/mobilePhone.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function digitsOnlyPhone(value) {
  return String(value ?? '').replace(/\D/g, '')
}

/**
 * Bienvenida saliente. No se espera: un fallo de Evolution no altera el alta.
 */
function dispatchRegistrationWelcome({ phoneNumber, nombre }) {
  const number = digitsOnlyPhone(phoneNumber)
  const wa = config.evolutionWhatsapp || {}
  const baseUrl = String(wa.baseUrl || '').replace(/\/$/, '')
  const instance = String(wa.instance || '').trim()
  const apiKey = String(wa.apiKey || '').trim()
  const doctor = String(nombre || '').trim() || 'Doctor(a)'
  if (!number || !baseUrl || !instance || !apiKey) {
    console.error('[WhatsApp] Bienvenida no enviada: faltan número o datos de Evolution API.')
    return
  }
  const url = `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`
  const text = `Hola ${doctor}, bienvenido a Mi Historia Dental. Su prueba gratuita ya está lista. Entre aquí: https://www.mihistoriadental.com`
  void (async () => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({ number, text }),
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        console.error('[WhatsApp] Evolution API rechazó la bienvenida:', response.status, body)
      }
    } catch (error) {
      console.error(
        '[WhatsApp] No se pudo enviar la bienvenida:',
        error instanceof Error ? error.message : error,
      )
    }
  })()
}

function conflictMessage(emailTaken, phoneTaken) {
  if (emailTaken && phoneTaken) {
    return 'Ya existe una cuenta con este correo y con este número de WhatsApp.'
  }
  if (emailTaken) return 'Ya existe una cuenta con este correo.'
  if (phoneTaken) return 'Ya existe una cuenta con este número de WhatsApp.'
  return ''
}

function webhookSecretOk(req) {
  const expected = String(config.evolutionWebhookSecret || process.env.EVOLUTION_WEBHOOK_SECRET || '').trim()
  if (!expected) return true
  const presented = [
    req.query?.secret,
    req.get('apikey'),
    req.get('x-webhook-secret'),
  ].map((value) => String(value || ''))
  const expectedBuf = Buffer.from(expected)
  return presented.some((value) => {
    const received = Buffer.from(value)
    if (received.length !== expectedBuf.length) return false
    return timingSafeEqual(expectedBuf, received)
  })
}

/**
 * Paso 1: no crea la cuenta. Deja un pendiente, manda el OTP por correo
 * y devuelve el enlace wa.me para que el usuario escriba el código.
 */
export async function requestRegisterCode(req, res) {
  let pending = null
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const nombre = String(body.nombre ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '').trim()
    const phone = normalizeColombiaPhoneNumber(body.phone_number ?? body.phone)

    if (!nombre) {
      return res.status(400).json({ success: false, ok: false, error: 'El nombre es obligatorio.' })
    }
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, ok: false, error: 'Indique un correo electrónico válido.' })
    }
    if (email === SUPERADMIN_EMAIL) {
      return res.status(403).json({
        success: false,
        ok: false,
        error: 'Este correo está reservado para el administrador del sistema.',
      })
    }
    if (!phone) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: FAKE_OR_INVALID_MOBILE_ERROR,
      })
    }
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'La contraseña debe tener al menos 6 caracteres.',
      })
    }
    if (!getCorporateWhatsAppNumber()) {
      return res.status(503).json({
        success: false,
        ok: false,
        error: 'Falta configurar WHATSAPP_BUSINESS_NUMBER (WhatsApp corporativo) en el servidor.',
      })
    }

    // Consulta silenciosa a Evolution: sin OTP ni SMS. Si la instancia falla, no bloquea.
    const waExists = await checkWhatsAppNumberExists(phone)
    if (waExists.ok && waExists.exists === false) {
      return res.status(400).json({
        success: false,
        ok: false,
        error:
          'Este número no parece tener WhatsApp activo. Por favor ingresa un número celular real.',
      })
    }
    if (!waExists.ok) {
      console.warn(
        '[Auth] Check WhatsApp omitido (fallback):',
        waExists.skipped ? 'no configurado' : waExists.error || 'desconocido',
      )
    }

    const conflicts = await findRegistrationConflicts({ email, phoneNumber: phone })
    const duplicate = conflictMessage(conflicts.emailTaken, conflicts.phoneTaken)
    if (duplicate) {
      return res.status(409).json({
        success: false,
        ok: false,
        error: duplicate,
        emailTaken: conflicts.emailTaken,
        phoneTaken: conflicts.phoneTaken,
      })
    }

    pending = await savePendingRegistration({
      nombre,
      email,
      phoneNumber: phone,
      passwordHash: hashPasswordSha256(password),
    })

    const link = buildRegistrationVerificationLink(pending.whatsappCode)
    if (!link.ok) {
      await deletePendingRegistration(pending.pendingId)
      return res.status(503).json({ success: false, ok: false, error: link.error })
    }

    try {
      await sendVerificationCodeEmail({ to: email, code: pending.emailCode })
    } catch (error) {
      await deletePendingRegistration(pending.pendingId)
      console.error('[Auth] No se pudo enviar el código de registro:', error instanceof Error ? error.message : error)
      return res.status(503).json({
        success: false,
        ok: false,
        error: describeMailError(error),
      })
    }

    return res.status(201).json({
      success: true,
      ok: true,
      pendingId: pending.pendingId,
      email: pending.email,
      phone_number: pending.phone_number,
      whatsapp_code: pending.whatsappCode,
      whatsapp_url: link.url,
      whatsapp_message: link.message,
      expiresInSeconds: 900,
    })
  } catch (error) {
    if (pending?.pendingId) {
      try {
        await deletePendingRegistration(pending.pendingId)
      } catch {
        /* el pendiente no debe quedar si la respuesta falló */
      }
    }
    console.error('[Auth] Error en /auth/register/request-code:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo iniciar el registro.',
    })
  }
}

export async function registerStatus(req, res) {
  try {
    const status = await readPendingStatus(req.params.pendingId)
    return res.json({
      success: true,
      ok: true,
      emailVerified: status.emailVerified,
      whatsappVerified: status.whatsappVerified,
      expired: status.expired,
    })
  } catch (error) {
    console.error('[Auth] Error en GET /auth/register/status:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo consultar el registro.',
    })
  }
}

export async function resendRegisterEmail(req, res) {
  let rotated = null
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    rotated = await rotatePendingEmailCode(body.pendingId)
    if (!rotated.ok) {
      return res.status(rotated.status).json({
        success: false,
        ok: false,
        error: rotated.error,
        retryAfterSeconds: rotated.retryAfterSeconds,
      })
    }
    try {
      await sendVerificationCodeEmail({
        to: rotated.record.email,
        code: rotated.record.emailCode,
      })
    } catch (error) {
      if (rotated.previous) await restorePendingRecord(rotated.previous)
      console.error('[Auth] Reenvío de código falló:', error instanceof Error ? error.message : error)
      return res.status(503).json({
        success: false,
        ok: false,
        error: describeMailError(error),
      })
    }
    return res.json({
      success: true,
      ok: true,
      pendingId: rotated.record.pendingId,
      message: 'Enviamos un código nuevo a su correo. Caduca con el registro, en un máximo de 15 minutos.',
    })
  } catch (error) {
    console.error('[Auth] Error en /auth/register/resend-email:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo reenviar el código.',
    })
  }
}

export async function completeRegister(req, res) {
  let pendingId = ''
  let claimed = false
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    pendingId = String(body.pendingId || '').trim()
    const started = await beginPendingCompletion({
      pendingId,
      emailCode: body.emailCode ?? body.code,
    })
    if (!started.ok) {
      return res.status(started.status).json({
        success: false,
        ok: false,
        error: started.error,
      })
    }
    claimed = true
    const pending = started.record
    const phoneDigits = digitsOnlyPhone(pending.phone_number)

    const conflicts = await findRegistrationConflicts({
      email: pending.email,
      phoneNumber: phoneDigits,
    })
    const duplicate = conflictMessage(conflicts.emailTaken, conflicts.phoneTaken)
    if (duplicate) {
      await deletePendingRegistration(pending.pendingId)
      claimed = false
      return res.status(409).json({ success: false, ok: false, error: duplicate })
    }

    const created = await registerSubscriptionUser({
      nombre: pending.nombre,
      email: pending.email,
      passwordHash: pending.passwordHash,
      phone_number: phoneDigits,
      verifiedRegistration: true,
      is_verified: true,
      email_verified: true,
      whatsapp_verified: true,
      whatsapp_status: 'verified',
    })
    if (!created.ok) {
      await releasePendingCompletion(pending.pendingId)
      claimed = false
      return res.status(created.status).json({
        success: false,
        ok: false,
        error: created.error,
      })
    }

    const session = await issueSessionForStoredUser(created.user.id)
    await deletePendingRegistration(pending.pendingId)
    claimed = false
    if (!session.ok) {
      return res.status(session.status || 500).json({
        success: false,
        ok: false,
        error: session.error || 'La cuenta quedó creada, pero no se pudo abrir la sesión. Inicie sesión.',
      })
    }

    dispatchRegistrationWelcome({
      phoneNumber: phoneDigits,
      nombre: pending.nombre,
    })

    return res.status(200).json({
      success: true,
      ok: true,
      token: session.token,
      user: session.user,
      rol: session.rol,
      expiresAt: session.expiresAt,
      requiresSubscription: true,
      unlimitedAccess: false,
    })
  } catch (error) {
    if (claimed && pendingId) {
      try {
        await releasePendingCompletion(pendingId)
      } catch {
        /* ignore */
      }
    }
    console.error('[Auth] Error en /auth/register/complete:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo crear la cuenta.',
    })
  }
}

/**
 * Webhook de mensajes entrantes. No responde al chat: solo marca el pendiente
 * si el código y el celular coinciden.
 */
export async function evolutionWhatsAppWebhook(req, res) {
  try {
    if (!webhookSecretOk(req)) {
      return res.status(401).json({ ok: false, error: 'Webhook no autorizado.' })
    }
    const messages = collectInboundMessages(req.body)
    let verified = false
    for (const item of messages) {
      const codes = extractWhatsAppCodes(inboundMessageText(item.message))
      const senderDigits = senderDigitCandidates(item.key, item)
      if (!codes.length || !senderDigits.length) continue
      const result = await verifyPendingWhatsApp({ codes, senderDigits })
      if (result.verified) verified = true
    }
    return res.status(200).json({ ok: true, verified })
  } catch (error) {
    console.error('[Auth] Error en webhook Evolution:', error)
    return res.status(500).json({ ok: false, error: 'No se pudo procesar el mensaje.' })
  }
}

/**
 * Confirmación manual del flujo anterior (cuentas ya creadas con token).
 * El alta nuevo no usa esta ruta.
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

/** @deprecated Preferir el alta con verificación dual. */
export async function verifyRegisterCode(req, res) {
  return confirmWhatsAppClickToChat(req, res)
}

/** @deprecated Preferir el webhook de Evolution. */
export async function verifyWhatsAppRegistration(req, res) {
  return confirmWhatsAppClickToChat(req, res)
}
