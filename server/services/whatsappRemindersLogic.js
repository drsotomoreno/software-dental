/**
 * Lógica pura del motor de recordatorios / inasistencias / sesiones chatbot.
 * Separada para tests unitarios sin Postgres ni Graph API.
 */

export const REMINDER_24H_DELAY_MS = (23 * 60 + 45) * 60 * 1000
export const NO_SHOW_STEP1_DELAY_MS = 24 * 60 * 60 * 1000
export const NO_SHOW_STEP2_DELAY_MS = 6 * 24 * 60 * 60 * 1000
export const CHATBOT_WINDOW_MS = 24 * 60 * 60 * 1000

export const TEMPLATE_CITA_48H = 'cita_48h'
export const TEMPLATE_CITA_24H = 'cita_24h'
export const TEMPLATE_NO_SHOW_D1 = 'inasistencia_dia_siguiente'
export const TEMPLATE_NO_SHOW_WEEK = 'inasistencia_semanal'

const NO_SHOW_STATUSES = new Set(['no_asistio', 'no_show', 'no-show', 'inasistencia'])

export function isNoShowStatus(status) {
  return NO_SHOW_STATUSES.has(String(status || '').trim().toLowerCase())
}

export function isFutureAppointmentStatus(status) {
  const s = String(status || '').trim().toLowerCase()
  if (!s) return true
  if (isNoShowStatus(s)) return false
  if (['cancelada', 'cancelled', 'completada', 'completed', 'deleted'].includes(s)) return false
  return true
}

/**
 * Elegible para plantilla 48h: cita futura, aún no enviada, dentro de las próximas 48h.
 */
export function isEligibleFor48hReminder(appointment, now = new Date()) {
  if (!appointment) return false
  if (appointment.reminder_48h_sent_at) return false
  if (appointment.confirmed_by_patient === true) return false
  if (!isFutureAppointmentStatus(appointment.status)) return false
  const start = Date.parse(String(appointment.start_time || appointment.startTime || ''))
  if (!Number.isFinite(start)) return false
  const t = now.getTime()
  if (start <= t) return false
  const horizon = t + 48 * 60 * 60 * 1000
  return start <= horizon
}

/**
 * Ahorro ventana Meta: 23h 45m después del envío 48h, si aún no confirmó.
 */
export function isEligibleFor24hReminder(appointment, now = new Date()) {
  if (!appointment) return false
  if (!appointment.reminder_48h_sent_at) return false
  if (appointment.reminder_24h_sent_at) return false
  if (appointment.confirmed_by_patient === true) return false
  if (!isFutureAppointmentStatus(appointment.status)) return false
  const sent = Date.parse(String(appointment.reminder_48h_sent_at))
  if (!Number.isFinite(sent)) return false
  return sent <= now.getTime() - REMINDER_24H_DELAY_MS
}

/**
 * Transición de follow-up tras un envío exitoso (o DRY_RUN acreditado).
 * step 1 → step 2 + next_send +6 días
 * step 2 → pending_manual_call
 */
export function nextNoShowFollowupAfterSend(step, now = new Date()) {
  const current = Number(step) || 1
  if (current <= 1) {
    return {
      step: 2,
      status: 'active',
      next_send_at: new Date(now.getTime() + NO_SHOW_STEP2_DELAY_MS).toISOString(),
      last_attempt_at: now.toISOString(),
    }
  }
  return {
    step: 2,
    status: 'pending_manual_call',
    next_send_at: null,
    last_attempt_at: now.toISOString(),
  }
}

export function noShowInitialFollowup(missedStartTime, now = new Date()) {
  const missed = Date.parse(String(missedStartTime || ''))
  const base = Number.isFinite(missed) ? missed : now.getTime()
  return {
    step: 1,
    status: 'active',
    next_send_at: new Date(base + NO_SHOW_STEP1_DELAY_MS).toISOString(),
  }
}

/**
 * ¿Hay que descontar 1 sesión de chatbot?
 * false si la ventana 24h sigue abierta.
 */
export function shouldDebitChatbotSession(session, now = new Date()) {
  if (!session?.window_expires_at) return true
  const expires = Date.parse(String(session.window_expires_at))
  if (!Number.isFinite(expires)) return true
  return expires <= now.getTime()
}

export function nextChatbotWindowExpiresAt(now = new Date()) {
  return new Date(now.getTime() + CHATBOT_WINDOW_MS).toISOString()
}

/**
 * Gate del cron / webhook: suscripción paga + saldo.
 */
export function canSpendReminderCredit({ paidSubscription, remindersBalance }) {
  if (!paidSubscription) {
    return { ok: false, code: 'WHATSAPP_PAID_SUBSCRIPTION_REQUIRED' }
  }
  if (!(Number(remindersBalance) > 0)) {
    return { ok: false, code: 'REMINDERS_BALANCE_EMPTY' }
  }
  return { ok: true }
}

export function canOpenChatbotSession({
  paidSubscription,
  chatbotEnabled,
  chatbotSessionsBalance,
  existingSession,
  now = new Date(),
}) {
  if (!paidSubscription) {
    return { ok: false, code: 'WHATSAPP_PAID_SUBSCRIPTION_REQUIRED', debit: false }
  }
  if (!chatbotEnabled) {
    return { ok: false, code: 'CHATBOT_DISABLED', debit: false }
  }
  if (!shouldDebitChatbotSession(existingSession, now)) {
    return { ok: true, debit: false, reuseWindow: true }
  }
  if (!(Number(chatbotSessionsBalance) > 0)) {
    return { ok: false, code: 'CHATBOT_SESSIONS_BALANCE_EMPTY', debit: false }
  }
  return { ok: true, debit: true, reuseWindow: false }
}

export function templateBodyComponents(texts = []) {
  const parameters = (Array.isArray(texts) ? texts : [])
    .map((text) => String(text ?? '').trim())
    .filter(Boolean)
    .map((text) => ({ type: 'text', text: text.slice(0, 1024) }))
  if (!parameters.length) return []
  return [{ type: 'body', parameters }]
}
