/**
 * EMR v2 — store transaccional ACID (FASE 1).
 * Tablas emr_v2_* en paralelo al stack clinical-sync / patient_clinical_charts.
 * No monta rutas HTTP; consumo futuro vía /api/v2/.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { withPgClient } from './durableStore.js'
import { splitSqlStatements } from './consultasRepository.js'
import { sha256Hex } from '../utils/clinicalHash.js'

const DIR = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = [
  join(DIR, '../db/migrations/20261119180000_emr_v2_acid_immutable.sql'),
  join(DIR, '../db/migrations/20261119190000_emr_v2_assets_and_rls.sql'),
]

export const FORENSIC_GENESIS_HASH = 'GENESIS'

export const ALLOWED_CLINICAL_SECTIONS = Object.freeze([
  'anamnesis',
  'examen_estomatologico',
  'odontograma',
  'diagnosticos',
  'plan_tratamiento',
])

const sectionNameSchema = z.enum([
  'anamnesis',
  'examen_estomatologico',
  'odontograma',
  'diagnosticos',
  'plan_tratamiento',
])

const actorSchema = z
  .object({
    email: z.string().optional().default(''),
    rethus: z.string().optional().default(''),
    id: z.string().optional().default(''),
    nombre: z.string().optional().default(''),
  })
  .passthrough()

let schemaReady = null

/**
 * @param {string} prevChainHash
 * @param {string} entityId
 * @param {string} action
 * @param {unknown} afterState
 * @param {string} timestamp
 */
export function computeForensicChainHash(prevChainHash, entityId, action, afterState, timestamp) {
  const payload =
    String(prevChainHash ?? '') +
    String(entityId ?? '') +
    String(action ?? '') +
    JSON.stringify(afterState ?? null) +
    String(timestamp ?? '')
  return sha256Hex(payload)
}

/**
 * Hash de sello de evolución (contenido + identidad profesional).
 * @param {object} row
 */
export function computeEvolutionSealHash(row) {
  const canonical = JSON.stringify({
    contenido: row?.contenido ?? null,
    profesional_id: String(row?.profesional_id || ''),
    profesional_nombre: String(row?.profesional_nombre || ''),
    rethus: String(row?.rethus || ''),
    parent_evolution_id: row?.parent_evolution_id || null,
  })
  return sha256Hex(canonical)
}

function emptyContentHash() {
  return sha256Hex(
    JSON.stringify({
      anamnesis: {},
      examen_estomatologico: {},
      odontograma: {},
      diagnosticos: [],
      plan_tratamiento: {},
    }),
  )
}

function contentHashFromSections(row) {
  return sha256Hex(
    JSON.stringify({
      anamnesis: row.anamnesis ?? {},
      examen_estomatologico: row.examen_estomatologico ?? {},
      odontograma: row.odontograma ?? {},
      diagnosticos: row.diagnosticos ?? [],
      plan_tratamiento: row.plan_tratamiento ?? {},
    }),
  )
}

function normalizeActor(actor) {
  const parsed = actorSchema.safeParse(actor || {})
  const value = parsed.success ? parsed.data : {}
  return {
    email: String(value.email || '').trim(),
    rethus: String(value.rethus || '').trim(),
    id: String(value.id || '').trim(),
    nombre: String(value.nombre || '').trim(),
  }
}

function versionConflict(currentVersion = 0) {
  return {
    ok: false,
    status: 409,
    code: 'VERSION_CONFLICT',
    version: Number(currentVersion) || 0,
  }
}

function legalImmutabilityError(message) {
  const err = new Error(
    message ||
      'LEGAL_IMMUTABILITY_VIOLATION: No se permite modificar ni eliminar una evolución clínica cerrada/firmada (Res. 1995/1999)',
  )
  err.code = 'LEGAL_IMMUTABILITY_VIOLATION'
  err.status = 403
  return err
}

/**
 * Aplica migraciones EMR v2 de forma idempotente.
 * @param {import('pg').Pool | { connect: Function } | null} [pool] — opcional; si se omite usa withPgClient.
 */
export async function ensureEmrV2Schema(pool = null) {
  if (schemaReady) return schemaReady
  schemaReady = (async () => {
    const run = async (client) => {
      for (const file of MIGRATIONS) {
        const sql = await readFile(file, 'utf8')
        for (const statement of splitSqlStatements(sql)) {
          await client.query(statement)
        }
      }
    }
    if (pool && typeof pool.connect === 'function') {
      const client = await pool.connect()
      try {
        await run(client)
      } finally {
        client.release()
      }
    } else {
      await withPgClient(run)
    }
  })().catch((error) => {
    schemaReady = null
    throw error
  })
  return schemaReady
}

/**
 * Append a forensic audit row inside an open transaction.
 * @param {{ query: Function }} client
 * @param {object} params
 */
export async function appendForensicAudit(client, params) {
  const clinicaId = String(params?.clinicaId || params?.clinica_id || '').trim()
  const entityTable = String(params?.entityTable || params?.entity_table || '').trim()
  const entityId = String(params?.entityId || params?.entity_id || '').trim()
  const action = String(params?.action || '').trim()
  if (!clinicaId || !entityTable || !entityId || !action) {
    throw new Error('appendForensicAudit: clinicaId, entityTable, entityId y action son obligatorios')
  }

  const patientId = params?.patientId || params?.patient_id || null
  const actor = normalizeActor(params?.actor)
  const beforeState = params?.beforeState ?? params?.before_state ?? null
  const afterState = params?.afterState ?? params?.after_state ?? null
  const createdAt = String(params?.createdAt || params?.created_at || new Date().toISOString())

  const prevResult = await client.query(
    `SELECT chain_hash
       FROM emr_v2_forensic_audit_trail
      WHERE clinica_id = $1::text
      ORDER BY seq DESC
      LIMIT 1
      FOR UPDATE`,
    [clinicaId],
  )
  const prevChainHash =
    prevResult.rows[0]?.chain_hash != null && String(prevResult.rows[0].chain_hash).trim()
      ? String(prevResult.rows[0].chain_hash)
      : FORENSIC_GENESIS_HASH

  const chainHash = computeForensicChainHash(
    prevChainHash,
    entityId,
    action,
    afterState,
    createdAt,
  )

  const insert = await client.query(
    `INSERT INTO emr_v2_forensic_audit_trail (
       clinica_id, patient_id, entity_table, entity_id, action,
       actor_email, actor_rethus, before_state, after_state,
       prev_chain_hash, chain_hash, created_at
     ) VALUES (
       $1::text, $2::uuid, $3::text, $4::text, $5::text,
       $6::text, $7::text, $8::jsonb, $9::jsonb,
       $10::text, $11::text, $12::timestamptz
     )
     RETURNING seq, id, prev_chain_hash, chain_hash, created_at`,
    [
      clinicaId,
      patientId,
      entityTable,
      entityId,
      action,
      actor.email || null,
      actor.rethus || null,
      beforeState == null ? null : JSON.stringify(beforeState),
      afterState == null ? null : JSON.stringify(afterState),
      prevChainHash,
      chainHash,
      createdAt,
    ],
  )

  const row = insert.rows[0]
  return {
    seq: row.seq,
    id: row.id,
    prevChainHash: row.prev_chain_hash,
    chainHash: row.chain_hash,
    createdAt: row.created_at,
  }
}

/**
 * Resolve patient by legacy_sync_id; create stub if missing.
 * @param {{ query: Function }} client
 */
export async function resolveOrCreatePatient(client, clinicaId, patientSyncId, actor = {}) {
  const clinic = String(clinicaId || '').trim()
  const syncId = String(patientSyncId || '').trim()
  if (!clinic || !syncId) {
    throw new Error('resolveOrCreatePatient: clinicaId y patientSyncId son obligatorios')
  }

  const existing = await client.query(
    `SELECT id, clinica_id, legacy_sync_id, tipo_documento, numero_documento,
            nombre_completo, datos_demograficos, version, updated_at
       FROM emr_v2_patients
      WHERE clinica_id = $1::text AND legacy_sync_id = $2::text
      LIMIT 1`,
    [clinic, syncId],
  )
  if (existing.rows[0]) return existing.rows[0]

  const stubDoc = `SYNC-${syncId}`
  const inserted = await client.query(
    `INSERT INTO emr_v2_patients (
       clinica_id, legacy_sync_id, tipo_documento, numero_documento,
       nombre_completo, datos_demograficos, version, updated_at
     ) VALUES (
       $1::text, $2::text, 'OT'::text, $3::text,
       $4::text, '{}'::jsonb, 1, NOW()
     )
     ON CONFLICT (clinica_id, legacy_sync_id) DO UPDATE SET
       updated_at = emr_v2_patients.updated_at
     RETURNING id, clinica_id, legacy_sync_id, tipo_documento, numero_documento,
               nombre_completo, datos_demograficos, version, updated_at`,
    [clinic, syncId, stubDoc, `Paciente ${syncId.slice(0, 8)}`],
  )
  const patient = inserted.rows[0]

  await appendForensicAudit(client, {
    clinicaId: clinic,
    patientId: patient.id,
    entityTable: 'emr_v2_patients',
    entityId: patient.id,
    action: 'patient.upsert_stub',
    actor,
    beforeState: null,
    afterState: {
      id: patient.id,
      legacy_sync_id: syncId,
      tipo_documento: patient.tipo_documento,
      numero_documento: patient.numero_documento,
    },
  })

  return patient
}

async function ensureClinicalBaseRow(client, patient, actor) {
  const found = await client.query(
    `SELECT patient_id, clinica_id, anamnesis, examen_estomatologico, odontograma,
            diagnosticos, plan_tratamiento, version, content_hash, updated_by, updated_at
       FROM emr_v2_clinical_base
      WHERE patient_id = $1::uuid
      LIMIT 1`,
    [patient.id],
  )
  if (found.rows[0]) return found.rows[0]

  const hash = emptyContentHash()
  const inserted = await client.query(
    `INSERT INTO emr_v2_clinical_base (
       patient_id, clinica_id, content_hash, updated_by, updated_at
     ) VALUES (
       $1::uuid, $2::text, $3::text, $4::text, NOW()
     )
     ON CONFLICT (patient_id) DO UPDATE SET
       updated_at = emr_v2_clinical_base.updated_at
     RETURNING patient_id, clinica_id, anamnesis, examen_estomatologico, odontograma,
               diagnosticos, plan_tratamiento, version, content_hash, updated_by, updated_at`,
    [patient.id, patient.clinica_id, hash, actor.email || actor.id || null],
  )
  return inserted.rows[0]
}

/**
 * Actualiza únicamente una sección de la ficha viva con bloqueo optimista.
 */
export async function upsertClinicalBaseSection(
  clinicaId,
  patientSyncId,
  sectionName,
  sectionPayload,
  expectedVersion,
  actor,
) {
  const clinic = String(clinicaId || '').trim()
  const syncId = String(patientSyncId || '').trim()
  const section = sectionNameSchema.parse(String(sectionName || '').trim())
  const who = normalizeActor(actor)
  const expected = Math.trunc(Number(expectedVersion))
  if (!clinic || !syncId || !Number.isFinite(expected) || expected < 1) {
    return {
      ok: false,
      status: 400,
      code: 'BAD_REQUEST',
      error: 'clinicaId, patientSyncId y expectedVersion (>=1) son obligatorios',
    }
  }

  await ensureEmrV2Schema()
  return withPgClient(async (client) => {
    await client.query('BEGIN')
    try {
      const patient = await resolveOrCreatePatient(client, clinic, syncId, who)
      const before = await ensureClinicalBaseRow(client, patient, who)

      if (Number(before.version) !== expected) {
        await client.query('ROLLBACK')
        return versionConflict(before.version)
      }

      const nextSections = {
        anamnesis: before.anamnesis,
        examen_estomatologico: before.examen_estomatologico,
        odontograma: before.odontograma,
        diagnosticos: before.diagnosticos,
        plan_tratamiento: before.plan_tratamiento,
        [section]: sectionPayload ?? (section === 'diagnosticos' ? [] : {}),
      }
      const nextHash = contentHashFromSections(nextSections)

      const updated = await client.query(
        `UPDATE emr_v2_clinical_base
            SET ${section} = $1::jsonb,
                version = version + 1,
                content_hash = $2::text,
                updated_by = $3::text,
                updated_at = NOW()
          WHERE patient_id = $4::uuid
            AND version = $5::integer
          RETURNING patient_id, clinica_id, anamnesis, examen_estomatologico, odontograma,
                    diagnosticos, plan_tratamiento, version, content_hash, updated_by, updated_at`,
        [
          JSON.stringify(nextSections[section]),
          nextHash,
          who.email || who.id || null,
          patient.id,
          expected,
        ],
      )

      if (!updated.rows[0]) {
        await client.query('ROLLBACK')
        return versionConflict(before.version)
      }

      const after = updated.rows[0]
      await appendForensicAudit(client, {
        clinicaId: clinic,
        patientId: patient.id,
        entityTable: 'emr_v2_clinical_base',
        entityId: String(patient.id),
        action: `clinical_base.update.${section}`,
        actor: who,
        beforeState: {
          version: before.version,
          content_hash: before.content_hash,
          [section]: before[section],
        },
        afterState: {
          version: after.version,
          content_hash: after.content_hash,
          [section]: after[section],
        },
      })

      await client.query('COMMIT')
      return {
        ok: true,
        status: 200,
        version: after.version,
        contentHash: after.content_hash,
        patientId: patient.id,
        section,
      }
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* no enmascarar */
      }
      throw error
    }
  })
}

/**
 * Inserta o sella criptográficamente una evolución.
 * Correcciones a evoluciones locked: solo vía nota aclaratoria (parent_evolution_id).
 */
export async function createOrLockEvolution(clinicaId, patientSyncId, evolutionPayload, lockNow, actor) {
  const clinic = String(clinicaId || '').trim()
  const syncId = String(patientSyncId || '').trim()
  const who = normalizeActor(actor)
  const payload = evolutionPayload && typeof evolutionPayload === 'object' ? evolutionPayload : {}
  const shouldLock = Boolean(lockNow)

  if (!clinic || !syncId) {
    return {
      ok: false,
      status: 400,
      code: 'BAD_REQUEST',
      error: 'clinicaId y patientSyncId son obligatorios',
    }
  }

  await ensureEmrV2Schema()
  return withPgClient(async (client) => {
    await client.query('BEGIN')
    try {
      const patient = await resolveOrCreatePatient(client, clinic, syncId, who)
      const evolutionId = String(payload.id || payload.evolutionId || '').trim() || null
      const parentEvolutionId = String(
        payload.parent_evolution_id || payload.parentEvolutionId || '',
      ).trim() || null

      let row = null
      let action = 'evolution.create'

      if (evolutionId) {
        const existing = await client.query(
          `SELECT id, patient_id, clinica_id, fecha_atencion, profesional_id, profesional_nombre,
                  rethus, contenido, is_locked, locked_at, seal_hash_sha256, parent_evolution_id, created_at
             FROM emr_v2_evolutions
            WHERE id = $1::uuid AND clinica_id = $2::text
            LIMIT 1
            FOR UPDATE`,
          [evolutionId, clinic],
        )
        row = existing.rows[0] || null
        if (!row) {
          await client.query('ROLLBACK')
          return { ok: false, status: 404, code: 'NOT_FOUND', error: 'Evolución no encontrada' }
        }
        if (row.is_locked) {
          throw legalImmutabilityError()
        }

        if (shouldLock) {
          const sealInput = {
            contenido: payload.contenido != null ? payload.contenido : row.contenido,
            profesional_id: String(payload.profesional_id || payload.profesionalId || row.profesional_id),
            profesional_nombre: String(
              payload.profesional_nombre || payload.profesionalNombre || row.profesional_nombre,
            ),
            rethus: String(payload.rethus || row.rethus || who.rethus),
            parent_evolution_id: row.parent_evolution_id,
          }
          if (!sealInput.rethus) {
            await client.query('ROLLBACK')
            return {
              ok: false,
              status: 400,
              code: 'RETHUS_REQUIRED',
              error: 'ReTHUS obligatorio para sellar una evolución',
            }
          }
          const sealHash = computeEvolutionSealHash(sealInput)
          const locked = await client.query(
            `UPDATE emr_v2_evolutions
                SET contenido = $1::jsonb,
                    profesional_id = $2::text,
                    profesional_nombre = $3::text,
                    rethus = $4::text,
                    is_locked = TRUE,
                    locked_at = NOW(),
                    seal_hash_sha256 = $5::text
              WHERE id = $6::uuid
                AND is_locked = FALSE
              RETURNING id, patient_id, clinica_id, fecha_atencion, profesional_id, profesional_nombre,
                        rethus, contenido, is_locked, locked_at, seal_hash_sha256, parent_evolution_id, created_at`,
            [
              JSON.stringify(sealInput.contenido),
              sealInput.profesional_id,
              sealInput.profesional_nombre,
              sealInput.rethus,
              sealHash,
              evolutionId,
            ],
          )
          if (!locked.rows[0]) {
            throw legalImmutabilityError()
          }
          row = locked.rows[0]
          action = 'evolution.lock'
        } else {
          const updated = await client.query(
            `UPDATE emr_v2_evolutions
                SET contenido = COALESCE($1::jsonb, contenido),
                    profesional_id = COALESCE(NULLIF($2::text, ''), profesional_id),
                    profesional_nombre = COALESCE(NULLIF($3::text, ''), profesional_nombre),
                    rethus = COALESCE(NULLIF($4::text, ''), rethus),
                    fecha_atencion = COALESCE($5::timestamptz, fecha_atencion)
              WHERE id = $6::uuid
                AND is_locked = FALSE
              RETURNING id, patient_id, clinica_id, fecha_atencion, profesional_id, profesional_nombre,
                        rethus, contenido, is_locked, locked_at, seal_hash_sha256, parent_evolution_id, created_at`,
            [
              payload.contenido != null ? JSON.stringify(payload.contenido) : null,
              String(payload.profesional_id || payload.profesionalId || ''),
              String(payload.profesional_nombre || payload.profesionalNombre || ''),
              String(payload.rethus || who.rethus || ''),
              payload.fecha_atencion || payload.fechaAtencion || null,
              evolutionId,
            ],
          )
          if (!updated.rows[0]) {
            throw legalImmutabilityError()
          }
          row = updated.rows[0]
          action = 'evolution.update_draft'
        }
      } else {
        const profesionalId = String(
          payload.profesional_id || payload.profesionalId || who.id || '',
        ).trim()
        const profesionalNombre = String(
          payload.profesional_nombre || payload.profesionalNombre || who.nombre || '',
        ).trim()
        const rethus = String(payload.rethus || who.rethus || '').trim()
        const contenido = payload.contenido != null ? payload.contenido : {}

        if (!profesionalId || !profesionalNombre || !rethus) {
          await client.query('ROLLBACK')
          return {
            ok: false,
            status: 400,
            code: 'PROFESSIONAL_REQUIRED',
            error: 'profesional_id, profesional_nombre y rethus son obligatorios',
          }
        }

        let sealHash = null
        let lockedAt = null
        if (shouldLock) {
          sealHash = computeEvolutionSealHash({
            contenido,
            profesional_id: profesionalId,
            profesional_nombre: profesionalNombre,
            rethus,
            parent_evolution_id: parentEvolutionId,
          })
          lockedAt = new Date().toISOString()
        }

        const inserted = await client.query(
          `INSERT INTO emr_v2_evolutions (
             patient_id, clinica_id, fecha_atencion, profesional_id, profesional_nombre,
             rethus, contenido, is_locked, locked_at, seal_hash_sha256, parent_evolution_id
           ) VALUES (
             $1::uuid, $2::text, COALESCE($3::timestamptz, NOW()), $4::text, $5::text,
             $6::text, $7::jsonb, $8::boolean, $9::timestamptz, $10::text, $11::uuid
           )
           RETURNING id, patient_id, clinica_id, fecha_atencion, profesional_id, profesional_nombre,
                     rethus, contenido, is_locked, locked_at, seal_hash_sha256, parent_evolution_id, created_at`,
          [
            patient.id,
            clinic,
            payload.fecha_atencion || payload.fechaAtencion || null,
            profesionalId,
            profesionalNombre,
            rethus,
            JSON.stringify(contenido),
            shouldLock,
            lockedAt,
            sealHash,
            parentEvolutionId,
          ],
        )
        row = inserted.rows[0]
        action = parentEvolutionId
          ? shouldLock
            ? 'evolution.nota_aclaratoria.lock'
            : 'evolution.nota_aclaratoria.create'
          : shouldLock
            ? 'evolution.create_locked'
            : 'evolution.create'
      }

      await appendForensicAudit(client, {
        clinicaId: clinic,
        patientId: patient.id,
        entityTable: 'emr_v2_evolutions',
        entityId: String(row.id),
        action,
        actor: who,
        beforeState: evolutionId ? { id: evolutionId, is_locked: false } : null,
        afterState: {
          id: row.id,
          is_locked: row.is_locked,
          seal_hash_sha256: row.seal_hash_sha256,
          parent_evolution_id: row.parent_evolution_id,
          rethus: row.rethus,
        },
      })

      await client.query('COMMIT')
      return {
        ok: true,
        status: 200,
        evolution: {
          id: row.id,
          patientId: row.patient_id,
          clinicaId: row.clinica_id,
          isLocked: row.is_locked,
          lockedAt: row.locked_at,
          sealHashSha256: row.seal_hash_sha256,
          parentEvolutionId: row.parent_evolution_id,
          rethus: row.rethus,
          createdAt: row.created_at,
        },
      }
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* no enmascarar */
      }
      if (error?.code === 'LEGAL_IMMUTABILITY_VIOLATION' || /LEGAL_IMMUTABILITY_VIOLATION/.test(String(error?.message || ''))) {
        const wrapped = legalImmutabilityError(error.message)
        return { ok: false, status: 403, code: wrapped.code, error: wrapped.message }
      }
      throw error
    }
  })
}

/**
 * Busca paciente v2 por UUID, legacy_sync_id o numero_documento dentro de la clínica.
 */
export async function findEmrV2Patient(clinicaId, idOrSyncId) {
  const clinic = String(clinicaId || '').trim()
  const needle = String(idOrSyncId || '').trim()
  if (!clinic || !needle) return null
  await ensureEmrV2Schema()
  return withPgClient(async (client) => {
    const byUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      needle,
    )
    const { rows } = await client.query(
      `SELECT id, clinica_id, legacy_sync_id, tipo_documento, numero_documento,
              nombre_completo, datos_demograficos, version, updated_at
         FROM emr_v2_patients
        WHERE clinica_id = $1::text
          AND (
            ($2::boolean AND id = $3::uuid)
            OR legacy_sync_id = $4::text
            OR numero_documento = $4::text
          )
        ORDER BY updated_at DESC
        LIMIT 1`,
      [clinic, byUuid, byUuid ? needle : '00000000-0000-4000-8000-000000000000', needle],
    )
    return rows[0] || null
  })
}

export async function listEmrV2Evolutions(patientId) {
  const id = String(patientId || '').trim()
  if (!id) return []
  await ensureEmrV2Schema()
  return withPgClient(async (client) => {
    const { rows } = await client.query(
      `SELECT id, patient_id, clinica_id, fecha_atencion, profesional_id, profesional_nombre,
              rethus, contenido, is_locked, locked_at, seal_hash_sha256, parent_evolution_id, created_at
         FROM emr_v2_evolutions
        WHERE patient_id = $1::uuid
        ORDER BY fecha_atencion ASC, created_at ASC`,
      [id],
    )
    return rows
  })
}

export async function getEmrV2ClinicalBase(patientId) {
  const id = String(patientId || '').trim()
  if (!id) return null
  await ensureEmrV2Schema()
  return withPgClient(async (client) => {
    const { rows } = await client.query(
      `SELECT patient_id, clinica_id, anamnesis, examen_estomatologico, odontograma,
              diagnosticos, plan_tratamiento, version, content_hash, updated_by, updated_at
         FROM emr_v2_clinical_base
        WHERE patient_id = $1::uuid
        LIMIT 1`,
      [id],
    )
    return rows[0] || null
  })
}

export async function listEmrV2Assets(clinicaId, patientId) {
  const clinic = String(clinicaId || '').trim()
  const id = String(patientId || '').trim()
  if (!clinic || !id) return []
  await ensureEmrV2Schema()
  return withPgClient(async (client) => {
    const { rows } = await client.query(
      `SELECT id, clinica_id, patient_id, asset_type, file_name, mime_type, byte_size,
              sha256_hash, storage_driver, storage_key, uploaded_by, created_at
         FROM emr_v2_clinical_assets
        WHERE clinica_id = $1::text AND patient_id = $2::uuid
        ORDER BY created_at DESC`,
      [clinic, id],
    )
    return rows
  })
}

export async function getEmrV2AuditTrail(clinicaId, patientId, { limit = 200 } = {}) {
  const clinic = String(clinicaId || '').trim()
  const id = String(patientId || '').trim()
  if (!clinic || !id) return []
  await ensureEmrV2Schema()
  const capped = Math.min(Math.max(1, Number(limit) || 200), 1000)
  return withPgClient(async (client) => {
    const { rows } = await client.query(
      `SELECT seq, id, clinica_id, patient_id, entity_table, entity_id, action,
              actor_email, actor_rethus, before_state, after_state,
              prev_chain_hash, chain_hash, created_at
         FROM emr_v2_forensic_audit_trail
        WHERE clinica_id = $1::text AND patient_id = $2::uuid
        ORDER BY seq ASC
        LIMIT $3::int`,
      [clinic, id, capped],
    )
    return rows
  })
}

function chartFormFromLegacy(chart) {
  const draft = chart?.draft
  const payload =
    draft?.payload && typeof draft.payload === 'object' && !Array.isArray(draft.payload)
      ? draft.payload
      : draft && typeof draft === 'object'
        ? draft
        : {}
  const form =
    payload.clinicalDraft ||
    payload.valuationDraft ||
    (Array.isArray(chart?.clinicalRecords) && chart.clinicalRecords[0]?.payload) ||
    payload
  return form && typeof form === 'object' ? form : {}
}

function mapLegacySections(form) {
  return {
    anamnesis: form.anamnesis && typeof form.anamnesis === 'object' ? form.anamnesis : {},
    examen_estomatologico:
      form.stomatologicalExam && typeof form.stomatologicalExam === 'object'
        ? form.stomatologicalExam
        : form.examen_estomatologico && typeof form.examen_estomatologico === 'object'
          ? form.examen_estomatologico
          : {},
    odontograma:
      form.odontogram && typeof form.odontogram === 'object'
        ? form.odontogram
        : form.odontograma && typeof form.odontograma === 'object'
          ? form.odontograma
          : {},
    diagnosticos: Array.isArray(form.diagnoses)
      ? form.diagnoses
      : Array.isArray(form.diagnosticos)
        ? form.diagnosticos
        : [],
    plan_tratamiento:
      form.treatmentPlan && typeof form.treatmentPlan === 'object'
        ? form.treatmentPlan
        : form.plan_tratamiento && typeof form.plan_tratamiento === 'object'
          ? form.plan_tratamiento
          : {},
  }
}

function collectLegacyEvolutions(form, chart) {
  const notes = []
  if (Array.isArray(form.evolutionNotes)) notes.push(...form.evolutionNotes)
  for (const record of Array.isArray(chart?.clinicalRecords) ? chart.clinicalRecords : []) {
    const payload = record?.payload && typeof record.payload === 'object' ? record.payload : record
    if (Array.isArray(payload?.evolutionNotes)) notes.push(...payload.evolutionNotes)
  }
  return notes.filter((n) => n && typeof n === 'object')
}

function legacyEvolutionLocked(note) {
  return note.isLocked === true || Boolean(String(note.signedAt || '').trim() && String(note.contentHash || '').trim())
}

/**
 * Migra un paciente legacy (patient_clinical_charts / clinical-sync) a EMR v2.
 * Extrae binarios pesados hacia emrV2AssetStore.
 */
export async function lazyMigratePatientToEmrV2({
  clinicaId,
  idOrSyncId,
  aliasIds = [],
  actor = {},
  documentNumber = '',
  localId = '',
}) {
  const clinic = String(clinicaId || '').trim()
  const routeId = String(idOrSyncId || '').trim()
  if (!clinic || !routeId) {
    return { ok: false, status: 400, code: 'BAD_REQUEST', error: 'clinicaId e idOrSyncId obligatorios' }
  }

  const existing = await findEmrV2Patient(clinic, routeId)
  if (existing) {
    const [clinicalBase, evolutions, assets] = await Promise.all([
      getEmrV2ClinicalBase(existing.id),
      listEmrV2Evolutions(existing.id),
      listEmrV2Assets(clinic, existing.id),
    ])
    if (clinicalBase) {
      return {
        ok: true,
        status: 200,
        migrated: false,
        patient: existing,
        clinicalBase,
        evolutions,
        assets,
      }
    }
  }

  const { readOrMigratePatientChart } = await import('./clinicalPostgresStore.js')
  const chart = await readOrMigratePatientChart({
    clinicaId: clinic,
    aliasIds,
    routeId,
    patientSyncId: routeId,
    localId,
    documentNumber,
    updatedBy: actor?.email || 'emr-v2-lazy-migrate',
  })
  if (!chart) {
    return { ok: false, status: 404, code: 'NOT_FOUND', error: 'Paciente legacy no encontrado' }
  }

  const form = chartFormFromLegacy(chart)
  const sections = mapLegacySections(form)
  const syncId = String(chart.patientSyncId || routeId).trim()
  const docNumber = String(chart.documentNumber || documentNumber || form.documentNumber || `SYNC-${syncId}`).trim()
  const docType = String(chart.documentType || form.documentType || 'CC').trim() || 'CC'
  const fullName = String(
    chart.fullName ||
      [chart.firstName || form.firstName, chart.lastName || form.lastName].filter(Boolean).join(' ') ||
      form.nombreCompleto ||
      `Paciente ${syncId.slice(0, 8)}`,
  ).trim()

  const { extractAndPersistHeavyBinaries } = await import('./emrV2AssetStore.js')

  await ensureEmrV2Schema()
  return withPgClient(async (client) => {
    await client.query('BEGIN')
    try {
      const who = normalizeActor(actor)
      let patient = existing
      if (!patient) {
        const inserted = await client.query(
          `INSERT INTO emr_v2_patients (
             clinica_id, legacy_sync_id, tipo_documento, numero_documento,
             nombre_completo, datos_demograficos, version, updated_at
           ) VALUES (
             $1::text, $2::text, $3::text, $4::text,
             $5::text, $6::jsonb, 1, NOW()
           )
           ON CONFLICT (clinica_id, legacy_sync_id) DO UPDATE SET
             nombre_completo = EXCLUDED.nombre_completo,
             tipo_documento = EXCLUDED.tipo_documento,
             numero_documento = COALESCE(NULLIF(EXCLUDED.numero_documento, ''), emr_v2_patients.numero_documento),
             updated_at = NOW()
           RETURNING id, clinica_id, legacy_sync_id, tipo_documento, numero_documento,
                     nombre_completo, datos_demograficos, version, updated_at`,
          [
            clinic,
            syncId,
            docType,
            docNumber,
            fullName,
            JSON.stringify({
              firstName: chart.firstName || form.firstName || null,
              lastName: chart.lastName || form.lastName || null,
              source: chart.source || 'legacy',
            }),
          ],
        )
        patient = inserted.rows[0]
        await appendForensicAudit(client, {
          clinicaId: clinic,
          patientId: patient.id,
          entityTable: 'emr_v2_patients',
          entityId: patient.id,
          action: 'patient.lazy_migrate',
          actor: who,
          beforeState: null,
          afterState: { id: patient.id, legacy_sync_id: syncId },
        })
      }

      const sanitizedSections = {}
      const createdAssets = []
      for (const [section, value] of Object.entries(sections)) {
        const extracted = await extractAndPersistHeavyBinaries({
          clinicaId: clinic,
          patientId: patient.id,
          value,
          actor: who,
          defaultAssetType: section === 'odontograma' ? 'foto_clinica' : 'anexo',
          client,
        })
        sanitizedSections[section] = extracted.value
        createdAssets.push(...extracted.assets)
      }

      const hash = contentHashFromSections(sanitizedSections)
      const baseResult = await client.query(
        `INSERT INTO emr_v2_clinical_base (
           patient_id, clinica_id, anamnesis, examen_estomatologico, odontograma,
           diagnosticos, plan_tratamiento, version, content_hash, updated_by, updated_at
         ) VALUES (
           $1::uuid, $2::text, $3::jsonb, $4::jsonb, $5::jsonb,
           $6::jsonb, $7::jsonb, 1, $8::text, $9::text, NOW()
         )
         ON CONFLICT (patient_id) DO UPDATE SET
           anamnesis = EXCLUDED.anamnesis,
           examen_estomatologico = EXCLUDED.examen_estomatologico,
           odontograma = EXCLUDED.odontograma,
           diagnosticos = EXCLUDED.diagnosticos,
           plan_tratamiento = EXCLUDED.plan_tratamiento,
           content_hash = EXCLUDED.content_hash,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING patient_id, clinica_id, anamnesis, examen_estomatologico, odontograma,
                   diagnosticos, plan_tratamiento, version, content_hash, updated_by, updated_at`,
        [
          patient.id,
          clinic,
          JSON.stringify(sanitizedSections.anamnesis),
          JSON.stringify(sanitizedSections.examen_estomatologico),
          JSON.stringify(sanitizedSections.odontograma),
          JSON.stringify(sanitizedSections.diagnosticos),
          JSON.stringify(sanitizedSections.plan_tratamiento),
          hash,
          who.email || who.id || 'lazy-migrate',
        ],
      )
      const clinicalBase = baseResult.rows[0]

      const evolutions = []
      for (const note of collectLegacyEvolutions(form, chart)) {
        const locked = legacyEvolutionLocked(note)
        const contenido = {
          id: note.id || null,
          note: note.note || note.content || note.text || note,
          cups: note.cups || null,
          signedAt: note.signedAt || null,
          contentHash: note.contentHash || null,
        }
        const profesionalId = String(note.professionalId || note.profesional_id || who.id || 'legacy').trim()
        const profesionalNombre = String(
          note.professionalName || note.profesional_nombre || who.nombre || 'Profesional legacy',
        ).trim()
        const rethus = String(note.rethus || note.rethusNumber || who.rethus || 'LEGACY').trim()
        const sealHash = locked
          ? computeEvolutionSealHash({
              contenido,
              profesional_id: profesionalId,
              profesional_nombre: profesionalNombre,
              rethus,
              parent_evolution_id: null,
            })
          : null
        const insertedEv = await client.query(
          `INSERT INTO emr_v2_evolutions (
             patient_id, clinica_id, fecha_atencion, profesional_id, profesional_nombre,
             rethus, contenido, is_locked, locked_at, seal_hash_sha256
           ) VALUES (
             $1::uuid, $2::text, COALESCE($3::timestamptz, NOW()), $4::text, $5::text,
             $6::text, $7::jsonb, $8::boolean, $9::timestamptz, $10::text
           )
           RETURNING id, patient_id, clinica_id, fecha_atencion, profesional_id, profesional_nombre,
                     rethus, contenido, is_locked, locked_at, seal_hash_sha256, parent_evolution_id, created_at`,
          [
            patient.id,
            clinic,
            note.date || note.fecha || note.signedAt || note.createdAt || null,
            profesionalId,
            profesionalNombre,
            rethus,
            JSON.stringify(contenido),
            locked,
            locked ? note.signedAt || new Date().toISOString() : null,
            sealHash,
          ],
        )
        evolutions.push(insertedEv.rows[0])
      }

      await appendForensicAudit(client, {
        clinicaId: clinic,
        patientId: patient.id,
        entityTable: 'emr_v2_clinical_base',
        entityId: String(patient.id),
        action: 'clinical_base.lazy_migrate',
        actor: who,
        beforeState: null,
        afterState: {
          version: clinicalBase.version,
          evolutions: evolutions.length,
          assets: createdAssets.length,
        },
      })

      await client.query('COMMIT')
      const assets = await listEmrV2Assets(clinic, patient.id)
      return {
        ok: true,
        status: 200,
        migrated: true,
        patient,
        clinicalBase,
        evolutions,
        assets: assets.length ? assets : createdAssets,
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

/**
 * Historia completa normalizada (con lazy migration transparente).
 */
export async function getOrMigrateEmrV2Chart(input) {
  const result = await lazyMigratePatientToEmrV2(input)
  if (!result.ok) return result
  return {
    ok: true,
    status: 200,
    migrated: Boolean(result.migrated),
    patient: result.patient,
    clinicalBase: result.clinicalBase,
    evolutions: result.evolutions || [],
    assets: result.assets || [],
  }
}

/**
 * Intento explícito de mutar/borrar una evolución (para tests / API futura).
 * Debe fallar si is_locked.
 */
export async function mutateLockedEvolutionForbidden(clinicaId, evolutionId, mode = 'update') {
  const clinic = String(clinicaId || '').trim()
  const id = String(evolutionId || '').trim()
  if (!clinic || !id) {
    return { ok: false, status: 400, code: 'BAD_REQUEST' }
  }
  await ensureEmrV2Schema()
  return withPgClient(async (client) => {
    await client.query('BEGIN')
    try {
      if (mode === 'delete') {
        await client.query(
          `DELETE FROM emr_v2_evolutions WHERE id = $1::uuid AND clinica_id = $2::text`,
          [id, clinic],
        )
      } else {
        await client.query(
          `UPDATE emr_v2_evolutions
              SET contenido = contenido
            WHERE id = $1::uuid AND clinica_id = $2::text`,
          [id, clinic],
        )
      }
      await client.query('COMMIT')
      return { ok: true, status: 200 }
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      if (/LEGAL_IMMUTABILITY_VIOLATION/.test(String(error?.message || ''))) {
        return {
          ok: false,
          status: 403,
          code: 'LEGAL_IMMUTABILITY_VIOLATION',
          error: String(error.message),
        }
      }
      throw error
    }
  })
}
