/**
 * Migración de firmas base64 → Google Drive.
 * No arranca el servidor HTTP. Por defecto es dry-run.
 *
 *   node scripts/migrate-signatures-to-drive.mjs
 *   node scripts/migrate-signatures-to-drive.mjs --apply
 */
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../server/config.js'
import { withPgClient } from '../server/services/durableStore.js'
import { writeDurableJsonReplace } from '../server/services/durableStore.js'
import { offloadSignaturesInPayload } from '../server/services/signatureDriveService.js'
import { isSignatureDataUrl, jsonUtf8Bytes } from '../shared/signatureDriveRef.js'

const STORE_FILE = join(config.dataDir, 'clinical-sync.json')
const STORE_KEY = 'clinical-sync'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APPLY = process.argv.includes('--apply')
const BUDGET_MS = 24 * 60 * 60 * 1000

function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

function stampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function readStore() {
  try {
    const info = await stat(STORE_FILE)
    const raw = await readFile(STORE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return { info, store: parsed && typeof parsed === 'object' ? parsed : { clinics: {} } }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { info: null, store: { clinics: {} } }
    throw error
  }
}

function clinicEntries(store) {
  const clinics = store?.clinics && typeof store.clinics === 'object' ? store.clinics : null
  if (clinics) return Object.entries(clinics)
  return [['clinica', store]]
}

async function offloadPostgresColumn(table, apply) {
  let rows = []
  try {
    rows = await withPgClient(async (client) => {
      const { rows: found } = await client.query(
        `SELECT id::text AS id, clinic_id::text AS clinic_id, signature_base64
         FROM ${table}
         WHERE signature_base64 LIKE 'data:image/%'`,
      )
      return found
    })
  } catch (error) {
    console.warn(
      `[migrate-signatures] Postgres ${table} no disponible:`,
      error instanceof Error ? error.message : error,
    )
    return { migrated: 0, pending: 0, bytesSaved: 0 }
  }

  let migrated = 0
  let pending = 0
  let bytesSaved = 0
  for (const row of rows) {
    if (!isSignatureDataUrl(row.signature_base64)) continue
    const before = Buffer.byteLength(String(row.signature_base64), 'utf8')
    const options = { clinicId: row.clinic_id, budgetMs: BUDGET_MS }
    if (!apply) {
      let seq = 0
      options.isDriveConnected = async () => true
      options.uploadSignature = async () => {
        seq += 1
        return { driveFileId: `dryrun-pg-${seq}` }
      }
    }
    const result = await offloadSignaturesInPayload(
      { signatureBase64: row.signature_base64 },
      options,
    )
    const next = String(result.payload?.signatureBase64 || row.signature_base64)
    bytesSaved += Math.max(0, before - Buffer.byteLength(next, 'utf8'))
    if (!result.migrated) {
      pending += 1
      continue
    }
    migrated += 1
    if (!apply) continue
    await withPgClient(async (client) => {
      await client.query(
        `UPDATE ${table}
         SET signature_base64 = $1::text
         WHERE id::text = $2::text`,
        [next, row.id],
      )
    })
  }
  return { migrated, pending, bytesSaved }
}

async function main() {
  console.log(APPLY ? 'Modo --apply' : 'Modo --dry-run (no escribe ni sube a Drive)')
  const { info, store } = await readStore()
  if (!info) {
    console.log(`No existe ${STORE_FILE}`)
  } else {
    console.log(`clinical-sync.json: ${formatBytes(info.size)}`)
  }

  const bytesBefore = jsonUtf8Bytes(store)
  let migrated = 0
  let pending = 0
  let skipped = 0
  const nextStore = store

  for (const [clinicId, clinic] of clinicEntries(nextStore)) {
    if (!clinic || typeof clinic !== 'object') continue
    const options = { clinicId, budgetMs: BUDGET_MS }
    if (!APPLY) {
      let seq = 0
      options.isDriveConnected = async () => true
      options.uploadSignature = async () => {
        seq += 1
        return { driveFileId: `dryrun${clinicId}-${seq}`.slice(0, 80) }
      }
    }
    const result = await offloadSignaturesInPayload(clinic, options)
    if (store.clinics && store.clinics[clinicId]) store.clinics[clinicId] = result.payload
    migrated += result.migrated
    pending += result.pending
    skipped += result.skipped
    console.log(
      `  ${clinicId}: migradas=${result.migrated} pendientes=${result.pending} yaEnDrive=${result.skipped} ahorro=${formatBytes(result.bytesSaved)}`,
    )
  }

  const bytesAfter = jsonUtf8Bytes(store)
  const saved = Math.max(0, bytesBefore - bytesAfter)

  if (APPLY && migrated > 0) {
    const backupDir = join(ROOT, 'backups')
    await mkdir(backupDir, { recursive: true })
    const backupPath = join(backupDir, `pre-migrate-signatures-${stampForFile()}.json`)
    if (info) {
      await copyFile(STORE_FILE, backupPath)
      console.log(`Respaldo: ${backupPath}`)
    }
    await writeDurableJsonReplace(STORE_FILE, store, STORE_KEY)
    console.log('clinical-sync.json actualizado (disco y app_json_store).')
  } else if (APPLY) {
    console.log('No se escribió clinical-sync.json: ninguna firma quedó subida a Drive.')
  }

  let pgMigrated = 0
  let pgPending = 0
  let pgSaved = 0
  for (const table of ['kiosk_signatures', 'patients']) {
    const pg = await offloadPostgresColumn(table, APPLY)
    pgMigrated += pg.migrated
    pgPending += pg.pending
    pgSaved += pg.bytesSaved
    console.log(
      `  Postgres ${table}: ${APPLY ? 'migradas' : 'se migrarían'}=${pg.migrated} pendientes=${pg.pending} ahorro=${formatBytes(pg.bytesSaved)}`,
    )
  }

  console.log('---')
  console.log(
    `${APPLY ? 'Firmas migradas' : 'Firmas que se migrarían'}: ${migrated + pgMigrated}`,
  )
  console.log(`Firmas pendientes (sin Drive o error de red): ${pending + pgPending}`)
  console.log(`Firmas que ya eran referencia Drive: ${skipped}`)
  console.log(`Peso JSON antes: ${formatBytes(bytesBefore)}`)
  console.log(`Peso JSON después: ${formatBytes(bytesAfter)}`)
  console.log(`Reducción del JSON clínico: ${formatBytes(saved + pgSaved)}`)
  if (!APPLY) console.log('Dry-run: no hubo escrituras. Use --apply para subir y reemplazar.')
}

main().catch((error) => {
  console.error('[migrate-signatures]', error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
})
