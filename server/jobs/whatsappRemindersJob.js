/**
 * Cron cada 15 minutos: recordatorios 48h / 23h45m e inasistencias (máx. 2 intentos).
 * No toca los envíos manuales wa.me de la historia clínica.
 */
import { hasActivePaidSubscription } from '../../shared/whatsappPackages.js'
import { listAllSubscriptionUsers } from '../services/subscriptionAuthStore.js'
import {
  sendTemplateMessage,
} from '../services/metaWhatsappClient.js'
import { withPgClient } from '../services/durableStore.js'
import {
  canSpendReminderCredit,
  isEligibleFor24hReminder,
  isEligibleFor48hReminder,
  nextNoShowFollowupAfterSend,
  TEMPLATE_CITA_24H,
  TEMPLATE_CITA_48H,
  TEMPLATE_NO_SHOW_D1,
  TEMPLATE_NO_SHOW_WEEK,
  templateBodyComponents,
} from '../services/whatsappRemindersLogic.js'
import {
  debitReminderCredit,
  ensureWhatsappClinicSchema,
  listClinicsWithReminderBalance,
} from '../services/whatsappClinicStore.js'

const INTERVAL_MS = 15 * 60 * 1000
const LOG = '[WhatsAppReminders]'
let timer = null
let running = false

function cronEnabled() {
  const raw = String(process.env.WHATSAPP_REMINDERS_CRON ?? 'true').trim().toLowerCase()
  return raw !== '0' && raw !== 'false' && raw !== 'off'
}

function bareTenantId(canonical) {
  const key = String(canonical || '').trim()
  if (key.startsWith('clinic:')) return key.slice('clinic:'.length)
  return key
}

/**
 * ¿La clínica tiene titular con suscripción paga activa?
 */
export async function clinicHasPaidSubscription(clinicRow, users = null) {
  const list = Array.isArray(users) ? users : await listAllSubscriptionUsers()
  const clinicId = String(clinicRow?.id || '')
  const canonical = String(clinicRow?.clinic_canonical_id || '')
  const bare = bareTenantId(canonical) || clinicId

  for (const user of list) {
    const ownerId = String(user.clinicId || user.id || '')
    const isTitular = String(user.id) === ownerId
    if (!isTitular) continue
    const matches =
      ownerId === clinicId ||
      ownerId === bare ||
      `clinic:${ownerId}` === canonical ||
      String(user.id) === clinicId
    if (!matches) continue
    if (hasActivePaidSubscription(user)) return true
  }

  // Superadmin / clínicas sin usuario espejo: no gastar créditos automáticamente.
  return false
}

function formatAppointmentWhen(startTime) {
  try {
    return new Date(startTime).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return String(startTime || '')
  }
}

async function loadDue48h(clinicId, now) {
  return withPgClient(async (client) => {
    const result = await client.query(
      `SELECT id, clinic_id, sync_id, patient_phone, patient_name, start_time, status,
              reminder_48h_sent_at, reminder_24h_sent_at, confirmed_by_patient
         FROM appointments
        WHERE clinic_id::text = $1::text
          AND reminder_48h_sent_at IS NULL
          AND confirmed_by_patient = FALSE
          AND start_time > $2::timestamptz
          AND start_time <= ($2::timestamptz + INTERVAL '48 hours')
          AND lower(COALESCE(status, 'programada')) NOT IN
              ('cancelada', 'cancelled', 'completada', 'completed', 'no_asistio', 'no_show')
          AND patient_phone IS NOT NULL
          AND btrim(patient_phone) <> ''
        ORDER BY start_time ASC
        LIMIT 50`,
      [String(clinicId), now.toISOString()],
    )
    return result.rows.filter((row) => isEligibleFor48hReminder(row, now))
  })
}

async function loadDue24h(clinicId, now) {
  return withPgClient(async (client) => {
    const result = await client.query(
      `SELECT id, clinic_id, sync_id, patient_phone, patient_name, start_time, status,
              reminder_48h_sent_at, reminder_24h_sent_at, confirmed_by_patient
         FROM appointments
        WHERE clinic_id::text = $1::text
          AND reminder_48h_sent_at IS NOT NULL
          AND reminder_48h_sent_at <= ($2::timestamptz - INTERVAL '23 hours 45 minutes')
          AND reminder_24h_sent_at IS NULL
          AND confirmed_by_patient = FALSE
          AND start_time > $2::timestamptz
          AND lower(COALESCE(status, 'programada')) NOT IN
              ('cancelada', 'cancelled', 'completada', 'completed', 'no_asistio', 'no_show')
          AND patient_phone IS NOT NULL
          AND btrim(patient_phone) <> ''
        ORDER BY reminder_48h_sent_at ASC
        LIMIT 50`,
      [String(clinicId), now.toISOString()],
    )
    return result.rows.filter((row) => isEligibleFor24hReminder(row, now))
  })
}

async function loadDueNoShows(clinicId, now) {
  return withPgClient(async (client) => {
    const result = await client.query(
      `SELECT f.id, f.clinic_id, f.patient_id, f.missed_appointment_id, f.step,
              f.next_send_at, f.status,
              a.patient_phone, a.patient_name, a.start_time, a.patient_sync_id
         FROM no_show_followups f
         LEFT JOIN appointments a ON a.id = f.missed_appointment_id
        WHERE f.clinic_id::text = $1::text
          AND f.status = 'active'
          AND f.next_send_at <= $2::timestamptz
        ORDER BY f.next_send_at ASC
        LIMIT 50`,
      [String(clinicId), now.toISOString()],
    )
    return result.rows
  })
}

async function patientHasFutureAppointment(clinicId, { patientId, patientSyncId }, now) {
  return withPgClient(async (client) => {
    const result = await client.query(
      `SELECT id FROM appointments
        WHERE clinic_id::text = $1::text
          AND start_time > $2::timestamptz
          AND lower(COALESCE(status, 'programada')) IN
              ('programada', 'confirmada', 'en_atencion', 'scheduled', 'confirmed')
          AND (
            ($3::uuid IS NOT NULL AND patient_id = $3::uuid)
            OR ($4::text IS NOT NULL AND patient_sync_id = $4::text)
          )
        LIMIT 1`,
      [String(clinicId), now.toISOString(), patientId || null, patientSyncId || null],
    )
    return Boolean(result.rows[0])
  })
}

async function markReminderSent(appointmentId, which, now) {
  const col = which === '48h' ? 'reminder_48h_sent_at' : 'reminder_24h_sent_at'
  await withPgClient(async (client) => {
    await client.query(
      `UPDATE appointments
          SET ${col} = $2::timestamptz,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid`,
      [appointmentId, now.toISOString()],
    )
  })
}

async function applyNoShowTransition(followupId, clinicId, patch) {
  await withPgClient(async (client) => {
    await client.query(
      `UPDATE no_show_followups
          SET step = $3::int,
              status = $4::text,
              next_send_at = $5::timestamptz,
              last_attempt_at = $6::timestamptz,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
          AND clinic_id::text = $2::text`,
      [
        followupId,
        String(clinicId),
        patch.step,
        patch.status,
        patch.next_send_at,
        patch.last_attempt_at,
      ],
    )
  })
}

async function markFollowupScheduled(followupId, clinicId) {
  await withPgClient(async (client) => {
    await client.query(
      `UPDATE no_show_followups
          SET status = 'scheduled',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
          AND clinic_id::text = $2::text`,
      [followupId, String(clinicId)],
    )
  })
}

async function sendAndDebit({
  clinicId,
  toPhone,
  templateName,
  components,
  paid,
  balance,
}) {
  const gate = canSpendReminderCredit({
    paidSubscription: paid,
    remindersBalance: balance,
  })
  if (!gate.ok) return { ok: false, code: gate.code }

  const debit = await debitReminderCredit(clinicId)
  if (!debit.ok) return { ok: false, code: debit.code }

  const sent = await sendTemplateMessage({
    clinicId,
    toPhone,
    templateName,
    languageCode: 'es',
    components,
  })

  if (!sent.ok && !sent.dryRun) {
    // Reembolso best-effort si Meta falló de verdad.
    await withPgClient(async (client) => {
      await client.query(
        `UPDATE clinicas
            SET reminders_balance = reminders_balance + 1
          WHERE id::text = $1::text`,
        [String(clinicId)],
      )
    }).catch(() => undefined)
    return { ok: false, code: 'SEND_FAILED', error: sent.error }
  }

  return { ok: true, dryRun: sent.dryRun === true, reminders_balance: debit.reminders_balance }
}

/**
 * Procesa una clínica (exportado para tests / disparo manual).
 */
export async function processClinicReminders(clinicRow, { now = new Date(), users = null } = {}) {
  const summary = {
    clinicId: clinicRow.id,
    sent48h: 0,
    sent24h: 0,
    noShowSent: 0,
    noShowPendingCall: 0,
    skipped: 0,
  }

  const paid = await clinicHasPaidSubscription(clinicRow, users)
  let balance = Number(clinicRow.reminders_balance) || 0
  if (!paid || balance <= 0) {
    summary.skipped += 1
    return summary
  }

  const due48 = await loadDue48h(clinicRow.id, now)
  for (const appt of due48) {
    if (balance <= 0) break
    const result = await sendAndDebit({
      clinicId: clinicRow.id,
      toPhone: appt.patient_phone,
      templateName: TEMPLATE_CITA_48H,
      components: templateBodyComponents([
        appt.patient_name || 'paciente',
        formatAppointmentWhen(appt.start_time),
      ]),
      paid,
      balance,
    })
    if (!result.ok) {
      summary.skipped += 1
      if (result.code === 'REMINDERS_BALANCE_EMPTY') break
      continue
    }
    await markReminderSent(appt.id, '48h', now)
    balance = result.reminders_balance
    summary.sent48h += 1
  }

  const due24 = await loadDue24h(clinicRow.id, now)
  for (const appt of due24) {
    if (balance <= 0) break
    const result = await sendAndDebit({
      clinicId: clinicRow.id,
      toPhone: appt.patient_phone,
      templateName: TEMPLATE_CITA_24H,
      components: templateBodyComponents([
        appt.patient_name || 'paciente',
        formatAppointmentWhen(appt.start_time),
      ]),
      paid,
      balance,
    })
    if (!result.ok) {
      summary.skipped += 1
      if (result.code === 'REMINDERS_BALANCE_EMPTY') break
      continue
    }
    await markReminderSent(appt.id, '24h', now)
    balance = result.reminders_balance
    summary.sent24h += 1
  }

  const dueNoShows = await loadDueNoShows(clinicRow.id, now)
  for (const followup of dueNoShows) {
    if (balance <= 0) break

    const hasFuture = await patientHasFutureAppointment(
      clinicRow.id,
      {
        patientId: followup.patient_id,
        patientSyncId: followup.patient_sync_id,
      },
      now,
    )
    if (hasFuture) {
      await markFollowupScheduled(followup.id, clinicRow.id)
      summary.skipped += 1
      continue
    }

    if (!followup.patient_phone) {
      summary.skipped += 1
      continue
    }

    const step = Number(followup.step) || 1
    const templateName = step <= 1 ? TEMPLATE_NO_SHOW_D1 : TEMPLATE_NO_SHOW_WEEK
    const result = await sendAndDebit({
      clinicId: clinicRow.id,
      toPhone: followup.patient_phone,
      templateName,
      components: templateBodyComponents([
        followup.patient_name || 'paciente',
        formatAppointmentWhen(followup.start_time),
      ]),
      paid,
      balance,
    })
    if (!result.ok) {
      summary.skipped += 1
      if (result.code === 'REMINDERS_BALANCE_EMPTY') break
      continue
    }

    const patch = nextNoShowFollowupAfterSend(step, now)
    await applyNoShowTransition(followup.id, clinicRow.id, patch)
    balance = result.reminders_balance
    summary.noShowSent += 1
    if (patch.status === 'pending_manual_call') summary.noShowPendingCall += 1
  }

  return summary
}

export async function runWhatsappRemindersJob(reason = 'manual') {
  if (running) {
    return { ok: true, skipped: true, reason: 'already_running' }
  }
  running = true
  const started = Date.now()
  console.log(LOG, `Inicio (${reason})`)
  try {
    await ensureWhatsappClinicSchema()
    const users = await listAllSubscriptionUsers().catch(() => [])
    const clinics = await listClinicsWithReminderBalance()
    const results = []
    for (const clinic of clinics) {
      try {
        results.push(await processClinicReminders(clinic, { users, now: new Date() }))
      } catch (error) {
        console.error(LOG, 'clínica', clinic.id, error instanceof Error ? error.message : error)
      }
    }
    const totals = results.reduce(
      (acc, row) => {
        acc.sent48h += row.sent48h
        acc.sent24h += row.sent24h
        acc.noShowSent += row.noShowSent
        acc.noShowPendingCall += row.noShowPendingCall
        return acc
      },
      { sent48h: 0, sent24h: 0, noShowSent: 0, noShowPendingCall: 0 },
    )
    console.log(LOG, `Fin ${Date.now() - started}ms`, totals)
    return { ok: true, clinics: results.length, ...totals }
  } catch (error) {
    console.error(LOG, 'Falló el ciclo:', error instanceof Error ? error.message : error)
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    running = false
  }
}

function armTimer() {
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    void runWhatsappRemindersJob('cron')
  }, INTERVAL_MS)
  if (typeof timer.unref === 'function') timer.unref()
}

export async function startWhatsappRemindersCron() {
  if (!cronEnabled()) {
    console.log(LOG, 'Cron desactivado (WHATSAPP_REMINDERS_CRON=false)')
    return { enabled: false }
  }
  armTimer()
  void runWhatsappRemindersJob('startup').catch((error) => {
    console.error(LOG, 'Catch-up inicial falló:', error instanceof Error ? error.message : error)
  })
  console.log(LOG, `Cron activo cada ${INTERVAL_MS / 60000} min`)
  return { enabled: true, intervalMs: INTERVAL_MS }
}
