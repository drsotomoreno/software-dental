import type { TreatmentPhase, TreatmentPlanItem } from '@/types/clinicalRecord'
import type { OdontogramData, ToothFace, ToothRecord } from '@/types/odontogram'
import { generateId } from './crypto'

const FACES: ToothFace[] = ['vestibular', 'mesial', 'oclusal', 'distal', 'lingual']

interface SuggestionTemplate {
  procedure: string
  cupsCode: string
  phase: TreatmentPhase
  notes?: string
}

const CARIES_SUGGESTION: SuggestionTemplate = {
  procedure: 'Obturación dental con resina de fotocurado',
  cupsCode: '232102',
  phase: 'fase_ii',
  notes: 'Sugerido por caries en odontograma',
}

const AUSENTE_SUGGESTIONS: SuggestionTemplate[] = [
  {
    procedure: 'Evaluación rehabilitación oral',
    cupsCode: '234000',
    phase: 'fase_iii',
    notes: 'Pieza ausente — definir alternativa terapéutica (corona, prótesis fija o removible)',
  },
]

function hasCaries(tooth: ToothRecord): boolean {
  return FACES.some((f) => tooth.faces[f] === 'caries')
}

/** Genera sugerencias de plan según hallazgos del odontograma (el odontólogo decide qué aplicar). */
export function suggestTreatmentFromOdontogram(odontogram: OdontogramData): TreatmentPlanItem[] {
  const items: TreatmentPlanItem[] = []

  for (const tooth of odontogram.teeth) {
    if (hasCaries(tooth)) {
      items.push({
        id: generateId(),
        phase: CARIES_SUGGESTION.phase,
        procedure: CARIES_SUGGESTION.procedure,
        cupsCode: CARIES_SUGGESTION.cupsCode,
        toothNumber: tooth.number,
        quantity: 1,
        unitPrice: 0,
        notes: CARIES_SUGGESTION.notes,
        patientApproved: 'pendiente',
        executionStatus: 'pendiente',
        source: 'sugerencia',
      })
    }

    if (tooth.globalState === 'ausente') {
      for (const template of AUSENTE_SUGGESTIONS) {
        items.push({
          id: generateId(),
          phase: template.phase,
          procedure: template.procedure,
          cupsCode: template.cupsCode,
          toothNumber: tooth.number,
          quantity: 1,
          unitPrice: 0,
          notes: template.notes,
          patientApproved: 'pendiente',
          executionStatus: 'pendiente',
          source: 'sugerencia',
        })
      }
    }
  }

  return items
}

/** Evita duplicar sugerencias ya presentes (mismo procedimiento + pieza). */
export function mergeSuggestedTreatments(
  current: TreatmentPlanItem[],
  suggested: TreatmentPlanItem[],
): TreatmentPlanItem[] {
  const existing = new Set(
    current.map((i) => `${i.procedure.trim().toLowerCase()}|${i.toothNumber ?? ''}`),
  )

  const toAdd = suggested.filter((s) => {
    const key = `${s.procedure.trim().toLowerCase()}|${s.toothNumber ?? ''}`
    if (existing.has(key)) return false
    existing.add(key)
    return true
  })

  return [...current, ...toAdd]
}
