import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { config } from '../config.js'
import {
  getPaidPlanById,
  isBoldCheckoutPlan,
  SUBSCRIPTION_PURCHASES_ENABLED,
  SUBSCRIPTION_PURCHASES_DISABLED_MESSAGE,
} from '../../shared/subscriptionPlans.js'
import {
  activateSubscriptionFromBoldPayment,
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'
import { readDurableJson, writeDurableJson } from '../services/durableStore.js'

const ORDERS_FILE = join(config.dataDir, 'bold-orders.json')
const APPROVED_STATUSES = new Set(['APPROVED', 'SALE_APPROVED'])
const REJECTED_STATUSES = new Set(['REJECTED', 'SALE_REJECTED', 'FAILED', 'DECLINED'])

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

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

function clinicIdOf(user) {
  return String(user?.clinicId || user?.id || '')
}

function canPurchasePlans(user) {
  if (!user) return false
  if (user.is_superadmin === true || user.isSuperAdmin === true) return true
  const rol = String(user.rol || user.role || '')
    .trim()
    .toLowerCase()
  if (rol === 'admin' || rol === 'superadmin') return true
  return String(user.id) === clinicIdOf(user)
}

function integrityHash(orderId, amount, secretKey) {
  const payload = `${orderId}${amount}COP${secretKey}`
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}

function pickStatus(body) {
  const data = body?.data && typeof body.data === 'object' ? body.data : {}
  const raw =
    body?.type ??
    body?.status ??
    body?.event ??
    body?.payment_status ??
    data.status ??
    data.payment_status ??
    data.type ??
    ''
  return String(raw).trim().toUpperCase()
}

function pickOrderId(body) {
  const data = body?.data && typeof body.data === 'object' ? body.data : {}
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {}
  return String(
    body?.orderId ??
      body?.order_id ??
      data.order_id ??
      data.orderId ??
      data.reference ??
      meta.reference ??
      meta.order_id ??
      meta.orderId ??
      '',
  ).trim()
}

function pickPaymentId(body) {
  const data = body?.data && typeof body.data === 'object' ? body.data : {}
  return String(
    body?.paymentId ??
      body?.payment_id ??
      data.payment_id ??
      data.paymentId ??
      body?.subject ??
      body?.id ??
      '',
  ).trim()
}

/**
 * POST /api/payments/bold/integrity
 * Autenticado. Genera orderId + firma SHA-256 (Secret Key) con tax excluido (0).
 */
export async function createBoldIntegrity(req, res) {
  try {
    if (!SUBSCRIPTION_PURCHASES_ENABLED) {
      return res.status(503).json({
        success: false,
        ok: false,
        error: SUBSCRIPTION_PURCHASES_DISABLED_MESSAGE,
      })
    }

    const secretKey = String(config.bold?.secretKey || process.env.BOLD_SECRET_KEY || '').trim()
    const apiKey = String(process.env.VITE_BOLD_API_KEY || '').trim()
    if (!secretKey || !apiKey) {
      return res.status(503).json({
        success: false,
        ok: false,
        error: 'Bold no está configurado en el servidor (faltan llaves).',
      })
    }

    const session = await resolveSubscriptionSession(bearerToken(req), sessionHintFromRequest(req))
    if (!session?.user) {
      return res.status(401).json({ success: false, ok: false, error: 'Sesión inválida o expirada.' })
    }
    if (!canPurchasePlans(session.user)) {
      return res.status(403).json({
        success: false,
        ok: false,
        error: 'Solo el titular de la clínica puede iniciar el pago de un plan.',
      })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const planId = String(body.planId ?? '')
      .trim()
      .toLowerCase()
    if (!isBoldCheckoutPlan(planId)) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'Seleccione un plan con monto fijo: nomad, smart o bionic.',
      })
    }

    const plan = getPaidPlanById(planId)
    const amount = Number(plan.amountCOP)
    const titularUserId = clinicIdOf(session.user)
    const orderId = `MHD-${planId.toUpperCase()}-${titularUserId}-${Date.now()}`
    const integritySignature = integrityHash(orderId, amount, secretKey)
    const description = `Suscripción Anual Mi Historia Dental - Plan ${plan.name} (Cuota 1/12 - Débito mensual - Excluido de IVA)`
    const now = new Date().toISOString()

    const store = await loadOrders()
    store.orders.push({
      orderId,
      planId,
      amount,
      currency: 'COP',
      tax: '0',
      billingCycle: 'monthly',
      commitmentMonths: 12,
      installmentNumber: 1,
      userId: titularUserId,
      email: String(session.user.email || '').trim().toLowerCase(),
      actorUserId: String(session.user.id),
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
      amount,
      currency: 'COP',
      tax: '0',
      integritySignature,
      apiKey,
      description,
      commitmentMonths: 12,
      installmentNumber: 1,
      billingCycle: 'monthly',
    })
  } catch (error) {
    console.error('[Bold] Error en POST /payments/bold/integrity:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo generar la firma de integridad Bold.',
    })
  }
}

/**
 * POST /api/webhooks/bold/payments
 * Público. Idempotente por orderId / paymentId. APPROVED → activa plan 30 días.
 */
export async function boldPaymentsWebhook(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const status = pickStatus(body)
    const orderId = pickOrderId(body)
    const paymentId = pickPaymentId(body)
    const store = await loadOrders()

    if (paymentId && store.processedPaymentIds.includes(paymentId)) {
      return res.json({
        success: true,
        ok: true,
        duplicate: true,
        message: 'Pago ya procesado (idempotente).',
      })
    }

    const order =
      (orderId && store.orders.find((item) => item.orderId === orderId)) ||
      (paymentId && store.orders.find((item) => item.paymentId === paymentId)) ||
      null

    if (!order) {
      console.warn('[Bold] Webhook sin orden local:', { orderId, paymentId, status })
      return res.status(404).json({
        success: false,
        ok: false,
        error: 'Orden Bold no encontrada.',
      })
    }

    if (order.status === 'approved' || order.status === 'activated') {
      if (paymentId && !store.processedPaymentIds.includes(paymentId)) {
        store.processedPaymentIds.push(paymentId)
        await saveOrders(store)
      }
      return res.json({
        success: true,
        ok: true,
        duplicate: true,
        message: 'Orden ya activada (idempotente).',
      })
    }

    const now = new Date().toISOString()

    if (REJECTED_STATUSES.has(status)) {
      order.status = 'rejected'
      order.paymentId = paymentId || order.paymentId
      order.updatedAt = now
      order.webhookStatus = status
      if (paymentId && !store.processedPaymentIds.includes(paymentId)) {
        store.processedPaymentIds.push(paymentId)
      }
      await saveOrders(store)
      return res.json({
        success: true,
        ok: true,
        message: 'Pago rechazado; suscripción no activada.',
      })
    }

    if (!APPROVED_STATUSES.has(status)) {
      order.updatedAt = now
      order.webhookStatus = status || 'unknown'
      order.paymentId = paymentId || order.paymentId
      await saveOrders(store)
      return res.json({
        success: true,
        ok: true,
        message: `Evento ${status || 'desconocido'} registrado sin activación.`,
      })
    }

    const data = body?.data && typeof body.data === 'object' ? body.data : {}
    const boldCustomerToken = String(
      data.customer_token ?? data.customerToken ?? body.customer_token ?? '',
    ).trim() || null
    const boldPaymentMethodId = String(
      data.payment_method_id ??
        data.paymentMethodId ??
        data.card_id ??
        body.payment_method_id ??
        '',
    ).trim() || null

    const activation = await activateSubscriptionFromBoldPayment({
      userId: order.userId,
      email: order.email,
      planId: order.planId,
      boldOrderId: order.orderId,
      boldPaymentId: paymentId || null,
      boldCustomerToken,
      boldPaymentMethodId,
    })

    if (!activation.ok) {
      console.error('[Bold] Falló activación tras APPROVED:', activation.error)
      return res.status(activation.status || 500).json({
        success: false,
        ok: false,
        error: activation.error || 'No se pudo activar la suscripción.',
      })
    }

    order.status = 'activated'
    order.paymentId = paymentId || order.paymentId
    order.updatedAt = now
    order.webhookStatus = status
    order.activatedAt = now
    order.installmentNumber = activation.installmentNumber || 1
    order.contractEndDate = activation.contractEndDate || null
    if (paymentId && !store.processedPaymentIds.includes(paymentId)) {
      store.processedPaymentIds.push(paymentId)
    }
    await saveOrders(store)

    return res.json({
      success: true,
      ok: true,
      message:
        'Pago aprobado. Suscripción anual activa (cuota mensual 1/12, débito automático).',
      userId: order.userId,
      planId: order.planId,
      expiresAt: activation.expiresAt,
      nextBillingDate: activation.expiresAt,
      installmentNumber: activation.installmentNumber,
      contractEndDate: activation.contractEndDate,
    })
  } catch (error) {
    console.error('[Bold] Error en POST /webhooks/bold/payments:', error)
    return res.status(500).json({
      success: false,
      ok: false,
      error: 'No se pudo procesar el webhook de Bold.',
    })
  }
}
