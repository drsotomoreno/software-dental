import type { ClinicalDiagnosticChart } from '@/types/clinicalDiagnosticChart'
import type { Cie10Diagnosis, TreatmentPlanItem } from '@/types/clinicalRecord'
import { isValidFdiToothNumber } from '@/utils/cupsLocationRules'
import { generateId } from './crypto'
import { parseAnatomicalZone } from './treatmentPlanZone'

const DEFAULT_TREATMENT_PHASE = 'fase_ii' as const

interface DiagnosisImportSource {
  code: string
  description: string
  toothNumber?: number
}

function diagnosisKey(code: string, toothNumber?: number): string {
  return `${code.trim().toUpperCase()}|${toothNumber ?? ''}`
}

function rememberTooth(teeth: number[], toothNumber: number | undefined) {
  if (typeof toothNumber !== 'number' || !isValidFdiToothNumber(toothNumber)) return
  if (teeth.includes(toothNumber)) return
  teeth.push(toothNumber)
}

/** Une la lista CIE-10 y el esquema por pieza de la sección 4. */
function collectDiagnosisSources(
  diagnoses: Cie10Diagnosis[],
  chart?: ClinicalDiagnosticChart | null,
): DiagnosisImportSource[] {
  const buckets = new Map<string, { description: string; teeth: number[] }>()

  const bucketFor = (code: string, description: string) => {
    const normalized = code.trim().toUpperCase()
    if (!normalized) return null
    const current = buckets.get(normalized)
    if (current) {
      if (!current.description && description.trim()) current.description = description.trim()
      return current
    }
    const created = { description: description.trim(), teeth: [] as number[] }
    buckets.set(normalized, created)
    return created
  }

  for (const diagnosis of diagnoses) {
    const bucket = bucketFor(diagnosis.code, diagnosis.description)
    if (!bucket) continue
    if (diagnosis.description.trim()) bucket.description = diagnosis.description.trim()
    for (const toothNumber of diagnosis.affectedTeeth ?? []) {
      rememberTooth(bucket.teeth, toothNumber)
    }
  }

  for (const entry of chart?.entries ?? []) {
    const bucket = bucketFor(entry.diagnosisCode, entry.diagnosisDescription)
    if (!bucket) continue
    rememberTooth(bucket.teeth, Number(entry.dienteId))
  }

  const sources: DiagnosisImportSource[] = []
  for (const [code, bucket] of buckets) {
    const teeth = [...bucket.teeth].sort((left, right) => left - right)
    if (teeth.length === 0) {
      sources.push({ code, description: bucket.description })
      continue
    }
    for (const toothNumber of teeth) {
      sources.push({ code, description: bucket.description, toothNumber })
    }
  }
  return sources
}

function planToothNumber(item: TreatmentPlanItem): number | undefined {
  if (isValidFdiToothNumber(item.toothNumber)) return item.toothNumber
  const zone = item.anatomicalZone?.trim() ?? ''
  if (/^\d{2}$/.test(zone)) {
    const toothNumber = Number(zone)
    if (isValidFdiToothNumber(toothNumber)) return toothNumber
  }
  return undefined
}

function alreadyImported(plan: TreatmentPlanItem[], source: DiagnosisImportSource): boolean {
  const key = diagnosisKey(source.code, source.toothNumber)
  return plan.some((item) => {
    if (!item.diagnosisCode?.trim()) return false
    return diagnosisKey(item.diagnosisCode, planToothNumber(item)) === key
  })
}

function toPlanItem(source: DiagnosisImportSource): TreatmentPlanItem {
  const zone = source.toothNumber
    ? parseAnatomicalZone(String(source.toothNumber))
    : { anatomicalZone: '' }
  return {
    id: generateId(),
    phase: DEFAULT_TREATMENT_PHASE,
    procedure: '',
    diagnosisCode: source.code,
    diagnosisDescription: source.description || undefined,
    toothNumber: zone.toothNumber,
    anatomicalZone: zone.anatomicalZone || undefined,
    quantity: 1,
    unitPrice: 0,
    patientApproved: 'pendiente',
    executionStatus: 'pendiente',
    source: 'diagnostico',
  }
}

/** Filas nuevas que el botón «Importar desde diagnósticos» agregaría. */
export function previewDiagnosisTreatmentImports(
  diagnoses: Cie10Diagnosis[] | undefined,
  plan: TreatmentPlanItem[],
  chart?: ClinicalDiagnosticChart | null,
): TreatmentPlanItem[] {
  return collectDiagnosisSources(diagnoses ?? [], chart)
    .filter((source) => !alreadyImported(plan, source))
    .map(toPlanItem)
}

export function importDiagnosesToTreatmentPlan(
  diagnoses: Cie10Diagnosis[],
  plan: TreatmentPlanItem[],
  chart?: ClinicalDiagnosticChart | null,
): TreatmentPlanItem[] {
  const additions = previewDiagnosisTreatmentImports(diagnoses, plan, chart)
  return additions.length > 0 ? [...plan, ...additions] : plan
}
