#!/usr/bin/env node
/**
 * Corrige flags de Isabel De la Rosa (CC 37861325) → paciente ACTIVA.
 * syncId: 4a08b227-da3d-45f6-8325-a0ec906a45c9
 *
 * - treatmentCompleted → false (estaba true → listado Terminados por error)
 * - valuationOnly → false
 * - phase → TRATAMIENTO_ACEPTADO (coherente con activa; no VALORACION_RAPIDA)
 *
 * NO toca .bak-*. Reescribe clinical-sync.json + clinical-sync-meta.json.
 *
 *   node --max-old-space-size=1536 scripts/fix-isabel-active-flags.cjs
 */
const fs = require('node:fs')
const path = require('node:path')

const SYNC_ID = '4a08b227-da3d-45f6-8325-a0ec906a45c9'
const DOC = '37861325'
const CANONICAL = 'clinic:doctormauriciosoto@gmail.com'

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

function atomicWrite(filePath, value) {
  const tmp = `${filePath}.tmp-${process.pid}`
  fs.writeFileSync(tmp, typeof value === 'string' ? value : JSON.stringify(value))
  fs.renameSync(tmp, filePath)
}

function main() {
  const syncPath = resolveSyncPath()
  const metaPath = syncPath.replace(/clinical-sync\.json$/i, 'clinical-sync-meta.json')
  console.log(`SOURCE=${syncPath}`)

  const store = JSON.parse(fs.readFileSync(syncPath, 'utf8'))
  const clinic = store?.clinics?.[CANONICAL]
  if (!clinic?.patients) throw new Error(`Cubo ${CANONICAL} ausente`)

  let rec = clinic.patients[SYNC_ID]
  if (!rec) {
    rec = Object.values(clinic.patients).find((r) => {
      const pay = r?.payload && typeof r.payload === 'object' ? r.payload : {}
      return String(pay.documentNumber || '') === DOC
    })
  }
  if (!rec) throw new Error(`Isabel (${DOC}) no encontrada`)

  const pay = rec.payload && typeof rec.payload === 'object' ? { ...rec.payload } : {}
  const before = {
    syncId: rec.syncId,
    valuationOnly: pay.valuationOnly,
    phase: pay.phase,
    treatmentCompleted: pay.treatmentCompleted,
  }

  pay.valuationOnly = false
  pay.treatmentCompleted = false
  pay.phase = 'TRATAMIENTO_ACEPTADO'
  pay.updatedAt = new Date().toISOString()
  pay.serverUpdatedAt = pay.updatedAt

  const next = {
    ...rec,
    payload: pay,
    updatedAt: pay.updatedAt,
    serverUpdatedAt: pay.updatedAt,
    deletedAt: null,
  }
  clinic.patients[String(next.syncId || SYNC_ID)] = next

  // Backup puntual junto al sync (no es .bak-20261112 protegido).
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  fs.copyFileSync(syncPath, `${syncPath}.bak-isabel-active-${stamp}`)

  atomicWrite(syncPath, store)

  // Regenerar meta liviano
  const st = fs.statSync(syncPath)
  const clinicsOut = {}
  for (const [id, c] of Object.entries(store.clinics || {})) {
    if (!c || typeof c !== 'object') continue
    clinicsOut[id] = {
      patients: c.patients && typeof c.patients === 'object' ? c.patients : {},
      appointments: c.appointments && typeof c.appointments === 'object' ? c.appointments : {},
    }
  }
  atomicWrite(metaPath, {
    version: 1,
    updatedAt: new Date().toISOString(),
    sourceMtimeMs: st.mtimeMs,
    sourceSize: st.size,
    clinics: clinicsOut,
  })

  const afterPay = next.payload
  console.log(
    JSON.stringify(
      {
        ok: true,
        before,
        after: {
          syncId: next.syncId,
          valuationOnly: afterPay.valuationOnly,
          phase: afterPay.phase,
          treatmentCompleted: afterPay.treatmentCompleted,
          documentNumber: afterPay.documentNumber,
          firstName: afterPay.firstName,
          lastName: afterPay.lastName,
        },
        bucket: 'activo',
        metaPath,
      },
      null,
      2,
    ),
  )
}

main()
