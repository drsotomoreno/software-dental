import type { ClinicalDiagnosticChart } from '../types/clinicalDiagnosticChart.ts'
import type { Cie10Diagnosis } from '../types/clinicalRecord.ts'

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
