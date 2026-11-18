/**
 * Índice chico de exámenes complementarios ya subidos a Drive.
 * El POST /upload escribe aquí y responde. No abre clinical-sync.json.
 * El pull slim y saveStore superponen este archivo para no perder driveFileId.
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { config } from '../config.js'

const LIGHT_KEYS = [
  'id',
  'patientId',
  'patientSyncId',
  'clinicId',
  'encounterId',
  'fileName',
  'fileType',
  'mimeType',
  'receivedAt',
  'createdAt',
  'comments',
  'fileHash',
  'sha256',
  'driveFileId',
  'webViewLink',
  'driveWebViewLink',
  'byteLength',
  'storageBackend',
  'driveUploadStatus',
  'explicitDelete',
  'deletedBy',
  'updatedAt',
]

const DEFAULT_INDEX_FILE = join(config.dataDir, 'diagnostic-aid-index.json')

let indexFilePath = process.env.DIAGNOSTIC_AID_INDEX_PATH || DEFAULT_INDEX_FILE
let writeChain = Promise.resolve()

function emptyIndex() {
  return { version: 1, updatedAt: null, clinics: {} }
}

function stamp(record) {
  const deleted = Date.parse(record?.deletedAt || '') || 0
  const updated = Date.parse(record?.updatedAt || record?.payload?.updatedAt || '') || 0
  return Math.max(deleted, updated)
}

function enqueueIndexWrite(fn) {
  const next = writeChain.then(fn, fn)
  writeChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

/** Solo tests. Apunta el índice a un archivo temporal. */
export function setDiagnosticAidIndexPathForTests(filePath) {
  indexFilePath = filePath || DEFAULT_INDEX_FILE
  writeChain = Promise.resolve()
}

export function toDiagnosticAidIndexRecord(clinicId, meta = {}) {
  const canonical = String(clinicId || meta.clinicId || '').trim()
  const aidId = String(meta.id || meta.aidId || meta.syncId || '').trim()
  const now = new Date().toISOString()
  const source = meta && typeof meta === 'object' ? meta : {}
  const payloadIn =
    source.payload && typeof source.payload === 'object' && !Array.isArray(source.payload)
      ? { ...source.payload, ...source }
      : source
  const payload = {}
  for (const key of LIGHT_KEYS) {
    const value = payloadIn[key]
    if (value == null || value === '') continue
    if (typeof value === 'string' && value.length > 50_000) continue
    payload[key] = value
  }
  if (aidId) payload.id = aidId
  if (canonical) payload.clinicId = canonical
  if (payload.fileHash && !payload.sha256) payload.sha256 = payload.fileHash
  if (payload.webViewLink && !payload.driveWebViewLink) {
    payload.driveWebViewLink = payload.webViewLink
  }
  if (payload.driveFileId) {
    payload.storageBackend = 'google_drive'
    if (!payload.driveUploadStatus) payload.driveUploadStatus = 'uploaded'
  }
  if (payload.byteLength != null) payload.byteLength = Number(payload.byteLength) || 0
  const updatedAt = String(source.updatedAt || payload.updatedAt || now)
  payload.updatedAt = updatedAt
  return {
    syncId: aidId,
    clinicId: canonical,
    updatedAt,
    deletedAt: source.deletedAt ? String(source.deletedAt) : null,
    payload,
  }
}

async function writeIndexAtomic(index) {
  await mkdir(dirname(indexFilePath), { recursive: true })
  const tmpPath = `${indexFilePath}.tmp-${process.pid}`
  await writeFile(tmpPath, JSON.stringify(index), 'utf8')
  try {
    await rename(tmpPath, indexFilePath)
  } catch (error) {
    try {
      await unlink(indexFilePath)
    } catch {
      // El destino puede no existir.
    }
    try {
      await rename(tmpPath, indexFilePath)
    } catch (retryError) {
      try {
        await unlink(tmpPath)
      } catch {
        // ignore
      }
      throw retryError || error
    }
  }
}

export async function readDiagnosticAidIndex() {
  try {
    const raw = await readFile(indexFilePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !parsed.clinics || typeof parsed.clinics !== 'object') {
      return emptyIndex()
    }
    return parsed
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyIndex()
    console.error(
      '[diagnostic-aid-index] No se pudo leer el índice:',
      error instanceof Error ? error.message : error,
    )
    return emptyIndex()
  }
}

/**
 * Una ficha de examen. Ignora base64 y no toca el JSON clínico grande.
 */
export async function upsertDiagnosticAidIndexEntry(clinicId, meta = {}) {
  const record = toDiagnosticAidIndexRecord(clinicId, meta)
  const canonical = record.clinicId
  const aidId = record.syncId
  if (!canonical) {
    const err = new Error('clinicId canónico vacío; no se guardó el metadato del examen.')
    err.code = 'CLINIC_REQUIRED'
    throw err
  }
  if (!aidId) {
    const err = new Error('aidId es obligatorio para persistir el examen.')
    err.code = 'INVALID_AID'
    throw err
  }

  return enqueueIndexWrite(async () => {
    const index = await readDiagnosticAidIndex()
    if (!index.clinics || typeof index.clinics !== 'object') index.clinics = {}
    if (!index.clinics[canonical] || typeof index.clinics[canonical] !== 'object') {
      index.clinics[canonical] = {}
    }
    const prev = index.clinics[canonical][aidId]
    if (prev?.deletedAt && stamp(prev) > stamp(record)) {
      return { ok: true, aidId, skipped: 'deleted' }
    }
    index.clinics[canonical][aidId] = record
    index.version = 1
    index.updatedAt = new Date().toISOString()
    await writeIndexAtomic(index)
    return { ok: true, aidId, metadataPersisted: true }
  })
}

function payloadOf(record) {
  return record?.payload && typeof record.payload === 'object' ? record.payload : {}
}

/** El registro más nuevo gana. Un driveFileId ya confirmado no se pierde. */
export function mergeDiagnosticAidIndexRecord(prev, next) {
  if (!prev) return next
  if (!next) return prev
  const nextWins = stamp(next) >= stamp(prev)
  const winner = nextWins ? next : prev
  const other = nextWins ? prev : next
  if (winner.deletedAt && stamp(winner) >= stamp(other)) return winner
  const winnerPayload = payloadOf(winner)
  const otherPayload = payloadOf(other)
  if (!winnerPayload.driveFileId && otherPayload.driveFileId) {
    return {
      ...winner,
      payload: {
        ...winnerPayload,
        driveFileId: otherPayload.driveFileId,
        webViewLink: winnerPayload.webViewLink || otherPayload.webViewLink,
        driveWebViewLink:
          winnerPayload.driveWebViewLink ||
          otherPayload.driveWebViewLink ||
          otherPayload.webViewLink,
        storageBackend: 'google_drive',
        driveUploadStatus: winnerPayload.driveUploadStatus || 'uploaded',
        byteLength: winnerPayload.byteLength || otherPayload.byteLength,
      },
    }
  }
  return winner
}

export function overlayDiagnosticAidRecords(baseMap, indexMap) {
  const out = { ...(baseMap && typeof baseMap === 'object' ? baseMap : {}) }
  const incoming = indexMap && typeof indexMap === 'object' ? indexMap : {}
  for (const [aidId, record] of Object.entries(incoming)) {
    if (!record || typeof record !== 'object') continue
    out[aidId] = mergeDiagnosticAidIndexRecord(out[aidId], record)
  }
  return out
}

/** Superpone el índice sobre el cubo ya fusionado del pull (solo ids del scope). */
export function overlayClinicDiagnosticAids(clinic, index, ids = []) {
  if (!clinic || typeof clinic !== 'object') return clinic
  const allowed = new Set(
    (Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean),
  )
  let aids = clinic.diagnosticAids && typeof clinic.diagnosticAids === 'object' ? clinic.diagnosticAids : {}
  const clinics = index?.clinics && typeof index.clinics === 'object' ? index.clinics : {}
  for (const [clinicId, bucket] of Object.entries(clinics)) {
    if (allowed.size && !allowed.has(clinicId)) continue
    aids = overlayDiagnosticAidRecords(aids, bucket)
  }
  clinic.diagnosticAids = aids
  return clinic
}

/**
 * Tras armar clinical-sync-meta.json desde el store grande, vuelve a poner
 * los exámenes que solo viven en el índice.
 */
export function overlayIndexOntoMeta(meta, index) {
  if (!meta || typeof meta !== 'object') return meta
  if (!meta.clinics || typeof meta.clinics !== 'object') meta.clinics = {}
  const clinics = index?.clinics && typeof index.clinics === 'object' ? index.clinics : {}
  for (const [clinicId, bucket] of Object.entries(clinics)) {
    if (!bucket || typeof bucket !== 'object') continue
    if (!meta.clinics[clinicId] || typeof meta.clinics[clinicId] !== 'object') {
      meta.clinics[clinicId] = { patients: {}, appointments: {}, diagnosticAids: {} }
    }
    const clinic = meta.clinics[clinicId]
    clinic.diagnosticAids = overlayDiagnosticAidRecords(clinic.diagnosticAids, bucket)
  }
  return meta
}
