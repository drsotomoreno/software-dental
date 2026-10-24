import { db } from '@/db/database'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { EvolutionNote } from '@/types/evolutionNote'
import type { PatientClinicalDraft } from '@/types/patientClinicalDraft'
import {
  RIPS_QUEUE_STATUS,
  dispositionForRipsClose,
  isRipsBatchCandidate,
  type RipsEvolutionCloseData,
  type RipsQueueEntry,
  type RipsQueueError,
  type RipsQueuePayload,
  type RipsQueueStatus,
} from '@/types/ripsQueue'
import {
  buildPreliminaryRipsJson,
  highlightFieldsForRipsIssues,
  validateRipsLocalSchema,
  type RipsLocalSchemaIssue,
} from '@/services/ripsValidator'
import { toDexiePrimaryKey, toPatientForeignKey } from '@/utils/patientId'

export type {
  RipsEvolutionCloseData,
  RipsQueueEntry,
  RipsQueueError,
  RipsQueueFlowType,
  RipsQueuePayload,
  RipsQueueStatus,
} from '@/types/ripsQueue'

export { RIPS_QUEUE_FLOW, RIPS_QUEUE_STATUS, isRipsBatchCandidate } from '@/types/ripsQueue'

export interface RipsCloseBlocked {
  ok: false
  blocked: true
  /** El borrador clínico no se borra ni se marca cerrado. */
  draftPreserved: true
  evolutionStatus: 'DRAFT' | 'CLOSED'
  errors: RipsLocalSchemaIssue[]
  highlightFields: string[]
  jsonPayload: RipsQueuePayload
  note: EvolutionNote
}

export interface RipsCloseAccepted {
  ok: true
  blocked: false
  draftPreserved: true
  evolutionStatus: 'CLOSED'
  flow: RipsQueueEntry['type']
  queueStatus: RipsQueueStatus
  nextStep: 'BATCH' | 'EMIT_FEV'
  entry: RipsQueueEntry
  jsonPayload: RipsQueuePayload
  note: EvolutionNote
}

export type CloseEvolutionResult = RipsCloseBlocked | RipsCloseAccepted

export class RipsQueueTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RipsQueueTransitionError'
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function blocked(
  data: RipsEvolutionCloseData,
  jsonPayload: RipsQueuePayload,
  errors: RipsLocalSchemaIssue[],
  evolutionStatus: 'DRAFT' | 'CLOSED' = 'DRAFT',
): RipsCloseBlocked {
  return {
    ok: false,
    blocked: true,
    draftPreserved: true,
    evolutionStatus,
    errors,
    highlightFields: highlightFieldsForRipsIssues(errors),
    jsonPayload,
    note: data.note,
  }
}

function closeNotes(notes: EvolutionNote[] | null | undefined, evolutionId: string): EvolutionNote[] | null | undefined {
  if (!Array.isArray(notes)) return notes
  let changed = false
  const next = notes.map((note) => {
    if (note.id !== evolutionId || note.workflowStatus === 'CLOSED') return note
    changed = true
    return { ...note, workflowStatus: 'CLOSED' as const }
  })
  return changed ? next : notes
}

function closeForm(
  form: ClinicalRecordFormData | null | undefined,
  evolutionId: string,
): ClinicalRecordFormData | null | undefined {
  if (!form) return form
  const evolutionNotes = closeNotes(form.evolutionNotes, evolutionId)
  if (evolutionNotes === form.evolutionNotes) return form
  return { ...form, evolutionNotes: evolutionNotes ?? form.evolutionNotes }
}

async function markEvolutionWorkflowClosed(patientId: string, evolutionId: string): Promise<void> {
  const key = toPatientForeignKey(patientId)
  const draft = await db.patientClinicalDrafts.get(key)
  if (draft) {
    const evolutionNotes = closeNotes(draft.evolutionNotes, evolutionId) ?? draft.evolutionNotes
    const clinicalDraft = closeForm(draft.clinicalDraft, evolutionId)
    const valuationDraft = closeForm(draft.valuationDraft, evolutionId)
    const changed =
      evolutionNotes !== draft.evolutionNotes ||
      clinicalDraft !== draft.clinicalDraft ||
      valuationDraft !== draft.valuationDraft
    if (changed) {
      const next: PatientClinicalDraft = {
        ...draft,
        evolutionNotes,
        updatedAt: nowIso(),
      }
      if (clinicalDraft && clinicalDraft !== draft.clinicalDraft) next.clinicalDraft = clinicalDraft
      if (valuationDraft && valuationDraft !== draft.valuationDraft) next.valuationDraft = valuationDraft
      await db.patientClinicalDrafts.put(next)
    }
  }

  const stringKey = toPatientForeignKey(patientId)
  const numericKey = toDexiePrimaryKey(stringKey)
  const byString = await db.clinicalRecords.where('patientId').equals(stringKey).toArray()
  const byNumeric =
    typeof numericKey === 'number'
      ? await db.clinicalRecords.where('patientId').equals(numericKey).toArray()
      : []
  const seen = new Set<string>()
  for (const record of [...byString, ...byNumeric]) {
    const recordKey = String(record.id ?? '')
    if (!recordKey || seen.has(recordKey)) continue
    seen.add(recordKey)
    const evolutionNotes = closeNotes(record.evolutionNotes, evolutionId)
    if (!evolutionNotes || evolutionNotes === record.evolutionNotes || record.id == null) continue
    await db.clinicalRecords.update(record.id, {
      evolutionNotes,
      updatedAt: nowIso(),
    })
  }
}

async function readByEvolution(evolutionId: string): Promise<RipsQueueEntry | undefined> {
  return db.rips_queue.where('evolutionId').equals(evolutionId).first()
}

/**
 * Cierra la evolución para RIPS.
 * Si el esquema local falla, no encola y no cambia el borrador.
 * Sin FEV queda `QUEUED`. Con FEV el sobre se reclama para la emisión DIAN.
 */
export async function closeEvolution(
  evolutionData: RipsEvolutionCloseData,
  hasFEV: boolean,
): Promise<CloseEvolutionResult> {
  const data: RipsEvolutionCloseData = {
    ...evolutionData,
    evolutionId: evolutionData.evolutionId || evolutionData.note.id,
    patientId: String(evolutionData.patientId ?? ''),
  }
  const jsonPayload = buildPreliminaryRipsJson(data)
  const validation = validateRipsLocalSchema(jsonPayload)
  if (!validation.valid) {
    return blocked(data, jsonPayload, validation.errors, data.note.workflowStatus === 'CLOSED' ? 'CLOSED' : 'DRAFT')
  }

  if (!data.evolutionId.trim() || !data.patientId.trim()) {
    return blocked(data, jsonPayload, [
      {
        code: 'EVOLUTION_ID',
        field: 'evolutionId',
        path: 'evolutionId',
        message: 'La evolución y el paciente son obligatorios para encolar el RIPS.',
      },
    ])
  }

  const disposition = dispositionForRipsClose(hasFEV)
  const closedNote: EvolutionNote = { ...data.note, workflowStatus: 'CLOSED' }

  try {
    const entry = await db.transaction(
      'rw',
      [db.rips_queue, db.patientClinicalDrafts, db.clinicalRecords],
      async () => {
        const existing = await readByEvolution(data.evolutionId)
        if (existing?.status === RIPS_QUEUE_STATUS.SYNCHRONIZED) {
          throw new RipsQueueTransitionError('SYNCHRONIZED')
        }
        if (
          existing?.status === RIPS_QUEUE_STATUS.PROCESSING &&
          existing.type !== disposition.type
        ) {
          throw new RipsQueueTransitionError('PROCESSING')
        }

        const timestamp = nowIso()
        const next: RipsQueueEntry = {
          id: existing?.id,
          evolutionId: data.evolutionId,
          patientId: data.patientId,
          type: disposition.type,
          status:
            existing?.status === RIPS_QUEUE_STATUS.PROCESSING && disposition.type === existing.type
              ? RIPS_QUEUE_STATUS.PROCESSING
              : disposition.status,
          jsonPayload,
          cufe: disposition.type === 'WITH_FEV' ? existing?.cufe : undefined,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }
        if (existing?.id != null) {
          await db.rips_queue.put(next)
        } else {
          const fresh: RipsQueueEntry = { ...next }
          delete fresh.id
          const id = await db.rips_queue.add(fresh)
          next.id = Number(id)
        }
        await markEvolutionWorkflowClosed(data.patientId, data.evolutionId)
        return next
      },
    )

    return {
      ok: true,
      blocked: false,
      draftPreserved: true,
      evolutionStatus: 'CLOSED',
      flow: entry.type,
      queueStatus: entry.status,
      nextStep: disposition.nextStep,
      entry,
      jsonPayload,
      note: closedNote,
    }
  } catch (error) {
    const evolutionStatus = data.note.workflowStatus === 'CLOSED' ? 'CLOSED' : 'DRAFT'
    if (error instanceof RipsQueueTransitionError && error.message === 'SYNCHRONIZED') {
      return blocked(
        data,
        jsonPayload,
        [
          {
            code: 'ALREADY_SYNCHRONIZED',
            field: 'cuv',
            path: 'cuv',
            message: 'Esta evolución ya tiene CUV. No se vuelve a encolar.',
          },
        ],
        'CLOSED',
      )
    }
    if (error instanceof RipsQueueTransitionError && error.message === 'PROCESSING') {
      return blocked(
        data,
        jsonPayload,
        [
          {
            code: 'FLOW_IN_PROGRESS',
            field: 'type',
            path: 'type',
            message: 'El RIPS de esta evolución ya está en el flujo de factura electrónica.',
          },
        ],
        evolutionStatus,
      )
    }
    return blocked(
      data,
      jsonPayload,
      [
        {
          code: 'STORAGE',
          field: 'rips_queue',
          path: 'rips_queue',
          message: 'No se pudo guardar la cola RIPS en este equipo. El borrador sigue intacto.',
        },
      ],
      evolutionStatus,
    )
  }
}

export async function getRipsQueueByEvolution(evolutionId: string): Promise<RipsQueueEntry | undefined> {
  return readByEvolution(evolutionId)
}

export async function listRipsQueueByPatient(patientId: string): Promise<RipsQueueEntry[]> {
  const rows = await db.rips_queue.where('patientId').equals(patientId).toArray()
  return rows.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

/** Lote diario / cierre de jornada: solo atenciones particulares ya validadas. */
export async function listRipsBatchQueue(): Promise<RipsQueueEntry[]> {
  const rows = await db.rips_queue.where('[status+type]').equals(['QUEUED', 'WITHOUT_FEV']).toArray()
  return rows.filter(isRipsBatchCandidate)
}

async function transition(
  evolutionId: string,
  status: RipsQueueStatus,
  patch: Partial<Pick<RipsQueueEntry, 'cufe' | 'cuv' | 'errors'>>,
): Promise<RipsQueueEntry> {
  const existing = await readByEvolution(evolutionId)
  if (!existing?.id) {
    throw new RipsQueueTransitionError('No hay un RIPS encolado para esta evolución.')
  }
  if (existing.status === RIPS_QUEUE_STATUS.SYNCHRONIZED && status !== RIPS_QUEUE_STATUS.SYNCHRONIZED) {
    throw new RipsQueueTransitionError('Un RIPS con CUV no cambia de estado.')
  }
  const next: RipsQueueEntry = {
    ...existing,
    ...patch,
    status,
    updatedAt: nowIso(),
  }
  await db.rips_queue.put(next)
  return next
}

export async function markRipsProcessing(evolutionId: string): Promise<RipsQueueEntry> {
  return transition(evolutionId, RIPS_QUEUE_STATUS.PROCESSING, { errors: undefined })
}

export async function markRipsSynchronized(
  evolutionId: string,
  cuv: string,
  cufe?: string,
): Promise<RipsQueueEntry> {
  const code = cuv.trim()
  if (!code) {
    throw new RipsQueueTransitionError('El CUV del MUV es obligatorio para marcar el RIPS como sincronizado.')
  }
  return transition(evolutionId, RIPS_QUEUE_STATUS.SYNCHRONIZED, {
    cuv: code,
    cufe: cufe?.trim() || undefined,
    errors: undefined,
  })
}

export async function markRipsErrorRetry(
  evolutionId: string,
  errors: RipsQueueError[],
): Promise<RipsQueueEntry> {
  return transition(evolutionId, RIPS_QUEUE_STATUS.ERROR_RETRY, {
    errors: errors.map((item) => ({ code: item.code, message: item.message })),
  })
}
