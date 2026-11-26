/**
 * API WhatsApp y Chatbot — status, checkout Bold y cola de inasistencias.
 */
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { config } from '../config.js'
import {
  creditsForWhatsappPackage,
  getWhatsappPackageById,
  hasActivePaidSubscription,
  WHATSAPP_PACKAGES,
} from '../../shared/whatsappPackages.js'
import { readDurableJson, writeDurableJson } from '../services/durableStore.js'
import {
  getWhatsappStatusForUser,
  listNoShowFollowups,
  patchNoShowFollowup,
  resolveClinicUuid,
  updateClinicWhatsappCredentials,
} from '../services/whatsappClinicStore.js'
import { isSuperAdminUser } from '../services/subscriptionAuthStore.js'

const ORDERS_FILE = join(config.dataDir, 'bold-orders.json')

function emptyOrdersStore() {
  return { orders: [], processedPaymentIds: [] }
}

async function loadOrders() {
  const parsed = await readDurableJson(ORDERS_FILE, emptyOrdersStore())
  if (!parsed || typeof parsed !== 'object') return emptyOrdersStore()
  return {
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    processedPaymentIds: Array.isArray(parsed.processedPaymentIds)
      ? parsed.processedPaymentIds
      : [],
  }
}

async function saveOrders(store) {
  await writeDurableJson(ORDERS_FILE, store)
}

function amountToBoldString(amountCOP) {
  return String(Math.round(Number(amountCOP) || 0)).replace(/\D/g, '')
}

function integrityHash(orderId, amountStr, secretKey) {
  return createHash('sha256').update(`${orderId}${amountStr}COP${secretKey}`, 'utf8').digest('hex')
}

function boldWhatsappDescription(pack) {
  const safeName = String(pack?.name || 'Paquete WhatsApp')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `Mi Historia Dental ${safeName} Excluido IVA`
}

function sessionUser(req) {
  return req.whatsappSession?.user || req.authSession?.user || null
}

function canPurchaseWhatsapp(user) {
  if (!user) return false
  if (isSuperAdminUser(user) || user.is_superadmin === true) return true
  const rol = String(user.rol || user.role || '')
    .trim()
    .toLowerCase()
  if (rol === 'admin' || rol === 'admin_clinica' || rol === 'titular') return true
  const clinicId = String(user.clinicId || user.clinica_id || user.id || '')
  return String(user.id) === clinicId
}

/** GET /api/whatsapp/status */
export async function getWhatsappStatus(req, res) {
  try {
    const user = sessionUser(req)
    const result = await getWhatsappStatusForUser(user)
    if (!result.ok) {
      return res.status(result.status || 500).json({
        success: false,
        ok: false,
        error: result.error,
      })
    }
    return res.json({
      success: true,
      ok: true,
      ...result,
    })
  } catch (error) {
    console.error('[WhatsApp] GET /status:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo leer el estado de WhatsApp.',
    })
  }
}

/**
 * POST /api/whatsapp/checkout
 * Body: { packageId: 'REMINDERS_50' | ... }
 * Crea intención Bold; el webhook acredita créditos al APPROVED.
 */
export async function createWhatsappCheckout(req, res) {
  try {
    const user = sessionUser(req)
    if (!hasActivePaidSubscription(user)) {
      return res.status(402).json({
        success: false,
        ok: false,
        error:
          'Los paquetes de WhatsApp requieren suscripción paga activa (no aplica a free_trial).',
        code: 'WHATSAPP_PAID_SUBSCRIPTION_REQUIRED',
        requiresPaidSubscription: true,
      })
    }
    if (!canPurchaseWhatsapp(user)) {
      return res.status(403).json({
        success: false,
        ok: false,
        error: 'Solo el titular o administrador de la clínica puede comprar paquetes WhatsApp.',
      })
    }

    const secretKey = String(
      config.bold?.secretKey || process.env.BOLD_SECRET_KEY || '',
    ).trim()
    const apiKey = String(
      config.bold?.apiKey ||
        process.env.BOLD_API_KEY ||
        process.env.VITE_BOLD_API_KEY ||
        '',
    ).trim()
    if (!secretKey || !apiKey) {
      return res.status(503).json({
        success: false,
        ok: false,
        error: 'Bold no está configurado en el servidor (faltan llaves).',
      })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const pack = getWhatsappPackageById(body.packageId ?? body.package_id)
    if (!pack) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'Seleccione un paquete válido: REMINDERS_50, REMINDERS_150, CHATBOT_200 o CHATBOT_600.',
        packages: WHATSAPP_PACKAGES,
      })
    }

    const clinicId = await resolveClinicUuid(user)
    if (!clinicId) {
      return res.status(404).json({
        success: false,
        ok: false,
        error: 'No se encontró la clínica para iniciar el checkout.',
      })
    }

    const amountStr = amountToBoldString(pack.amountCOP)
    const orderId = `MHDWA${Date.now()}${randomUUID().replace(/-/g, '').slice(0, 6)}`
    const integritySignature = integrityHash(orderId, amountStr, secretKey)
    const description = boldWhatsappDescription(pack)
    const now = new Date().toISOString()
    const credits = creditsForWhatsappPackage(pack)

    const store = await loadOrders()
    store.orders.push({
      orderId,
      kind: 'whatsapp_package',
      packageId: pack.id,
      packageType: pack.type,
      credits,
      amount: amountStr,
      currency: 'COP',
      taxExcluded: true,
      clinicId,
      userId: String(user.clinicId || user.id),
      email: String(user.email || '').trim().toLowerCase(),
      actorUserId: String(user.id),
      status: 'pending',
      integritySignature,
      description,
      createdAt: now,
      updatedAt: now,
      paymentId: null,
    })
    await saveOrders(store)

    return res.json({
      success: true,
      ok: true,
      orderId,
      amount: amountStr,
      currency: 'COP',
      integritySignature,
      apiKey,
      description,
      package: {
        id: pack.id,
        name: pack.name,
        type: pack.type,
        credits,
        amountCOP: pack.amountCOP,
        priceLabel: pack.priceLabel,
      },
      clinic_id: clinicId,
    })
  } catch (error) {
    console.error('[WhatsApp] POST /checkout:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo crear la intención de pago WhatsApp.',
    })
  }
}

/** GET /api/whatsapp/no-shows */
export async function listWhatsappNoShows(req, res) {
  try {
    const user = sessionUser(req)
    const clinicId = await resolveClinicUuid(user)
    if (!clinicId) {
      return res.status(404).json({
        success: false,
        ok: false,
        error: 'No se encontró la clínica asociada a la sesión.',
      })
    }

    const status = req.query?.status ? String(req.query.status) : undefined
    const items = await listNoShowFollowups(clinicId, { status })
    return res.json({
      success: true,
      ok: true,
      clinic_id: clinicId,
      count: items.length,
      items,
    })
  } catch (error) {
    console.error('[WhatsApp] GET /no-shows:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo listar las inasistencias pendientes.',
    })
  }
}

/** PATCH /api/whatsapp/settings — toggle chatbot_enabled (y flags de conexión futuros). */
export async function patchWhatsappSettings(req, res) {
  try {
    const user = sessionUser(req)
    if (!canPurchaseWhatsapp(user) && !isSuperAdminUser(user)) {
      return res.status(403).json({
        success: false,
        ok: false,
        error: 'Solo el titular o administrador puede cambiar la configuración de WhatsApp.',
      })
    }
    const clinicId = await resolveClinicUuid(user)
    if (!clinicId) {
      return res.status(404).json({
        success: false,
        ok: false,
        error: 'No se encontró la clínica asociada a la sesión.',
      })
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const chatbotEnabled =
      typeof body.chatbot_enabled === 'boolean'
        ? body.chatbot_enabled
        : typeof body.chatbotEnabled === 'boolean'
          ? body.chatbotEnabled
          : undefined

    const updated = await updateClinicWhatsappCredentials(clinicId, {
      chatbotEnabled,
      connected: typeof body.whatsapp_connected === 'boolean' ? body.whatsapp_connected : undefined,
      phoneNumberId: body.whatsapp_phone_number_id ?? body.phoneNumberId,
      wabaId: body.whatsapp_waba_id ?? body.wabaId,
      accessToken: body.whatsapp_access_token ?? body.accessToken,
    })

    return res.json({
      success: true,
      ok: true,
      clinic_id: clinicId,
      ...updated,
    })
  } catch (error) {
    console.error('[WhatsApp] PATCH /settings:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo actualizar la configuración de WhatsApp.',
    })
  }
}

/** PATCH /api/whatsapp/no-shows/:id */
export async function patchWhatsappNoShow(req, res) {
  try {
    const user = sessionUser(req)
    const clinicId = await resolveClinicUuid(user)
    if (!clinicId) {
      return res.status(404).json({
        success: false,
        ok: false,
        error: 'No se encontró la clínica asociada a la sesión.',
      })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await patchNoShowFollowup(clinicId, req.params.id, {
      status: body.status,
      receptionist_notes: body.receptionist_notes ?? body.receptionistNotes ?? body.notes,
    })

    if (!result.ok) {
      return res.status(result.status || 400).json({
        success: false,
        ok: false,
        error: result.error,
      })
    }

    return res.json({
      success: true,
      ok: true,
      followup: result.followup,
    })
  } catch (error) {
    console.error('[WhatsApp] PATCH /no-shows/:id:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo actualizar el follow-up de inasistencia.',
    })
  }
}
