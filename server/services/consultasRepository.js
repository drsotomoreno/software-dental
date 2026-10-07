/**
 * Persistencia de la consulta / atención y del resultado del MUV.
 * La migración vive en server/db/migrations y se aplica al usar el repositorio.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPgClient } from './durableStore.js'

const MIGRATION_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/20261007193000_consultas_muv.sql',
)

const ESTADOS = new Set(['PENDIENTE', 'APROBADO', 'RECHAZADO'])

let schemaReady = null

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    clinicId: row.clinic_id,
    patientId: row.patient_id,
    professionalId: row.professional_id,
    clinicalRecordId: row.clinical_record_id,
    cuv: row.cuv ?? null,
    estadoMuv: row.estado_muv,
    resultadoValidacion: row.resultado_validacion ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function ensureConsultasSchema() {
  if (!schemaReady) {
    schemaReady = withPgClient(async (client) => {
      const sql = await readFile(MIGRATION_FILE, 'utf8')
      await client.query(sql)
    }).catch((error) => {
      schemaReady = null
      throw error
    })
  }
  return schemaReady
}

/**
 * @param {string} id
 */
export async function obtenerConsulta(id) {
  await ensureConsultasSchema()
  return withPgClient(async (client) => {
    const { rows } = await client.query(
      `SELECT id, clinic_id, patient_id, professional_id, clinical_record_id,
              cuv, estado_muv, resultado_validacion, created_at, updated_at
       FROM consultas
       WHERE id = $1`,
      [id],
    )
    return mapRow(rows[0])
  })
}

/**
 * Inserta o actualiza el CUV, el estado MUV y las notificaciones de la consulta.
 * @param {object} entry
 */
export async function guardarResultadoMuv(entry) {
  const estado = String(entry.estadoMuv ?? 'PENDIENTE').toUpperCase()
  if (!ESTADOS.has(estado)) {
    throw new Error(`estado_muv no reconocido: ${estado}`)
  }
  const id = String(entry.id ?? '').trim()
  if (!id) throw new Error('La consulta necesita un id para guardar el resultado del MUV.')

  await ensureConsultasSchema()
  return withPgClient(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO consultas (
         id, clinic_id, patient_id, professional_id, clinical_record_id,
         cuv, estado_muv, resultado_validacion, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::estado_muv, $8::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET
         clinic_id = COALESCE(EXCLUDED.clinic_id, consultas.clinic_id),
         patient_id = COALESCE(EXCLUDED.patient_id, consultas.patient_id),
         professional_id = COALESCE(EXCLUDED.professional_id, consultas.professional_id),
         clinical_record_id = COALESCE(EXCLUDED.clinical_record_id, consultas.clinical_record_id),
         cuv = EXCLUDED.cuv,
         estado_muv = EXCLUDED.estado_muv,
         resultado_validacion = EXCLUDED.resultado_validacion,
         updated_at = now()
       RETURNING id, clinic_id, patient_id, professional_id, clinical_record_id,
                 cuv, estado_muv, resultado_validacion, created_at, updated_at`,
      [
        id,
        entry.clinicId ?? null,
        entry.patientId != null ? String(entry.patientId) : null,
        entry.professionalId ?? null,
        entry.clinicalRecordId != null ? String(entry.clinicalRecordId) : id,
        entry.cuv ?? null,
        estado,
        JSON.stringify(entry.resultadoValidacion ?? null),
      ],
    )
    return mapRow(rows[0])
  })
}
