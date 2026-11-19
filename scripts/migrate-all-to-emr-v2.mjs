#!/usr/bin/env node
/**
 * Migración masiva idempotente → EMR v2 (RDS).
 * Uso (en EC2 / local con DATABASE_URL):
 *   node scripts/migrate-all-to-emr-v2.mjs
 *   node scripts/migrate-all-to-emr-v2.mjs --dry-run
 *   node scripts/migrate-all-to-emr-v2.mjs --clinic=clinic:doctormauriciosoto@gmail.com
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
dotenv.config({ path: join(root, '.env') })
dotenv.config({ path: join(root, 'server', '.env') })

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const clinicArg = args.find((a) => a.startsWith('--clinic='))
const onlyClinic = clinicArg ? clinicArg.slice('--clinic='.length).trim() : ''

const { ensureEmrV2Schema, lazyMigratePatientToEmrV2 } = await import(
  '../server/services/emrV2Store.js'
)
const { config } = await import('../server/config.js')

const SYNC_FILE = join(config.dataDir, 'clinical-sync.json')

function listPatientsFromClinicBucket(bucket) {
  const out = []
  const patients = bucket?.patients && typeof bucket.patients === 'object' ? bucket.patients : {}
  for (const [key, raw] of Object.entries(patients)) {
    if (!raw || typeof raw !== 'object') continue
    const syncId = String(raw.syncId || raw.patientSyncId || key || '').trim()
    if (!syncId) continue
    out.push({
      syncId,
      documentNumber: String(raw.documentNumber || '').trim(),
      localId: raw.id != null ? String(raw.id) : '',
      firstName: raw.firstName,
      lastName: raw.lastName,
    })
  }
  // Drafts / clinicalRecords pueden referenciar pacientes sin fila en patients.
  for (const draft of Object.values(bucket?.drafts || {})) {
    const syncId = String(draft?.patientSyncId || draft?.payload?.patientSyncId || '')
      .replace(/^draft:/, '')
      .trim()
    if (syncId && !out.some((p) => p.syncId === syncId)) {
      out.push({
        syncId,
        documentNumber: String(draft?.payload?.documentNumber || '').trim(),
        localId: String(draft?.patientId || draft?.payload?.patientId || ''),
      })
    }
  }
  return out
}

async function main() {
  console.log(`[migrate-emr-v2] Inicio ${dryRun ? '(dry-run) ' : ''}→ ${SYNC_FILE}`)
  await ensureEmrV2Schema()

  let store = {}
  try {
    const raw = await readFile(SYNC_FILE, 'utf8')
    store = JSON.parse(raw)
  } catch (error) {
    console.error('[migrate-emr-v2] No se pudo leer clinical-sync.json:', error.message)
    process.exit(1)
  }

  const clinics =
    store?.clinics && typeof store.clinics === 'object'
      ? store.clinics
      : store && typeof store === 'object'
        ? { default: store }
        : {}

  let patientsTotal = 0
  let migrated = 0
  let skipped = 0
  let failed = 0
  let evolutionsTotal = 0
  let assetsTotal = 0

  for (const [clinicKey, bucket] of Object.entries(clinics)) {
    const clinicaId = String(clinicKey || '').trim()
    if (!clinicaId) continue
    if (onlyClinic && clinicaId !== onlyClinic && !clinicaId.includes(onlyClinic)) continue

    const patients = listPatientsFromClinicBucket(bucket || {})
    console.log(`[migrate-emr-v2] Clínica ${clinicaId}: ${patients.length} pacientes`)

    for (const patient of patients) {
      patientsTotal += 1
      if (dryRun) {
        skipped += 1
        continue
      }
      try {
        const result = await lazyMigratePatientToEmrV2({
          clinicaId,
          idOrSyncId: patient.syncId,
          documentNumber: patient.documentNumber,
          localId: patient.localId,
          actor: {
            email: 'migrate-all-to-emr-v2@system',
            id: 'migrate-script',
            nombre: 'Migración EMR v2',
            rethus: 'SYSTEM',
          },
        })
        if (!result.ok) {
          failed += 1
          console.warn(`  · FAIL ${patient.syncId}: ${result.error || result.code}`)
          continue
        }
        if (result.migrated) migrated += 1
        else skipped += 1
        evolutionsTotal += Array.isArray(result.evolutions) ? result.evolutions.length : 0
        assetsTotal += Array.isArray(result.assets) ? result.assets.length : 0
      } catch (error) {
        failed += 1
        console.warn(
          `  · ERROR ${patient.syncId}:`,
          error instanceof Error ? error.message : error,
        )
      }
    }
  }

  console.log('\n========== RESUMEN EMR v2 ==========')
  console.log(`Pacientes encontrados : ${patientsTotal}`)
  console.log(`Migrados (nuevos)     : ${migrated}`)
  console.log(`Ya en v2 / dry-run    : ${skipped}`)
  console.log(`Fallidos              : ${failed}`)
  console.log(`Evoluciones tocadas   : ${evolutionsTotal}`)
  console.log(`Assets registrados    : ${assetsTotal}`)
  console.log('====================================\n')

  if (failed > 0) process.exitCode = 2
}

main().catch((error) => {
  console.error('[migrate-emr-v2] Abortado:', error)
  process.exit(1)
})
