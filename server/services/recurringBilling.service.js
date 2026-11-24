/**
 * Cobro recurrente mensual (compromiso anual 12 meses / débito a tarjeta Bold).
 * Cron diario: revisa nextBillingDate vencida y prepara cobro con token o notificación.
 */
import { getPaidPlanById } from '../../shared/subscriptionPlans.js'
import {
  listRecurringBillingCandidates,
  recordRecurringBillingAttempt,
} from './subscriptionAuthStore.js'
import { config } from '../config.js'

const TZ = 'America/Bogota'
const DAILY_HOUR = 6
const DAILY_MINUTE = 0
const MAX_TIMEOUT_MS = 2_147_483_647
const DAY_MS = 24 * 60 * 60 * 1000

let timer = null
let running = false

function bogotaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const num = (type) => Number(parts.find((part) => part.type === type)?.value)
  return {
    year: num('year'),
    month: num('month'),
    day: num('day'),
    hour: num('hour'),
    minute: num('minute'),
  }
}

/** Próxima ejecución diaria 06:00 America/Bogota. */
export function nextDailyRunDate(now = new Date()) {
  const bogota = bogotaParts(now)
  let { year, month, day } = bogota
  const alreadyPassed =
    bogota.hour > DAILY_HOUR || (bogota.hour === DAILY_HOUR && bogota.minute >= DAILY_MINUTE)
  if (alreadyPassed) {
    const utcNoon = Date.UTC(year, month - 1, day, 17, 0, 0, 0)
    const next = new Date(utcNoon + DAY_MS)
    const nextParts = bogotaParts(next)
    year = nextParts.year
    month = nextParts.month
    day = nextParts.day
  }
  // Bogotá = UTC-5 → 06:00 Bogotá = 11:00 UTC
  return new Date(Date.UTC(year, month - 1, day, DAILY_HOUR + 5, DAILY_MINUTE, 0, 0))
}

function msUntilNextDailyRun(now = new Date()) {
  return Math.max(1_000, Math.min(MAX_TIMEOUT_MS, nextDailyRunDate(now).getTime() - now.getTime()))
}

/**
 * Stub listo para API Bold de cobro con token (Pagos en Línea).
 * Cuando Bold habilite tokenización recurrente, completar el HTTP aquí.
 */
async function chargeWithBoldToken(candidate) {
  const plan = getPaidPlanById(candidate.plan)
  const amount = plan?.amountCOP
  if (!amount) {
    return { ok: false, reason: 'plan_sin_monto' }
  }
  if (!candidate.boldCustomerToken && !candidate.boldPaymentMethodId) {
    return { ok: false, reason: 'sin_token' }
  }

  const secretKey = String(config.bold?.secretKey || process.env.BOLD_SECRET_KEY || '').trim()
  if (!secretKey) {
    return { ok: false, reason: 'bold_no_configurado' }
  }

  // Placeholder: endpoint de cobro recurrente con token (Bold Pagos en Línea).
  // No invocar aún API real hasta confirmar path/contrato de tokenización.
  console.info(
    `[RecurringBilling] Token presente para ${candidate.email}; cobro automático pendiente de API Bold tokenizada.`,
    {
      userId: candidate.id,
      plan: candidate.plan,
      amount,
      installment: (Number(candidate.installmentNumber) || 0) + 1,
      paymentMethodId: candidate.boldPaymentMethodId ? '[set]' : null,
    },
  )
  return {
    ok: false,
    reason: 'api_token_pending',
    note: 'Token guardado; falta habilitar endpoint de cobro recurrente Bold.',
  }
}

export async function processDueRecurringBillings(now = new Date()) {
  if (running) {
    return { skipped: true, reason: 'already_running' }
  }
  running = true
  const summary = {
    checkedAt: now.toISOString(),
    due: 0,
    charged: 0,
    notifiedMissingToken: 0,
    pendingApi: 0,
    errors: 0,
  }
  try {
    const candidates = await listRecurringBillingCandidates(now)
    summary.due = candidates.length
    for (const candidate of candidates) {
      try {
        if (!candidate.boldCustomerToken && !candidate.boldPaymentMethodId) {
          await recordRecurringBillingAttempt({
            userId: candidate.id,
            success: false,
            note: 'Sin boldCustomerToken/boldPaymentMethodId: notificar al titular para renovar pago o tokenizar tarjeta.',
          })
          summary.notifiedMissingToken += 1
          console.warn(
            `[RecurringBilling] Cuota pendiente sin token: ${candidate.email} plan=${candidate.plan} next=${candidate.nextBillingDate}`,
          )
          continue
        }

        const charge = await chargeWithBoldToken(candidate)
        if (charge.ok) {
          await recordRecurringBillingAttempt({
            userId: candidate.id,
            success: true,
            boldPaymentId: charge.paymentId || null,
            note: charge.note || 'Cobro recurrente Bold OK.',
          })
          summary.charged += 1
        } else {
          await recordRecurringBillingAttempt({
            userId: candidate.id,
            success: false,
            note: charge.note || `Cobro no ejecutado (${charge.reason}).`,
          })
          if (charge.reason === 'api_token_pending') summary.pendingApi += 1
          else summary.notifiedMissingToken += 1
        }
      } catch (error) {
        summary.errors += 1
        console.error(
          `[RecurringBilling] Error con usuario ${candidate.id}:`,
          error instanceof Error ? error.message : error,
        )
      }
    }
    console.log('[RecurringBilling] Ciclo diario:', summary)
    return summary
  } finally {
    running = false
  }
}

function scheduleNext() {
  if (timer) clearTimeout(timer)
  const delay = msUntilNextDailyRun()
  timer = setTimeout(() => {
    void processDueRecurringBillings()
      .catch((error) => {
        console.error(
          '[RecurringBilling] Falló el ciclo diario:',
          error instanceof Error ? error.message : error,
        )
      })
      .finally(() => {
        scheduleNext()
      })
  }, delay)
  if (typeof timer.unref === 'function') timer.unref()
  console.log(
    `[RecurringBilling] Próximo ciclo: ${nextDailyRunDate().toISOString()} (en ${Math.round(delay / 60000)} min)`,
  )
}

export async function startRecurringBillingCron() {
  scheduleNext()
  // Catch-up suave al arrancar (no bloquea el listen).
  void processDueRecurringBillings().catch((error) => {
    console.error(
      '[RecurringBilling] Catch-up inicial falló:',
      error instanceof Error ? error.message : error,
    )
  })
  return { ok: true }
}
