import { DIAGNOSIS_ANATOMICAL_SCOPE_LABELS } from '../constants/dental.ts'
import type { ClinicalDiagnosticChart } from '../types/clinicalDiagnosticChart.ts'
import type { Cie10Diagnosis, DiagnosisCertainty } from '../types/clinicalRecord.ts'
import { parseDiagnosisAssociation } from './diagnosisAssociation.ts'

/** Mismas 32 piezas permanentes del esquema. Los temporales se guardan solo en la lista. */
const PERMANENT_CHART_TEETH = new Set([
  '18', '17', '16', '15', '14', '13', '12', '11',
  '21', '22', '23', '24', '25', '26', '27', '28',
  '31', '32', '33', '34', '35', '36', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48',
])

const CHART_COLORS = [
  '#3B82F6',
  '#EF4444',
  '#8B5CF6',
  '#F97316',
  '#0D9488',
  '#EC4899',
  '#CA8A04',
  '#64748B',
] as const

function isPermanentChartTooth(toothId: string | number): boolean {
  return PERMANENT_CHART_TEETH.has(String(toothId))
}

function chartColorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length]
}

function normalizeChart(
  data?: Partial<ClinicalDiagnosticChart> | null,
): ClinicalDiagnosticChart {
  const entries = Array.isArray(data?.entries)
    ? data.entries
        .filter((entry) => {
          if (!entry || typeof entry !== 'object') return false
          const dienteId = String(entry.dienteId ?? '')
          return (
            PERMANENT_CHART_TEETH.has(dienteId) &&
            typeof entry.diagnosisCode === 'string' &&
            entry.diagnosisCode.trim() !== '' &&
            typeof entry.diagnosisDescription === 'string'
          )
        })
        .map((entry) => ({
          dienteId: String(entry.dienteId),
          diagnosisCode: entry.diagnosisCode.trim(),
          diagnosisDescription: entry.diagnosisDescription.trim(),
          color: typeof entry.color === 'string' && entry.color ? entry.color : CHART_COLORS[0],
        }))
    : []
  return {
    entries,
    notes: typeof data?.notes === 'string' ? data.notes : '',
  }
}

export interface ReassignImportedCieParams {
  fromCode: string
  toCode: string
  toDescription: string
  /** Si se indica, solo esa pieza cambia de CIE. Si no, cambia el diagnóstico completo. */
  toothNumber?: number
}

function copyDiagnosis(diagnosis: Cie10Diagnosis): Cie10Diagnosis {
  return {
    ...diagnosis,
    affectedTeeth: diagnosis.affectedTeeth ? [...diagnosis.affectedTeeth] : undefined,
    overridesOdontogramCodes: diagnosis.overridesOdontogramCodes
      ? [...diagnosis.overridesOdontogramCodes]
      : undefined,
  }
}

function sortedUnique(teeth: number[]): number[] {
  return [...new Set(teeth)].sort((a, b) => a - b)
}

export function collectOverriddenOdontogramCodes(diagnoses: Cie10Diagnosis[]): Set<string> {
  const codes = new Set<string>()
  for (const diagnosis of diagnoses) {
    for (const code of diagnosis.overridesOdontogramCodes ?? []) {
      if (code && code !== diagnosis.code) codes.add(code)
    }
  }
  return codes
}

/** Piezas del odontograma que todavía no están en otro CIE elegido por el clínico. */
export function teethAvailableForOdontogramImport(
  diagnoses: Cie10Diagnosis[],
  code: string,
  teeth: number[] | undefined,
): number[] {
  const claimed = new Set<number>()
  for (const diagnosis of diagnoses) {
    if (diagnosis.code === code) continue
    for (const tooth of diagnosis.affectedTeeth ?? []) claimed.add(tooth)
  }
  return sortedUnique(teeth ?? []).filter((tooth) => !claimed.has(tooth))
}

function fromOdontogram(diagnosis: Cie10Diagnosis): boolean {
  return diagnosis.source === 'odontograma' || diagnosis.source === 'odontograma_suplementario'
}

/** Conserva el CIE original del odontograma y no marca los códigos intermedios del clínico. */
function carryOverrides(source: Cie10Diagnosis, toCode: string): string[] {
  const overrides = new Set(source.overridesOdontogramCodes ?? [])
  if (fromOdontogram(source) && overrides.size === 0) overrides.add(source.code)
  overrides.delete(toCode)
  return [...overrides]
}

function mergeOverrides(
  target: Cie10Diagnosis,
  source: Cie10Diagnosis,
  toCode: string,
): string[] | undefined {
  const overrides = new Set([
    ...(target.overridesOdontogramCodes ?? []),
    ...carryOverrides(source, toCode),
  ])
  overrides.delete(toCode)
  const list = [...overrides]
  return list.length > 0 ? list : undefined
}

function settlePrincipal(
  diagnoses: Cie10Diagnosis[],
  toCode: string,
  handoff: boolean,
): Cie10Diagnosis[] {
  if (diagnoses.length === 0) return diagnoses
  if (handoff) {
    return diagnoses.map((diagnosis) => ({
      ...diagnosis,
      type: diagnosis.code === toCode
        ? 'principal'
        : diagnosis.type === 'principal'
          ? 'relacionado'
          : diagnosis.type,
    }))
  }
  if (diagnoses.some((diagnosis) => diagnosis.type === 'principal')) return diagnoses
  const preferred = diagnoses.find((diagnosis) => diagnosis.code === toCode) ?? diagnoses[0]
  return diagnoses.map((diagnosis) =>
    diagnosis.code === preferred.code ? { ...diagnosis, type: 'principal' } : diagnosis,
  )
}

function reassignWholeDiagnosis(
  current: Cie10Diagnosis[],
  source: Cie10Diagnosis,
  toCode: string,
  toDescription: string,
): Cie10Diagnosis[] {
  const target = current.find((diagnosis) => diagnosis.code === toCode)

  if (!target) {
    const overrides = carryOverrides(source, toCode)
    return current.map((diagnosis) => {
      if (diagnosis.code !== source.code) return diagnosis
      return {
        ...copyDiagnosis(diagnosis),
        code: toCode,
        description: toDescription,
        overridesOdontogramCodes: overrides.length > 0 ? overrides : undefined,
      }
    })
  }

  if (target.code === source.code) return current

  const mergedTeeth = sortedUnique([
    ...(target.affectedTeeth ?? []),
    ...(source.affectedTeeth ?? []),
  ])
  const sourceWasPrincipal = source.type === 'principal'
  const next = current
    .filter((diagnosis) => diagnosis.code !== source.code)
    .map((diagnosis) => {
      if (diagnosis.code !== toCode) return diagnosis
      return {
        ...copyDiagnosis(diagnosis),
        affectedTeeth: mergedTeeth.length > 0 ? mergedTeeth : diagnosis.affectedTeeth,
        anatomicalScope:
          mergedTeeth.length > 0
            ? undefined
            : diagnosis.anatomicalScope ?? source.anatomicalScope,
        source: fromOdontogram(diagnosis) ? diagnosis.source : source.source ?? diagnosis.source,
        overridesOdontogramCodes: mergeOverrides(diagnosis, source, toCode),
      }
    })

  return settlePrincipal(next, toCode, sourceWasPrincipal && !next.some((d) => d.type === 'principal'))
}

/**
 * Cambia el CIE de una pieza importada del odontograma, o del diagnóstico completo
 * cuando no hay pieza. El resto de las piezas conserva su código.
 */
export function reassignImportedDiagnosisCie(
  current: Cie10Diagnosis[],
  params: ReassignImportedCieParams,
): Cie10Diagnosis[] {
  const toCode = params.toCode.trim()
  const toDescription = params.toDescription.trim()
  const fromCode = params.fromCode.trim()
  if (!toCode || !toDescription || !fromCode || toCode === fromCode) return current

  const source = current.find((diagnosis) => diagnosis.code === fromCode)
  if (!source) return current

  if (params.toothNumber == null) {
    return reassignWholeDiagnosis(current, source, toCode, toDescription)
  }

  const tooth = params.toothNumber
  if (!(source.affectedTeeth ?? []).includes(tooth)) return current

  const removedPrincipal = current.some(
    (diagnosis) =>
      diagnosis.type === 'principal' &&
      diagnosis.code !== toCode &&
      (diagnosis.affectedTeeth ?? []).includes(tooth) &&
      (diagnosis.affectedTeeth ?? []).length === 1,
  )

  const next: Cie10Diagnosis[] = []
  for (const diagnosis of current) {
    if (diagnosis.code === toCode || !(diagnosis.affectedTeeth ?? []).includes(tooth)) {
      next.push(copyDiagnosis(diagnosis))
      continue
    }
    const remaining = (diagnosis.affectedTeeth ?? []).filter((item) => item !== tooth)
    if (remaining.length === 0) continue
    next.push({ ...copyDiagnosis(diagnosis), affectedTeeth: remaining })
  }

  const target = next.find((diagnosis) => diagnosis.code === toCode)
  if (target) {
    target.affectedTeeth = sortedUnique([...(target.affectedTeeth ?? []), tooth])
    target.anatomicalScope = undefined
    if (!fromOdontogram(target) && fromOdontogram(source)) {
      target.source = source.source
    }
  } else {
    next.push({
      code: toCode,
      description: toDescription,
      type: 'relacionado',
      certainty: source.certainty,
      source: source.source ?? 'odontograma',
      affectedTeeth: [tooth],
    })
  }

  return settlePrincipal(next, toCode, removedPrincipal)
}

/**
 * Asigna un CIE a una pieza. Si esa pieza ya tenía otro código, lo mueve:
 * el diente queda en un solo diagnóstico.
 */
export function assignCieToTooth(
  diagnoses: Cie10Diagnosis[],
  params: { code: string; description: string; toothNumber: number },
): Cie10Diagnosis[] {
  const code = params.code.trim()
  const description = params.description.trim()
  const toothNumber = params.toothNumber
  if (!code || !description || !Number.isFinite(toothNumber)) return diagnoses

  const owner = diagnoses.find(
    (diagnosis) =>
      diagnosis.code !== code && (diagnosis.affectedTeeth ?? []).includes(toothNumber),
  )
  if (owner) {
    return reassignImportedDiagnosisCie(diagnoses, {
      fromCode: owner.code,
      toCode: code,
      toDescription: description,
      toothNumber,
    })
  }

  const existing = diagnoses.find((diagnosis) => diagnosis.code === code)
  if (!existing) {
    return [
      ...diagnoses,
      {
        code,
        description,
        type: diagnoses.length === 0 ? 'principal' : 'relacionado',
        certainty: 'impresion',
        source: 'manual',
        affectedTeeth: [toothNumber],
      },
    ]
  }

  const affectedTeeth = sortedUnique([...(existing.affectedTeeth ?? []), toothNumber])
  const already =
    (existing.affectedTeeth ?? []).length === affectedTeeth.length &&
    affectedTeeth.every((tooth, index) => existing.affectedTeeth?.[index] === tooth)
  if (already) {
    if (!existing.anatomicalScope) return diagnoses
    return diagnoses.map((diagnosis) =>
      diagnosis.code === code
        ? { ...copyDiagnosis(diagnosis), anatomicalScope: undefined }
        : diagnosis,
    )
  }

  return diagnoses.map((diagnosis) =>
    diagnosis.code === code
      ? { ...copyDiagnosis(diagnosis), affectedTeeth, anatomicalScope: undefined }
      : diagnosis,
  )
}

/** Quita piezas de los diagnósticos y conserva el código CIE aunque ya no tenga dientes. */
export function detachTeethFromDiagnoses(
  diagnoses: Cie10Diagnosis[],
  toothNumbers: number[],
): Cie10Diagnosis[] {
  const numbers = new Set(toothNumbers.filter((tooth) => Number.isFinite(tooth)))
  if (numbers.size === 0) return diagnoses

  let changed = false
  const next = diagnoses.map((diagnosis) => {
    const current = diagnosis.affectedTeeth ?? []
    if (!current.some((tooth) => numbers.has(tooth))) return diagnosis
    changed = true
    const remaining = current.filter((tooth) => !numbers.has(tooth))
    return {
      ...copyDiagnosis(diagnosis),
      affectedTeeth: remaining.length > 0 ? remaining : undefined,
    }
  })

  return changed ? next : diagnoses
}

export function reassignDiagnosticChartCie(
  chart: ClinicalDiagnosticChart,
  params: { fromCode: string; toCode: string; toDescription: string; toothId?: string },
): ClinicalDiagnosticChart {
  const fromCode = params.fromCode.trim()
  const toCode = params.toCode.trim()
  const toDescription = params.toDescription.trim()
  if (!fromCode || !toCode || !toDescription || fromCode === toCode) return chart

  const targetColor = chart.entries.find((entry) => entry.diagnosisCode === toCode)?.color
  let changed = false
  const entries = chart.entries.map((entry) => {
    if (entry.diagnosisCode !== fromCode) return entry
    if (params.toothId != null && entry.dienteId !== params.toothId) return entry
    changed = true
    return {
      ...entry,
      diagnosisCode: toCode,
      diagnosisDescription: toDescription,
      color: targetColor ?? entry.color,
    }
  })

  if (!changed) return chart
  return { ...chart, entries }
}

export type ManualDiagnosisStatus = 'added' | 'attached' | 'duplicate' | 'invalid'

export interface ManualDiagnosisResult {
  diagnoses: Cie10Diagnosis[]
  chart: ClinicalDiagnosticChart
  status: ManualDiagnosisStatus
  message: string
}

export interface AddManualDiagnosisParams {
  code: string
  description: string
  /** `tooth:NN`, `maxilar_superior`, `maxilar_inferior` o `denticion`. */
  associationValue: string
  type?: Cie10Diagnosis['type']
  certainty?: DiagnosisCertainty
}

function resultOf(
  diagnoses: Cie10Diagnosis[],
  chart: ClinicalDiagnosticChart,
  status: ManualDiagnosisStatus,
  message: string,
): ManualDiagnosisResult {
  return { diagnoses, chart, status, message }
}

function chartColorFor(chart: ClinicalDiagnosticChart, code: string): string {
  const existing = chart.entries.find((entry) => entry.diagnosisCode === code)?.color
  if (existing) return existing
  const used = new Set(chart.entries.map((entry) => entry.diagnosisCode))
  return chartColorAt(used.size)
}

function paintChartTooth(
  chart: ClinicalDiagnosticChart,
  toothNumber: number,
  code: string,
  description: string,
): ClinicalDiagnosticChart {
  const dienteId = String(toothNumber)
  if (!isPermanentChartTooth(dienteId)) return chart
  return {
    ...chart,
    entries: [
      ...chart.entries.filter((entry) => entry.dienteId !== dienteId),
      {
        dienteId,
        diagnosisCode: code,
        diagnosisDescription: description,
        color: chartColorFor(chart, code),
      },
    ],
  }
}

function releaseTooth(
  diagnoses: Cie10Diagnosis[],
  toothNumber: number,
  keepCode: string,
): Cie10Diagnosis[] {
  return diagnoses.map((diagnosis) => {
    if (diagnosis.code === keepCode) return diagnosis
    const teeth = diagnosis.affectedTeeth ?? []
    if (!teeth.includes(toothNumber)) return diagnosis
    const remaining = teeth.filter((tooth) => tooth !== toothNumber)
    return {
      ...copyDiagnosis(diagnosis),
      affectedTeeth: remaining.length > 0 ? remaining : undefined,
    }
  })
}

function withRequestedPrincipal(
  diagnoses: Cie10Diagnosis[],
  code: string,
  requested: Cie10Diagnosis['type'],
): Cie10Diagnosis[] {
  const hasOtherPrincipal = diagnoses.some(
    (diagnosis) => diagnosis.code !== code && diagnosis.type === 'principal',
  )
  const makePrincipal = requested === 'principal' || !hasOtherPrincipal
  return diagnoses.map((diagnosis) => {
    if (diagnosis.code === code) {
      return { ...copyDiagnosis(diagnosis), type: makePrincipal ? 'principal' : 'relacionado' }
    }
    if (makePrincipal && diagnosis.type === 'principal') {
      return { ...copyDiagnosis(diagnosis), type: 'relacionado' }
    }
    return diagnosis
  })
}

function scopeLabel(scope: NonNullable<Cie10Diagnosis['anatomicalScope']>): string {
  return DIAGNOSIS_ANATOMICAL_SCOPE_LABELS[scope]
}

/**
 * Alta o asociación de un CIE elegido en el catálogo.
 * El llamador entrega código y descripción del catálogo: aquí no hay texto libre.
 * Una pieza queda en un solo diagnóstico. Si el código anterior se queda sin piezas, la fila se conserva.
 */
export function addManualDiagnosis(
  diagnoses: Cie10Diagnosis[],
  chartInput: ClinicalDiagnosticChart | Partial<ClinicalDiagnosticChart> | undefined,
  params: AddManualDiagnosisParams,
): ManualDiagnosisResult {
  const chart = normalizeChart(chartInput)
  const code = params.code.trim()
  const description = params.description.trim()
  const association = parseDiagnosisAssociation(params.associationValue ?? '')
  if (!code || !description || !association) {
    return resultOf(
      diagnoses,
      chart,
      'invalid',
      'Elija un código del catálogo y asocie el diagnóstico a un diente, a un maxilar o a toda la dentición.',
    )
  }

  const requestedType = params.type === 'principal' ? 'principal' : 'relacionado'
  const certainty = params.certainty ?? 'impresion'
  const existing = diagnoses.find((diagnosis) => diagnosis.code === code)

  if (association.kind === 'scope') {
    const scope = association.scope
    const hasTeeth =
      (existing?.affectedTeeth?.length ?? 0) > 0 ||
      chart.entries.some((entry) => entry.diagnosisCode === code)
    if (existing && (hasTeeth || existing.anatomicalScope)) {
      const where = existing.anatomicalScope
        ? scopeLabel(existing.anatomicalScope)
        : 'piezas del esquema'
      return resultOf(
        diagnoses,
        chart,
        'duplicate',
        hasTeeth
          ? `${code} ya está asociado a piezas. Para pasarlo a un maxilar o a toda la dentición, quite primero esas piezas.`
          : `${code} ya está asociado a ${where}. Cambie la asociación en la lista.`,
      )
    }

    const nextChart = {
      ...chart,
      entries: chart.entries.filter((entry) => entry.diagnosisCode !== code),
    }
    if (existing) {
      const next = diagnoses.map((diagnosis) =>
        diagnosis.code === code
          ? { ...copyDiagnosis(diagnosis), anatomicalScope: scope, affectedTeeth: undefined }
          : diagnosis,
      )
      return resultOf(next, nextChart, 'attached', `Se asoció ${code} a ${scopeLabel(scope)}.`)
    }

    const created: Cie10Diagnosis = {
      code,
      description,
      type: 'relacionado',
      certainty,
      source: 'manual',
      anatomicalScope: scope,
    }
    const next = withRequestedPrincipal([...diagnoses, created], code, requestedType)
    const storedPrincipal = next.find((diagnosis) => diagnosis.code === code)?.type === 'principal'
    const promoted =
      storedPrincipal && requestedType === 'relacionado'
        ? ' Quedó como principal porque la sección no tenía otro.'
        : ''
    return resultOf(
      next,
      nextChart,
      'added',
      `Se añadió ${code} — ${description} (${scopeLabel(scope)}).${promoted}`,
    )
  }

  const toothNumber = association.toothNumber
  const paintedHere = chart.entries.some(
    (entry) => entry.dienteId === String(toothNumber) && entry.diagnosisCode === code,
  )
  const alreadyListed = (existing?.affectedTeeth ?? []).includes(toothNumber)
  if (existing && alreadyListed && (paintedHere || !isPermanentChartTooth(toothNumber))) {
    return resultOf(
      diagnoses,
      chart,
      'duplicate',
      `${code} ya está asociado a la pieza ${toothNumber}.`,
    )
  }

  const previousTeeth = new Map(
    diagnoses.map((diagnosis) => [diagnosis.code, new Set(diagnosis.affectedTeeth ?? [])]),
  )
  let next = releaseTooth(diagnoses, toothNumber, code)
  const current = next.find((diagnosis) => diagnosis.code === code)
  const chartBase = current?.anatomicalScope
    ? { ...chart, entries: chart.entries.filter((entry) => entry.diagnosisCode !== code) }
    : chart
  const chartDescription = current?.description || description

  if (!current) {
    const created: Cie10Diagnosis = {
      code,
      description,
      type: 'relacionado',
      certainty,
      source: 'manual',
      affectedTeeth: [toothNumber],
    }
    next = withRequestedPrincipal([...next, created], code, requestedType)
  } else {
    const affectedTeeth = sortedUnique([...(current.affectedTeeth ?? []), toothNumber])
    next = next.map((diagnosis) =>
      diagnosis.code === code
        ? { ...copyDiagnosis(diagnosis), affectedTeeth, anatomicalScope: undefined }
        : diagnosis,
    )
  }

  const nextChart = paintChartTooth(chartBase, toothNumber, code, chartDescription)
  const stranded = next.filter((diagnosis) => {
    if (diagnosis.code === code) return false
    if (!previousTeeth.get(diagnosis.code)?.has(toothNumber)) return false
    const teethLeft = diagnosis.affectedTeeth ?? []
    const stillPainted = nextChart.entries.some((entry) => entry.diagnosisCode === diagnosis.code)
    return teethLeft.length === 0 && !stillPainted
  })
  const strandedNote =
    stranded.length === 0
      ? ''
      : stranded.length === 1
        ? ` ${stranded[0].code} quedó sin piezas: asócielo de nuevo o quítelo de la lista.`
        : ` ${stranded.map((diagnosis) => diagnosis.code).join(', ')} quedaron sin piezas: asócielos de nuevo o quítelos de la lista.`
  const scopeNote = existing?.anatomicalScope
    ? ` La asociación de ${scopeLabel(existing.anatomicalScope)} quedó reemplazada por esa pieza.`
    : ''
  const storedPrincipal = next.find((diagnosis) => diagnosis.code === code)?.type === 'principal'
  const promoted =
    !existing && storedPrincipal && requestedType === 'relacionado'
      ? ' Quedó como principal porque la sección no tenía otro.'
      : ''

  return resultOf(
    next,
    nextChart,
    existing ? 'attached' : 'added',
    existing
      ? `Se asignó la pieza ${toothNumber} a ${code}.${scopeNote}${strandedNote}`
      : `Se añadió ${code} — ${description} en la pieza ${toothNumber}.${promoted}${strandedNote}`,
  )
}

/**
 * Un solo principal. Marcar otro degrada al anterior.
 * No deja la lista sin principal: el único principal no pasa a relacionado.
 */
export function setDiagnosisType(
  diagnoses: Cie10Diagnosis[],
  code: string,
  type: Cie10Diagnosis['type'],
): Cie10Diagnosis[] {
  const target = diagnoses.find((diagnosis) => diagnosis.code === code)
  if (!target) return diagnoses

  if (type === 'principal') {
    const sole =
      target.type === 'principal' &&
      diagnoses.filter((diagnosis) => diagnosis.type === 'principal').length === 1
    if (sole) return diagnoses
    return diagnoses.map((diagnosis) => ({
      ...copyDiagnosis(diagnosis),
      type: diagnosis.code === code
        ? 'principal'
        : diagnosis.type === 'principal'
          ? 'relacionado'
          : diagnosis.type,
    }))
  }

  const principalCount = diagnoses.filter((diagnosis) => diagnosis.type === 'principal').length
  if (target.type !== 'principal' || principalCount <= 1) return diagnoses
  return diagnoses.map((diagnosis) =>
    diagnosis.code === code ? { ...copyDiagnosis(diagnosis), type: 'relacionado' } : diagnosis,
  )
}

export type DiagnosisRemovalStatus = 'removed' | 'missing' | 'needs_principal'

export interface DiagnosisRemovalResult {
  diagnoses: Cie10Diagnosis[]
  chart: ClinicalDiagnosticChart
  status: DiagnosisRemovalStatus
}

/** Quita el CIE y sus marcas del esquema. Si era el único principal, exige el reemplazo. */
export function removeDiagnosisFromRecord(
  diagnoses: Cie10Diagnosis[],
  chartInput: ClinicalDiagnosticChart | Partial<ClinicalDiagnosticChart> | undefined,
  code: string,
  replacementPrincipalCode?: string,
): DiagnosisRemovalResult {
  const chart = normalizeChart(chartInput)
  const target = diagnoses.find((diagnosis) => diagnosis.code === code)
  const nextChart = {
    ...chart,
    entries: chart.entries.filter((entry) => entry.diagnosisCode !== code),
  }

  if (!target) {
    const changed = nextChart.entries.length !== chart.entries.length
    return {
      diagnoses,
      chart: changed ? nextChart : chart,
      status: changed ? 'removed' : 'missing',
    }
  }

  const remaining = diagnoses.filter((diagnosis) => diagnosis.code !== code)
  if (target.type === 'principal' && remaining.length > 0) {
    const replacement = remaining.find((diagnosis) => diagnosis.code === replacementPrincipalCode)
    if (!replacement) {
      return { diagnoses, chart, status: 'needs_principal' }
    }
    return {
      status: 'removed',
      chart: nextChart,
      diagnoses: remaining.map((diagnosis) => ({
        ...copyDiagnosis(diagnosis),
        type: diagnosis.code === replacement.code
          ? 'principal'
          : diagnosis.type === 'principal'
            ? 'relacionado'
            : diagnosis.type,
      })),
    }
  }

  return {
    status: 'removed',
    chart: nextChart,
    diagnoses: remaining.map((diagnosis) => copyDiagnosis(diagnosis)),
  }
}

/** Dónde más está citado el código. Esas filas no se reescriben al quitar el diagnóstico. */
export function diagnosisRecordUsage(
  record: {
    treatmentPlan?: Array<{ diagnosisCode?: string | null }>
    budgetItems?: Array<{ diagnosisCode?: string | null }>
    paymentControlLines?: Array<{ diagnosisCode?: string | null }>
  },
  code: string,
): string[] {
  const normalized = code.trim()
  const labels: string[] = []
  const matches = (items?: Array<{ diagnosisCode?: string | null }>) =>
    (items ?? []).some((item) => item.diagnosisCode?.trim() === normalized)
  if (matches(record.treatmentPlan)) labels.push('el plan de tratamiento')
  if (matches(record.budgetItems)) labels.push('el presupuesto')
  if (matches(record.paymentControlLines)) labels.push('el control de pagos')
  return labels
}
