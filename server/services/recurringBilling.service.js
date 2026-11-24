/**
 * Renovación mensual Bold (Botón de Pagos): sin tokenización.
 * Cada cuota 2–12 requiere autorización directa del suscriptor en /suscripcion.
 * Cron diario 06:00 America/Bogota: recordatorio (−3 días), gracia al vencer, vencido tras 3 días.
 */
import { getPaidPlanById } from '../../shared/subscriptionPlans.js'
import {
  listSubscriptionRenewalCandidates,
  markRenewalDuePending,
  markRenewalOverdue,
  markRenewalReminderPending,
  RENEWAL_GRACE_DAYS,
  RENEWAL_REMINDER_DAYS_BEFORE,
} from './subscriptionAuthStore.js'
import { isMailConfigured, sendSubscriptionRenewalEmail } from './mailer.js'

const TZ = 'America/Bogota'
const DAILY_HOUR = 6
const DAILY_MINUTE = 0
const MAX_TIMEOUT_MS = 2_147_483_647
const DAY_MS = 24 * 60 * 60 * 1000
const RENEW_URL = 'https://www.mihistoriadental.com/suscripcion?renovar=1'

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

/** Día calendario Bogotá como YYYY-MM-DD. */
function bogotaDayKey(date = new Date()) {
  const p = bogotaParts(date)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

function dayKeyFromIso(iso) {
  if (!iso) return null
  return bogotaDayKey(new Date(iso))
}

/** Diferencia en días de calendario Bogotá: target − today (negativo = pasado). */
function calendarDaysBetween(fromKey, toKey) {
  if (!fromKey || !toKey) return null
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const fromUtc = Date.UTC(fy, fm - 1, fd)
  const toUtc = Date.UTC(ty, tm - 1, td)
  return Math.round((toUtc - fromUtc) / DAY_MS)
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

function formatAmountLabel(amountCOP) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(amountCOP) || 0)
}

function formatDueLabel(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: TZ,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

async function notifyRenewalEmail(candidate, kind) {
  const plan = getPaidPlanById(candidate.plan)
  const amountLabel = plan?.priceLabel || formatAmountLabel(plan?.amountCOP)
  const payload = {
    to: candidate.email,
    planName: plan?.name || String(candidate.plan || 'Plan'),
    amountLabel,
    installmentNumber: candidate.nextInstallment,
    commitmentMonths: candidate.commitmentMonths || 12,
    dueLabel: formatDueLabel(candidate.nextBillingDate),
    renewUrl: RENEW_URL,
    kind,
  }

  const configured = await isMailConfigured()
  if (!configured) {
    console.info('[RecurringBilling] MAIL_NOT_CONFIGURED — recordatorio listo (log):', {
      kind,
      email: candidate.email,
      cuota: `${payload.installmentNumber}/${payload.commitmentMonths}`,
      amountLabel,
      renewUrl: RENEW_URL,
    })
    return { sent: false, via: 'log' }
  }

  try {
    const result = await sendSubscriptionRenewalEmail(payload)
    return result
  } catch (error) {
    console.error(
      '[RecurringBilling] Falló envío de correo de renovación:',
      error instanceof Error ? error.message : error,
      { email: candidate.email, kind },
    )
    console.info('[RecurringBilling] Fallback log estructurado:', {
      kind,
      email: candidate.email,
      cuota: `${payload.installmentNumber}/${payload.commitmentMonths}`,
      amountLabel,
      renewUrl: RENEW_URL,
    })
    return { sent: false, via: 'log_after_error' }
  }
}

export async function processDueRecurringBillings(now = new Date()) {
  if (running) {
    return { skipped: true, reason: 'already_running' }
  }
  running = true
  const summary = {
    checkedAt: now.toISOString(),
    candidates: 0,
    reminders: 0,
    dueMarked: 0,
    overdue: 0,
    skipped: 0,
    errors: 0,
  }
  try {
    const todayKey = bogotaDayKey(now)
    const candidates = await listSubscriptionRenewalCandidates(now)
    summary.candidates = candidates.length

    for (const candidate of candidates) {
      try {
        const billingKey = dayKeyFromIso(candidate.nextBillingDate)
        const daysUntilDue = calendarDaysBetween(todayKey, billingKey)
        const estado = String(candidate.estado_pago || '')

        // Fin de gracia → vencido (sin borrar datos clínicos).
        if (estado === 'pendiente_renovacion') {
          const graceKey = dayKeyFromIso(candidate.renewalGraceUntil || candidate.fecha_vencimiento)
          const daysPastGrace = calendarDaysBetween(graceKey, todayKey)
          if (graceKey && daysPastGrace != null && daysPastGrace >= 0) {
            await markRenewalOverdue({
              userId: candidate.id,
              note: `Gracia de ${RENEWAL_GRACE_DAYS} días agotada. Suspensión administrativa.`,
            })
            if (!candidate.overdueReminderSentAt) {
              await notifyRenewalEmail(candidate, 'due')
            }
            summary.overdue += 1
            continue
          }
          summary.skipped += 1
          continue
        }

        if (estado === 'vencido') {
          summary.skipped += 1
          continue
        }

        // Día de vencimiento o ya pasó → pendiente_renovacion + correo.
        if (daysUntilDue != null && daysUntilDue <= 0 && estado === 'activo') {
          if (!candidate.renewalDueNotifiedAt) {
            await markRenewalDuePending({
              userId: candidate.id,
              note: `Cuota ${candidate.nextInstallment}/12 vencida. Gracia ${RENEWAL_GRACE_DAYS} días.`,
            })
            await notifyRenewalEmail(candidate, 'due')
            summary.dueMarked += 1
          } else {
            summary.skipped += 1
          }
          continue
        }

        // 3 días antes → recordatorio preventivo.
        if (
          daysUntilDue != null &&
          daysUntilDue === RENEWAL_REMINDER_DAYS_BEFORE &&
          estado === 'activo' &&
          !candidate.renewalReminderSentAt
        ) {
          await markRenewalReminderPending({
            userId: candidate.id,
            note: `Recordatorio −${RENEWAL_REMINDER_DAYS_BEFORE} días: Cuota ${candidate.nextInstallment}/12.`,
          })
          await notifyRenewalEmail(candidate, 'reminder')
          summary.reminders += 1
          continue
        }

        summary.skipped += 1
      } catch (error) {
        summary.errors += 1
        console.error(
          `[RecurringBilling] Error con usuario ${candidate.id}:`,
          error instanceof Error ? error.message : error,
        )
      }
    }
    console.log('[RecurringBilling] Ciclo diario (autorización Bold):', summary)
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
  void processDueRecurringBillings().catch((error) => {
    console.error(
      '[RecurringBilling] Catch-up inicial falló:',
      error instanceof Error ? error.message : error,
    )
  })
  return { ok: true }
}
