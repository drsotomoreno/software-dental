import {
  DEFAULT_ODONTOLOGY_CONSULTATION_CUPS,
  ODONTOLOGY_EMERGENCY_CONSULTATION_CUPS,
  ODONTOLOGY_FOLLOWUP_CONSULTATION_CUPS,
  ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS,
  ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS,
  ODONTOLOGY_SPECIALTY_FIRST_VISIT_CUPS,
  ODONTOLOGY_SPECIALTY_FOLLOWUP_CUPS,
} from '@/constants/rips'

/** Especialidad declarada en REPS para el THS prestador de la atención */
export type OdontologyThsSpecialtyId =
  | 'odontologia_general'
  | 'cirugia_oral_maxilofacial'
  | 'endodoncia'
  | 'estomatologia_cirugia_oral'
  | 'odontopediatria'
  | 'odontologia_del_bebe'
  | 'periodoncia'
  | 'ortodoncia'
  | 'radiologia_oral_maxilofacial'
  | 'rehabilitacion_oral'
  | 'patologia_oral_maxilofacial'
  | 'otras_especialidades'

export type RipsConsultationVisitType = 'primera_vez' | 'control' | 'urgencias'

export interface OdontologyThsSpecialtyDefinition {
  id: OdontologyThsSpecialtyId
  /** Etiqueta alineada con la especialidad REPS / THS */
  label: string
  primeraVezCups: string
  controlCups: string
  /** Solo odontología general reporta urgencias con 890703 */
  urgenciasCups?: string
}

export const ODONTOLOGY_THS_SPECIALTIES: OdontologyThsSpecialtyDefinition[] = [
  {
    id: 'odontologia_general',
    label: 'Odontología general',
    primeraVezCups: DEFAULT_ODONTOLOGY_CONSULTATION_CUPS,
    controlCups: ODONTOLOGY_FOLLOWUP_CONSULTATION_CUPS,
    urgenciasCups: ODONTOLOGY_EMERGENCY_CONSULTATION_CUPS,
  },
  {
    id: 'cirugia_oral_maxilofacial',
    label: 'Cirugía oral y maxilofacial',
    primeraVezCups: ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS.cirugiaOral,
    controlCups: ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS.cirugiaOralMaxilofacial,
  },
  {
    id: 'endodoncia',
    label: 'Endodoncia',
    primeraVezCups: ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS.endodoncia,
    controlCups: ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS.endodoncia,
  },
  {
    id: 'estomatologia_cirugia_oral',
    label: 'Estomatología y cirugía oral',
    primeraVezCups: ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS.estomatologiaCirugiaOral,
    controlCups: ODONTOLOGY_SPECIALTY_FOLLOWUP_CUPS,
  },
  {
    id: 'odontopediatria',
    label: 'Odontopediatría',
    primeraVezCups: ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS.odontopediatria,
    controlCups: ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS.odontopediatria,
  },
  {
    id: 'odontologia_del_bebe',
    label: 'Odontología del bebé',
    primeraVezCups: ODONTOLOGY_SPECIALTY_FIRST_VISIT_CUPS,
    controlCups: ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS.odontologiaDelBebe,
  },
  {
    id: 'periodoncia',
    label: 'Periodoncia',
    primeraVezCups: ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS.periodoncia,
    controlCups: ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS.periodoncia,
  },
  {
    id: 'ortodoncia',
    label: 'Ortodoncia',
    primeraVezCups: ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS.ortodoncia,
    controlCups: ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS.ortodoncia,
  },
  {
    id: 'radiologia_oral_maxilofacial',
    label: 'Radiología oral y maxilofacial',
    primeraVezCups: ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS.radiologiaOralMaxilofacial,
    controlCups: ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS.radiologiaOralMaxilofacial,
  },
  {
    id: 'rehabilitacion_oral',
    label: 'Rehabilitación oral',
    primeraVezCups: ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS.rehabilitacionOral,
    controlCups: ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS.rehabilitacionOral,
  },
  {
    id: 'patologia_oral_maxilofacial',
    label: 'Patología oral y maxilofacial',
    primeraVezCups: ODONTOLOGY_SPECIALTY_FIRST_VISIT_CUPS,
    controlCups: ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS.patologiaOralMaxilofacial,
  },
  {
    id: 'otras_especialidades',
    label: 'Otras especialidades en odontología (genérico)',
    primeraVezCups: ODONTOLOGY_SPECIALTY_FIRST_VISIT_CUPS,
    controlCups: ODONTOLOGY_SPECIALTY_FOLLOWUP_CUPS,
  },
]

export const RIPS_CONSULTATION_VISIT_TYPE_LABELS: Record<RipsConsultationVisitType, string> = {
  primera_vez: 'Primera vez',
  control: 'Control o seguimiento',
  urgencias: 'Urgencias',
}

export function getThsSpecialtyDefinition(
  specialtyId: OdontologyThsSpecialtyId | undefined,
): OdontologyThsSpecialtyDefinition | undefined {
  if (!specialtyId) return undefined
  return ODONTOLOGY_THS_SPECIALTIES.find((item) => item.id === specialtyId)
}

export function resolveConsultationCupsForThs(
  specialtyId: OdontologyThsSpecialtyId | undefined,
  visitType: RipsConsultationVisitType | undefined,
): string | null {
  const specialty = getThsSpecialtyDefinition(specialtyId)
  if (!specialty || !visitType) return null

  if (visitType === 'urgencias') {
    return specialty.urgenciasCups ?? null
  }
  if (visitType === 'control') {
    return specialty.controlCups
  }
  return specialty.primeraVezCups
}

export function listAllowedConsultationCupsForThs(
  specialtyId: OdontologyThsSpecialtyId | undefined,
): string[] {
  const specialty = getThsSpecialtyDefinition(specialtyId)
  if (!specialty) return []

  const codes = [specialty.primeraVezCups, specialty.controlCups]
  if (specialty.urgenciasCups) codes.push(specialty.urgenciasCups)
  return [...new Set(codes)]
}
