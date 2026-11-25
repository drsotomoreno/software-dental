/**
 * Chatbot híbrido WhatsApp: ventanas 24h, botones nativos y confirmación de citas.
 * No interfiere con enlaces wa.me manuales de la historia clínica.
 */
import { hasActivePaidSubscription } from '../../shared/whatsappPackages.js'
import { listAllSubscriptionUsers } from './subscriptionAuthStore.js'
import {
  normalizeMetaRecipient,
  sendInteractiveMessage,
  sendTextMessage,
} from './metaWhatsappClient.js'
import { withPgClient } from './durableStore.js'
import {
  canOpenChatbotSession,
  nextChatbotWindowExpiresAt,
  shouldDebitChatbotSession,
} from './whatsappRemindersLogic.js'
import {
  debitChatbotSessionCredit,
  ensureWhatsappClinicSchema,
} from './whatsappClinicStore.js'

export const BTN_CONFIRMAR_CITA = 'CONFIRMAR_CITA'
export const BTN_NO_CONTACTAR = 'NO_CONTACTAR'
export const BTN_AGENDAR = 'AGENDAR_CITA'
export const BTN_HORARIOS = 'HORARIOS_UBICACION'
export const BTN_PRECIOS = 'PRECIOS_SERVICIOS'

export async function getChatSession(clinicId, patientPhone) {
  const phone = normalizeMetaRecipient(patientPhone)
  if (!phone) return null
  await ensureWhatsappClinicSchema()
  return withPgClient(async (client) => {
    const result = await client.query(
      `SELECT id, clinic_id, patient_phone, window_expires_at, last_interaction_at
         FROM whatsapp_chat_sessions
        WHERE clinic_id::text = $1::text
          AND patient_phone = $2::text
        LIMIT 1`,
      [String(clinicId), phone],
    )
    return result.rows[0] || null
  })
}

export async function upsertChatSession(clinicId, patientPhone, { windowExpiresAt, now = new Date() } = {}) {
  const phone = normalizeMetaRecipient(patientPhone)
  await ensureWhatsappClinicSchema()
  const expires = windowExpiresAt || nextChatbotWindowExpiresAt(now)
  return withPgClient(async (client) => {
    const existing = await client.query(
      `SELECT id FROM whatsapp_chat_sessions
        WHERE clinic_id::text = $1::text AND patient_phone = $2::text
        LIMIT 1`,
      [String(clinicId), phone],
    )
    if (existing.rows[0]) {
      const updated = await client.query(
        `UPDATE whatsapp_chat_sessions
            SET window_expires_at = $3::timestamptz,
                last_interaction_at = $4::timestamptz
          WHERE id = $5::uuid
          RETURNING id, clinic_id, patient_phone, window_expires_at, last_interaction_at`,
        [String(clinicId), phone, expires, now.toISOString(), existing.rows[0].id],
      )
      return updated.rows[0]
    }
    const inserted = await client.query(
      `INSERT INTO whatsapp_chat_sessions (
         clinic_id, patient_phone, window_expires_at, last_interaction_at
       ) VALUES ($1::uuid, $2::text, $3::timestamptz, $4::timestamptz)
       RETURNING id, clinic_id, patient_phone, window_expires_at, last_interaction_at`,
      [clinicId, phone, expires, now.toISOString()],
    )
    return inserted.rows[0]
  })
}

export async function touchChatSession(clinicId, patientPhone, now = new Date()) {
  const phone = normalizeMetaRecipient(patientPhone)
  await ensureWhatsappClinicSchema()
  return withPgClient(async (client) => {
    const result = await client.query(
      `UPDATE whatsapp_chat_sessions
          SET last_interaction_at = $3::timestamptz
        WHERE clinic_id::text = $1::text
          AND patient_phone = $2::text
        RETURNING id, window_expires_at`,
      [String(clinicId), phone, now.toISOString()],
    )
    return result.rows[0] || null
  })
}

/**
 * Abre o reutiliza ventana 24h. Descuenta 1 crédito solo al abrir ventana nueva.
 */
export async function ensureChatbotWindow({
  clinicRow,
  patientPhone,
  paidSubscription,
  now = new Date(),
}) {
  const session = await getChatSession(clinicRow.id, patientPhone)
  const gate = canOpenChatbotSession({
    paidSubscription,
    chatbotEnabled: clinicRow.chatbot_enabled === true,
    chatbotSessionsBalance: clinicRow.chatbot_sessions_balance,
    existingSession: session,
    now,
  })

  if (!gate.ok) {
    return { ok: false, code: gate.code, session }
  }

  if (gate.reuseWindow) {
    await touchChatSession(clinicRow.id, patientPhone, now)
    return { ok: true, debit: false, reuseWindow: true, session }
  }

  const debit = await debitChatbotSessionCredit(clinicRow.id)
  if (!debit.ok) {
    return { ok: false, code: debit.code, session }
  }

  const next = await upsertChatSession(clinicRow.id, patientPhone, {
    windowExpiresAt: nextChatbotWindowExpiresAt(now),
    now,
  })
  return {
    ok: true,
    debit: true,
    reuseWindow: false,
    session: next,
    chatbot_sessions_balance: debit.chatbot_sessions_balance,
  }
}

export async function confirmNextAppointment(clinicId, patientPhone, now = new Date()) {
  const phone = normalizeMetaRecipient(patientPhone)
  await ensureWhatsappClinicSchema()
  return withPgClient(async (client) => {
    const result = await client.query(
      `UPDATE appointments
          SET confirmed_by_patient = TRUE,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = (
          SELECT id FROM appointments
           WHERE clinic_id::text = $1::text
             AND patient_phone = $2::text
             AND start_time >= $3::timestamptz
             AND lower(COALESCE(status, 'programada')) NOT IN
                 ('cancelada', 'cancelled', 'completada', 'completed', 'no_asistio', 'no_show')
           ORDER BY start_time ASC
           LIMIT 1
        )
        RETURNING id, start_time, patient_name, sync_id`,
      [String(clinicId), phone, now.toISOString()],
    )
    return result.rows[0] || null
  })
}

export async function optOutNoShowFollowups(clinicId, patientPhone) {
  const phone = normalizeMetaRecipient(patientPhone)
  await ensureWhatsappClinicSchema()
  return withPgClient(async (client) => {
    const result = await client.query(
      `UPDATE no_show_followups f
          SET status = 'opted_out',
              updated_at = CURRENT_TIMESTAMP
         FROM appointments a
        WHERE f.clinic_id::text = $1::text
          AND f.status IN ('active', 'pending_manual_call', 'scheduled')
          AND (
            f.missed_appointment_id = a.id
            OR f.patient_id = a.patient_id
          )
          AND a.clinic_id::text = $1::text
          AND a.patient_phone = $2::text
        RETURNING f.id`,
      [String(clinicId), phone],
    )
    // También por patient_id directo si no hay join.
    await client.query(
      `UPDATE no_show_followups
          SET status = 'opted_out',
              updated_at = CURRENT_TIMESTAMP
        WHERE clinic_id::text = $1::text
          AND status IN ('active', 'pending_manual_call')
          AND patient_id IN (
            SELECT patient_id FROM appointments
             WHERE clinic_id::text = $1::text
               AND patient_phone = $2::text
               AND patient_id IS NOT NULL
          )`,
      [String(clinicId), phone],
    )
    return { ok: true, updated: result.rowCount || 0 }
  })
}

export async function closeActiveFollowupsForPhone(clinicId, patientPhone) {
  const phone = normalizeMetaRecipient(patientPhone)
  await ensureWhatsappClinicSchema()
  return withPgClient(async (client) => {
    const result = await client.query(
      `UPDATE no_show_followups
          SET status = 'scheduled',
              updated_at = CURRENT_TIMESTAMP
        WHERE clinic_id::text = $1::text
          AND status IN ('active', 'pending_manual_call')
          AND (
            patient_id IN (
              SELECT patient_id FROM appointments
               WHERE clinic_id::text = $1::text
                 AND patient_phone = $2::text
                 AND patient_id IS NOT NULL
            )
            OR missed_appointment_id IN (
              SELECT id FROM appointments
               WHERE clinic_id::text = $1::text
                 AND patient_phone = $2::text
            )
          )
        RETURNING id`,
      [String(clinicId), phone],
    )
    return { ok: true, closed: result.rowCount || 0 }
  })
}

/**
 * Disponibilidad simple: próximos huecos libres mañana–7 días (09:00–12:00 / 14:00–17:00 Bogotá).
 */
export async function suggestAvailabilitySlots(clinicId, now = new Date()) {
  await ensureWhatsappClinicSchema()
  const busy = await withPgClient(async (client) => {
    const result = await client.query(
      `SELECT start_time FROM appointments
        WHERE clinic_id::text = $1::text
          AND start_time > $2::timestamptz
          AND start_time < ($2::timestamptz + INTERVAL '8 days')
          AND lower(COALESCE(status, 'programada')) NOT IN
              ('cancelada', 'cancelled', 'no_asistio', 'no_show')
        ORDER BY start_time ASC
        LIMIT 200`,
      [String(clinicId), now.toISOString()],
    )
    return new Set(
      result.rows.map((row) => {
        const d = new Date(row.start_time)
        return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`
      }),
    )
  })

  const slots = []
  for (let day = 1; day <= 7 && slots.length < 3; day += 1) {
    const base = new Date(now.getTime() + day * 24 * 60 * 60 * 1000)
    const dayKey = base.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    for (const hour of [9, 10, 11, 14, 15, 16]) {
      const candidate = new Date(
        `${dayKey}T${String(hour).padStart(2, '0')}:00:00-05:00`,
      )
      if (!(candidate.getTime() > now.getTime())) continue
      const key = `${candidate.getUTCFullYear()}-${candidate.getUTCMonth()}-${candidate.getUTCDate()}-${candidate.getUTCHours()}`
      if (busy.has(key)) continue
      slots.push(
        candidate.toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
      )
      if (slots.length >= 3) break
    }
  }
  return slots
}

export function mainMenuInteractive(clinicName) {
  const name = String(clinicName || 'nuestra clínica').slice(0, 60)
  return {
    type: 'button',
    body: {
      text: `Hola, soy el asistente de ${name}. ¿En qué podemos ayudarle?`,
    },
    action: {
      buttons: [
        { type: 'reply', reply: { id: BTN_AGENDAR, title: 'Agendar cita' } },
        { type: 'reply', reply: { id: BTN_HORARIOS, title: 'Horarios y ubicación' } },
        { type: 'reply', reply: { id: BTN_PRECIOS, title: 'Precios y servicios' } },
      ],
    },
  }
}

export async function resolveClinicPaidFlag(clinicRow) {
  const users = await listAllSubscriptionUsers().catch(() => [])
  const clinicId = String(clinicRow?.id || '')
  const canonical = String(clinicRow?.clinic_canonical_id || '')
  const bare = canonical.startsWith('clinic:') ? canonical.slice('clinic:'.length) : canonical
  for (const user of users) {
    const ownerId = String(user.clinicId || user.id || '')
    if (ownerId === clinicId || ownerId === bare || String(user.id) === clinicId) {
      return hasActivePaidSubscription(user)
    }
  }
  return false
}

/**
 * Responde a un botón o texto entrante del chatbot.
 */
export async function handleChatbotInbound({
  clinicRow,
  patientPhone,
  buttonId,
  textBody,
  now = new Date(),
}) {
  const paid = await resolveClinicPaidFlag(clinicRow)
  const windowGate = await ensureChatbotWindow({
    clinicRow,
    patientPhone,
    paidSubscription: paid,
    now,
  })

  if (!windowGate.ok) {
    return {
      ok: false,
      code: windowGate.code,
      replied: false,
      reason:
        windowGate.code === 'CHATBOT_SESSIONS_BALANCE_EMPTY'
          ? 'Sin saldo de sesiones de chatbot; no se envía respuesta automática.'
          : windowGate.code,
    }
  }

  const id = String(buttonId || '').trim().toUpperCase()
  const text = String(textBody || '').trim().toLowerCase()

  if (id === BTN_AGENDAR || /agendar|cita|turno/.test(text)) {
    const slots = await suggestAvailabilitySlots(clinicRow.id, now)
    await closeActiveFollowupsForPhone(clinicRow.id, patientPhone)
    const body =
      slots.length > 0
        ? `Tenemos disponibilidad aproximada:\n• ${slots.join('\n• ')}\n\nResponda con el horario preferido o llame a la clínica para confirmar.`
        : 'Por ahora no detectamos huecos libres en la agenda espejo. Un asesor le contactará para agendar.'
    await sendTextMessage({ clinicId: clinicRow.id, toPhone: patientPhone, body })
    return { ok: true, replied: true, action: 'agendar', slots }
  }

  if (id === BTN_HORARIOS || /horario|ubicaci[oó]n|direcci[oó]n/.test(text)) {
    const address = String(clinicRow.direccion || '').trim() || 'Consulte la dirección con recepción.'
    const body = `Horario de atención habitual: lunes a viernes 8:00–12:00 y 14:00–18:00 (hora Colombia).\nUbicación: ${address}\nClínica: ${clinicRow.nombre || 'mihistoriadental'}.`
    await sendTextMessage({ clinicId: clinicRow.id, toPhone: patientPhone, body })
    return { ok: true, replied: true, action: 'horarios' }
  }

  if (id === BTN_PRECIOS || /precio|tarifa|servicio|costo/.test(text)) {
    await sendTextMessage({
      clinicId: clinicRow.id,
      toPhone: patientPhone,
      body:
        'Los valores dependen del plan de tratamiento. Podemos enviarle un presupuesto personalizado tras valoración. ¿Desea agendar una valoración?',
    })
    return { ok: true, replied: true, action: 'precios' }
  }

  // Menú por defecto
  await sendInteractiveMessage({
    clinicId: clinicRow.id,
    toPhone: patientPhone,
    interactivePayload: mainMenuInteractive(clinicRow.nombre),
  })
  return { ok: true, replied: true, action: 'menu', debit: windowGate.debit === true }
}

export { shouldDebitChatbotSession, canOpenChatbotSession }
