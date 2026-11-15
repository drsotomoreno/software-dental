#!/usr/bin/env node
/**
 * Construye clinical-sync-meta.json (patients, appointments y metadatos de exámenes).
 * Uso en EC2 con heap alto (una vez), sin tocar clinical-sync.json ni .bak-*:
 *   node --max-old-space-size=1536 scripts/build-clinical-sync-meta.cjs
 *
 * El pull slim (full=0) lee este archivo en lugar de parsear ~83MB.
 * diagnosticAids guarda solo metadatos livianos: nunca base64 ni buffers.
 */
const fs = require('node:fs')
const path = require('node:path')

function resolveSyncPath() {
  const candidates = [
    process.env.CLINICAL_SYNC_PATH,
    path.resolve(process.cwd(), 'server/data/clinical-sync.json'),
    '/home/ubuntu/software-dental/server/data/clinical-sync.json',
    '/var/www/mihistoriadental/server/data/clinical-sync.json',
  ].filter(Boolean)
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  throw new Error('clinical-sync.json no encontrado')
}

const DIAGNOSTIC_AID_LIGHT_KEYS = [
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
  'updatedAt',
]

function isHeavyBinaryString(entry) {
  if (typeof entry !== 'string' || entry.length <= 50000) return false
  return /^data:/i.test(entry) || /^[A-Za-z0-9+/=\s]+$/.test(entry.slice(0, 120))
}

function lightDiagnosticAid(record) {
  if (!record || typeof record !== 'object') return null
  const payloadIn =
    record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
      ? record.payload
      : record
  const payload = {}
  for (const key of DIAGNOSTIC_AID_LIGHT_KEYS) {
    const value = payloadIn[key]
    if (value == null || value === '') continue
    if (isHeavyBinaryString(value)) continue
    payload[key] = value
  }
  const syncId = String(record.syncId || payload.id || '').trim()
  if (!syncId) return null
  payload.id = payload.id || syncId
  if (payload.driveFileId) {
    payload.storageBackend = 'google_drive'
    if (!payload.driveUploadStatus) payload.driveUploadStatus = 'uploaded'
  }
  return {
    syncId,
    clinicId: record.clinicId || payload.clinicId || '',
    updatedAt: String(record.updatedAt || payload.updatedAt || ''),
    deletedAt: record.deletedAt ? String(record.deletedAt) : null,
    payload,
  }
}

function metaDiagnosticAids(clinic) {
  const map =
    clinic.diagnosticAids && typeof clinic.diagnosticAids === 'object'
      ? clinic.diagnosticAids
      : {}
  const out = {}
  for (const record of Object.values(map)) {
    const light = lightDiagnosticAid(record)
    if (!light) continue
    out[light.syncId] = light
  }
  return out
}

function main() {
  const syncPath = resolveSyncPath()
  const metaPath = syncPath.replace(/clinical-sync\.json$/i, 'clinical-sync-meta.json')
  const st = fs.statSync(syncPath)
  console.log(`SOURCE=${syncPath} bytes=${st.size}`)

  const store = JSON.parse(fs.readFileSync(syncPath, 'utf8'))
  const clinicsIn = store?.clinics && typeof store.clinics === 'object' ? store.clinics : {}
  const clinicsOut = {}
  let patientCount = 0
  let appointmentCount = 0
  let diagnosticAidCount = 0

  for (const [clinicId, clinic] of Object.entries(clinicsIn)) {
    if (!clinic || typeof clinic !== 'object') continue
    const patients =
      clinic.patients && typeof clinic.patients === 'object' ? clinic.patients : {}
    const appointments =
      clinic.appointments && typeof clinic.appointments === 'object'
        ? clinic.appointments
        : {}
    const diagnosticAids = metaDiagnosticAids(clinic)
    clinicsOut[clinicId] = { patients, appointments, diagnosticAids }
    patientCount += Object.keys(patients).length
    appointmentCount += Object.keys(appointments).length
    diagnosticAidCount += Object.keys(diagnosticAids).length
  }

  const meta = {
    version: 1,
    updatedAt: new Date().toISOString(),
    sourceMtimeMs: st.mtimeMs,
    sourceSize: st.size,
    clinics: clinicsOut,
  }

  const tmp = `${metaPath}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(meta))
  fs.renameSync(tmp, metaPath)
  const outStat = fs.statSync(metaPath)
  console.log(
    JSON.stringify(
      {
        ok: true,
        metaPath,
        metaBytes: outStat.size,
        clinicKeys: Object.keys(clinicsOut).length,
        patientCount,
        appointmentCount,
        diagnosticAidCount,
      },
      null,
      2,
    ),
  )
}

main()
