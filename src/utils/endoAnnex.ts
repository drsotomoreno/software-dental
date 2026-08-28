import type {
  CanalMeasurement,
  ConductometryMethod,
  EndoAnnexData,
  EndoClinicalTests,
  EndoComplexityLevel,
  EndoDiagnosisEntry,
  EndodonticBudgetState,
  EndoRadiographicFindingKey,
  EndoRadiographicFindings,
  EndoToothBudgetLine,
} from '@/types/endoAnnex.types'
import { ENDO_RADIOGRAPHIC_FINDING_OPTIONS } from '@/types/endoAnnex.types'
import { formatCurrency } from './crypto'

const CANAL_PRESETS: Record<number, string[]> = {
  11: ['C'], 12: ['C'], 13: ['C'], 14: ['B', 'P'], 15: ['B', 'P'],
  16: ['MB', 'DB', 'P'], 17: ['MB', 'DB', 'P'], 18: ['MB', 'DB', 'P'],
  21: ['C'], 22: ['C'], 23: ['C'], 24: ['B', 'P'], 25: ['B', 'P'],
  26: ['MB', 'DB', 'P'], 27: ['MB', 'DB', 'P'], 28: ['MB', 'DB', 'P'],
  31: ['C'], 32: ['C'], 33: ['C'], 34: ['LC', 'C'], 35: ['C'],
  36: ['ML', 'MB', 'D'], 37: ['ML', 'MB', 'D'], 38: ['ML', 'MB', 'D'],
  41: ['C'], 42: ['C'], 43: ['C'], 44: ['LC', 'C'], 45: ['C'],
  46: ['ML', 'MB', 'D'], 47: ['ML', 'MB', 'D'], 48: ['ML', 'MB', 'D'],
}

const ENDO_BASE_BUDGET_COP: Record<
  EndoComplexityLevel,
  { initial: number; retreatment: number }
> = {
  Simple: { initial: 450_000, retreatment: 550_000 },
  Moderado: { initial: 650_000, retreatment: 780_000 },
  Complejo: { initial: 900_000, retreatment: 1_100_000 },
}

const VALID_FDI = new Set(
  Object.keys(CANAL_PRESETS).map((tooth) => Number(tooth)),
)

export function getLikelyCanals(toothNumber: number): string[] {
  return [...(CANAL_PRESETS[toothNumber] ?? ['C'])]
}

export function createEmptyCanalMeasurement(canalName: string): CanalMeasurement {
  return {
    canalName,
    workingLength: 0,
    method: '',
    referencePoint: '',
  }
}

export function buildDefaultCanalsForTooth(toothNumber: number): CanalMeasurement[] {
  return getLikelyCanals(toothNumber).map((canalName) => createEmptyCanalMeasurement(canalName))
}

function createEmptyClinicalTests(): EndoClinicalTests {
  return {
    thermalCold: '',
    thermalPersistentPain: false,
    percussion: '',
    palpation: '',
  }
}

const VALID_RADIOGRAPHIC_FINDINGS = new Set<EndoRadiographicFindingKey>(
  ENDO_RADIOGRAPHIC_FINDING_OPTIONS.map((option) => option.value),
)

function createEmptyRadiographicFindings(): EndoRadiographicFindings {
  return {
    selected: [],
    notes: '',
  }
}

function normalizeRadiographicFindings(
  data?: Partial<EndoRadiographicFindings>,
): EndoRadiographicFindings {
  const empty = createEmptyRadiographicFindings()
  if (!data) return empty

  const selected = Array.isArray(data.selected)
    ? data.selected.filter((key): key is EndoRadiographicFindingKey =>
        VALID_RADIOGRAPHIC_FINDINGS.has(key as EndoRadiographicFindingKey),
      )
    : []

  return {
    selected: selected.includes('normal')
      ? ['normal']
      : [...new Set(selected.filter((key) => key !== 'normal'))],
    notes: data.notes ?? '',
  }
}

export function createEmptyEndodonticBudget(): EndodonticBudgetState {
  return {
    active: false,
    toothLines: [],
    notes: '',
  }
}

export function createEmptyEndoAnnexData(): EndoAnnexData {
  return {
    toothNumber: null,
    isRetreatment: false,
    clinicalTests: createEmptyClinicalTests(),
    radiographicFindings: createEmptyRadiographicFindings(),
    canals: [],
    diagnosis: [],
    complexityLevel: '',
    budget: null,
    notes: '',
    updatedAt: '',
    specialistId: '',
  }
}

export function calculateEndoBudget(
  complexityLevel: EndoComplexityLevel | '',
  isRetreatment: boolean,
): number {
  if (!complexityLevel) return 0
  const tier = ENDO_BASE_BUDGET_COP[complexityLevel]
  return isRetreatment ? tier.retreatment : tier.initial
}

export function calculateEndoBudgetTotal(budget: EndodonticBudgetState | null): number {
  if (!budget) return 0
  return budget.toothLines.reduce((sum, line) => sum + Math.max(0, line.unitPrice), 0)
}

export function upsertEndoToothBudgetLine(
  lines: EndoToothBudgetLine[],
  toothNumber: number,
  unitPrice?: number,
): EndoToothBudgetLine[] {
  const existing = lines.find((line) => line.toothNumber === toothNumber)
  if (existing) {
    if (unitPrice === undefined) return lines
    return lines.map((line) =>
      line.toothNumber === toothNumber ? { ...line, unitPrice } : line,
    )
  }
  return [...lines, { toothNumber, unitPrice: unitPrice ?? 0 }].sort(
    (a, b) => a.toothNumber - b.toothNumber,
  )
}

export function resolveEndoBudget(
  complexityLevel: EndoComplexityLevel | '',
  isRetreatment: boolean,
  toothNumber: number | null,
  current: EndodonticBudgetState | null,
): EndodonticBudgetState {
  const base = current ?? createEmptyEndodonticBudget()
  const suggested = calculateEndoBudget(complexityLevel, isRetreatment)
  let toothLines = [...base.toothLines]

  if (toothNumber) {
    const existing = toothLines.find((line) => line.toothNumber === toothNumber)
    if (!existing) {
      toothLines = upsertEndoToothBudgetLine(toothLines, toothNumber, suggested)
    } else if (existing.unitPrice === 0 && suggested > 0) {
      toothLines = upsertEndoToothBudgetLine(toothLines, toothNumber, suggested)
    }
  }

  return {
    active: base.active,
    toothLines,
    notes: base.notes,
  }
}

function normalizeToothBudgetLine(entry: Partial<EndoToothBudgetLine>): EndoToothBudgetLine | null {
  const toothNumber = Number(entry.toothNumber)
  if (!VALID_FDI.has(toothNumber)) return null
  return {
    toothNumber,
    unitPrice: Math.max(0, entry.unitPrice ?? 0),
  }
}

function normalizeBudget(
  data?: Partial<EndodonticBudgetState> | null,
  legacy?: { baseAmount?: number; adjustment?: number; notes?: string },
): EndodonticBudgetState | null {
  if (!data && !legacy) return null

  if (data && Array.isArray(data.toothLines)) {
    const toothLines = data.toothLines
      .map((entry) => normalizeToothBudgetLine(entry))
      .filter((entry): entry is EndoToothBudgetLine => entry !== null)
    return {
      active: Boolean(data.active),
      toothLines,
      notes: data.notes ?? '',
    }
  }

  if (legacy && (legacy.baseAmount ?? 0) > 0) {
    return {
      active: true,
      toothLines: [{ toothNumber: 0, unitPrice: (legacy.baseAmount ?? 0) + (legacy.adjustment ?? 0) }],
      notes: legacy.notes ?? '',
    }
  }

  return null
}

function normalizeClinicalTests(data?: Partial<EndoClinicalTests>): EndoClinicalTests {
  const empty = createEmptyClinicalTests()
  if (!data) return empty
  return {
    thermalCold:
      data.thermalCold === 'positive' || data.thermalCold === 'negative'
        ? data.thermalCold
        : '',
    thermalPersistentPain: Boolean(data.thermalPersistentPain),
    percussion:
      data.percussion === 'positive' || data.percussion === 'negative'
        ? data.percussion
        : '',
    palpation:
      data.palpation === 'positive' || data.palpation === 'negative'
        ? data.palpation
        : '',
  }
}

function normalizeCanal(entry: Partial<CanalMeasurement>): CanalMeasurement | null {
  const canalName = entry.canalName?.trim()
  if (!canalName) return null
  const method: ConductometryMethod | '' =
    entry.method === 'EAL' || entry.method === 'RX' || entry.method === 'Mixed'
      ? entry.method
      : ''
  return {
    canalName,
    workingLength:
      typeof entry.workingLength === 'number' && entry.workingLength >= 0
        ? Math.round(entry.workingLength * 10) / 10
        : 0,
    method,
    referencePoint: entry.referencePoint ?? '',
  }
}

function normalizeDiagnosis(entry: Partial<EndoDiagnosisEntry>): EndoDiagnosisEntry | null {
  const code = entry.code?.trim()
  const description = entry.description?.trim()
  if (!code || !description) return null
  return { code, description }
}

export function normalizeEndoAnnexData(data?: Partial<EndoAnnexData>): EndoAnnexData {
  const empty = createEmptyEndoAnnexData()
  const toothNumber =
    typeof data?.toothNumber === 'number' && VALID_FDI.has(data.toothNumber)
      ? data.toothNumber
      : null

  const complexityLevel =
    data?.complexityLevel === 'Simple' ||
    data?.complexityLevel === 'Moderado' ||
    data?.complexityLevel === 'Complejo'
      ? data.complexityLevel
      : ''

  const canals = Array.isArray(data?.canals)
    ? data.canals
        .map((entry) => normalizeCanal(entry))
        .filter((entry): entry is CanalMeasurement => entry !== null)
    : []

  const diagnosis = Array.isArray(data?.diagnosis)
    ? data.diagnosis
        .map((entry) => normalizeDiagnosis(entry))
        .filter((entry): entry is EndoDiagnosisEntry => entry !== null)
    : []

  const isRetreatment = Boolean(data?.isRetreatment)
  const legacyBudget = data?.budget as EndodonticBudgetState & {
    baseAmount?: number
    adjustment?: number
  }
  const budget =
    normalizeBudget(data?.budget, legacyBudget) ??
    (toothNumber || complexityLevel
      ? resolveEndoBudget(complexityLevel, isRetreatment, toothNumber, null)
      : null)

  const normalizedBudget = budget
    ? resolveEndoBudget(complexityLevel, isRetreatment, toothNumber, budget)
    : null

  return {
    toothNumber,
    isRetreatment,
    clinicalTests: normalizeClinicalTests(data?.clinicalTests),
    radiographicFindings: normalizeRadiographicFindings(data?.radiographicFindings),
    canals: canals.length > 0 ? canals : toothNumber ? buildDefaultCanalsForTooth(toothNumber) : [],
    diagnosis,
    complexityLevel,
    budget: normalizedBudget,
    notes: data?.notes ?? '',
    updatedAt: data?.updatedAt ?? '',
    specialistId: data?.specialistId ?? '',
  }
}

export function stampEndoAnnexAudit(
  data: EndoAnnexData,
  specialistId = '',
): EndoAnnexData {
  return {
    ...data,
    updatedAt: new Date().toISOString(),
    specialistId: specialistId || data.specialistId,
  }
}

export function formatEndoProcedureLabel(toothNumber: number, isRetreatment: boolean): string {
  return `${isRetreatment ? 'Reendodoncia' : 'Endodoncia'} — Pieza ${toothNumber}`
}

export function formatEndoClinicalTestsSummary(tests: EndoClinicalTests): string {
  const parts: string[] = []
  if (tests.thermalCold) {
    parts.push(`Frío: ${tests.thermalCold === 'positive' ? '+' : '-'}`)
    if (tests.thermalPersistentPain) parts.push('dolor persistente')
  }
  if (tests.percussion) {
    parts.push(`Percusión: ${tests.percussion === 'positive' ? '+' : '-'}`)
  }
  if (tests.palpation) {
    parts.push(`Palpación: ${tests.palpation === 'positive' ? '+' : '-'}`)
  }
  return parts.join(' · ')
}

export function formatEndoRadiographicFindingsSummary(
  findings: EndoRadiographicFindings,
): string {
  const labels = findings.selected
    .map(
      (key) =>
        ENDO_RADIOGRAPHIC_FINDING_OPTIONS.find((option) => option.value === key)?.label ?? key,
    )
    .filter(Boolean)

  const parts = [...labels]
  if (findings.notes.trim()) parts.push(findings.notes.trim())
  return parts.join(' · ')
}

export function formatEndoAnnexSummary(data: EndoAnnexData): string {
  const parts: string[] = []
  if (data.toothNumber) parts.push(`Pieza FDI ${data.toothNumber}`)
  if (data.isRetreatment) parts.push('Reendodoncia')
  if (data.complexityLevel) parts.push(`Complejidad ${data.complexityLevel}`)
  if (data.diagnosis.length > 0) {
    parts.push(
      `Dx: ${data.diagnosis.map((item) => `${item.code} ${item.description}`).join('; ')}`,
    )
  }
  const tests = formatEndoClinicalTestsSummary(data.clinicalTests)
  if (tests) parts.push(tests)
  const radiographic = formatEndoRadiographicFindingsSummary(data.radiographicFindings)
  if (radiographic) parts.push(`RX: ${radiographic}`)
  if (data.canals.length > 0) {
    parts.push(
      `Conductos: ${data.canals
        .map((canal) =>
          canal.workingLength > 0
            ? `${canal.canalName}=${canal.workingLength}mm`
            : canal.canalName,
        )
        .join(', ')}`,
    )
  }
  const budgetSummary = formatEndodonticBudgetSummary(data.budget, data.isRetreatment)
  if (budgetSummary) parts.push(`Presupuesto: ${budgetSummary}`)
  if (data.notes.trim()) parts.push(data.notes.trim())
  return parts.join(' · ')
}

export function formatEndodonticBudgetSummary(
  budget: EndodonticBudgetState | null,
  isRetreatment = false,
): string {
  if (!budget || budget.toothLines.length === 0) return ''
  const lines = budget.toothLines
    .filter((line) => line.unitPrice > 0)
    .map(
      (line) =>
        `${formatEndoProcedureLabel(line.toothNumber, isRetreatment)}: ${formatCurrency(line.unitPrice)}`,
    )
  const total = calculateEndoBudgetTotal(budget)
  if (lines.length === 0) return ''
  return `${lines.join(' · ')} · Total ${formatCurrency(total)}`
}
