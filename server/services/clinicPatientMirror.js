/**
 * Espejo Postgres de los pacientes de UNA clínica.
 * La clave es el cubo canónico de la sesión (clinic:…). Otra cuenta no lee esta fila.
 * Si Postgres no responde, el snapshot JSON sigue siendo la copia que viaja entre dispositivos.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPgClient } from './durableStore.js'
import { splitSqlStatements } from './consultasRepository.js'
import { ensureTenantRbacSchema } from './tenantRbacStore.js'

const DOC_TYPES = new Set(['CC', 'TI', 'CE', 'PA', 'RC', 'NV', 'CD', 'SC', 'PE', 'PT', 'AS', 'MS'])
const SEX = new Set(['F', 'M', 'O'])

const DIR = dirname(fileURLToPath(import.meta.url))
const PACIENTES_MIGRATION = join(
  DIR,
  '../db/migrations/20261102150000_pacientes_historias_clinicas.sql',
)
const CLEANUP_MIGRATION = join(DIR, '../db/migrations/20261111170000_cleanup_ghost_tables.sql')
const FLAGS_MIGRATION = join(DIR, '../db/migrations/20261114200000_pacientes_clinical_flags.sql')

let columnsReady = null
let schemaReady = null

async function ensurePacientesSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureTenantRbacSchema()
      await withPgClient(async (client) => {
        for (const file of [PACIENTES_MIGRATION, CLEANUP_MIGRATION, FLAGS_MIGRATION]) {
          const sql = await readFile(file, 'utf8')
          for (const statement of splitSqlStatements(sql)) {
            await client.query(statement)
          }
        }
      })
    })().catch((error) => {
      schemaReady = null
      throw error
    })
  }
  return schemaReady
}

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

function asOptionalBool(value) {
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase()
    if (s === 'true' || s === '1') return true
    if (s === 'false' || s === '0') return false
  }
  return null
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
  const phaseRaw = String(payload.phase || '').trim()
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
    valuationOnly: asOptionalBool(payload.valuationOnly),
    phase: phaseRaw || null,
    treatmentCompleted: asOptionalBool(payload.treatmentCompleted),
    updatedAt: record.updatedAt || payload.updatedAt || new Date().toISOString(),
    deletedAt: record.deletedAt || payload.deletedAt || null,
  }
}

async function ensureMirrorColumns(client) {
  if (!columnsReady) {
    columnsReady = (async () => {
      await client.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS sync_id TEXT`)
      await client.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS valuation_only BOOLEAN`)
      await client.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS phase TEXT`)
      await client.query(
        `ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS treatment_completed BOOLEAN`,
      )
    })().catch((error) => {
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

  await ensurePacientesSchema()

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
           fecha_nacimiento, sexo, email, telefono, sync_id,
           valuation_only, phase, treatment_completed,
           updated_at, deleted_at
         )
         VALUES (
           $1::uuid, $2::text, $3::text, $4::text, $5::text,
           $6::date, $7::text, $8::text, $9::text, $10::text,
           $11::boolean, $12::text, $13::boolean,
           $14::timestamptz, $15::timestamptz
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
           valuation_only = COALESCE(EXCLUDED.valuation_only, pacientes.valuation_only),
           phase = COALESCE(EXCLUDED.phase, pacientes.phase),
           treatment_completed = COALESCE(EXCLUDED.treatment_completed, pacientes.treatment_completed),
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
          row.valuationOnly,
          row.phase,
          row.treatmentCompleted,
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
  const payload = {
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
  }
  if (row.valuation_only !== undefined && row.valuation_only !== null) {
    payload.valuationOnly = row.valuation_only === true || row.valuation_only === 't'
  }
  if (row.phase != null && String(row.phase).trim()) {
    payload.phase = String(row.phase).trim()
  }
  if (row.treatment_completed !== undefined && row.treatment_completed !== null) {
    payload.treatmentCompleted =
      row.treatment_completed === true || row.treatment_completed === 't'
  }
  return {
    syncId,
    clinicId: canonical,
    updatedAt,
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    payload,
  }
}

/** Flags clínicas: JSON es fuente primaria; Postgres (columnas) es respaldo. */
const CLINICAL_FLAG_KEYS = ['valuationOnly', 'phase', 'treatmentCompleted']

function pickClinicalFlags(...payloads) {
  const out = {}
  for (const payload of payloads) {
    if (!payload || typeof payload !== 'object') continue
    for (const key of CLINICAL_FLAG_KEYS) {
      if (payload[key] !== undefined && out[key] === undefined) out[key] = payload[key]
    }
  }
  return out
}

/**
 * Une demografía del espejo PG con el cubo JSON.
 * Gana updated_at más reciente para demografía; las flags
 * valuationOnly/phase/treatmentCompleted se conservan (JSON primero, PG después).
 */
function mergeStoreAndMirror(storeRec, pgRec) {
  if (!storeRec) return pgRec
  if (!pgRec) return storeRec
  const storeStamp =
    Math.max(
      Date.parse(storeRec.updatedAt || '') || 0,
      Date.parse(storeRec.serverUpdatedAt || '') || 0,
    ) || 0
  const pgStamp = Date.parse(pgRec.updatedAt || '') || 0
  const flags = pickClinicalFlags(storeRec.payload, pgRec.payload)
  if (pgStamp >= storeStamp) {
    return {
      ...pgRec,
      serverUpdatedAt: storeRec.serverUpdatedAt || pgRec.updatedAt,
      payload: {
        ...(storeRec.payload && typeof storeRec.payload === 'object' ? storeRec.payload : {}),
        ...(pgRec.payload && typeof pgRec.payload === 'object' ? pgRec.payload : {}),
        ...flags,
      },
    }
  }
  return {
    ...storeRec,
    payload: {
      ...(pgRec.payload && typeof pgRec.payload === 'object' ? pgRec.payload : {}),
      ...(storeRec.payload && typeof storeRec.payload === 'object' ? storeRec.payload : {}),
      ...flags,
    },
  }
}

/** Une el espejo al mapa del snapshot. Demografía por stamp; flags clínicas del JSON. */
export async function mergeMirroredPatients(canonical, patients = {}) {
  const clinicKey = String(canonical || '').trim()
  if (!clinicKey) return patients
  const clinicaId = clinicaUuidFromCanonical(clinicKey)
  let rows = []
  try {
    await ensurePacientesSchema()
    rows = await withPgClient(async (client) => {
      await ensureMirrorColumns(client)
      const result = await client.query(
        `SELECT sync_id, tipo_documento, numero_documento, nombres, apellidos,
                fecha_nacimiento::text, sexo, email, telefono, updated_at, deleted_at,
                valuation_only, phase, treatment_completed
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
    next[record.syncId] = mergeStoreAndMirror(next[record.syncId], record)
  }
  return next
}
