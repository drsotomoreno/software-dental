/**
 * Bitácora clínica append-only (Res. 1995).
 *
 * Orden médico-legal:
 * 1) Espejo inmediato en clinicBucket → clinical-sync.json (nunca bloqueado por RDS).
 * 2) INSERT opcional a PostgreSQL con timeout corto; fallo/latencia → solo warn.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPgClient } from './durableStore.js'
import { splitSqlStatements } from './consultasRepository.js'

const DIR = dirname(fileURLToPath(import.meta.url))
const MIGRATION = join(DIR, '../db/migrations/20261118180000_clinical_audit_logs.sql')
const PG_TIMEOUT_MS = 2_500

let schemaReady = null

function withTimeout(promise, ms, label) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms)
    }),
  ])
}

async function ensureSchema() {
  if (schemaReady) return schemaReady
  schemaReady = (async () => {
    const sql = await readFile(MIGRATION, 'utf8')
    await withPgClient(async (client) => {
      for (const statement of splitSqlStatements(sql)) {
        await client.query(statement)
      }
    })
  })().catch((error) => {
    schemaReady = null
    throw error
  })
  return schemaReady
}

function asEntry(raw, clinicId) {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id || '').trim()
  const patientSyncId = String(raw.patientSyncId || raw.patient_sync_id || '').trim()
  if (!id || !patientSyncId) return null
  return {
    id,
    patientSyncId,
    clinicaId: String(raw.clinicaId || raw.clinica_id || clinicId || ''),
    userId: String(raw.userId || raw.user_id || ''),
    userEmail: String(raw.userEmail || raw.user_email || ''),
    clinicalRevision: Math.max(0, Number(raw.clinicalRevision || raw.clinical_revision) || 0),
    contentHash: String(raw.contentHash || raw.content_hash || ''),
    changedSections: Array.isArray(raw.changedSections)
      ? raw.changedSections
      : Array.isArray(raw.changed_sections)
        ? raw.changed_sections
        : [],
    source: String(raw.source || 'autosave'),
    createdAt: String(raw.createdAt || raw.created_at || new Date().toISOString()),
  }
}

/**
 * Persistencia Postgres en background. Nunca rechaza al caller del push.
 * @param {string} clinicId
 * @param {object[]} entries
 */
function persistPostgresInBackground(clinicId, entries) {
  void withTimeout(
    (async () => {
      await ensureSchema()
      await withPgClient(async (client) => {
        for (const entry of entries) {
          await client.query(
            `INSERT INTO clinical_audit_logs (
              id, patient_sync_id, clinica_id, user_id, user_email,
              clinical_revision, content_hash, changed_sections, source, created_at
            ) VALUES (
              $1::uuid, $2::text, $3::text, $4::text, $5::text,
              $6::int, $7::text, $8::jsonb, $9::text, $10::timestamptz
            ) ON CONFLICT (id) DO NOTHING`,
            [
              entry.id,
              entry.patientSyncId,
              entry.clinicaId || clinicId,
              entry.userId,
              entry.userEmail,
              entry.clinicalRevision,
              entry.contentHash,
              JSON.stringify(entry.changedSections),
              entry.source,
              entry.createdAt,
            ],
          )
        }
      })
    })(),
    PG_TIMEOUT_MS,
    'clinical_audit_logs',
  ).catch((error) => {
    console.warn(
      '[ClinicalAudit] Postgres omitido; espejo clinical-sync.json intacto:',
      error instanceof Error ? error.message : error,
    )
  })
}

/**
 * @param {string} clinicId
 * @param {unknown[]} rows
 * @param {object} clinicBucket — mutado: clinic.clinicalAuditLogs
 * @returns {Promise<number>} filas nuevas en el espejo JSON (no espera RDS)
 */
export async function appendClinicalAuditLogs(clinicId, rows, clinicBucket) {
  const list = Array.isArray(rows) ? rows : []
  if (list.length === 0) return 0

  if (!clinicBucket.clinicalAuditLogs || typeof clinicBucket.clinicalAuditLogs !== 'object') {
    clinicBucket.clinicalAuditLogs = {}
  }

  const fresh = []
  let written = 0
  for (const raw of list) {
    const entry = asEntry(raw, clinicId)
    if (!entry) continue
    // Append-only: nunca sobrescribir una fila existente en el espejo.
    if (!clinicBucket.clinicalAuditLogs[entry.id]) {
      clinicBucket.clinicalAuditLogs[entry.id] = entry
      fresh.push(entry)
      written += 1
    }
  }

  // RDS es best-effort: no await → saveStore(clinical-sync.json) no espera a Postgres.
  if (fresh.length > 0) {
    persistPostgresInBackground(clinicId, fresh)
  }

  return written
}
