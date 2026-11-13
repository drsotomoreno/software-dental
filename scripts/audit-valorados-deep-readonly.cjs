#!/usr/bin/env node
/**
 * READ-ONLY: compara clinical-sync activo vs .bak-20261112.
 * Uso: node scripts/audit-valorados-deep-readonly.cjs /path/to/clinical-sync.json
 * No escribe ni modifica ningún archivo.
 */
const { existsSync, readFileSync, statSync } = require('node:fs')

const activePath = process.argv[2] || ''
const bakPath = activePath ? `${activePath}.bak-20261112` : ''
const clinicKey = 'clinic:doctormauriciosoto@gmail.com'
const probes = [
  '017ed372-ad13-42cc-8bc4-eea603634278',
  '04c42991-f8b4-432b-813a-28c54db80a26',
]

function asObj(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v
}

function coerceBool(v) {
  if (v === true || v === 1) return true
  if (v === false || v === 0) return false
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1' || s === 'yes' || s === 'si') return true
    if (s === 'false' || s === '0' || s === 'no') return false
  }
  return undefined
}

function extractPatientFields(rec) {
  const top = asObj(rec) || {}
  const payload = asObj(top.payload) || {}
  const nestedPayload = asObj(payload.payload) || {}
  const data = asObj(payload.data) || asObj(top.data) || {}
  const nestedData = asObj(data.payload) || asObj(data.data) || {}
  const layers = [top, payload, nestedPayload, data, nestedData]
  const pick = (key) => {
    for (const layer of layers) {
      if (layer && Object.prototype.hasOwnProperty.call(layer, key) && layer[key] != null) {
        return layer[key]
      }
    }
    return undefined
  }
  return {
    syncId: String(top.syncId || payload.syncId || ''),
    clinicId: String(top.clinicId || payload.clinicId || ''),
    valuationOnlyRaw: pick('valuationOnly'),
    valuationOnly: coerceBool(pick('valuationOnly')),
    treatmentCompleted: coerceBool(pick('treatmentCompleted')),
    phase: pick('phase') != null ? String(pick('phase')) : null,
    status: pick('status') != null ? String(pick('status')) : null,
    payloadKeyCount: Object.keys(payload).length,
    payloadHasValuationOnly: Object.prototype.hasOwnProperty.call(payload, 'valuationOnly'),
    payloadHasPhase: Object.prototype.hasOwnProperty.call(payload, 'phase'),
    layerHits: {
      top: top.valuationOnly,
      payload: payload.valuationOnly,
      nestedPayload: nestedPayload.valuationOnly,
      data: data.valuationOnly,
      nestedData: nestedData.valuationOnly,
    },
  }
}

function classify(fields) {
  if (fields.treatmentCompleted === true) return 'terminado'
  if (fields.valuationOnly === true || fields.phase === 'VALORACION_RAPIDA') return 'valorado'
  return 'activo'
}

function summarize(filePath, label, preloaded) {
  if (!filePath || !existsSync(filePath)) {
    return { label, error: 'missing', filePath }
  }
  const st = statSync(filePath)
  const j = preloaded || JSON.parse(readFileSync(filePath, 'utf8'))
  const clinic = (j.clinics && j.clinics[clinicKey]) || {}
  const patientsMap = clinic.patients || {}
  const draftsMap = clinic.drafts || clinic.patientClinicalDrafts || {}
  const patients = Object.values(patientsMap)
  const drafts = Object.values(draftsMap)
  const counts = { activo: 0, valorado: 0, terminado: 0 }
  const naiveStrict = { valorado: 0, terminado: 0, activo: 0 }
  const stringTrue = { valuationOnly: 0, treatmentCompleted: 0 }
  const missingFlags = { noVoNoPhase: 0, hasDraftHint: 0 }
  const probesOut = {}
  const draftByPatient = {}
  for (const d of drafts) {
    const p = asObj(d.payload) || {}
    const pid = String(d.syncId || p.patientSyncId || p.syncId || '').replace(/^draft:/, '')
    if (!pid) continue
    draftByPatient[pid] = {
      syncId: d.syncId,
      keys: Object.keys(p).sort().slice(0, 30),
      valuationOnly: p.valuationOnly,
      phase: p.phase,
      kind: p.kind || p.type || p.draftType || null,
    }
  }
  for (const rec of patients) {
    const f = extractPatientFields(rec)
    counts[classify(f)]++
    const p = asObj(rec.payload) || {}
    if (p.valuationOnly === true) naiveStrict.valorado++
    else if (p.treatmentCompleted === true) naiveStrict.terminado++
    else naiveStrict.activo++
    if (typeof p.valuationOnly === 'string' && p.valuationOnly.toLowerCase() === 'true') {
      stringTrue.valuationOnly++
    }
    if (
      typeof p.treatmentCompleted === 'string' &&
      p.treatmentCompleted.toLowerCase() === 'true'
    ) {
      stringTrue.treatmentCompleted++
    }
    if (f.valuationOnly !== true && f.phase !== 'VALORACION_RAPIDA' && f.treatmentCompleted !== true) {
      missingFlags.noVoNoPhase++
      if (draftByPatient[f.syncId]) missingFlags.hasDraftHint++
    }
    if (probes.includes(f.syncId)) {
      probesOut[f.syncId] = {
        ...f,
        draft: draftByPatient[f.syncId] || null,
        updatedAt: rec.updatedAt || null,
        serverUpdatedAt: rec.serverUpdatedAt || null,
      }
    }
  }
  return {
    label,
    filePath,
    bytes: st.size,
    mtime: st.mtime.toISOString(),
    patients: patients.length,
    odontograms: Object.keys(clinic.odontograms || {}).length,
    drafts: drafts.length,
    countsRobust: counts,
    countsNaivePayloadStrict: naiveStrict,
    stringTrueCoercible: stringTrue,
    missingFlags,
    probes: probesOut,
    _patientsMap: patientsMap,
  }
}

try {
  if (!activePath) {
    console.error('Usage: node audit-valorados-deep-readonly.cjs /path/to/clinical-sync.json')
    process.exit(2)
  }
  console.error('[deep] reading active', activePath)
  const activeJson = existsSync(activePath) ? JSON.parse(readFileSync(activePath, 'utf8')) : null
  console.error('[deep] reading bak', bakPath)
  const bakJson = existsSync(bakPath) ? JSON.parse(readFileSync(bakPath, 'utf8')) : null

  const active = summarize(activePath, 'ACTIVE', activeJson)
  const bak = summarize(bakPath, 'BAK_20261112', bakJson)
  delete active._patientsMap
  const bakPatients = bak._patientsMap || {}
  delete bak._patientsMap

  const flagDiff = {}
  for (const id of probes) {
    const a = active.probes && active.probes[id]
    const b = bak.probes && bak.probes[id]
    flagDiff[id] = {
      bak: b
        ? {
            valuationOnly: b.valuationOnly,
            phase: b.phase,
            treatmentCompleted: b.treatmentCompleted,
            payloadHasValuationOnly: b.payloadHasValuationOnly,
          }
        : null,
      active: a
        ? {
            valuationOnly: a.valuationOnly,
            phase: a.phase,
            treatmentCompleted: a.treatmentCompleted,
            payloadHasValuationOnly: a.payloadHasValuationOnly,
          }
        : null,
    }
  }

  let lostValorados = 0
  let keptValorados = 0
  let gainedValorados = 0
  let bakBuckets = null
  if (!active.error && !bak.error && activeJson && bakJson) {
    const ap = ((activeJson.clinics || {})[clinicKey] || {}).patients || {}
    const bp = bakPatients
    bakBuckets = { activo: 0, valorado: 0, terminado: 0 }
    for (const id of Object.keys(bp)) {
      const bClass = classify(extractPatientFields(bp[id]))
      bakBuckets[bClass]++
      const aRec = ap[id]
      const aClass = aRec ? classify(extractPatientFields(aRec)) : 'MISSING'
      if (bClass === 'valorado' && aClass === 'valorado') keptValorados++
      if (bClass === 'valorado' && aClass !== 'valorado') lostValorados++
      if (bClass !== 'valorado' && aClass === 'valorado') gainedValorados++
    }
  }

  console.log('DEEP_AUDIT_JSON_BEGIN')
  console.log(
    JSON.stringify(
      {
        active,
        bak,
        flagDiff,
        valoradosMigration: { keptValorados, lostValorados, gainedValorados },
        expectedUiBucketsFromBak: bakBuckets,
        currentUiBucketsFromActive: active.countsRobust || null,
      },
      null,
      2,
    ),
  )
  console.log('DEEP_AUDIT_JSON_END')
} catch (err) {
  console.error('DEEP_AUDIT_ERROR', err && err.stack ? err.stack : err)
  process.exit(1)
}
