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
    issues.push({
      field: 'diagnoses',
      message: `Asocie el diagnóstico ${diagnosis.code} a un diente, un maxilar o toda la dentición.`,
    })
  }

  return issues
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

/** Quita filas vacías antes de firmar para que no entren al hash clínico. */
export function omitBlankEvolutionDiagnoses(note: EvolutionNote): EvolutionNote {
  if (!note.diagnoses?.length) return note
  const diagnoses = note.diagnoses.filter((diagnosis) => diagnosis.code.trim())
  if (diagnoses.length === note.diagnoses.length) return note
  return { ...note, diagnoses }
}
