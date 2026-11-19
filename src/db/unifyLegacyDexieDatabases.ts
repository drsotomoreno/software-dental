/**
 * Consolida IndexedDB fragmentadas (superadmin-session, UUIDs efímeros, DentalEMR plano)
 * hacia la única base canónica DentalEMR_canonical_${clinicKey}.
 * No destructivo: las bases legacy quedan como respaldo frío.
 */
import Dexie from 'dexie'
import {
  isDentalEmrDatabaseName,
  resolveCanonicalClinicDbKey,
  resolveDentalEmrDbNameFromUser,
  sanitizeDentalDbSegment,
} from '../../shared/dentalEmrDbName.js'
import { resolveClinicSyncId } from '../../shared/clinicalSyncScope.js'
import { getStoredApiAuth } from '@/services/apiAuthService'
import type { Patient } from '@/types/patient'
import type { PatientClinicalDraft } from '@/types/patientClinicalDraft'
import type { ClinicalRecord } from '@/types/clinicalRecord'
import { db, ensureDentalDatabaseForAuth } from '@/db/database'

export const EMR_V2_DEXIE_UNIFIED_FLAG = 'emr_v2_dexie_unified_v1'

function formRichness(value: unknown): number {
  if (value == null) return 0
  if (typeof value === 'string') return value.trim() ? Math.min(value.trim().length, 400) : 0
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0 ? 1 : 0
  if (typeof value === 'boolean') return value ? 1 : 0
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + formRichness(item), 0)
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce(
      (sum, item) => sum + formRichness(item),
      0,
    )
  }
  return 0
}

function mergePatients(a: Patient, b: Patient): Patient {
  const legacyA = Array.isArray((a as Patient & { legacyNumericIds?: string[] }).legacyNumericIds)
    ? [...((a as Patient & { legacyNumericIds?: string[] }).legacyNumericIds || [])]
    : []
  const legacyB = Array.isArray((b as Patient & { legacyNumericIds?: string[] }).legacyNumericIds)
    ? [...((b as Patient & { legacyNumericIds?: string[] }).legacyNumericIds || [])]
    : []
  for (const id of [a.id, b.id]) {
    if (id != null && /^\d+$/.test(String(id))) legacyA.push(String(id))
  }
  const legacyNumericIds = [...new Set([...legacyA, ...legacyB].map(String).filter(Boolean))]
  const newer = String(b.updatedAt || '') >= String(a.updatedAt || '') ? b : a
  const older = newer === b ? a : b
  return {
    ...older,
    ...newer,
    syncId: newer.syncId || older.syncId,
    documentNumber: newer.documentNumber || older.documentNumber,
    firstName: newer.firstName || older.firstName,
    lastName: newer.lastName || older.lastName,
    legacyNumericIds,
  } as Patient
}

function mergeDrafts(a: PatientClinicalDraft, b: PatientClinicalDraft): PatientClinicalDraft {
  const newer = String(b.updatedAt || '') >= String(a.updatedAt || '') ? b : a
  const older = newer === b ? a : b
  const pickForm = (
    left: PatientClinicalDraft['clinicalDraft'],
    right: PatientClinicalDraft['clinicalDraft'],
  ) => {
    if (!left) return right ?? null
    if (!right) return left
    return formRichness(left) >= formRichness(right) ? { ...right, ...left } : { ...left, ...right }
  }
  return {
    ...older,
    ...newer,
    patientSyncId: newer.patientSyncId || older.patientSyncId,
    clinicalRevision: Math.max(Number(a.clinicalRevision) || 0, Number(b.clinicalRevision) || 0),
    clinicalDraft: pickForm(older.clinicalDraft, newer.clinicalDraft),
    valuationDraft: pickForm(older.valuationDraft, newer.valuationDraft),
    evolutionNotes: [
      ...new Map(
        [...(older.evolutionNotes || []), ...(newer.evolutionNotes || [])]
          .filter(Boolean)
          .map((n) => [String((n as { id?: string }).id || JSON.stringify(n)), n]),
      ).values(),
    ],
    odontogramDraft: newer.odontogramDraft ?? older.odontogramDraft ?? null,
  }
}

function patientDedupeKey(row: Patient): string {
  const sync = String(row.syncId || '').trim()
  if (sync) return `sync:${sync}`
  const doc = String(row.documentNumber || '').trim()
  if (doc) return `doc:${doc}`
  return `id:${String(row.id)}`
}

class LegacyDentalMirror extends Dexie {
  patients!: Dexie.Table<Patient, number | string>
  patientClinicalDrafts!: Dexie.Table<PatientClinicalDraft, string>
  clinicalRecords!: Dexie.Table<ClinicalRecord, number | string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      patients: '++id, documentNumber, syncId, clinicId',
      patientClinicalDrafts: 'patientId, patientSyncId, updatedAt',
      clinicalRecords: '++id, patientId, syncId, signedAt',
    })
  }
}

async function listDentalDatabaseNames(): Promise<string[]> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return []
  try {
    const listed = await indexedDB.databases()
    return listed
      .map((entry) => String(entry?.name || '').trim())
      .filter((name) => isDentalEmrDatabaseName(name))
  } catch {
    return []
  }
}

async function readLegacyTables(dbName: string): Promise<{
  patients: Patient[]
  drafts: PatientClinicalDraft[]
  records: ClinicalRecord[]
}> {
  const mirror = new LegacyDentalMirror(dbName)
  try {
    await mirror.open()
    const [patients, drafts, records] = await Promise.all([
      mirror.table('patients').toArray().catch(() => [] as Patient[]),
      mirror.table('patientClinicalDrafts').toArray().catch(() => [] as PatientClinicalDraft[]),
      mirror.table('clinicalRecords').toArray().catch(() => [] as ClinicalRecord[]),
    ])
    return { patients, drafts, records }
  } catch (error) {
    console.warn(`[Dexie unify] No se pudo leer ${dbName}:`, error)
    return { patients: [], drafts: [], records: [] }
  } finally {
    try {
      mirror.close()
    } catch {
      /* ignore */
    }
  }
}

/**
 * Ejecutar tras abrir la sesión y la BD canónica, antes de listar pacientes.
 */
export async function unifyLegacyDexieDatabases(input?: {
  userId?: string | null
  clinicaId?: string | null
  user?: { id?: string; clinicId?: string; email?: string } | null
}): Promise<{
  ok: boolean
  skipped?: boolean
  canonicalName: string
  sources: string[]
  patientsMerged: number
  draftsMerged: number
  recordsMerged: number
}> {
  const auth = getStoredApiAuth()
  const user = input?.user || auth?.user || null
  const clinicKey = resolveCanonicalClinicDbKey(user, {
    userId: input?.userId || user?.id,
    clinicaId: input?.clinicaId || user?.clinicId,
  })
  const canonicalName = resolveDentalEmrDbNameFromUser(user, {
    userId: input?.userId || user?.id,
    clinicaId: input?.clinicaId || resolveClinicSyncId(user) || user?.clinicId,
  })
  const flagKey = `${EMR_V2_DEXIE_UNIFIED_FLAG}:${sanitizeDentalDbSegment(clinicKey)}`
  if (typeof localStorage !== 'undefined' && localStorage.getItem(flagKey) === 'true') {
    return {
      ok: true,
      skipped: true,
      canonicalName,
      sources: [],
      patientsMerged: 0,
      draftsMerged: 0,
      recordsMerged: 0,
    }
  }

  await ensureDentalDatabaseForAuth(input?.userId || user?.id, input?.clinicaId || user?.clinicId)
  const names = await listDentalDatabaseNames()
  const sources = names.filter((name) => name && name !== canonicalName)
  if (sources.length === 0) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(flagKey, 'true')
      localStorage.setItem(EMR_V2_DEXIE_UNIFIED_FLAG, 'true')
    }
    return {
      ok: true,
      skipped: false,
      canonicalName,
      sources: [],
      patientsMerged: 0,
      draftsMerged: 0,
      recordsMerged: 0,
    }
  }

  const patientMap = new Map<string, Patient>()
  const draftMap = new Map<string, PatientClinicalDraft>()
  const recordMap = new Map<string, ClinicalRecord>()

  const seedPatients = await db.patients.toArray().catch(() => [] as Patient[])
  for (const row of seedPatients) patientMap.set(patientDedupeKey(row), row)
  const seedDrafts = await db.patientClinicalDrafts.toArray().catch(() => [] as PatientClinicalDraft[])
  for (const row of seedDrafts) {
    const key = String(row.patientSyncId || row.patientId || '')
    if (key) draftMap.set(key, row)
  }
  const seedRecords = await db.clinicalRecords.toArray().catch(() => [] as ClinicalRecord[])
  for (const row of seedRecords) {
    const key = String(row.syncId || row.id || '')
    if (key) recordMap.set(key, row)
  }

  for (const name of sources) {
    const legacy = await readLegacyTables(name)
    for (const row of legacy.patients) {
      const key = patientDedupeKey(row)
      const prev = patientMap.get(key)
      patientMap.set(key, prev ? mergePatients(prev, row) : row)
    }
    for (const row of legacy.drafts) {
      const key = String(row.patientSyncId || row.patientId || '')
      if (!key) continue
      const prev = draftMap.get(key)
      draftMap.set(key, prev ? mergeDrafts(prev, row) : row)
      // También fusiona alias numéricos hacia syncId si existe en patients
      const sync = String(row.patientSyncId || '').trim()
      if (sync && sync !== key) {
        const bySync = draftMap.get(sync)
        draftMap.set(sync, bySync ? mergeDrafts(bySync, row) : row)
      }
    }
    for (const row of legacy.records) {
      const key = String(row.syncId || `${row.patientId}:${row.id}`)
      const prev = recordMap.get(key)
      if (!prev || String(row.updatedAt || '') >= String(prev.updatedAt || '')) {
        recordMap.set(key, row)
      }
    }
  }

  let patientsMerged = 0
  for (const row of patientMap.values()) {
    const existing =
      (row.syncId && (await db.patients.where('syncId').equals(row.syncId).first())) ||
      (row.documentNumber
        ? await db.patients.filter((p) => p.documentNumber === row.documentNumber).first()
        : null) ||
      (row.id != null ? await db.patients.get(row.id as never) : null)
    if (existing?.id != null) {
      const merged = mergePatients(existing, row)
      await db.patients.put({ ...merged, id: existing.id } as Patient)
    } else {
      const { id: _drop, ...rest } = row
      await db.patients.add(rest as Patient)
    }
    patientsMerged += 1
  }

  let draftsMerged = 0
  for (const row of draftMap.values()) {
    const syncKey = String(row.patientSyncId || row.patientId || '').trim()
    if (!syncKey) continue
    const existing = await db.patientClinicalDrafts.get(syncKey)
    const merged = existing ? mergeDrafts(existing, { ...row, patientId: syncKey }) : { ...row, patientId: syncKey }
    await db.patientClinicalDrafts.put(merged)
    draftsMerged += 1
  }

  let recordsMerged = 0
  for (const row of recordMap.values()) {
    if (row.syncId) {
      const existing = await db.clinicalRecords.where('syncId').equals(row.syncId).first()
      if (existing?.id != null) {
        await db.clinicalRecords.put({ ...existing, ...row, id: existing.id })
        recordsMerged += 1
        continue
      }
    }
    const { id: _id, ...rest } = row
    await db.clinicalRecords.add(rest as ClinicalRecord)
    recordsMerged += 1
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(flagKey, 'true')
    localStorage.setItem(EMR_V2_DEXIE_UNIFIED_FLAG, 'true')
  }

  console.info(
    `[Dexie unify] ${canonicalName}: ${sources.length} fuentes → patients=${patientsMerged} drafts=${draftsMerged} records=${recordsMerged}`,
  )

  return {
    ok: true,
    canonicalName,
    sources,
    patientsMerged,
    draftsMerged,
    recordsMerged,
  }
}
