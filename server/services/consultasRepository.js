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

const RETURNING_CONSULTA = `RETURNING id, clinic_id, patient_id, professional_id, clinical_record_id,
            cuv, estado_muv, resultado_validacion, created_at, updated_at`

/** Alta de la consulta. No pisa un CUV ni un estado ya guardados. */
export const SQL_INSERTAR_CONSULTA_CLINICA = `INSERT INTO consultas (
         id, clinic_id, patient_id, professional_id, clinical_record_id, updated_at
       ) VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE SET
         clinic_id = COALESCE(EXCLUDED.clinic_id, consultas.clinic_id),
         patient_id = COALESCE(EXCLUDED.patient_id, consultas.patient_id),
         professional_id = COALESCE(EXCLUDED.professional_id, consultas.professional_id),
         clinical_record_id = COALESCE(EXCLUDED.clinical_record_id, consultas.clinical_record_id),
         updated_at = now()
       ${RETURNING_CONSULTA}`

/** Estado del MUV después del mapeo o de la respuesta del ministerio. */
export const SQL_ACTUALIZAR_ESTADO_MUV = `UPDATE consultas
       SET cuv = $2,
           estado_muv = $3::estado_muv,
           resultado_validacion = $4::jsonb,
           updated_at = now()
       WHERE id = $1
       ${RETURNING_CONSULTA}`

let schemaReady = null

/**
 * Separa un script en sentencias. Respeta bloques dollar-quote (DO $$ ... $$)
 * para no partir el CREATE TYPE por el punto y coma interno.
 * @param {string} sql
 * @returns {string[]}
 */
export function splitSqlStatements(sql) {
  const statements = []
  let current = ''
  let index = 0
  let dollar = null

  while (index < sql.length) {
    if (!dollar && sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index)
      index = end === -1 ? sql.length : end + 1
      continue
    }

    if (!dollar && sql[index] === "'") {
      current += sql[index]
      index += 1
      while (index < sql.length) {
        current += sql[index]
        if (sql[index] === "'" && sql[index + 1] === "'") {
          current += sql[index + 1]
          index += 2
          continue
        }
        if (sql[index] === "'") {
          index += 1
          break
        }
        index += 1
      }
      continue
    }

    if (sql[index] === '$') {
      const match = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(index))
      if (match) {
        const tag = match[0]
        if (!dollar) dollar = tag
        else if (dollar === tag) dollar = null
        current += tag
        index += tag.length
        continue
      }
    }

    if (!dollar && sql[index] === ';') {
      const statement = current.trim()
      if (statement) statements.push(statement)
      current = ''
      index += 1
      continue
    }

    current += sql[index]
    index += 1
  }

  const tail = current.trim()
  if (tail) statements.push(tail)
  return statements
}

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
      for (const statement of splitSqlStatements(sql)) {
        try {
          await client.query(statement)
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          const wrapped = new Error(`${detail} — sentencia: ${statement}`)
          wrapped.code = error?.code
          wrapped.cause = error
          throw wrapped
        }
      }
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

function assertEstado(estado) {
  if (!ESTADOS.has(estado)) {
    throw new Error(`estado_muv no reconocido: ${estado}`)
  }
}

function assertId(id) {
  if (!id) throw new Error('La consulta necesita un id para guardar el resultado del MUV.')
}

function parametrosIdentidad(entry, id) {
  return [
    id,
    entry.clinicId ?? null,
    entry.patientId != null ? String(entry.patientId) : null,
    entry.professionalId ?? null,
    entry.clinicalRecordId != null ? String(entry.clinicalRecordId) : id,
  ]
}

/**
 * Guarda la identidad clínica de la consulta. El estado nace en PENDIENTE
 * por el default de la tabla y un reintento no borra el CUV previo.
 * @param {object} entry
 */
export async function insertarConsultaClinica(entry) {
  const id = String(entry.id ?? '').trim()
  assertId(id)
  await ensureConsultasSchema()
  return withPgClient(async (client) => {
    const { rows } = await client.query(SQL_INSERTAR_CONSULTA_CLINICA, parametrosIdentidad(entry, id))
    return mapRow(rows[0])
  })
}

/**
 * UPDATE parametrizado de cuv, estado_muv y resultado_validacion.
 * @param {object} entry
 */
export async function actualizarEstadoMuv(entry) {
  const estado = String(entry.estadoMuv ?? '').toUpperCase()
  assertEstado(estado)
  const id = String(entry.id ?? '').trim()
  assertId(id)
  await ensureConsultasSchema()
  return withPgClient(async (client) => {
    const { rows } = await client.query(SQL_ACTUALIZAR_ESTADO_MUV, [
      id,
      entry.cuv ?? null,
      estado,
      JSON.stringify(entry.resultadoValidacion ?? null),
    ])
    if (!rows[0]) {
      const error = new Error('No se encontró la consulta para actualizar el estado del MUV.')
      error.statusCode = 503
      throw error
    }
    return mapRow(rows[0])
  })
}

/**
 * Inserta o actualiza el CUV, el estado MUV y las notificaciones de la consulta.
 * @param {object} entry
 */
export async function guardarResultadoMuv(entry) {
  const estado = String(entry.estadoMuv ?? 'PENDIENTE').toUpperCase()
  assertEstado(estado)
  const id = String(entry.id ?? '').trim()
  assertId(id)

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
