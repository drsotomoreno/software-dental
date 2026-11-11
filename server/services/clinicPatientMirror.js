/**
 * Espejo Postgres de los pacientes de UNA clínica.
 * La clave es el cubo canónico de la sesión (clinic:…). Otra cuenta no lee esta fila.
 * Si Postgres no responde, el snapshot JSON sigue siendo la copia que viaja entre dispositivos.
 */
import { createHash } from 'node:crypto'
import { withPgClient } from './durableStore.js'

const DOC_TYPES = new Set(['CC', 'TI', 'CE', 'PA', 'RC', 'NV', 'CD', 'SC', 'PE', 'PT', 'AS', 'MS'])
const SEX = new Set(['F', 'M', 'O'])

let columnsReady = null

export function clinicaUuidFromCanonical(canonical) {
  const hex = createHash('sha256').update(String(canonical || '')).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function payloadOf(record) {
  if (!record || typeof record !== 'object') return null
  const payload = record.payload && typeof record.payload === 'object' ? record.payload : record
  return payload
}

function asDate(value) {
  const raw = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return ''
  return raw.slice(0, 10)
}

function patientRow(record) {
  const payload = payloadOf(record)
  if (!payload) return null
  const documentType = String(payload.documentType || '').trim().toUpperCase()
  const documentNumber = String(payload.documentNumber || '').trim()
  const firstName = String(payload.firstName || '').trim()
  const lastName = String(payload.lastName || '').trim()
  const birthDate = asDate(payload.birthDate)
  const gender = String(payload.gender || '').trim().toUpperCase()
  if (!DOC_TYPES.has(documentType) || !documentNumber || !firstName || !lastName || !birthDate) {
    return null
  }
  return {
    syncId: String(record.syncId || payload.syncId || '').trim() || null,
    documentType,
    documentNumber,
    firstName: firstName.slice(0, 100),
    lastName: lastName.slice(0, 100),
    birthDate,
    gender: SEX.has(gender) ? gender : 'O',
    email: String(payload.email || '').trim() || null,
    phone: String(payload.phone || '').trim() || null,
    updatedAt: record.updatedAt || payload.updatedAt || new Date().toISOString(),
    deletedAt: record.deletedAt || payload.deletedAt || null,
  }
}

async function ensureMirrorColumns(client) {
  if (!columnsReady) {
    columnsReady = client
      .query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS sync_id TEXT`)
      .catch((error) => {
        columnsReady = null
        throw error
      })
  }
  await columnsReady
}

export async function mirrorClinicPatients(canonical, records) {
  const clinicKey = String(canonical || '').trim()
  if (!clinicKey) return { ok: false, mirrored: 0 }
  const rows = (Array.isArray(records) ? records : []).map(patientRow).filter(Boolean)
  if (rows.length === 0) return { ok: true, mirrored: 0 }
  const clinicaId = clinicaUuidFromCanonical(clinicKey)
  const nombre = clinicKey.startsWith('clinic:') ? clinicKey.slice('clinic:'.length) : clinicKey

  return withPgClient(async (client) => {
    await ensureMirrorColumns(client)
    await client.query(
      `INSERT INTO clinicas (id, nombre)
       VALUES ($1::uuid, $2::text)
       ON CONFLICT (id) DO NOTHING`,
      [clinicaId, nombre.slice(0, 255) || 'Clínica'],
    )
    let mirrored = 0
    for (const row of rows) {
      await client.query(
        `INSERT INTO pacientes (
           clinica_id, tipo_documento, numero_documento, nombres, apellidos,
           fecha_nacimiento, sexo, email, telefono, sync_id, updated_at, deleted_at
         )
         VALUES (
           $1::uuid, $2::text, $3::text, $4::text, $5::text,
           $6::date, $7::text, $8::text, $9::text, $10::text, $11::timestamptz, $12::timestamptz
         )
         ON CONFLICT (clinica_id, tipo_documento, numero_documento) WHERE deleted_at IS NULL
         DO UPDATE SET
           nombres = EXCLUDED.nombres,
           apellidos = EXCLUDED.apellidos,
           fecha_nacimiento = EXCLUDED.fecha_nacimiento,
           sexo = EXCLUDED.sexo,
           email = EXCLUDED.email,
           telefono = EXCLUDED.telefono,
           sync_id = COALESCE(EXCLUDED.sync_id, pacientes.sync_id),
           updated_at = EXCLUDED.updated_at,
           deleted_at = EXCLUDED.deleted_at
         WHERE pacientes.updated_at IS NULL OR pacientes.updated_at <= EXCLUDED.updated_at`,
        [
          clinicaId,
          row.documentType,
          row.documentNumber,
          row.firstName,
          row.lastName,
          row.birthDate,
          row.gender,
          row.email,
          row.phone,
          row.syncId,
          row.updatedAt,
          row.deletedAt,
        ],
      )
      mirrored += 1
    }
    return { ok: true, mirrored, clinicaId }
  })
}

function recordFromRow(canonical, row) {
  const syncId = String(row.sync_id || `${row.tipo_documento}:${row.numero_documento}`).trim()
  const updatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
  return {
    syncId,
    clinicId: canonical,
    updatedAt,
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    payload: {
      documentType: row.tipo_documento,
      documentNumber: row.numero_documento,
      firstName: row.nombres,
      lastName: row.apellidos,
      birthDate: row.fecha_nacimiento ? String(row.fecha_nacimiento).slice(0, 10) : '',
      gender: row.sexo,
      email: row.email || undefined,
      phone: row.telefono || '',
      syncId,
      clinicId: canonical,
      updatedAt,
      deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    },
  }
}

/** Une el espejo al mapa del snapshot. Gana la ficha con updated_at más reciente. */
export async function mergeMirroredPatients(canonical, patients = {}) {
  const clinicKey = String(canonical || '').trim()
  if (!clinicKey) return patients
  const clinicaId = clinicaUuidFromCanonical(clinicKey)
  let rows = []
  try {
    rows = await withPgClient(async (client) => {
      await ensureMirrorColumns(client)
      const result = await client.query(
        `SELECT sync_id, tipo_documento, numero_documento, nombres, apellidos,
                fecha_nacimiento::text, sexo, email, telefono, updated_at, deleted_at
         FROM pacientes
         WHERE clinica_id = $1::uuid`,
        [clinicaId],
      )
      return result.rows
    })
  } catch {
    return patients
  }
  const next = { ...patients }
  for (const row of rows) {
    const record = recordFromRow(clinicKey, row)
    const prev = next[record.syncId]
    const prevStamp = Date.parse(prev?.updatedAt || '') || 0
    const nextStamp = Date.parse(record.updatedAt || '') || 0
    if (!prev || nextStamp >= prevStamp) next[record.syncId] = record
  }
  return next
}
