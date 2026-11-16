#!/usr/bin/env node
/**
 * Rescate de Isabel De la Rosa (CC 37861325).
 * No arranca con el servidor. Por defecto solo informa (--dry-run).
 *
 *   node --max-old-space-size=3072 scripts/recover-isabel.mjs
 *   node --max-old-space-size=3072 scripts/recover-isabel.mjs --apply
 *   node --max-old-space-size=3072 scripts/recover-isabel.mjs --sync server/data/clinical-sync.json --backup backups/clinical-sync-clean-20261114.json
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { mergeBudgetItems } from '../shared/clinicalBudgetMerge.js'
import { mergePaymentRecords } from '../shared/paymentControlMerge.js'

export const ISABEL_SYNC_ID = '4a08b227-da3d-45f6-8325-a0ec906a45c9'
export const ISABEL_DOCUMENT = '37861325'
export const ISABEL_SIGNED_RECORD_ID = 'e3a4df37-b719-424b-a952-da429c83d93d'
const CANONICAL = 'clinic:doctormauriciosoto@gmail.com'

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function charsOf(value) {
  if (value == null) return 0
  try {
    return JSON.stringify(value).length
  } catch {
    return 0
  }
}

function payloadOf(record) {
  return record?.payload && typeof record.payload === 'object' ? record.payload : {}
}

function isIsabelPatient(record) {
  const pay = payloadOf(record)
  const doc = String(pay.documentNumber || '').replace(/\D/g, '')
  const name = `${pay.firstName || ''} ${pay.lastName || ''}`.toLowerCase()
  return (
    String(record?.syncId || pay.syncId || '') === ISABEL_SYNC_ID ||
    doc === ISABEL_DOCUMENT ||
    (name.includes('isabel') && name.includes('rosa'))
  )
}

function belongsToIsabel(record) {
  const pay = payloadOf(record)
  const ids = [record?.syncId, pay.patientSyncId, pay.patientId, pay.syncId].map((value) =>
    String(value || ''),
  )
  return ids.some((value) => value === ISABEL_SYNC_ID || value === `draft:${ISABEL_SYNC_ID}`)
}

function isStl(record) {
  const pay = payloadOf(record)
  const name = String(pay.fileName || pay.name || '').toLowerCase()
  const kind = String(pay.fileType || pay.mimeType || '').toLowerCase()
  return name.endsWith('.stl') || kind === 'stl' || kind.includes('stl')
}

export function clinicalFormStats(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return null
  return {
    budget: Array.isArray(form.budgetItems) ? form.budgetItems.length : 0,
    payments: Array.isArray(form.paymentControl) ? form.paymentControl.length : 0,
    notes: Array.isArray(form.evolutionNotes) ? form.evolutionNotes.length : 0,
    chars: charsOf(form),
  }
}

export function dedupeClinicalMoney(form) {
  if (!form || typeof form !== 'object') return form
  const next = { ...form }
  if (Array.isArray(next.budgetItems)) next.budgetItems = mergeBudgetItems(next.budgetItems, [])
  if (Array.isArray(next.paymentControl)) next.paymentControl = mergePaymentRecords(next.paymentControl, [])
  return next
}

/** Elige el clinicalDraft sano (~56 KB, pocas líneas) frente al inflado de megabytes. */
export function pickHealthyClinicalDraft(forms) {
  const ranked = forms
    .map((form) => ({ form, stats: clinicalFormStats(form) }))
    .filter((row) => row.stats && row.stats.budget > 0 && row.stats.budget <= 30 && row.stats.chars < 200_000)
    .sort((a, b) => Math.abs(a.stats.chars - 56_516) - Math.abs(b.stats.chars - 56_516))
  return ranked[0]?.form || null
}

function clinicsOf(store) {
  return store?.clinics && typeof store.clinics === 'object' ? store.clinics : {}
}

function collectForms(store) {
  const forms = []
  for (const clinic of Object.values(clinicsOf(store))) {
    for (const record of Object.values(clinic?.drafts || {})) {
      if (!belongsToIsabel(record) && !isIsabelPatient(record)) continue
      const draft = payloadOf(record).clinicalDraft
      if (draft) forms.push(draft)
    }
    for (const record of Object.values(clinic?.clinicalRecords || {})) {
      if (!belongsToIsabel(record)) continue
      forms.push(payloadOf(record))
    }
  }
  return forms
}

function canonicalClinic(store) {
  const clinics = clinicsOf(store)
  if (clinics[CANONICAL]) return clinics[CANONICAL]
  const withIsabel = Object.values(clinics).find((clinic) =>
    Object.values(clinic?.patients || {}).some((record) => isIsabelPatient(record)),
  )
  return withIsabel || null
}

function clearStlTombstone(record) {
  if (!record || !isStl(record) || !record.deletedAt) return false
  record.deletedAt = null
  if (record.payload && typeof record.payload === 'object') {
    record.payload.deletedAt = null
    delete record.payload.explicitDelete
  }
  return true
}

/**
 * @returns {object} resumen antes/después. Muta `store` en memoria.
 */
export function planIsabelRecovery(store, extraStores = []) {
  const clinic = canonicalClinic(store)
  if (!clinic) {
    return { ok: false, error: 'No está Isabel en el archivo activo.' }
  }

  const patient = Object.values(clinic.patients || {}).find((record) => isIsabelPatient(record)) || null
  const signed =
    clinic.clinicalRecords?.[ISABEL_SIGNED_RECORD_ID] ||
    Object.values(clinic.clinicalRecords || {}).find(
      (record) => record?.syncId === ISABEL_SIGNED_RECORD_ID || belongsToIsabel(record),
    ) ||
    null

  const draftKey = `draft:${ISABEL_SYNC_ID}`
  const draft =
    clinic.drafts?.[draftKey] ||
    Object.values(clinic.drafts || {}).find((record) => belongsToIsabel(record)) ||
    null

  const forms = [...collectForms(store), ...extraStores.flatMap((extra) => collectForms(extra))]
  const healthy = pickHealthyClinicalDraft(forms)
  const beforeDraft = clinicalFormStats(payloadOf(draft).clinicalDraft)
  const beforeSigned = clinicalFormStats(signed ? payloadOf(signed) : null)
  const stlBefore = [
    ...Object.values(clinic.diagnosticAids || {}),
    ...Object.values(clinic.attachments || {}),
  ].filter((record) => belongsToIsabel(record) && isStl(record))
  const stlDeletedBefore = stlBefore.filter((record) => record.deletedAt).length

  if (signed?.payload) {
    signed.payload = dedupeClinicalMoney(signed.payload)
    signed.payload.patientSyncId = signed.payload.patientSyncId || ISABEL_SYNC_ID
  }

  if (draft) {
    const currentBudget = beforeDraft?.budget ?? 0
    const replaceDraft = !payloadOf(draft).clinicalDraft || currentBudget > 30 || (beforeDraft?.chars || 0) > 200_000
    if (replaceDraft && healthy) {
      draft.payload = {
        ...payloadOf(draft),
        clinicalDraft: dedupeClinicalMoney(healthy),
        patientSyncId: ISABEL_SYNC_ID,
      }
    } else if (draft.payload?.clinicalDraft) {
      draft.payload = {
        ...draft.payload,
        clinicalDraft: dedupeClinicalMoney(draft.payload.clinicalDraft),
      }
    }
  } else if (healthy) {
    clinic.drafts = clinic.drafts || {}
    clinic.drafts[draftKey] = {
      syncId: draftKey,
      clinicId: CANONICAL,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      payload: {
        syncId: draftKey,
        patientSyncId: ISABEL_SYNC_ID,
        clinicalDraft: dedupeClinicalMoney(healthy),
        valuationDraft: null,
        evolutionNotes: Array.isArray(healthy.evolutionNotes) ? healthy.evolutionNotes : [],
      },
    }
  }

  let stlReactivated = 0
  for (const record of stlBefore) {
    if (clearStlTombstone(record)) stlReactivated += 1
  }

  const afterDraftRecord = clinic.drafts?.[draftKey] || draft
  return {
    ok: true,
    patient: patient
      ? {
          syncId: patient.syncId,
          phase: payloadOf(patient).phase ?? null,
          treatmentCompleted: payloadOf(patient).treatmentCompleted ?? null,
          valuationOnly: payloadOf(patient).valuationOnly ?? null,
        }
      : null,
    signedRecordId: signed?.syncId || null,
    signedLinked: Boolean(signed && String(payloadOf(signed).patientSyncId || ISABEL_SYNC_ID) === ISABEL_SYNC_ID),
    healthyDraftChars: healthy ? charsOf(healthy) : 0,
    before: {
      draft: beforeDraft,
      signed: beforeSigned,
      stlDeleted: stlDeletedBefore,
      stlTotal: stlBefore.length,
    },
    after: {
      draft: clinicalFormStats(payloadOf(afterDraftRecord).clinicalDraft),
      signed: clinicalFormStats(signed ? payloadOf(signed) : null),
      stlReactivated,
    },
  }
}

function resolveSyncPath(explicit) {
  const candidates = [
    explicit,
    process.env.CLINICAL_SYNC_PATH,
    path.resolve(process.cwd(), 'server/data/clinical-sync.json'),
    '/home/ubuntu/software-dental/server/data/clinical-sync.json',
    '/var/www/mihistoriadental/server/data/clinical-sync.json',
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('clinical-sync.json no encontrado. Pase --sync.')
}

function argValue(flag) {
  const index = process.argv.indexOf(flag)
  if (index < 0) return ''
  return process.argv[index + 1] || ''
}

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function patchMeta(syncPath, store) {
  const metaPath = syncPath.replace(/clinical-sync\.json$/i, 'clinical-sync-meta.json')
  if (!existsSync(metaPath)) return null
  const meta = loadJson(metaPath)
  const clinic = clinicsOf(store)[CANONICAL]
  const aids = clinic?.diagnosticAids || {}
  const metaClinic = meta?.clinics?.[CANONICAL]
  if (metaClinic?.diagnosticAids) {
    for (const [id, record] of Object.entries(aids)) {
      if (!metaClinic.diagnosticAids[id]) continue
      metaClinic.diagnosticAids[id].deletedAt = record.deletedAt || null
      if (metaClinic.diagnosticAids[id].payload) {
        metaClinic.diagnosticAids[id].payload.deletedAt = null
      }
    }
    meta.updatedAt = new Date().toISOString()
    writeFileSync(metaPath, JSON.stringify(meta))
  }
  return metaPath
}

function main() {
  const apply = process.argv.includes('--apply')
  const syncPath = resolveSyncPath(argValue('--sync'))
  const store = loadJson(syncPath)
  const extras = []
  const backupHint =
    argValue('--backup') || path.resolve(process.cwd(), 'backups/clinical-sync-clean-20261114.json')
  const needsBackup = !pickHealthyClinicalDraft(collectForms(store))
  if (needsBackup && backupHint && existsSync(backupHint) && path.resolve(backupHint) !== path.resolve(syncPath)) {
    extras.push(loadJson(backupHint))
  }

  const report = planIsabelRecovery(store, extras)
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    syncPath,
    backupUsed: extras.length > 0,
    ...report,
  }
  console.log(JSON.stringify(summary, null, 2))
  if (!report.ok) process.exitCode = 1
  if (!apply || !report.ok) return
  if (/[\\/]backups[\\/]/i.test(path.resolve(syncPath)) || /\.bak/i.test(syncPath)) {
    console.error('REFUSE_APPLY: no se escribe sobre backups ni archivos .bak. Pase --sync al clinical-sync.json activo.')
    process.exitCode = 1
    return
  }

  const backupDir = path.resolve(process.cwd(), 'backups')
  mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `pre-recover-isabel-${stamp}.json`)
  copyFileSync(syncPath, backupPath)
  const tmp = `${syncPath}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(store))
  copyFileSync(tmp, syncPath)
  unlinkSync(tmp)
  const metaPath = patchMeta(syncPath, store)
  console.log(JSON.stringify({ wrote: syncPath, backupPath, metaPath }, null, 2))
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (invokedDirectly) main()
