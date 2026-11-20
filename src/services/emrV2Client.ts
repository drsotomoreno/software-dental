/**
 * Cliente Server-First EMR v2 → /api/v2/ + outbox Dexie FIFO.
 */
import { generateId } from '@/utils'
import { db } from '@/db/database'
import { getStoredApiAuth } from '@/services/apiAuthService'
import { getClinicKioskSocket } from '@/services/clinicKioskSocket'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { EmrV2OutboxEntry } from '@/types/emrV2Outbox'
import type { Patient } from '@/types/patient'
import {
  reconcilePatientDraftKeys,
  savePatientClinicalDraft,
} from '@/utils/patientClinicalDraft'
import { getPatientByRouteId } from '@/utils/patientId'
import {
  anamnesisHasContent,
  stomatologicalExamHasContent,
} from '../../shared/clinicalRecordGuard.js'

export const EMR_V2_PATIENT_UPDATED = 'emr:v2:patient-updated'

export type EmrV2Section =
  | 'anamnesis'
  | 'examen_estomatologico'
  | 'odontograma'
  | 'diagnosticos'
  | 'plan_tratamiento'

export const EMR_V2_SECTION_FROM_FORM: Record<
  EmrV2Section,
  keyof ClinicalRecordFormData | 'odontogram'
> = {
  anamnesis: 'anamnesis',
  examen_estomatologico: 'stomatologicalExam',
  odontograma: 'odontogram',
  diagnosticos: 'diagnoses',
  plan_tratamiento: 'treatmentPlan',
}

export interface EmrV2ChartResponse {
  success?: boolean
  ok?: boolean
  migrated?: boolean
  clinicId?: string
  patient?: {
    id: string
    legacy_sync_id?: string
    tipo_documento?: string
    numero_documento?: string
    nombre_completo?: string
    version?: number
  }
  clinicalBase?: {
    anamnesis?: unknown
    examen_estomatologico?: unknown
    odontograma?: unknown
    diagnosticos?: unknown
    plan_tratamiento?: unknown
    version?: number
    content_hash?: string
  }
  evolutions?: unknown[]
  assets?: unknown[]
}

function identityHeaders() {
  const auth = getStoredApiAuth()
  return {
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    ...(auth?.user?.email ? { 'X-Client-Email': String(auth.user.email) } : {}),
    ...(auth?.user?.id ? { 'X-Client-User-Id': String(auth.user.id) } : {}),
  }
}

async function v2Fetch(url: string, init?: RequestInit & { timeoutMs?: number }) {
  const { timeoutMs = 25_000, ...rest } = init || {}
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        ...identityHeaders(),
        ...(rest.headers || {}),
      },
    })
    return response
  } finally {
    globalThis.clearTimeout(timer)
  }
}

function clinicalBaseToFormPatch(base: EmrV2ChartResponse['clinicalBase']): Partial<ClinicalRecordFormData> {
  if (!base) return {}
  const patch: Partial<ClinicalRecordFormData> = {}
  if (anamnesisHasContent(base.anamnesis)) {
    patch.anamnesis = base.anamnesis as ClinicalRecordFormData['anamnesis']
  }
  if (stomatologicalExamHasContent(base.examen_estomatologico)) {
    patch.stomatologicalExam =
      base.examen_estomatologico as ClinicalRecordFormData['stomatologicalExam']
  }
  // Una base v2 vacía no puede tapar diagnósticos o plan que ya están en el dispositivo.
  if (Array.isArray(base.diagnosticos) && base.diagnosticos.length > 0) {
    patch.diagnoses = base.diagnosticos as ClinicalRecordFormData['diagnoses']
  }
  if (Array.isArray(base.plan_tratamiento) && base.plan_tratamiento.length > 0) {
    patch.treatmentPlan = base.plan_tratamiento as ClinicalRecordFormData['treatmentPlan']
  }
  return patch
}

function odontogramPayloadHasMarks(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const data = payload as {
    edentulismScope?: unknown
    supplementaryFindings?: Record<string, { present?: boolean; description?: string }>
    teeth?: Array<{ globalState?: string; faces?: Record<string, string> }>
  }
  if (data.edentulismScope) return true
  const findings = data.supplementaryFindings
  if (findings && typeof findings === 'object') {
    const marked = Object.values(findings).some(
      (item) => item?.present || String(item?.description || '').trim().length > 0,
    )
    if (marked) return true
  }
  if (!Array.isArray(data.teeth)) return false
  return data.teeth.some((tooth) => {
    if (!tooth || typeof tooth !== 'object') return false
    if (tooth.globalState && tooth.globalState !== 'presente') return true
    const faces = tooth.faces
    if (!faces || typeof faces !== 'object') return false
    return Object.values(faces).some((face) => face && face !== 'sano')
  })
}

function sectionPayloadHasContent(section: EmrV2Section, payload: unknown): boolean {
  if (section === 'anamnesis') return anamnesisHasContent(payload)
  if (section === 'examen_estomatologico') return stomatologicalExamHasContent(payload)
  if (section === 'diagnosticos') return Array.isArray(payload) && payload.length > 0
  if (section === 'plan_tratamiento') return Array.isArray(payload) && payload.length > 0
  if (section === 'odontograma') return odontogramPayloadHasMarks(payload)
  return false
}

export function pickSectionPayload(
  form: ClinicalRecordFormData,
  section: EmrV2Section,
  odontogram?: unknown,
): unknown {
  switch (section) {
    case 'anamnesis':
      return form.anamnesis ?? {}
    case 'examen_estomatologico':
      return form.stomatologicalExam ?? {}
    case 'odontograma':
      return odontogram ?? (form as { odontogram?: unknown }).odontogram ?? {}
    case 'diagnosticos':
      return Array.isArray(form.diagnoses) ? form.diagnoses : []
    case 'plan_tratamiento':
      return form.treatmentPlan ?? {}
    default:
      return {}
  }
}

export async function fetchPatientChartV2(
  idOrSyncId: string,
): Promise<{ ok: boolean; status: number; chart?: EmrV2ChartResponse; error?: string }> {
  const key = String(idOrSyncId || '').trim()
  if (!key) return { ok: false, status: 400, error: 'idOrSyncId vacío' }
  try {
    const response = await v2Fetch(`/api/v2/patients/${encodeURIComponent(key)}/chart`)
    const body = (await response.json().catch(() => ({}))) as EmrV2ChartResponse & {
      error?: string
    }
    if (!response.ok) {
      return { ok: false, status: response.status, error: body.error || 'Error al leer chart v2' }
    }

    const syncId = String(body.patient?.legacy_sync_id || key).trim()
    const localPatient = await getPatientByRouteId(syncId)
    if (localPatient) {
      await reconcilePatientDraftKeys({
        id: localPatient.id,
        syncId: localPatient.syncId || syncId,
        documentNumber: localPatient.documentNumber,
      })
    }

    const patch = clinicalBaseToFormPatch(body.clinicalBase)
    if (Object.keys(patch).length > 0 && syncId) {
      const existing = await db.patientClinicalDrafts.get(syncId)
      const baseForm = {
        ...(existing?.clinicalDraft || existing?.valuationDraft || {}),
        ...patch,
      } as ClinicalRecordFormData
      await savePatientClinicalDraft(syncId, baseForm, null, { source: 'sync_pull' })
      if (body.clinicalBase?.version != null) {
        await db.patientClinicalDrafts.update(syncId, {
          clinicalRevision: Number(body.clinicalBase.version) || 1,
          syncStatus: 'synced',
          patientSyncId: syncId,
        })
      }
    }

    return { ok: true, status: 200, chart: body }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Red no disponible',
    }
  }
}

async function enqueueOutbox(entry: Omit<EmrV2OutboxEntry, 'id' | 'createdAt' | 'updatedAt' | 'attempts' | 'status'> & {
  status?: EmrV2OutboxEntry['status']
  attempts?: number
}) {
  const now = new Date().toISOString()
  const row: EmrV2OutboxEntry = {
    idempotencyKey: entry.idempotencyKey,
    patientSyncId: entry.patientSyncId,
    kind: entry.kind,
    section: entry.section ?? null,
    payload: entry.payload,
    baseVersion: entry.baseVersion ?? null,
    status: entry.status || 'pending',
    attempts: entry.attempts ?? 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.emrV2Outbox.add(row)
  return row
}

export async function uploadClinicalAssetV2(
  patientSyncId: string,
  file: Blob,
  options?: { fileName?: string; assetType?: string; mimeType?: string },
): Promise<{ ok: boolean; status: number; asset?: unknown; error?: string }> {
  const form = new FormData()
  form.append('file', file, options?.fileName || 'asset.bin')
  form.append('assetType', options?.assetType || 'anexo')
  try {
    const response = await v2Fetch(`/api/v2/patients/${encodeURIComponent(patientSyncId)}/assets`, {
      method: 'POST',
      body: form,
      timeoutMs: 60_000,
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      return { ok: false, status: response.status, error: body.error || 'Error al subir asset' }
    }
    return { ok: true, status: response.status, asset: body.asset }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Red no disponible',
    }
  }
}

export async function patchClinicalSectionV2(
  patientSyncId: string,
  section: EmrV2Section,
  payload: unknown,
  expectedVersion: number,
): Promise<{
  ok: boolean
  status: number
  version?: number
  contentHash?: string
  queued?: boolean
  error?: string
  code?: string
}> {
  const syncId = String(patientSyncId || '').trim()
  if (!syncId) return { ok: false, status: 400, error: 'patientSyncId vacío' }

  try {
    const response = await v2Fetch(
      `/api/v2/patients/${encodeURIComponent(syncId)}/base/${encodeURIComponent(section)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, expectedVersion }),
      },
    )
    const body = await response.json().catch(() => ({}))
    if (response.status === 409) {
      // Conflicto: refrescar chart y reencolar con fusión no destructiva.
      await fetchPatientChartV2(syncId)
      await enqueueOutbox({
        idempotencyKey: generateId(),
        patientSyncId: syncId,
        kind: 'patch_section',
        section,
        payload,
        baseVersion: Number(body.version || expectedVersion) || expectedVersion,
        status: 'conflict',
      })
      return {
        ok: false,
        status: 409,
        code: body.code || 'VERSION_CONFLICT',
        version: body.version,
        error: body.error || 'Conflicto de versión',
        queued: true,
      }
    }
    if (!response.ok) {
      if (response.status === 0 || response.status >= 500) {
        await enqueueOutbox({
          idempotencyKey: generateId(),
          patientSyncId: syncId,
          kind: 'patch_section',
          section,
          payload,
          baseVersion: expectedVersion,
        })
        return { ok: false, status: response.status, error: body.error || 'Error servidor', queued: true }
      }
      return { ok: false, status: response.status, error: body.error || 'Error al guardar sección', code: body.code }
    }

    if (body.version != null) {
      await db.patientClinicalDrafts.update(syncId, {
        clinicalRevision: Number(body.version) || expectedVersion + 1,
        syncStatus: 'synced',
        contentHash: body.contentHash || undefined,
      })
    }
    return {
      ok: true,
      status: 200,
      version: body.version,
      contentHash: body.contentHash,
    }
  } catch (error) {
    await enqueueOutbox({
      idempotencyKey: generateId(),
      patientSyncId: syncId,
      kind: 'patch_section',
      section,
      payload,
      baseVersion: expectedVersion,
    })
    return {
      ok: false,
      status: 0,
      queued: true,
      error: error instanceof Error ? error.message : 'Red no disponible',
    }
  }
}

export async function createOrLockEvolutionV2(
  patientSyncId: string,
  payload: Record<string, unknown>,
  options?: { lockNow?: boolean; evolutionId?: string },
): Promise<{ ok: boolean; status: number; evolution?: unknown; error?: string; code?: string }> {
  const syncId = String(patientSyncId || '').trim()
  try {
    const path = options?.evolutionId
      ? `/api/v2/patients/${encodeURIComponent(syncId)}/evolutions/${encodeURIComponent(options.evolutionId)}/lock`
      : `/api/v2/patients/${encodeURIComponent(syncId)}/evolutions`
    const response = await v2Fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, lockNow: options?.lockNow === true }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      return { ok: false, status: response.status, error: body.error, code: body.code }
    }
    return { ok: true, status: response.status, evolution: body.evolution }
  } catch (error) {
    await enqueueOutbox({
      idempotencyKey: generateId(),
      patientSyncId: syncId,
      kind: options?.evolutionId ? 'lock_evolution' : 'create_evolution',
      payload: { ...payload, evolutionId: options?.evolutionId, lockNow: options?.lockNow },
      baseVersion: null,
    })
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Red no disponible',
    }
  }
}

export async function fetchAuditTrailV2(patientSyncId: string) {
  const response = await v2Fetch(
    `/api/v2/patients/${encodeURIComponent(patientSyncId)}/audit-trail`,
  )
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    return { ok: false as const, status: response.status, error: body.error as string }
  }
  return { ok: true as const, status: 200, auditTrail: body.auditTrail as unknown[] }
}

export async function flushEmrV2Outbox(): Promise<{ processed: number; remaining: number }> {
  const pending = await db.emrV2Outbox
    .where('status')
    .anyOf(['pending', 'conflict', 'error'])
    .sortBy('createdAt')
  let processed = 0
  for (const row of pending) {
    if (row.kind !== 'patch_section' || !row.section) continue
    const draft = await db.patientClinicalDrafts.get(row.patientSyncId)
    const baseVersion = Number(draft?.clinicalRevision || row.baseVersion || 1)
    const result = await patchClinicalSectionV2(
      row.patientSyncId,
      row.section as EmrV2Section,
      row.payload,
      Math.max(1, baseVersion),
    )
    if (result.ok) {
      if (row.id != null) await db.emrV2Outbox.delete(row.id)
      processed += 1
    } else if (row.id != null) {
      await db.emrV2Outbox.update(row.id, {
        attempts: (row.attempts || 0) + 1,
        status: result.status === 409 ? 'conflict' : 'error',
        lastError: result.error || null,
        updatedAt: new Date().toISOString(),
        baseVersion: result.version ?? row.baseVersion,
      })
    }
  }
  const remaining = await db.emrV2Outbox
    .where('status')
    .anyOf(['pending', 'conflict', 'error'])
    .count()
  return { processed, remaining }
}

export type EmrV2PatientUpdatedHandler = (event: {
  patientSyncId: string
  section: string | null
  newVersion: number | null
  actorEmail: string | null
  updatedAt: string
}) => void

export function subscribeEmrV2PatientUpdated(handler: EmrV2PatientUpdatedHandler): () => void {
  const socket = getClinicKioskSocket()
  if (!socket) return () => undefined
  const listener = (payload: {
    patientSyncId?: string
    section?: string | null
    newVersion?: number | null
    actorEmail?: string | null
    updatedAt?: string
  }) => {
    handler({
      patientSyncId: String(payload?.patientSyncId || ''),
      section: payload?.section ?? null,
      newVersion: payload?.newVersion ?? null,
      actorEmail: payload?.actorEmail ?? null,
      updatedAt: String(payload?.updatedAt || new Date().toISOString()),
    })
  }
  socket.on(EMR_V2_PATIENT_UPDATED, listener)
  const onOnline = () => {
    void flushEmrV2Outbox()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline)
  }
  return () => {
    socket.off(EMR_V2_PATIENT_UPDATED, listener)
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline)
    }
  }
}

/** Diff de secciones modificadas vs snapshot anterior (hashes FNV vía JSON). */
export function dirtyEmrV2Sections(
  current: ClinicalRecordFormData,
  previous: ClinicalRecordFormData | null,
  options?: { odontogram?: unknown; previousOdontogram?: unknown },
): EmrV2Section[] {
  const sections: EmrV2Section[] = [
    'anamnesis',
    'examen_estomatologico',
    'odontograma',
    'diagnosticos',
    'plan_tratamiento',
  ]
  if (!previous) {
    return sections.filter((section) =>
      sectionPayloadHasContent(section, pickSectionPayload(current, section, options?.odontogram)),
    )
  }
  return sections.filter((section) => {
    const a = JSON.stringify(
      pickSectionPayload(current, section, options?.odontogram) ?? null,
    )
    const b = JSON.stringify(
      pickSectionPayload(previous, section, options?.previousOdontogram) ?? null,
    )
    return a !== b
  })
}

export async function ensurePatientSyncIdForRoute(routeId: string): Promise<{
  patient: Patient | null
  patientSyncId: string
}> {
  const patient = await getPatientByRouteId(routeId)
  const syncId = String(patient?.syncId || '').trim()
  if (patient && syncId) {
    await reconcilePatientDraftKeys({
      id: patient.id,
      syncId,
      documentNumber: patient.documentNumber,
    })
    return { patient, patientSyncId: syncId }
  }
  return { patient, patientSyncId: syncId || String(routeId) }
}
