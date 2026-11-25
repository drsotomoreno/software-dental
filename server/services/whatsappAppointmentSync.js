/**
 * Espejo Postgres de citas para recordatorios WhatsApp.
 * Se dispara desde clinical-sync; no altera botones wa.me manuales.
 */
import { clinicaUuidFromCanonical } from './clinicPatientMirror.js'
import { withPgClient } from './durableStore.js'
import { ensureWhatsappClinicSchema, isClinicUuid } from './whatsappClinicStore.js'
import {
  isNoShowStatus,
  isFutureAppointmentStatus,
  noShowInitialFollowup,
} from './whatsappRemindersLogic.js'
import { normalizeMetaRecipient } from './metaWhatsappClient.js'

function payloadOf(record) {
  if (!record || typeof record !== 'object') return null
  if (record.payload && typeof record.payload === 'object') return record.payload
  return record
}

export function appointmentFieldsFromSync(raw, clinicCanonical) {
  const payload = payloadOf(raw)
  if (!payload) return null
  const syncId = String(raw.syncId || payload.syncId || payload.id || '').trim()
  if (!syncId) return null

  const startTime = String(payload.startTime || payload.start_time || '').trim()
  const status = String(payload.status || 'programada').trim().toLowerCase()
  const patientPhone = normalizeMetaRecipient(
    payload.patientPhone || payload.patient_phone || payload.phone || '',
  )
  const patientName = String(payload.patientName || payload.patient_name || '').trim() || null
  const patientSyncId =
    String(payload.patientSyncId || payload.patientId || payload.patient_sync_id || '').trim() ||
    null
  const deletedAt = raw.deletedAt || payload.deletedAt || null

  return {
    syncId,
    clinicCanonical: String(clinicCanonical || raw.clinicId || payload.clinicId || '').trim(),
    startTime: startTime || null,
    status: deletedAt ? 'cancelada' : status,
    patientPhone: patientPhone || null,
    patientName,
    patientSyncId,
    deletedAt: deletedAt ? String(deletedAt) : null,
  }
}

/**
 * Resuelve UUID de clínica alineado al espejo de pacientes + clinic_canonical_id.
 */
export async function resolveClinicUuidFromSyncCanonical(canonical) {
  const key = String(canonical || '').trim()
  if (!key) return null
  await ensureWhatsappClinicSchema()

  const bare = key.startsWith('clinic:') ? key.slice('clinic:'.length) : key
  const canonicalId = key.startsWith('clinic:') ? key : `clinic:${bare}`
  const hashed = clinicaUuidFromCanonical(canonicalId)

  return withPgClient(async (client) => {
    const byCanonical = await client.query(
      `SELECT id FROM clinicas
        WHERE clinic_canonical_id = $1::text
           OR clinic_canonical_id = $2::text
        LIMIT 1`,
      [canonicalId, key],
    )
    if (byCanonical.rows[0]?.id) return String(byCanonical.rows[0].id)

    if (isClinicUuid(bare)) {
      await client.query(
        `INSERT INTO clinicas (id, nombre, clinic_canonical_id)
         VALUES ($1::uuid, $2::text, $3::text)
         ON CONFLICT (id) DO UPDATE SET
           clinic_canonical_id = COALESCE(clinicas.clinic_canonical_id, EXCLUDED.clinic_canonical_id)`,
        [bare, bare.slice(0, 255), canonicalId],
      )
      return bare
    }

    await client.query(
      `INSERT INTO clinicas (id, nombre, clinic_canonical_id)
       VALUES ($1::uuid, $2::text, $3::text)
       ON CONFLICT (id) DO UPDATE SET
         clinic_canonical_id = COALESCE(clinicas.clinic_canonical_id, EXCLUDED.clinic_canonical_id)`,
      [hashed, bare.slice(0, 255) || 'Clínica', canonicalId],
    )
    return hashed
  })
}

async function resolvePatientUuid(client, clinicId, patientSyncId) {
  if (!patientSyncId) return null
  const result = await client.query(
    `SELECT id FROM pacientes
      WHERE clinica_id::text = $1::text
        AND sync_id = $2::text
        AND deleted_at IS NULL
      LIMIT 1`,
    [String(clinicId), String(patientSyncId)],
  )
  return result.rows[0]?.id ? String(result.rows[0].id) : null
}

/**
 * Crea/reprograma cita futura: limpia reminders y marca follow-ups como scheduled.
 */
export async function upsertFutureAppointmentMirror(clinicId, fields) {
  await ensureWhatsappClinicSchema()
  return withPgClient(async (client) => {
    const patientId = await resolvePatientUuid(client, clinicId, fields.patientSyncId)
    const prev = await client.query(
      `SELECT id, start_time, status
         FROM appointments
        WHERE clinic_id::text = $1::text
          AND sync_id = $2::text
        LIMIT 1`,
      [String(clinicId), fields.syncId],
    )

    const previousStart = prev.rows[0]?.start_time
      ? new Date(prev.rows[0].start_time).toISOString()
      : null
    const rescheduled =
      Boolean(previousStart) &&
      fields.startTime &&
      previousStart !== new Date(fields.startTime).toISOString()
    const isNew = !prev.rows[0]
    const clearReminders = isNew || rescheduled || isFutureAppointmentStatus(fields.status)

    let appointmentId = prev.rows[0]?.id || null
    if (appointmentId) {
      const updated = await client.query(
        `UPDATE appointments SET
           patient_id = COALESCE($3::uuid, patient_id),
           patient_sync_id = COALESCE($4::text, patient_sync_id),
           patient_phone = COALESCE($5::text, patient_phone),
           patient_name = COALESCE($6::text, patient_name),
           start_time = $7::timestamptz,
           status = $8::text,
           reminder_48h_sent_at = CASE WHEN $9::boolean THEN NULL ELSE reminder_48h_sent_at END,
           reminder_24h_sent_at = CASE WHEN $9::boolean THEN NULL ELSE reminder_24h_sent_at END,
           confirmed_by_patient = CASE WHEN $9::boolean THEN FALSE ELSE confirmed_by_patient END,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $10::uuid
         RETURNING id`,
        [
          clinicId,
          fields.syncId,
          patientId,
          fields.patientSyncId,
          fields.patientPhone,
          fields.patientName,
          fields.startTime,
          fields.status,
          clearReminders,
          appointmentId,
        ],
      )
      appointmentId = updated.rows[0]?.id || appointmentId
    } else {
      const inserted = await client.query(
        `INSERT INTO appointments (
           clinic_id, sync_id, patient_id, patient_sync_id, patient_phone, patient_name,
           start_time, status, reminder_48h_sent_at, reminder_24h_sent_at,
           confirmed_by_patient, updated_at
         ) VALUES (
           $1::uuid, $2::text, $3::uuid, $4::text, $5::text, $6::text,
           $7::timestamptz, $8::text, NULL, NULL, FALSE, CURRENT_TIMESTAMP
         )
         RETURNING id`,
        [
          clinicId,
          fields.syncId,
          patientId,
          fields.patientSyncId,
          fields.patientPhone,
          fields.patientName,
          fields.startTime,
          fields.status,
        ],
      )
      appointmentId = inserted.rows[0]?.id || null
    }

    // Si el paciente reagenda, cierra follow-ups activos / pending_manual_call.
    if (fields.patientSyncId || fields.patientPhone || patientId) {
      await client.query(
        `UPDATE no_show_followups
            SET status = 'scheduled',
                updated_at = CURRENT_TIMESTAMP
          WHERE clinic_id::text = $1::text
            AND status IN ('active', 'pending_manual_call')
            AND (
              ($2::uuid IS NOT NULL AND patient_id = $2::uuid)
              OR ($3::text IS NOT NULL AND patient_id IN (
                    SELECT id FROM pacientes
                     WHERE clinica_id::text = $1::text
                       AND sync_id = $3::text
                  ))
            )`,
        [String(clinicId), patientId, fields.patientSyncId],
      )
    }

    return { ok: true, appointmentId, clearedReminders: clearReminders }
  })
}

/**
 * Cita marcada como inasistencia → follow-up step 1 a las +24h de la hora perdida.
 */
export async function markAppointmentNoShowMirror(clinicId, fields) {
  await ensureWhatsappClinicSchema()
  const initial = noShowInitialFollowup(fields.startTime || new Date().toISOString())

  return withPgClient(async (client) => {
    const patientId = await resolvePatientUuid(client, clinicId, fields.patientSyncId)
    const prev = await client.query(
      `SELECT id, patient_id FROM appointments
        WHERE clinic_id::text = $1::text AND sync_id = $2::text
        LIMIT 1`,
      [String(clinicId), fields.syncId],
    )

    let appointmentId = prev.rows[0]?.id || null
    let resolvedPatientId = prev.rows[0]?.patient_id || patientId

    if (appointmentId) {
      const updated = await client.query(
        `UPDATE appointments SET
           patient_id = COALESCE($3::uuid, patient_id),
           patient_sync_id = COALESCE($4::text, patient_sync_id),
           patient_phone = COALESCE($5::text, patient_phone),
           patient_name = COALESCE($6::text, patient_name),
           start_time = COALESCE($7::timestamptz, start_time),
           status = $8::text,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $9::uuid
         RETURNING id, patient_id`,
        [
          clinicId,
          fields.syncId,
          patientId,
          fields.patientSyncId,
          fields.patientPhone,
          fields.patientName,
          fields.startTime,
          fields.status || 'no_asistio',
          appointmentId,
        ],
      )
      appointmentId = updated.rows[0]?.id || appointmentId
      resolvedPatientId = updated.rows[0]?.patient_id || resolvedPatientId
    } else {
      const inserted = await client.query(
        `INSERT INTO appointments (
           clinic_id, sync_id, patient_id, patient_sync_id, patient_phone, patient_name,
           start_time, status, updated_at
         ) VALUES (
           $1::uuid, $2::text, $3::uuid, $4::text, $5::text, $6::text,
           $7::timestamptz, $8::text, CURRENT_TIMESTAMP
         )
         RETURNING id, patient_id`,
        [
          clinicId,
          fields.syncId,
          patientId,
          fields.patientSyncId,
          fields.patientPhone,
          fields.patientName,
          fields.startTime,
          fields.status || 'no_asistio',
        ],
      )
      appointmentId = inserted.rows[0]?.id
      resolvedPatientId = inserted.rows[0]?.patient_id || patientId
    }

    // Evita duplicar follow-ups activos para la misma cita perdida.
    const existing = await client.query(
      `SELECT id FROM no_show_followups
        WHERE clinic_id::text = $1::text
          AND missed_appointment_id = $2::uuid
          AND status IN ('active', 'pending_manual_call', 'scheduled')
        LIMIT 1`,
      [String(clinicId), appointmentId],
    )
    if (existing.rows[0]) {
      await client.query(
        `UPDATE no_show_followups
            SET status = 'active',
                step = 1,
                next_send_at = $3::timestamptz,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $2::uuid
            AND clinic_id::text = $1::text`,
        [String(clinicId), existing.rows[0].id, initial.next_send_at],
      )
      return { ok: true, appointmentId, followupId: existing.rows[0].id, reused: true }
    }

    const inserted = await client.query(
      `INSERT INTO no_show_followups (
         clinic_id, patient_id, missed_appointment_id, step, next_send_at, status
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4::int, $5::timestamptz, $6::text
       )
       RETURNING id`,
      [
        clinicId,
        resolvedPatientId,
        appointmentId,
        initial.step,
        initial.next_send_at,
        initial.status,
      ],
    )

    return { ok: true, appointmentId, followupId: inserted.rows[0]?.id, reused: false }
  })
}

/**
 * Punto de entrada desde clinical-sync push.
 * @param {string} clinicCanonical clinic:{tenantId}
 * @param {unknown[]} appointmentsRaw
 */
export async function syncAppointmentsFromClinicalPush(clinicCanonical, appointmentsRaw = []) {
  const list = Array.isArray(appointmentsRaw) ? appointmentsRaw : []
  if (!list.length) return { ok: true, processed: 0 }

  let clinicId
  try {
    clinicId = await resolveClinicUuidFromSyncCanonical(clinicCanonical)
  } catch (error) {
    console.warn(
      '[WhatsAppSync] No se pudo resolver clínica:',
      error instanceof Error ? error.message : error,
    )
    return { ok: false, processed: 0, error: 'clinic_resolve_failed' }
  }
  if (!clinicId) return { ok: false, processed: 0, error: 'clinic_missing' }

  let processed = 0
  for (const raw of list) {
    const fields = appointmentFieldsFromSync(raw, clinicCanonical)
    if (!fields || fields.deletedAt) continue
    try {
      if (isNoShowStatus(fields.status)) {
        await markAppointmentNoShowMirror(clinicId, fields)
      } else if (isFutureAppointmentStatus(fields.status)) {
        await upsertFutureAppointmentMirror(clinicId, fields)
      } else {
        // cancelada / completada: solo actualiza status en espejo si existe
        await ensureWhatsappClinicSchema()
        await withPgClient(async (client) => {
          await client.query(
            `UPDATE appointments
                SET status = $3::text,
                    updated_at = CURRENT_TIMESTAMP
              WHERE clinic_id::text = $1::text
                AND sync_id = $2::text`,
            [String(clinicId), fields.syncId, fields.status],
          )
        })
      }
      processed += 1
    } catch (error) {
      console.warn(
        '[WhatsAppSync] Cita no espejada',
        fields.syncId,
        error instanceof Error ? error.message : error,
      )
    }
  }
  return { ok: true, processed, clinicId }
}
