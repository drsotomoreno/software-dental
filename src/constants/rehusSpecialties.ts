import {
  ODONTOLOGY_THS_SPECIALTIES,
  type OdontologyThsSpecialtyId,
} from '@/constants/ripsThsSpecialty'

/**
 * Especialidades REHUS / REPS habilitadas para odontología en Colombia.
 * Tabla maestra usada por `dental_service_authorized_specialties` y `professionals`.
 */
export type RehusSpecialtyId = OdontologyThsSpecialtyId

/** Especialidad REHUS de Odontología General — accesible por cualquier especialista. */
export const GENERAL_DENTISTRY_REHUS_SPECIALTY: RehusSpecialtyId = 'odontologia_general'

export interface RehusSpecialtyDefinition {
  id: RehusSpecialtyId
  /** Código REHUS/REPS para reportes regulatorios */
  code: string
  label: string
  active: boolean
}

export const REHUS_SPECIALTIES: RehusSpecialtyDefinition[] = ODONTOLOGY_THS_SPECIALTIES.map(
  (item, index) => ({
    id: item.id,
    code: String(index + 1).padStart(2, '0'),
    label: item.label,
    active: true,
  }),
)

export const REHUS_SPECIALTY_BY_ID = Object.fromEntries(
  REHUS_SPECIALTIES.map((item) => [item.id, item]),
) as Record<RehusSpecialtyId, RehusSpecialtyDefinition>

export function isRehusSpecialtyId(value: string): value is RehusSpecialtyId {
  return value in REHUS_SPECIALTY_BY_ID
}
