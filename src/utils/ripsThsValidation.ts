import {
  getThsSpecialtyDefinition,
  resolveConsultationCupsForThs,
  RIPS_CONSULTATION_VISIT_TYPE_LABELS,
  type OdontologyThsSpecialtyId,
  type RipsConsultationVisitType,
} from '@/constants/ripsThsSpecialty'
import { formatCupsCodeDotted, normalizeCupsCode } from '@/services/catalogService'

export interface ThsConsultationCupsValidation {
  valid: boolean
  message?: string
  expectedCups?: string
  specialtyLabel?: string
  visitTypeLabel?: string
}

export function validateThsConsultationCupsMatch(
  codConsulta: string | undefined,
  specialtyId: OdontologyThsSpecialtyId | undefined,
  visitType: RipsConsultationVisitType | undefined,
): ThsConsultationCupsValidation {
  const normalized = normalizeCupsCode(codConsulta ?? '')
  const specialty = getThsSpecialtyDefinition(specialtyId)

  if (!specialtyId || !specialty) {
    return {
      valid: false,
      message:
        'Configure la especialidad THS del profesional en su perfil o en el formulario RIPS antes de radicar.',
    }
  }

  if (!visitType) {
    return {
      valid: false,
      specialtyLabel: specialty.label,
      message:
        'Seleccione el tipo de consulta (primera vez, control o urgencias) para validar el CUPS ante el MUV.',
    }
  }

  const expectedCups = resolveConsultationCupsForThs(specialtyId, visitType)
  const visitTypeLabel = RIPS_CONSULTATION_VISIT_TYPE_LABELS[visitType]

  if (!expectedCups) {
    return {
      valid: false,
      specialtyLabel: specialty.label,
      visitTypeLabel,
      message: `La especialidad THS «${specialty.label}» no puede reportar consultas de tipo «${visitTypeLabel}» en RIPS.`,
    }
  }

  if (normalized !== expectedCups) {
    const example =
      specialtyId === 'odontologia_general' && normalized === '890222'
        ? ' Un odontólogo general provocará rechazo en el MUV si emite consulta 89.0.2.22 de ortodoncia sin parametrizar esa especialidad THS.'
        : ''
    return {
      valid: false,
      expectedCups,
      specialtyLabel: specialty.label,
      visitTypeLabel,
      message:
        `El código CUPS de consulta (${formatCupsCodeDotted(normalized) || normalized}) no coincide con la especialidad THS ` +
        `«${specialty.label}» para ${visitTypeLabel.toLowerCase()}. ` +
        `Use ${formatCupsCodeDotted(expectedCups)} (${expectedCups}) para evitar rechazo en el MUV.` +
        example,
    }
  }

  return {
    valid: true,
    expectedCups,
    specialtyLabel: specialty.label,
    visitTypeLabel,
  }
}
