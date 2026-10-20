import { REHAB_ODONTOGRAM_TEETH } from '@/components/clinical/rehabilitation/rehab-odontogram/constants'

export interface ClinicalDiagnosticToothEntry {
  dienteId: string
  diagnosisCode: string
  diagnosisDescription: string
  color: string
}

export interface ClinicalDiagnosticChart {
  entries: ClinicalDiagnosticToothEntry[]
  notes: string
}

const VALID_TOOTH_IDS = new Set(
  Object.values(REHAB_ODONTOGRAM_TEETH).flat().map((fdi) => String(fdi)),
)

export const CLINICAL_DIAGNOSIS_CHART_COLORS = [
  '#3B82F6',
  '#EF4444',
  '#8B5CF6',
  '#F97316',
  '#0D9488',
  '#EC4899',
  '#CA8A04',
  '#64748B',
] as const

export function createEmptyClinicalDiagnosticChart(): ClinicalDiagnosticChart {
  return {
    entries: [],
    notes: '',
  }
}

export function getDiagnosisChartColor(index: number): string {
  return CLINICAL_DIAGNOSIS_CHART_COLORS[index % CLINICAL_DIAGNOSIS_CHART_COLORS.length]
}

export function normalizeClinicalDiagnosticChart(
  data?: Partial<ClinicalDiagnosticChart>,
): ClinicalDiagnosticChart {
  const empty = createEmptyClinicalDiagnosticChart()
  if (!data) return empty

  const entries = Array.isArray(data.entries)
    ? data.entries
        .filter(
          (entry) =>
            entry &&
            typeof entry.dienteId === 'string' &&
            VALID_TOOTH_IDS.has(entry.dienteId) &&
            typeof entry.diagnosisCode === 'string' &&
            entry.diagnosisCode.trim() &&
            typeof entry.diagnosisDescription === 'string',
        )
        .map((entry) => ({
          dienteId: entry.dienteId,
          diagnosisCode: entry.diagnosisCode.trim(),
          diagnosisDescription: entry.diagnosisDescription.trim(),
          color:
            typeof entry.color === 'string' && entry.color
              ? entry.color
              : CLINICAL_DIAGNOSIS_CHART_COLORS[0],
        }))
    : []

  return {
    entries,
    notes: typeof data.notes === 'string' ? data.notes : '',
  }
}

/** Pinta en el esquema las piezas que aún no tienen diagnóstico, sin reemplazar asignaciones hechas a mano. */
export function appendUnassignedDiagnosticChartEntries(
  chart: Partial<ClinicalDiagnosticChart> | undefined,
  diagnoses: Array<{ code: string; description: string; affectedTeeth?: number[] }>,
): ClinicalDiagnosticChart {
  const normalized = normalizeClinicalDiagnosticChart(chart)
  const occupied = new Set(normalized.entries.map((entry) => entry.dienteId))
  const colorByCode = new Map<string, string>()
  for (const entry of normalized.entries) {
    if (!colorByCode.has(entry.diagnosisCode)) {
      colorByCode.set(entry.diagnosisCode, entry.color)
    }
  }

  let colorIndex = colorByCode.size
  const additions: ClinicalDiagnosticToothEntry[] = []

  for (const diagnosis of diagnoses) {
    for (const tooth of diagnosis.affectedTeeth ?? []) {
      const dienteId = String(tooth)
      if (!VALID_TOOTH_IDS.has(dienteId) || occupied.has(dienteId)) continue
      occupied.add(dienteId)
      if (!colorByCode.has(diagnosis.code)) {
        colorByCode.set(diagnosis.code, getDiagnosisChartColor(colorIndex))
        colorIndex += 1
      }
      additions.push({
        dienteId,
        diagnosisCode: diagnosis.code,
        diagnosisDescription: diagnosis.description,
        color: colorByCode.get(diagnosis.code) ?? getDiagnosisChartColor(0),
      })
    }
  }

  if (additions.length === 0) return normalized
  return { ...normalized, entries: [...normalized.entries, ...additions] }
}

export function formatClinicalDiagnosticChartSummary(chart: ClinicalDiagnosticChart): string {
  if (chart.entries.length === 0 && !chart.notes.trim()) return ''

  const byDiagnosis = new Map<string, { label: string; teeth: string[] }>()
  for (const entry of chart.entries) {
    const current = byDiagnosis.get(entry.diagnosisCode) ?? {
      label: `${entry.diagnosisCode} — ${entry.diagnosisDescription}`,
      teeth: [],
    }
    current.teeth.push(entry.dienteId)
    byDiagnosis.set(entry.diagnosisCode, current)
  }

  const lines = [...byDiagnosis.values()].map((item) => {
    const teeth = item.teeth.sort((a, b) => Number(a) - Number(b)).join(', ')
    return `${item.label}: piezas ${teeth}`
  })

  if (chart.notes.trim()) {
    lines.push(`Notas: ${chart.notes.trim()}`)
  }

  return lines.join(' · ')
}
