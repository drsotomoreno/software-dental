import type { UserProfile } from '@/types/user'
import type { FhirBundle, FhirExportMetadata, FhirValidationIssue } from '@/types/fhir'
import type { FhirSourceRecord } from './fhir'

export function validateFhirExport(
  bundle: FhirBundle,
  sources: FhirSourceRecord[],
  professional: UserProfile,
  metadata: FhirExportMetadata,
): FhirValidationIssue[] {
  const issues: FhirValidationIssue[] = []

  if (sources.length === 0) {
    issues.push({
      level: 'error',
      message: 'No hay historias clínicas firmadas seleccionadas para exportar.',
    })
  }

  if (!professional.documentNumber.trim()) {
    issues.push({
      level: 'warning',
      field: 'practitioner',
      message: 'El profesional no tiene documento de identificación registrado.',
    })
  }

  if (!professional.clinicName.trim() && !metadata.organizationName?.trim()) {
    issues.push({
      level: 'warning',
      field: 'organization',
      message: 'No hay nombre de clínica/organización configurado.',
    })
  }

  for (const { record, patient } of sources) {
    const recordId = String(record.id ?? '')
    const patientDoc = `${patient.documentType} ${patient.documentNumber}`

    if (!record.isLocked || !record.signedAt) {
      issues.push({
        level: 'error',
        recordId,
        patientDocument: patientDoc,
        message: 'Solo se pueden exportar historias clínicas firmadas y bloqueadas.',
      })
    }

    if ((record.diagnoses ?? []).length === 0) {
      issues.push({
        level: 'error',
        recordId,
        patientDocument: patientDoc,
        message: 'La historia no tiene diagnósticos CIE-10.',
      })
    }

    if (!patient.birthDate) {
      issues.push({
        level: 'error',
        recordId,
        patientDocument: patientDoc,
        message: 'El paciente no tiene fecha de nacimiento.',
      })
    }

    if (!patient.documentNumber.trim()) {
      issues.push({
        level: 'error',
        recordId,
        patientDocument: patientDoc,
        message: 'El paciente no tiene número de documento.',
      })
    }
  }

  if (metadata.bundleType === 'document') {
    const first = bundle.entry[0]?.resource
    if (!first || first.resourceType !== 'Composition') {
      issues.push({
        level: 'error',
        message:
          'El Bundle tipo document debe tener Composition como primera entrada (estructura RDA).',
      })
    }
  }

  if (bundle.entry.length === 0) {
    issues.push({
      level: 'error',
      message: 'El Bundle FHIR no contiene recursos.',
    })
  }

  const hasPatient = bundle.entry.some((e) => e.resource.resourceType === 'Patient')
  const hasEncounter = bundle.entry.some((e) => e.resource.resourceType === 'Encounter')

  if (!hasPatient) {
    issues.push({ level: 'error', message: 'El Bundle no incluye recurso Patient.' })
  }
  if (!hasEncounter) {
    issues.push({ level: 'warning', message: 'El Bundle no incluye recurso Encounter.' })
  }

  return issues
}

export function hasFhirBlockingErrors(issues: FhirValidationIssue[]): boolean {
  return issues.some((i) => i.level === 'error')
}

export function countFhirIssues(
  issues: FhirValidationIssue[],
  level: FhirValidationIssue['level'],
): number {
  return issues.filter((i) => i.level === level).length
}
