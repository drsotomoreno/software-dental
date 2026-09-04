import type { UserProfile } from '@/types/user'
import type { BudgetLineItem, ClinicalRecord } from '@/types/clinicalRecord'
import type { RipsExportMetadata, RipsTransaction, RipsValidationIssue } from '@/types/rips'
import type { RipsSourceRecord } from './rips'
import { formatCupsCodeDotted, normalizeCupsCode } from '@/services/catalogService'
import { getThsSpecialtyDefinition } from '@/constants/ripsThsSpecialty'
import { isOdontologyConsultationCups } from '@/constants/rips'
import { validateProcedureBillingQuantities } from './cupsBillingRules'
import { validateProcedureLocations } from './cupsLocationRules'
import { validateThsConsultationCupsMatch } from './ripsThsValidation'
import { validateRepsSedeStep, validateRethusProfessionalStep } from './fevRipsEmissionPipeline'
import {
  buildStructureValidationContext,
  validateRipsJsonStructure,
  validateRipsMetadataStructure,
} from './ripsStructureValidation'

function namesMatch(left: string, right: string): boolean {
  const a = left.trim().toLowerCase()
  const b = right.trim().toLowerCase()
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

/** Ítems sin CUPS que son personalizados / no RIPS a propósito (p. ej. Tatuaje Dental). */
export function isIntentionalNonCupsBudgetItem(
  item: BudgetLineItem,
  record: ClinicalRecord,
): boolean {
  if (item.cupsCode?.trim()) return false
  const name = (item.procedure ?? '').trim()
  if (!name) return true

  const plan = (record.treatmentPlan ?? []).find(
    (entry) =>
      (item.treatmentPlanItemId && entry.id === item.treatmentPlanItemId) ||
      namesMatch(entry.procedure, name),
  )
  if (plan && !plan.cupsCode?.trim()) return true

  for (const note of record.evolutionNotes ?? []) {
    if (note.requiereCupsRips === false && namesMatch(note.procedure || note.serviceName || '', name)) {
      return true
    }
    for (const service of note.catalogServices ?? []) {
      if (
        service.requiereCupsRips === false &&
        namesMatch(service.procedure || service.serviceName || '', name)
      ) {
        return true
      }
    }
  }

  return false
}

export function recordHasOdontologyConsultation(record: ClinicalRecord): boolean {
  const codes = [
    ...(record.budgetItems ?? []).map((item) => item.cupsCode),
    ...(record.treatmentPlan ?? []).map((item) => item.cupsCode),
    ...(record.evolutionNotes ?? []).flatMap((note) => [
      note.cupsCode,
      ...(note.catalogServices ?? []).map((service) => service.cupsCode),
    ]),
  ]
  return codes.some((code) => isOdontologyConsultationCups(code))
}

export function validateRipsExport(
  rips: RipsTransaction,
  sources: RipsSourceRecord[],
  professional: UserProfile,
  metadata: RipsExportMetadata,
): RipsValidationIssue[] {
  const issues: RipsValidationIssue[] = []

  if (!metadata.numDocumentoIdObligado.trim()) {
    issues.push({
      level: 'error',
      field: 'numDocumentoIdObligado',
      message: 'Configure el NIT del prestador en su perfil o en el formulario de exportación.',
    })
  } else if (!professional.providerNit?.replace(/\D/g, '') || !professional.repsCode?.replace(/\D/g, '')) {
    issues.push({
      level: 'error',
      field: 'numDocumentoIdObligado',
      message:
        'Configure NIT y código REPS de habilitación de la sede en el perfil antes de radicar RIPS o emitir FEV-Salud.',
    })
  }

  const structureContext = buildStructureValidationContext(metadata)
  issues.push(...validateRipsMetadataStructure(metadata, structureContext))
  issues.push(...validateRipsJsonStructure(rips, structureContext))

  if (!professional.documentNumber.trim()) {
    issues.push({
      level: 'warning',
      field: 'professional',
      message: 'El profesional no tiene documento de identificación registrado.',
    })
  }

  const cupsFromRips = rips.usuarios.flatMap((usuario) => [
    ...(usuario.servicios?.consultas ?? []).map((consulta) => consulta.codConsulta),
    ...(usuario.servicios?.procedimientos ?? []).map((proc) => proc.codProcedimiento),
  ])
  for (const issue of [
    ...validateRepsSedeStep(professional),
    ...validateRethusProfessionalStep(professional, cupsFromRips),
  ]) {
    issues.push({
      level: issue.level,
      field: issue.field,
      message: issue.message,
    })
  }

  if (sources.length === 0) {
    issues.push({
      level: 'error',
      message: 'No hay historias clínicas firmadas seleccionadas para exportar.',
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

    if (!patient.municipalityCode?.trim()) {
      issues.push({
        level: 'warning',
        recordId,
        patientDocument: patientDoc,
        field: 'codMunicipioResidencia',
        message: 'El paciente no tiene código de municipio DANE; se usará 00000.',
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

    const itemsWithoutCups = (record.budgetItems ?? []).filter(
      (item) =>
        (item.procedure ?? '').trim() &&
        !item.cupsCode?.trim() &&
        !isIntentionalNonCupsBudgetItem(item, record),
    )
    if (itemsWithoutCups.length > 0) {
      issues.push({
        level: 'warning',
        recordId,
        patientDocument: patientDoc,
        message: `${itemsWithoutCups.length} procedimiento(s) del presupuesto sin código CUPS.`,
      })
    }

    const invalidCups = (record.budgetItems ?? []).filter(
      (item) => item.cupsCode?.trim() && !/^\d{6}$/.test(item.cupsCode.replace(/\D/g, '')),
    )
    if (invalidCups.length > 0) {
      issues.push({
        level: 'warning',
        recordId,
        patientDocument: patientDoc,
        message: `${invalidCups.length} código(s) CUPS con formato inválido (deben ser 6 dígitos).`,
      })
    }

    for (const billingIssue of validateProcedureBillingQuantities(record.budgetItems ?? [])) {
      issues.push({
        level: billingIssue.level,
        recordId,
        patientDocument: patientDoc,
        field: 'budgetQuantity',
        message: billingIssue.message,
      })
    }

    for (const locationIssue of validateProcedureLocations(
      (record.budgetItems ?? []).map((item) => ({
        procedure: item.procedure,
        cupsCode: item.cupsCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        toothNumber: item.toothNumber,
        fdiQuadrant: item.fdiQuadrant,
        arch: item.arch,
      })),
    )) {
      issues.push({
        level: locationIssue.level,
        recordId,
        patientDocument: patientDoc,
        field: locationIssue.field,
        message: locationIssue.message,
      })
    }
  }

  const totalConsultas = rips.usuarios.reduce((n, u) => n + u.servicios.consultas.length, 0)
  const totalProcedimientos = rips.usuarios.reduce(
    (n, u) => n + u.servicios.procedimientos.length,
    0,
  )

  if (totalConsultas === 0 && totalProcedimientos === 0) {
    issues.push({
      level: 'error',
      message: 'El archivo RIPS no contiene consultas ni procedimientos.',
    })
  }

  if (
    (metadata.vrConsulta ?? 0) <= 0 &&
    totalConsultas > 0 &&
    sources.some(({ record }) => recordHasOdontologyConsultation(record))
  ) {
    issues.push({
      level: 'warning',
      field: 'vrConsulta',
      message: 'El valor de la consulta odontológica es 0; verifique antes de radicar.',
    })
  }

  const thsSpecialty = metadata.thsSpecialty ?? professional.thsSpecialty
  const visitType = metadata.tipoConsulta

  if (!thsSpecialty) {
    issues.push({
      level: 'error',
      field: 'thsSpecialty',
      message:
        'Configure la especialidad THS del profesional en su perfil o en el formulario RIPS. El MUV exige que coincida con el CUPS de consulta.',
    })
  }

  if (!visitType && totalConsultas > 0) {
    issues.push({
      level: 'error',
      field: 'tipoConsulta',
      message: 'Seleccione el tipo de consulta (primera vez, control o urgencias) para el RIPS.',
    })
  }

  const declaredConsultaCups = normalizeCupsCode(
    metadata.codConsultaOdontologia ?? '',
  )
  const thsValidation = validateThsConsultationCupsMatch(
    declaredConsultaCups,
    thsSpecialty,
    visitType,
  )
  const specialtyLabel = getThsSpecialtyDefinition(thsSpecialty)?.label

  if (!thsValidation.valid && totalConsultas > 0) {
    issues.push({
      level: 'error',
      field: 'codConsulta',
      message:
        thsValidation.message ??
        'El CUPS de consulta no coincide con la especialidad THS del profesional que firma la atención.',
    })
  } else if (thsValidation.valid && thsValidation.expectedCups && totalConsultas > 0) {
    for (const usuario of rips.usuarios) {
      for (const consulta of usuario.servicios.consultas) {
        if (normalizeCupsCode(consulta.codConsulta) !== thsValidation.expectedCups) {
          issues.push({
            level: 'error',
            field: 'codConsulta',
            patientDocument: usuario.numDocumentoIdentificacion,
            message:
              `El código de consulta en el JSON RIPS (${formatCupsCodeDotted(consulta.codConsulta)}) ` +
              `no coincide con la especialidad THS «${specialtyLabel ?? thsSpecialty}» ` +
              `(${formatCupsCodeDotted(thsValidation.expectedCups)}).`,
          })
        }
      }
    }
  }

  return issues
}

export function hasRipsBlockingErrors(issues: RipsValidationIssue[]): boolean {
  return issues.some((i) => i.level === 'error')
}

export function countRipsIssues(
  issues: RipsValidationIssue[],
  level: RipsValidationIssue['level'],
): number {
  return issues.filter((i) => i.level === level).length
}
