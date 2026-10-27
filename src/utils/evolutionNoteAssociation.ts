import type { EvolutionCatalogService, EvolutionNote, EvolutionNoteDiagnosis } from '@/types/evolutionNote'
import { diagnosisLocationLabel } from './diagnosisAssociation.ts'

export function compactEvolutionCie10(code: string | null | undefined): string {
  return String(code ?? '').replace(/[.\s]/g, '').toUpperCase()
}

export function formatAssociatedItemLabel(
  name: string,
  target: {
    toothNumber?: number | null
    anatomicalScope?: EvolutionNoteDiagnosis['anatomicalScope'] | null
  },
): string {
  const base = name.trim()
  const where = diagnosisLocationLabel({
    toothNumber: target.toothNumber,
    anatomicalScope: target.anatomicalScope ?? undefined,
  })
  if (base && where) return `${base} — ${where}`
  return base || where || ''
}

function isFilledCatalogService(service: EvolutionCatalogService): boolean {
  return Boolean(
    service.dentalServiceId || service.serviceName?.trim() || service.procedure?.trim(),
  )
}

export function evolutionProceduresRequiringAssociation(
  note: Pick<EvolutionNote, 'catalogServices' | 'procedure' | 'serviceName' | 'toothNumber' | 'anatomicalScope'>,
): Array<{
  label: string
  toothNumber?: number
  anatomicalScope?: EvolutionNoteDiagnosis['anatomicalScope']
}> {
  const persisted = (note.catalogServices ?? []).filter(isFilledCatalogService)
  if (persisted.length > 0) {
    return persisted.map((service) => ({
      label: service.serviceName?.trim() || service.procedure.trim() || 'Procedimiento',
      toothNumber: service.toothNumber,
      anatomicalScope: service.anatomicalScope,
    }))
  }

  const label = note.serviceName?.trim() || note.procedure?.trim()
  if (!label) return []
  return [
    {
      label,
      toothNumber: note.toothNumber,
      anatomicalScope: note.anatomicalScope,
    },
  ]
}

export function evolutionDiagnosesRequiringAssociation(
  note: Pick<EvolutionNote, 'diagnoses' | 'ripsMetadata'>,
): Array<Pick<EvolutionNoteDiagnosis, 'code' | 'toothNumber' | 'anatomicalScope'>> {
  const coded = (note.diagnoses ?? []).filter((diagnosis) => diagnosis.code.trim())
  if (coded.length > 0) return coded
  const code = note.ripsMetadata?.codDiagnosticoPrincipal?.trim()
  if (!code) return []
  return [{ code, toothNumber: undefined, anatomicalScope: undefined }]
}

function procedureCoversDiagnosisZone(
  note: EvolutionNote,
  diagnosis: Pick<EvolutionNoteDiagnosis, 'code'>,
): boolean {
  const procedures = evolutionProceduresRequiringAssociation(note)
  const services = (note.catalogServices ?? []).filter(
    (service) => service.procedure?.trim() || service.serviceName?.trim() || service.dentalServiceId,
  )
  const view = services.length > 0 ? procedureCardsWithDiagnoses(note, services) : null
  const paired = view?.services.find(
    (service) =>
      Boolean(diagnosisLocationLabel(service)) &&
      compactEvolutionCie10(service.cie10Code) === compactEvolutionCie10(diagnosis.code),
  )
  if (paired) return true
  return procedures.length === 1 && Boolean(diagnosisLocationLabel(procedures[0]))
}

export function collectEvolutionAssociationIssues(
  note: EvolutionNote,
): Array<{ field: string; message: string }> {
  const issues: Array<{ field: string; message: string }> = []

  for (const procedure of evolutionProceduresRequiringAssociation(note)) {
    if (diagnosisLocationLabel(procedure)) continue
    issues.push({
      field: 'catalogServices',
      message: `Asocie el procedimiento «${procedure.label}» a un diente, un maxilar o toda la dentición.`,
    })
  }

  for (const diagnosis of evolutionDiagnosesRequiringAssociation(note)) {
    if (diagnosisLocationLabel(diagnosis)) continue
    if (procedureCoversDiagnosisZone(note, diagnosis)) continue
    issues.push({
      field: 'diagnoses',
      message: `Asocie el diagnóstico ${diagnosis.code} a un diente, un maxilar o toda la dentición.`,
    })
  }

  return issues
}

/** Diagnósticos con código. Si la nota solo trae el CIE-10 de RIPS, se usa ese. */
export function clinicalDiagnosesOfNote(
  note: Pick<EvolutionNote, 'diagnoses' | 'ripsMetadata'>,
): EvolutionNoteDiagnosis[] {
  const rows = (note.diagnoses ?? []).filter((diagnosis) => diagnosis.code.trim())
  if (rows.length > 0) return rows
  const code = note.ripsMetadata?.codDiagnosticoPrincipal?.trim()
  if (!code) return []
  return [{ id: 'dx-metadata', code, description: '', type: 'principal' }]
}

/**
 * Pone cada diagnóstico en el procedimiento del mismo orden.
 * El código ya guardado en el procedimiento se respeta.
 * Los que no caben quedan como extras y, al guardar, usan la zona del procedimiento.
 */
export function procedureCardsWithDiagnoses(
  note: Pick<EvolutionNote, 'diagnoses' | 'ripsMetadata'>,
  services: EvolutionCatalogService[],
): { services: EvolutionCatalogService[]; extras: EvolutionNoteDiagnosis[] } {
  const diagnoses = clinicalDiagnosesOfNote(note)
  const used = new Set<string>()
  const assigned = services.map((service) => ({ ...service }))

  for (const service of assigned) {
    if (!service.cie10Code?.trim()) continue
    const byId = diagnoses.find((diagnosis) => !used.has(diagnosis.id) && diagnosis.id === `dx-${service.id}`)
    const byCode = diagnoses.find(
      (diagnosis) =>
        !used.has(diagnosis.id) &&
        compactEvolutionCie10(diagnosis.code) === compactEvolutionCie10(service.cie10Code),
    )
    const owned = byId ?? byCode
    if (owned) used.add(owned.id)
  }

  const pending = diagnoses.filter((diagnosis) => !used.has(diagnosis.id))
  let cursor = 0
  for (const service of assigned) {
    if (service.cie10Code?.trim()) continue
    const diagnosis = pending[cursor]
    if (!diagnosis) break
    cursor += 1
    used.add(diagnosis.id)
    service.cie10Code = diagnosis.code
    service.cie10Description = diagnosis.description
  }

  return {
    services: assigned,
    extras: diagnoses.filter((diagnosis) => !used.has(diagnosis.id)),
  }
}

/** Arma los diagnósticos de la sesión desde los procedimientos. La zona no se pide dos veces. */
export function sessionDiagnosesFromProcedures(
  services: EvolutionCatalogService[],
  extras: EvolutionNoteDiagnosis[] = [],
): EvolutionNoteDiagnosis[] {
  const rows: EvolutionNoteDiagnosis[] = []
  for (const service of services) {
    const code = service.cie10Code?.trim()
    if (!code) continue
    rows.push({
      id: `dx-${service.id}`,
      code,
      description: service.cie10Description?.trim() ?? '',
      type: 'principal',
      ...(service.toothNumber ? { toothNumber: service.toothNumber } : {}),
      ...(service.anatomicalScope && !service.toothNumber
        ? { anatomicalScope: service.anatomicalScope }
        : {}),
    })
  }

  const anchor = rows[0]
  const extraRows = extras
    .filter((diagnosis) => diagnosis.code.trim())
    .map((diagnosis) => {
      const hasPlace = Boolean(diagnosis.toothNumber || diagnosis.anatomicalScope)
      return {
        ...diagnosis,
        type: 'relacionado' as const,
        toothNumber: hasPlace ? diagnosis.toothNumber : anchor?.toothNumber,
        anatomicalScope: hasPlace ? diagnosis.anatomicalScope : anchor?.anatomicalScope,
      }
    })

  return withSinglePrincipalDiagnosis([...rows, ...extraRows])
}

export function editableEvolutionDiagnoses(note: EvolutionNote): EvolutionNoteDiagnosis[] {
  if (note.diagnoses && note.diagnoses.length > 0) return note.diagnoses
  return [
    {
      id: `draft-${note.id}`,
      code: note.ripsMetadata?.codDiagnosticoPrincipal?.trim() ?? '',
      description: '',
      type: 'principal',
    },
  ]
}

export function withSinglePrincipalDiagnosis(
  diagnoses: EvolutionNoteDiagnosis[],
  principalId?: string,
): EvolutionNoteDiagnosis[] {
  if (diagnoses.length === 0) return diagnoses
  const chosen =
    principalId && diagnoses.some((diagnosis) => diagnosis.id === principalId)
      ? principalId
      : (diagnoses.find((diagnosis) => diagnosis.type === 'principal')?.id ?? diagnoses[0]?.id)
  return diagnoses.map((diagnosis) => ({
    ...diagnosis,
    type: diagnosis.id === chosen ? 'principal' : 'relacionado',
  }))
}

export function evolutionDiagnosesPatch(diagnoses: EvolutionNoteDiagnosis[]): {
  diagnoses: EvolutionNoteDiagnosis[]
  ripsMetadata: { codDiagnosticoPrincipal: string }
} {
  const normalized = withSinglePrincipalDiagnosis(diagnoses)
  const principal = normalized.find((diagnosis) => diagnosis.type === 'principal')
  const coded = principal?.code.trim()
    ? principal
    : normalized.find((diagnosis) => diagnosis.code.trim())
  return {
    diagnoses: normalized,
    ripsMetadata: { codDiagnosticoPrincipal: compactEvolutionCie10(coded?.code) },
  }
}

/**
 * Si el diagnóstico no tiene zona propia, usa la del procedimiento.
 * Una zona ya elegida en el diagnóstico se conserva.
 */
export function fillMissingDiagnosisZones(note: EvolutionNote): EvolutionNote {
  if (!note.diagnoses?.length) return note
  const services = (note.catalogServices ?? []).filter(
    (service) => service.procedure?.trim() || service.serviceName?.trim() || service.dentalServiceId,
  )
  if (services.length === 0) return note
  const view = procedureCardsWithDiagnoses(note, services)
  let changed = false
  const diagnoses = note.diagnoses.map((diagnosis) => {
    if (!diagnosis.code.trim() || diagnosisLocationLabel(diagnosis)) return diagnosis
    const paired =
      view.services.find(
        (service) =>
          Boolean(diagnosisLocationLabel(service)) &&
          compactEvolutionCie10(service.cie10Code) === compactEvolutionCie10(diagnosis.code),
      ) ?? (services.length === 1 && diagnosisLocationLabel(services[0]) ? services[0] : undefined)
    if (!paired || !diagnosisLocationLabel(paired)) return diagnosis
    changed = true
    if (paired.toothNumber) {
      return { ...diagnosis, toothNumber: paired.toothNumber, anatomicalScope: undefined }
    }
    return { ...diagnosis, toothNumber: undefined, anatomicalScope: paired.anatomicalScope }
  })
  if (!changed) return note
  return { ...note, diagnoses }
}

/** Quita filas vacías antes de firmar para que no entren al hash clínico. */
export function omitBlankEvolutionDiagnoses(note: EvolutionNote): EvolutionNote {
  const withZones = fillMissingDiagnosisZones(note)
  if (!withZones.diagnoses?.length) return withZones
  const diagnoses = withZones.diagnoses.filter((diagnosis) => diagnosis.code.trim())
  if (diagnoses.length === withZones.diagnoses.length && withZones === note) return note
  return { ...withZones, diagnoses }
}
