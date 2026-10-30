import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPgClient } from './durableStore.js'
import { splitSqlStatements } from './consultasRepository.js'
import { pushClinicSnapshot } from './clinicalSyncStore.js'

const MIGRATION_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/20261030120000_kiosk_patients.sql',
)

const SQL_INSERT_PATIENT = `
  INSERT INTO patients (
    id, clinic_id, sync_id, document_type, document_number,
    first_name, last_name, phone, anamnesis, signature_base64, source
  ) VALUES (
    $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, 'kiosk'
  )
  RETURNING id, sync_id, clinic_id, created_at
`

let schemaReady = null

export async function ensureKioskPatientsSchema() {
  if (!schemaReady) {
    schemaReady = withPgClient(async (client) => {
      const sql = await readFile(MIGRATION_FILE, 'utf8')
      for (const statement of splitSqlStatements(sql)) {
        await client.query(statement)
      }
    }).catch((error) => {
      schemaReady = null
      throw error
    })
  }
  return schemaReady
}

function buildPatientPayload({ clinicId, syncId, datosBasicos, anamnesis, now }) {
  return {
    syncId,
    clinicId,
    documentType: datosBasicos.documentType,
    documentNumber: datosBasicos.documentNumber,
    firstName: datosBasicos.firstName,
    lastName: datosBasicos.lastName,
    phone: datosBasicos.phone || '',
    birthDate: '',
    gender: 'O',
    phase: 'VALORACION_RAPIDA',
    valuationOnly: true,
    createdAt: now,
    updatedAt: now,
    source: 'kiosk',
    kioskIntake: true,
    anamnesis: anamnesis || {},
  }
}

/**
 * Persiste el intake de kiosco en PostgreSQL y lo publica en el snapshot
 * clínico para que Dexie lo descargue en el próximo pull (sin alterar
 * la lógica interna de merge de sincronización).
 */
export async function saveKioskIntake({ clinicId, datosBasicos, anamnesis, signatureBase64 }) {
  const canonicalClinicId = String(clinicId || '').trim()
  if (!canonicalClinicId) {
    const error = new Error('clinicId es requerido.')
    error.status = 400
    throw error
  }

  await ensureKioskPatientsSchema()

  const id = randomUUID()
  const syncId = `kiosk-${id}`
  const now = new Date().toISOString()
  const anamnesisJson = anamnesis && typeof anamnesis === 'object' ? anamnesis : {}

  const row = await withPgClient(async (client) => {
    const { rows } = await client.query(SQL_INSERT_PATIENT, [
      id,
      canonicalClinicId,
      syncId,
      datosBasicos.documentType,
      datosBasicos.documentNumber,
      datosBasicos.firstName,
      datosBasicos.lastName,
      datosBasicos.phone || null,
      JSON.stringify(anamnesisJson),
      signatureBase64,
    ])
    return rows[0]
  })

  const patientPayload = buildPatientPayload({
    clinicId: canonicalClinicId,
    syncId,
    datosBasicos,
    anamnesis: anamnesisJson,
    now,
  })

  // Firma solo en PostgreSQL (TEXT). El pull recibe demografía + anamnesis.
  await pushClinicSnapshot(canonicalClinicId, {
    patients: [
      {
        syncId,
        clinicId: canonicalClinicId,
        updatedAt: now,
        payload: patientPayload,
      },
    ],
  })

  return {
    id: row.id,
    syncId: row.sync_id,
    clinicId: row.clinic_id,
    createdAt: row.created_at,
  }
}
