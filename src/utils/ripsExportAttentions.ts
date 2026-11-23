import type { Cie10Diagnosis, ClinicalRecord } from '../types/clinicalRecord.ts'
import type { EvolutionNote } from '../types/evolutionNote.ts'
import type { PatientClinicalDraft } from '../types/patientClinicalDraft.ts'

/**
 * La pantalla de exportación no puede quedarse en `clinicalRecords.isLocked`.
 * Cada nota con RIPS generado (`preparado`, `enviado_ok` o `error`) vive en el
 * borrador clínico: el autoguardado no reescribe la historia, y la firma del
 * tratante deja `isLocked` en false. Esas notas son RIPS de la cuenta.
 */

const ESTADOS_GENERADOS = new Set(['preparado', 'enviado_ok', 'error'])

export type RipsExportAttentionKind = 'historia' | 'nota'

export interface RipsExportAttention {
  id: string
  kind: RipsExportAttentionKind
  ripsEstado: 'preparado' | 'enviado_ok' | 'error' | null
  ripsErrorLog?: string | null
  occurredAt: string
  patientId: string
  diagnosisLabel: string
  procedureLabel: string
  record: ClinicalRecord
}

/** Normaliza fechas de atención a YYYY-MM-DD para comparar con inputs type="date". */
export function diaAtencionIso(value: string | null | undefined): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const latam = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)
  if (latam) {
    return `${latam[3]}-${latam[2].padStart(2, '0')}-${latam[1].padStart(2, '0')}`
  }
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return ''
}

export interface RipsExportDraftSource {
  patientId: string
  updatedAt?: string
  evolutionNotes?: EvolutionNote[] | null
  clinicalDraft?: {
    evolutionNotes?: EvolutionNote[] | null
    diagnoses?: Cie10Diagnosis[] | null
  } | null
  valuationDraft?: {
    evolutionNotes?: EvolutionNote[] | null
    diagnoses?: Cie10Diagnosis[] | null
  } | null
}

interface NoteHit {
  note: EvolutionNote
  patientId: string
  diagnoses: Cie10Diagnosis[]
  updatedAt: string
  prefer: number
}

/**
 * Estado RIPS exportable: sidecar `ripsMetadata.ripsEstado`, alias legados
 * (`listo_para_enviar`) y notas firmadas con CUPS+CIE-10+vínculo financiero.
 */
export function estadoRipsExportable(note: EvolutionNote): string {
  const meta = note.ripsMetadata
  const raw = String(meta?.ripsEstado ?? '').trim().toLowerCase()
  if (raw === 'enviado_ok' || raw === 'radicado') return 'enviado_ok'
  if (raw === 'error' || raw === 'rechazado') return 'error'
  if (raw === 'preparado' || raw === 'listo_para_enviar' || raw === 'listo') return 'preparado'

  if (!meta) return ''
  const firmada = Boolean(
    (note.signedAt && note.contentHash) || note.isLocked === true,
  )
  const cie = String(meta.codDiagnosticoPrincipal ?? '').replace(/[.\s]/g, '')
  const cupsMeta = String(meta.cupsCode ?? '')
    .replace(/\D/g, '')
    .slice(0, 6)
  const cupsNota = String(note.cupsCode ?? '')
    .replace(/\D/g, '')
    .slice(0, 6)
  const cups = cupsMeta.length === 6 ? cupsMeta : cupsNota
  const vinculo = meta.tipoVinculacionFinanciera
  // Solo promover si hay vínculo administrativo real (recibo/FEV) o CUPS en el sidecar RIPS.
  const listoAdmin =
    (vinculo === 'recibo_interno' && Boolean(meta.idReciboAsociado || note.pagoId)) ||
    (vinculo === 'fev' && Boolean(meta.idFacturaElectronica)) ||
    (vinculo === 'valor_cero' && cupsMeta.length === 6)
  if (firmada && cie && cups.length === 6 && listoAdmin) return 'preparado'
  return ''
}

function estadoDe(note: EvolutionNote): string {
  return estadoRipsExportable(note)
}

function rangoEstado(estado: string): number {
  if (estado === 'enviado_ok') return 3
  if (estado === 'preparado') return 2
  if (estado === 'error') return 1
  return 0
}

function compactCie(code: string): string {
  return code.replace(/[.\s]/g, '').toUpperCase()
}

function momentoNota(note: EvolutionNote, parent?: ClinicalRecord): string {
  return (
    note.signedAt?.trim() ||
    note.ripsMetadata?.ripsFechaTransmision?.trim() ||
    note.date?.trim() ||
    note.createdAt?.trim() ||
    parent?.signedAt ||
    parent?.createdAt ||
    ''
  )
}

function resumenProcedimiento(note: EvolutionNote): string {
  const servicios = (note.catalogServices ?? [])
    .map((service) => (service.serviceName || service.procedure || '').trim())
    .filter(Boolean)
  if (servicios.length > 1) return servicios.join(', ')
  return (
    servicios[0] ||
    note.serviceName?.trim() ||
    note.procedure?.trim() ||
    note.cupsCode?.trim() ||
    'Sin procedimiento'
  )
}

function etiquetaHistoria(record: ClinicalRecord): string {
  const diagnoses = record.diagnoses ?? []
  const principal = diagnoses.find((item) => item.type === 'principal') ?? diagnoses[0]
  if (!principal) return 'Sin diagnóstico'
  return `${principal.code} — ${principal.description}`
}

function diagnosticosDeNota(note: EvolutionNote, pool: Cie10Diagnosis[]): Cie10Diagnosis[] {
  const compact = compactCie(String(note.ripsMetadata?.codDiagnosticoPrincipal ?? ''))
  if (compact) {
    const match = pool.find((item) => compactCie(item.code) === compact)
    const principal: Cie10Diagnosis = match
      ? { ...match, type: 'principal' }
      : {
          code: compact,
          description: compact,
          type: 'principal',
          certainty: 'confirmado',
        }
    const relacionados = pool
      .filter((item) => compactCie(item.code) !== compact)
      .map((item) => ({ ...item, type: 'relacionado' as const }))
    return [principal, ...relacionados]
  }
  if (pool.length === 0) return []
  const principal = pool.find((item) => item.type === 'principal') ?? pool[0]!
  return [
    { ...principal, type: 'principal' },
    ...pool
      .filter((item) => item !== principal)
      .map((item) => ({ ...item, type: 'relacionado' as const })),
  ]
}

function etiquetaNota(diagnoses: Cie10Diagnosis[]): string {
  const principal = diagnoses.find((item) => item.type === 'principal') ?? diagnoses[0]
  if (!principal?.code) return 'Sin diagnóstico'
  const description = principal.description?.trim() ?? ''
  if (!description || compactCie(description) === compactCie(principal.code)) return principal.code
  return `${principal.code} — ${description}`
}

function clonarRegistro(record: ClinicalRecord): ClinicalRecord {
  try {
    return structuredClone(record)
  } catch {
    return {
      ...record,
      diagnoses: [...(record.diagnoses ?? [])],
      evolutionNotes: [...(record.evolutionNotes ?? [])],
      budgetItems: [...(record.budgetItems ?? [])],
      treatmentPlan: [...(record.treatmentPlan ?? [])],
    }
  }
}

function registroVacio(patientId: string, professionalId: string, when: string): ClinicalRecord {
  return {
    patientId,
    professionalId,
    anamnesis: { chiefComplaint: '' },
    stomatologicalExam: {},
    specializedAnnexes: {},
    diagnoses: [],
    findings: '',
    treatmentPlan: [],
    budgetItems: [],
    budget: { subtotal: 0, discount: 0, total: 0, currency: 'COP' },
    paymentPlan: [],
    paymentControl: [],
    paymentControlLines: [],
    orthodonticsPaymentControl: [],
    evolutionNotes: [],
    informedConsent: {
      selectedConsentIds: [],
      textAccepted: false,
      professionalLicense: '',
      professionalRegistry: '',
    },
    isLocked: true,
    signedAt: when,
    createdAt: when,
    updatedAt: when,
  } as unknown as ClinicalRecord
}

function registroNota(
  hit: NoteHit,
  parent: ClinicalRecord | undefined,
  diagnoses: Cie10Diagnosis[],
): ClinicalRecord {
  const when = momentoNota(hit.note, parent)
  const base = parent ? clonarRegistro(parent) : registroVacio(hit.patientId, hit.note.authorUserId ?? '', when)
  const cie = diagnosticosDeNota(hit.note, diagnoses)
  return {
    ...base,
    id: `nota:${hit.note.id}`,
    patientId: hit.patientId,
    professionalId: parent?.professionalId || hit.note.authorUserId || base.professionalId,
    diagnoses: cie,
    findings: base.findings ?? '',
    treatmentPlan: [],
    budgetItems: [],
    paymentPlan: [],
    paymentControl: [],
    paymentControlLines: [],
    orthodonticsPaymentControl: [],
    evolutionNotes: [hit.note],
    isLocked: true,
    signedAt: when || base.signedAt || hit.note.createdAt,
    createdAt: base.createdAt || when,
    updatedAt: when || base.updatedAt,
    ripsAtencionNotaId: hit.note.id,
  }
}

function registroHistoria(record: ClinicalRecord, noteIds: Set<string>): ClinicalRecord {
  const notes = record.evolutionNotes ?? []
  if (!notes.some((note) => noteIds.has(note.id))) return record
  const clone = clonarRegistro(record)
  clone.evolutionNotes = notes.filter((note) => !noteIds.has(note.id))
  return clone
}

function considerar(map: Map<string, NoteHit>, hit: NoteHit): void {
  const id = hit.note?.id
  if (!id) return
  const estado = estadoDe(hit.note)
  if (!ESTADOS_GENERADOS.has(estado)) return
  const actual = map.get(id)
  if (!actual) {
    map.set(id, hit)
    return
  }
  const rango = rangoEstado(estado) - rangoEstado(estadoDe(actual.note))
  if (rango > 0 || (rango === 0 && hit.updatedAt > actual.updatedAt) || (rango === 0 && hit.updatedAt === actual.updatedAt && hit.prefer > actual.prefer)) {
    map.set(id, hit)
  }
}

function diagnosticosBorrador(draft: RipsExportDraftSource): Cie10Diagnosis[] {
  const clinicos = draft.clinicalDraft?.diagnoses
  if (Array.isArray(clinicos) && clinicos.length > 0) return clinicos
  const valoracion = draft.valuationDraft?.diagnoses
  if (Array.isArray(valoracion) && valoracion.length > 0) return valoracion
  return []
}

function padreDe(noteId: string, patientId: string, records: ClinicalRecord[]): ClinicalRecord | undefined {
  const propios = records.filter((record) => String(record.patientId ?? '') === patientId)
  const conNota = propios.find((record) =>
    (record.evolutionNotes ?? []).some((note) => note.id === noteId),
  )
  if (conNota) return conNota
  return [...propios].sort((a, b) =>
    (b.updatedAt ?? b.signedAt ?? b.createdAt ?? '').localeCompare(
      a.updatedAt ?? a.signedAt ?? a.createdAt ?? '',
    ),
  )[0]
}

function tiempo(value: string): number {
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

/** Atención ya radicada ante MinSalud (tiene CUV / `enviado_ok`). No debe reexportarse. */
export function atencionRipsYaRadicada(
  attention: Pick<RipsExportAttention, 'ripsEstado'>,
): boolean {
  return attention.ripsEstado === 'enviado_ok'
}

export function etiquetaAtencionRips(
  attention: Pick<RipsExportAttention, 'kind' | 'ripsEstado'>,
): string {
  if (attention.kind === 'historia') return 'Historia firmada'
  if (attention.ripsEstado === 'enviado_ok') return 'Radicado'
  if (attention.ripsEstado === 'error') return 'Error de envío'
  return 'Listo para exportar'
}

/**
 * Si `Desde`/`Hasta` están vacíos, no restringe (todas las pendientes).
 * Compara por día calendario normalizado, no por lexicografía cruda del timestamp.
 */
export function atencionEnPeriodo(occurredAt: string, dateFrom: string, dateTo: string): boolean {
  const from = String(dateFrom ?? '').trim()
  const to = String(dateTo ?? '').trim()
  if (!from && !to) return true
  const day = diaAtencionIso(occurredAt)
  if (!day) return true
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

export function listRipsExportAttentions(input: {
  records: ClinicalRecord[]
  drafts?: Array<PatientClinicalDraft | RipsExportDraftSource> | null
}): RipsExportAttention[] {
  const records = input.records ?? []
  const drafts = input.drafts ?? []
  const notas = new Map<string, NoteHit>()

  for (const record of records) {
    const patientId = String(record.patientId ?? '')
    const updatedAt = record.updatedAt ?? record.signedAt ?? record.createdAt ?? ''
    for (const note of record.evolutionNotes ?? []) {
      considerar(notas, {
        note,
        patientId,
        diagnoses: record.diagnoses ?? [],
        updatedAt,
        prefer: 1,
      })
    }
  }

  for (const draft of drafts) {
    const patientId = String(draft.patientId ?? '')
    const updatedAt = draft.updatedAt ?? ''
    const diagnoses = diagnosticosBorrador(draft)
    const fuentes: Array<{ notes?: EvolutionNote[] | null; prefer: number }> = [
      { notes: draft.evolutionNotes, prefer: 2 },
      { notes: draft.valuationDraft?.evolutionNotes, prefer: 3 },
      { notes: draft.clinicalDraft?.evolutionNotes, prefer: 4 },
    ]
    for (const fuente of fuentes) {
      for (const note of fuente.notes ?? []) {
        considerar(notas, {
          note,
          patientId,
          diagnoses,
          updatedAt,
          prefer: fuente.prefer,
        })
      }
    }
  }

  const noteIds = new Set(notas.keys())
  const attentions: RipsExportAttention[] = []

  records.forEach((record, index) => {
    if (record.isLocked !== true) return
    const exportRecord = registroHistoria(record, noteIds)
    attentions.push({
      id: `historia:${record.id ?? index}`,
      kind: 'historia',
      ripsEstado: null,
      occurredAt: record.signedAt ?? record.createdAt ?? '',
      patientId: String(record.patientId ?? ''),
      diagnosisLabel: etiquetaHistoria(record),
      procedureLabel: String(
        (record.budgetItems ?? []).filter((item) => (item.procedure ?? '').trim()).length,
      ),
      record: exportRecord,
    })
  })

  for (const hit of notas.values()) {
    const parent = padreDe(hit.note.id, hit.patientId, records)
    const pool = hit.diagnoses.length > 0 ? hit.diagnoses : (parent?.diagnoses ?? [])
    const diagnoses = diagnosticosDeNota(hit.note, pool)
    const estado = estadoDe(hit.note) as RipsExportAttention['ripsEstado']
    attentions.push({
      id: `nota:${hit.note.id}`,
      kind: 'nota',
      ripsEstado: estado,
      ripsErrorLog: hit.note.ripsMetadata?.ripsErrorLog,
      occurredAt: momentoNota(hit.note, parent),
      patientId: hit.patientId,
      diagnosisLabel: etiquetaNota(diagnoses),
      procedureLabel: resumenProcedimiento(hit.note),
      record: registroNota(hit, parent, pool),
    })
  }

  attentions.sort((a, b) => tiempo(b.occurredAt) - tiempo(a.occurredAt) || a.id.localeCompare(b.id))
  return attentions
}
