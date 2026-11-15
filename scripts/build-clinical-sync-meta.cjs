#!/usr/bin/env node
/**
 * Construye clinical-sync-meta.json (solo patients + appointments por clínica).
 * Uso en EC2 con heap alto (una vez), sin tocar clinical-sync.json ni .bak-*:
 *   node --max-old-space-size=1536 scripts/build-clinical-sync-meta.cjs
 *
 * El pull slim (full=0) lee este archivo (~0.1MB) en lugar de parsear ~83MB.
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

  for (const [clinicId, clinic] of Object.entries(clinicsIn)) {
    if (!clinic || typeof clinic !== 'object') continue
    const patients =
      clinic.patients && typeof clinic.patients === 'object' ? clinic.patients : {}
    const appointments =
      clinic.appointments && typeof clinic.appointments === 'object'
        ? clinic.appointments
        : {}
    clinicsOut[clinicId] = { patients, appointments }
    patientCount += Object.keys(patients).length
    appointmentCount += Object.keys(appointments).length
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
      },
      null,
      2,
    ),
  )
}

main()
