import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPgClient } from './durableStore.js'
import { splitSqlStatements } from './consultasRepository.js'
import { saveKioskIntake } from './kiosk.service.js'

const MIGRATION_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/20261030180000_kiosk_signatures.sql',
)

const ACTION_TYPES = new Set(['INTAKE', 'EVOLUTION', 'CONSENT'])

const SQL_INSERT = `
  INSERT INTO kiosk_signatures (
    id, clinic_id, document_type, document_id, patient_id,
    title, content_text, signature_base64, form_data
  ) VALUES (
    $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
  )
  RETURNING id, clinic_id, document_type, document_id, patient_id, created_at
`

let schemaReady = null

export async function ensureKioskSignaturesSchema() {
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

export function normalizeKioskActionType(value) {
  const type = String(value || '').trim().toUpperCase()
  return ACTION_TYPES.has(type) ? type : null
}

/**
 * Guarda la firma de la tableta.
 * INTAKE también crea/actualiza el paciente vía saveKioskIntake cuando hay datos básicos.
 */
export async function saveKioskSignature({
  clinicId,
  documentType,
  documentId,
  patientId,
  title,
  contentText,
  signatureBase64,
  formData,
}) {
  const canonicalClinicId = String(clinicId || '').trim()
  const type = normalizeKioskActionType(documentType)
  const signature = String(signatureBase64 || '').trim()

  if (!canonicalClinicId) {
    const error = new Error('clinicId es requerido.')
    error.status = 400
    throw error
  }
  if (!type) {
    const error = new Error('documentType inválido.')
    error.status = 400
    throw error
  }
  if (!signature.startsWith('data:image/')) {
    const error = new Error('signatureBase64 inválida.')
    error.status = 400
    throw error
  }

  await ensureKioskSignaturesSchema()

  const form = formData && typeof formData === 'object' && !Array.isArray(formData) ? formData : {}
  let intakeResult = null

  if (type === 'INTAKE' && form.datosBasicos) {
    intakeResult = await saveKioskIntake({
      clinicId: canonicalClinicId,
      datosBasicos: form.datosBasicos,
      anamnesis: form.anamnesis || {},
      signatureBase64: signature,
    })
  }

  const id = randomUUID()
  const row = await withPgClient(async (client) => {
    const { rows } = await client.query(SQL_INSERT, [
      id,
      canonicalClinicId,
      type,
      documentId ? String(documentId) : intakeResult?.syncId || null,
      patientId ? String(patientId) : intakeResult?.syncId || null,
      title ? String(title).slice(0, 500) : null,
      contentText ? String(contentText).slice(0, 200_000) : null,
      signature,
      JSON.stringify(form),
    ])
    return rows[0]
  })

  return {
    id: row.id,
    clinicId: row.clinic_id,
    documentType: row.document_type,
    documentId: row.document_id,
    patientId: row.patient_id,
    createdAt: row.created_at,
    intake: intakeResult,
    formData: form,
    signatureBase64: signature,
  }
}
