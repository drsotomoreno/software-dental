/**
 * Persistencia del módulo WhatsApp / Chatbot por clínica (Postgres).
 * Credenciales Meta cifradas; saldos y follow-ups de inasistencia.
 */
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  creditsForWhatsappPackage,
  getWhatsappPackageById,
  whatsappSubscriptionSnapshot,
  WHATSAPP_PACKAGES,
} from '../../shared/whatsappPackages.js'
import { encryptSecret } from '../utils/tokenEncryption.js'
import { withPgClient } from './durableStore.js'
import { splitSqlStatements } from './consultasRepository.js'
import { syncAuthUserToTenantTables } from './tenantRbacStore.js'

const DIR = dirname(fileURLToPath(import.meta.url))
const MIGRATION_FILE = join(DIR, '../db/migrations/20261124180000_whatsapp_chatbot_module.sql')

const NO_SHOW_STATUSES = new Set([
  'active',
  'pending_manual_call',
  'scheduled',
  'opted_out',
  'archived',
])

let schemaReady = null

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? ''),
  )
}

export async function ensureWhatsappClinicSchema() {
  if (!schemaReady) {
    schemaReady = withPgClient(async (client) => {
      const sql = await readFile(MIGRATION_FILE, 'utf8')
      for (const statement of splitSqlStatements(sql)) {
        await client.query(statement)
      }
      // Columnas operativas del motor de envíos (idempotentes).
      await client.query(
        `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_phone VARCHAR(32)`,
      )
      await client.query(
        `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_name VARCHAR(255)`,
      )
      await client.query(
        `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_sync_id TEXT`,
      )
    }).catch((error) => {
      schemaReady = null
      throw error
    })
  }
  return schemaReady
}

/**
 * Asegura fila en `clinicas` y devuelve UUID del tenant.
 * @param {object} user sesión (titular o colaborador)
 */
export async function resolveClinicUuid(user) {
  if (!user) return null
  const ownerId = String(user.clinicId || user.clinica_id || user.id || '').trim()
  if (isUuid(ownerId)) {
    await ensureWhatsappClinicSchema()
    await withPgClient(async (client) => {
      await client.query(
        `INSERT INTO clinicas (id, nombre)
         VALUES ($1::uuid, $2::text)
         ON CONFLICT (id) DO NOTHING`,
        [
          ownerId,
          String(user.clinicName || user.nombre || 'Clínica').trim() || 'Clínica',
        ],
      )
    })
    return ownerId
  }

  const synced = await syncAuthUserToTenantTables(user)
  if (synced?.clinicaId && isUuid(synced.clinicaId)) return synced.clinicaId

  if (user.email) {
    await ensureWhatsappClinicSchema()
    const row = await withPgClient(async (client) => {
      const result = await client.query(
        `SELECT clinica_id FROM usuarios WHERE lower(email) = lower($1::text) LIMIT 1`,
        [String(user.email)],
      )
      return result.rows[0] || null
    })
    if (row?.clinica_id) return String(row.clinica_id)
  }

  return null
}

function publicClinicWhatsapp(row) {
  if (!row) {
    return {
      whatsapp_connected: false,
      whatsapp_phone_number_id: null,
      whatsapp_waba_id: null,
      has_access_token: false,
      reminders_balance: 0,
      chatbot_sessions_balance: 0,
      chatbot_enabled: false,
    }
  }
  return {
    whatsapp_connected: row.whatsapp_connected === true,
    whatsapp_phone_number_id: row.whatsapp_phone_number_id || null,
    whatsapp_waba_id: row.whatsapp_waba_id || null,
    has_access_token: Boolean(row.whatsapp_access_token),
    reminders_balance: Number(row.reminders_balance) || 0,
    chatbot_sessions_balance: Number(row.chatbot_sessions_balance) || 0,
    chatbot_enabled: row.chatbot_enabled === true,
  }
}

export async function getClinicWhatsappRow(clinicId) {
  await ensureWhatsappClinicSchema()
  return withPgClient(async (client) => {
    const result = await client.query(
      `SELECT id,
              whatsapp_phone_number_id,
              whatsapp_waba_id,
              whatsapp_access_token,
              whatsapp_connected,
              reminders_balance,
              chatbot_sessions_balance,
              chatbot_enabled
         FROM clinicas
        WHERE id::text = $1::text
        LIMIT 1`,
      [String(clinicId)],
    )
    return result.rows[0] || null
  })
}

export async function countPendingManualCalls(clinicId) {
  await ensureWhatsappClinicSchema()
  return withPgClient(async (client) => {
    const result = await client.query(
      `SELECT COUNT(*)::int AS total
         FROM no_show_followups
        WHERE clinic_id::text = $1::text
          AND status = 'pending_manual_call'`,
      [String(clinicId)],
    )
    return Number(result.rows[0]?.total) || 0
  })
}

export async function getWhatsappStatusForUser(user) {
  const clinicId = await resolveClinicUuid(user)
  if (!clinicId) {
    return {
      ok: false,
      status: 404,
      error: 'No se encontró la clínica asociada a la sesión.',
    }
  }

  const [row, pendingManualCall] = await Promise.all([
    getClinicWhatsappRow(clinicId),
    countPendingManualCalls(clinicId),
  ])

  return {
    ok: true,
    clinic_id: clinicId,
    ...publicClinicWhatsapp(row),
    pending_manual_call: pendingManualCall,
    subscription: whatsappSubscriptionSnapshot(user),
    packages: WHATSAPP_PACKAGES,
  }
}

/**
 * Acredita un paquete tras pago Bold APPROVED (idempotente por payment_reference).
 */
export async function creditWhatsappPurchase({
  clinicId,
  packageId,
  paymentReference,
  amountCop,
} = {}) {
  const pack = getWhatsappPackageById(packageId)
  if (!pack) {
    return { ok: false, status: 400, error: 'Paquete WhatsApp inválido.' }
  }
  if (!clinicId || !isUuid(clinicId)) {
    return { ok: false, status: 400, error: 'clinic_id inválido.' }
  }

  const credits = creditsForWhatsappPackage(pack)
  const reference =
    String(paymentReference || '').trim() || `WA-${pack.id}-${Date.now()}-${randomUUID().slice(0, 8)}`
  const amount = Math.round(Number(amountCop ?? pack.amountCOP) || pack.amountCOP)

  await ensureWhatsappClinicSchema()

  return withPgClient(async (client) => {
    await client.query('BEGIN')
    try {
      const existing = await client.query(
        `SELECT id, credits_added, type
           FROM whatsapp_purchases
          WHERE payment_reference = $1::text
          LIMIT 1`,
        [reference],
      )
      if (existing.rows[0]) {
        const balances = await client.query(
          `SELECT reminders_balance, chatbot_sessions_balance
             FROM clinicas WHERE id::text = $1::text LIMIT 1`,
          [String(clinicId)],
        )
        await client.query('ROLLBACK')
        return {
          ok: true,
          duplicate: true,
          purchase_id: existing.rows[0].id,
          credits_added: Number(existing.rows[0].credits_added) || credits,
          type: existing.rows[0].type,
          reminders_balance: Number(balances.rows[0]?.reminders_balance) || 0,
          chatbot_sessions_balance: Number(balances.rows[0]?.chatbot_sessions_balance) || 0,
        }
      }

      const balanceCol =
        pack.type === 'chatbot' ? 'chatbot_sessions_balance' : 'reminders_balance'

      const updated = await client.query(
        `UPDATE clinicas
            SET ${balanceCol} = COALESCE(${balanceCol}, 0) + $2::int
          WHERE id::text = $1::text
          RETURNING reminders_balance, chatbot_sessions_balance`,
        [String(clinicId), credits],
      )
      if (!updated.rows[0]) {
        await client.query('ROLLBACK')
        return { ok: false, status: 404, error: 'Clínica no encontrada para acreditar créditos.' }
      }

      const inserted = await client.query(
        `INSERT INTO whatsapp_purchases (
           id, clinic_id, package_id, package_name, type,
           credits_added, amount_cop, payment_reference
         ) VALUES (
           $1::uuid, $2::uuid, $3::text, $4::text, $5::text,
           $6::int, $7::int, $8::text
         )
         RETURNING id, created_at`,
        [
          randomUUID(),
          clinicId,
          pack.id,
          pack.name,
          pack.type,
          credits,
          amount,
          reference,
        ],
      )

      await client.query('COMMIT')
      return {
        ok: true,
        duplicate: false,
        purchase_id: inserted.rows[0].id,
        package_id: pack.id,
        type: pack.type,
        credits_added: credits,
        payment_reference: reference,
        reminders_balance: Number(updated.rows[0].reminders_balance) || 0,
        chatbot_sessions_balance: Number(updated.rows[0].chatbot_sessions_balance) || 0,
        created_at: inserted.rows[0].created_at,
      }
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw error
    }
  })
}

/** Actualiza credenciales Meta (token siempre cifrado). */
export async function updateClinicWhatsappCredentials(
  clinicId,
  { phoneNumberId, wabaId, accessToken, connected, chatbotEnabled } = {},
) {
  await ensureWhatsappClinicSchema()
  const tokenEnc =
    accessToken != null && String(accessToken).trim()
      ? encryptSecret(String(accessToken).trim())
      : undefined

  return withPgClient(async (client) => {
    const result = await client.query(
      `UPDATE clinicas SET
         whatsapp_phone_number_id = COALESCE($2::text, whatsapp_phone_number_id),
         whatsapp_waba_id = COALESCE($3::text, whatsapp_waba_id),
         whatsapp_access_token = COALESCE($4::text, whatsapp_access_token),
         whatsapp_connected = COALESCE($5::boolean, whatsapp_connected),
         chatbot_enabled = COALESCE($6::boolean, chatbot_enabled)
       WHERE id::text = $1::text
       RETURNING id, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token,
                 whatsapp_connected, reminders_balance, chatbot_sessions_balance, chatbot_enabled`,
      [
        String(clinicId),
        phoneNumberId != null ? String(phoneNumberId).trim() || null : null,
        wabaId != null ? String(wabaId).trim() || null : null,
        tokenEnc ?? null,
        typeof connected === 'boolean' ? connected : null,
        typeof chatbotEnabled === 'boolean' ? chatbotEnabled : null,
      ],
    )
    return publicClinicWhatsapp(result.rows[0] || null)
  })
}

export async function listNoShowFollowups(clinicId, { status } = {}) {
  await ensureWhatsappClinicSchema()
  return withPgClient(async (client) => {
    const params = [String(clinicId)]
    let filter = ''
    if (status && NO_SHOW_STATUSES.has(String(status))) {
      params.push(String(status))
      filter = ` AND status = $${params.length}::text`
    } else {
      filter = ` AND status IN ('active', 'pending_manual_call', 'scheduled')`
    }

    const result = await client.query(
      `SELECT f.id, f.clinic_id, f.patient_id, f.missed_appointment_id, f.step,
              f.next_send_at, f.last_attempt_at, f.status, f.receptionist_notes,
              f.created_at, f.updated_at,
              a.patient_name,
              a.patient_phone,
              a.start_time AS missed_start_time,
              a.sync_id AS appointment_sync_id,
              a.patient_sync_id
         FROM no_show_followups f
         LEFT JOIN appointments a ON a.id = f.missed_appointment_id
        WHERE f.clinic_id::text = $1::text
          ${filter.replace(/\bstatus\b/g, 'f.status')}
        ORDER BY
          CASE f.status
            WHEN 'pending_manual_call' THEN 0
            WHEN 'active' THEN 1
            WHEN 'scheduled' THEN 2
            ELSE 3
          END,
          f.next_send_at ASC NULLS LAST
        LIMIT 200`,
      params,
    )
    return result.rows
  })
}

export async function patchNoShowFollowup(clinicId, followupId, patch = {}) {
  await ensureWhatsappClinicSchema()
  if (!isUuid(followupId)) {
    return { ok: false, status: 400, error: 'id de follow-up inválido.' }
  }

  const notes =
    patch.receptionist_notes !== undefined
      ? patch.receptionist_notes == null
        ? null
        : String(patch.receptionist_notes)
      : undefined
  const status =
    patch.status !== undefined
      ? String(patch.status || '')
          .trim()
          .toLowerCase()
      : undefined

  if (status !== undefined && !NO_SHOW_STATUSES.has(status)) {
    return {
      ok: false,
      status: 400,
      error:
        'status inválido. Use: active, pending_manual_call, scheduled, opted_out, archived.',
    }
  }

  return withPgClient(async (client) => {
    const existing = await client.query(
      `SELECT id, status, receptionist_notes
         FROM no_show_followups
        WHERE id::text = $1::text
          AND clinic_id::text = $2::text
        LIMIT 1`,
      [String(followupId), String(clinicId)],
    )
    if (!existing.rows[0]) {
      return { ok: false, status: 404, error: 'Follow-up de inasistencia no encontrado.' }
    }

    const nextStatus = status ?? existing.rows[0].status
    const nextNotes = notes !== undefined ? notes : existing.rows[0].receptionist_notes

    const updated = await client.query(
      `UPDATE no_show_followups
          SET status = $3::text,
              receptionist_notes = $4::text,
              updated_at = CURRENT_TIMESTAMP
        WHERE id::text = $1::text
          AND clinic_id::text = $2::text
        RETURNING id, clinic_id, patient_id, missed_appointment_id, step,
                  next_send_at, last_attempt_at, status, receptionist_notes,
                  created_at, updated_at`,
      [String(followupId), String(clinicId), nextStatus, nextNotes],
    )

    return { ok: true, followup: updated.rows[0] }
  })
}

/** Localiza la sede por Phone Number ID de Meta (webhook). */
export async function findClinicByWhatsappPhoneNumberId(phoneNumberId) {
  const id = String(phoneNumberId || '').trim()
  if (!id) return null
  await ensureWhatsappClinicSchema()
  return withPgClient(async (client) => {
    const result = await client.query(
      `SELECT id,
              nombre,
              clinic_canonical_id,
              whatsapp_phone_number_id,
              whatsapp_waba_id,
              whatsapp_access_token,
              whatsapp_connected,
              reminders_balance,
              chatbot_sessions_balance,
              chatbot_enabled,
              direccion
         FROM clinicas
        WHERE whatsapp_phone_number_id = $1::text
        LIMIT 1`,
      [id],
    )
    return result.rows[0] || null
  })
}

/** Descuenta 1 recordatorio de forma atómica. */
export async function debitReminderCredit(clinicId) {
  await ensureWhatsappClinicSchema()
  return withPgClient(async (client) => {
    const result = await client.query(
      `UPDATE clinicas
          SET reminders_balance = reminders_balance - 1
        WHERE id::text = $1::text
          AND reminders_balance > 0
        RETURNING reminders_balance`,
      [String(clinicId)],
    )
    if (!result.rows[0]) {
      return { ok: false, code: 'REMINDERS_BALANCE_EMPTY', reminders_balance: 0 }
    }
    return {
      ok: true,
      reminders_balance: Number(result.rows[0].reminders_balance) || 0,
    }
  })
}

/** Descuenta 1 sesión de chatbot de forma atómica. */
export async function debitChatbotSessionCredit(clinicId) {
  await ensureWhatsappClinicSchema()
  return withPgClient(async (client) => {
    const result = await client.query(
      `UPDATE clinicas
          SET chatbot_sessions_balance = chatbot_sessions_balance - 1
        WHERE id::text = $1::text
          AND chatbot_sessions_balance > 0
        RETURNING chatbot_sessions_balance`,
      [String(clinicId)],
    )
    if (!result.rows[0]) {
      return { ok: false, code: 'CHATBOT_SESSIONS_BALANCE_EMPTY', chatbot_sessions_balance: 0 }
    }
    return {
      ok: true,
      chatbot_sessions_balance: Number(result.rows[0].chatbot_sessions_balance) || 0,
    }
  })
}

export async function listClinicsWithReminderBalance() {
  await ensureWhatsappClinicSchema()
  return withPgClient(async (client) => {
    const result = await client.query(
      `SELECT id,
              nombre,
              clinic_canonical_id,
              whatsapp_phone_number_id,
              whatsapp_connected,
              reminders_balance,
              chatbot_sessions_balance,
              chatbot_enabled
         FROM clinicas
        WHERE reminders_balance > 0
        ORDER BY reminders_balance DESC
        LIMIT 500`,
    )
    return result.rows
  })
}

export { isUuid as isClinicUuid }
