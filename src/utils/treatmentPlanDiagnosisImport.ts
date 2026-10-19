import type { ClinicalDiagnosticToothEntry } from '@/types/clinicalDiagnosticChart'
import type { Cie10Diagnosis, TreatmentPlanItem } from '@/types/clinicalRecord'
import { generateId } from './crypto'

const DEFAULT_TREATMENT_PHASE = 'fase_ii' as const

export interface DiagnosisImportSource {
  code: string
  description: string
  toothNumber?: number
}

function sourceKey(source: Pick<DiagnosisImportSource, 'code' | 'toothNumber'>): string {
  return `${source.code}|${source.toothNumber ?? ''}`
}

function planItemKey(item: TreatmentPlanItem): string | null {
  const code = item.diagnosisCode?.trim().toUpperCase()
  if (!code) return null
  const zone = item.anatomicalZone?.trim() || (item.toothNumber != null ? String(item.toothNumber) : '')
  return `${code}|${zone}`
}

/** Diagnósticos visibles en la sección 4: pieza del esquema y códigos sin pieza. */
export function collectSection4DiagnosisImports(
  diagnoses: Cie10Diagnosis[] = [],
  chartEntries: ClinicalDiagnosticToothEntry[] = [],
): DiagnosisImportSource[] {
  const sources: DiagnosisImportSource[] = []
  const seen = new Set<string>()

  const entries = [...chartEntries].sort((a, b) => Number(a.dienteId) - Number(b.dienteId))
  for (const entry of entries) {
    const code = entry.diagnosisCode.trim().toUpperCase()
    const toothNumber = Number(entry.dienteId)
    if (!code || !Number.isFinite(toothNumber)) continue
    const source = {
      code,
      description: entry.diagnosisDescription.trim(),
      toothNumber,
    }
    const key = sourceKey(source)
    if (seen.has(key)) continue
    seen.add(key)
    sources.push(source)
  }

  for (const diagnosis of diagnoses) {
    const code = diagnosis.code.trim().toUpperCase()
    if (!code) continue
    const description = diagnosis.description.trim()
    const teeth = [...new Set(diagnosis.affectedTeeth ?? [])]
      .filter((tooth) => Number.isFinite(tooth))
      .sort((a, b) => a - b)

    if (teeth.length === 0) {
      if ([...seen].some((key) => key.startsWith(`${code}|`))) continue
      const source = { code, description }
      const key = sourceKey(source)
      if (seen.has(key)) continue
      seen.add(key)
      sources.push(source)
      continue
    }

    for (const toothNumber of teeth) {
      const source = { code, description, toothNumber }
      const key = sourceKey(source)
      if (seen.has(key)) continue
      seen.add(key)
      sources.push(source)
    }
  }

  return sources
}

export function previewDiagnosisTreatmentImports(
  diagnoses: Cie10Diagnosis[] = [],
  plan: TreatmentPlanItem[] = [],
  chartEntries: ClinicalDiagnosticToothEntry[] = [],
): DiagnosisImportSource[] {
  const existing = new Set(plan.map(planItemKey).filter((key): key is string => Boolean(key)))
  return collectSection4DiagnosisImports(diagnoses, chartEntries).filter(
    (source) => !existing.has(sourceKey(source)),
  )
}

export function importDiagnosesToTreatmentPlan(
  diagnoses: Cie10Diagnosis[],
  plan: TreatmentPlanItem[],
  chartEntries: ClinicalDiagnosticToothEntry[] = [],
): TreatmentPlanItem[] {
  const additions = previewDiagnosisTreatmentImports(diagnoses, plan, chartEntries).map(
    (source) => {
      const zone = source.toothNumber != null ? String(source.toothNumber) : undefined
      return {
        id: generateId(),
        phase: DEFAULT_TREATMENT_PHASE,
        procedure: '',
        diagnosisCode: source.code,
        diagnosisDescription: source.description,
        anatomicalZone: zone,
        toothNumber: source.toothNumber,
        quantity: 1,
        unitPrice: 0,
        patientApproved: 'pendiente' as const,
        executionStatus: 'pendiente' as const,
        source: 'diagnostico' as const,
      }
    },
  )

  return [...plan, ...additions]
}
