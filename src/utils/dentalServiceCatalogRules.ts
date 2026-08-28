import {
  GENERAL_DENTISTRY_REHUS_SPECIALTY,
  isRehusSpecialtyId,
  type RehusSpecialtyId,
} from '@/constants/rehusSpecialties'
import {
  isGeneralDentistryCupsCode,
  resolveRehusSpecialtyForCupsCode,
} from '@/constants/generalDentistryCups'
import type { DentalService, DentalServiceFormInput } from '@/types/dentalServiceCatalog'

export interface DentalServiceValidationIssue {
  field?: string
  message: string
}

const CUPS_PATTERN = /^\d{6}$/

const GENERAL_DENTISTRY_CATEGORIES = new Set([
  'consulta',
  'operatoria',
  'preventivo',
  'exodoncia',
  'otro',
])

function normalizeCups(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '').padStart(6, '0').slice(0, 6)
}

/** Servicio catalogado como Odontología General (cualquier especialista puede ejecutarlo). */
export function isGeneralDentistryService(
  authorizedSpecialtyIds: readonly string[],
): boolean {
  return authorizedSpecialtyIds.includes(GENERAL_DENTISTRY_REHUS_SPECIALTY)
}

export function ensureGeneralDentistrySpecialtyAuthorized(
  authorizedSpecialtyIds: RehusSpecialtyId[],
): RehusSpecialtyId[] {
  if (authorizedSpecialtyIds.includes(GENERAL_DENTISTRY_REHUS_SPECIALTY)) {
    return authorizedSpecialtyIds
  }
  return [GENERAL_DENTISTRY_REHUS_SPECIALTY, ...authorizedSpecialtyIds]
}

export function validateDentalServiceInput(
  input: DentalServiceFormInput,
): DentalServiceValidationIssue[] {
  const issues: DentalServiceValidationIssue[] = []
  const authorizedSpecialtyIds =
    GENERAL_DENTISTRY_CATEGORIES.has(String(input.category)) ||
    isGeneralDentistryCupsCode(input.cupsCode) ||
    isGeneralDentistryCupsCode(input.cupsHomologo)
      ? ensureGeneralDentistrySpecialtyAuthorized(input.authorizedSpecialtyIds)
      : input.authorizedSpecialtyIds

  if (!input.internalCode.trim()) {
    issues.push({ field: 'internalCode', message: 'El código interno del servicio es obligatorio.' })
  }

  if (!input.name.trim()) {
    issues.push({ field: 'name', message: 'El nombre del servicio es obligatorio.' })
  }

  if (input.requiereCupsRips) {
    const cups = normalizeCups(input.cupsCode)
    if (!cups || !CUPS_PATTERN.test(cups)) {
      issues.push({
        field: 'cupsCode',
        message: 'Los servicios con CUPS obligatorio para RIPS deben tener un código CUPS de 6 dígitos.',
      })
    }
  } else if (input.cupsCode?.trim()) {
    const cups = normalizeCups(input.cupsCode)
    if (!CUPS_PATTERN.test(cups)) {
      issues.push({ field: 'cupsCode', message: 'El código CUPS opcional debe tener 6 dígitos.' })
    }
  }

  if (input.cupsHomologo?.trim()) {
    const homologo = normalizeCups(input.cupsHomologo)
    if (!CUPS_PATTERN.test(homologo)) {
      issues.push({
        field: 'cupsHomologo',
        message: 'cups_homologo debe ser un código CUPS válido de 6 dígitos.',
      })
    }
  }

  if (authorizedSpecialtyIds.length === 0) {
    issues.push({
      field: 'authorizedSpecialtyIds',
      message: 'Debe autorizar al menos una especialidad REHUS para el servicio.',
    })
  }

  for (const specialtyId of authorizedSpecialtyIds) {
    if (!isRehusSpecialtyId(specialtyId)) {
      issues.push({
        field: 'authorizedSpecialtyIds',
        message: `Especialidad REHUS inválida: ${specialtyId}`,
      })
    }
  }

  if (input.defaultPrice < 0) {
    issues.push({ field: 'defaultPrice', message: 'El precio no puede ser negativo.' })
  }

  return issues
}

/** CUPS efectivo para RIPS: propio o homólogo. */
export function resolveEffectiveCupsForRips(service: Pick<
  DentalService,
  'requiereCupsRips' | 'cupsCode' | 'cupsHomologo'
>): string | null {
  const primary = normalizeCups(service.cupsCode)
  if (service.requiereCupsRips && CUPS_PATTERN.test(primary)) {
    return primary
  }
  const homologo = normalizeCups(service.cupsHomologo)
  if (CUPS_PATTERN.test(homologo)) {
    return homologo
  }
  return service.requiereCupsRips ? primary || null : null
}

/**
 * Odontología General: cualquier especialista REHUS puede realizar el servicio.
 * Especialidades restringidas: solo el profesional habilitado.
 */
export function canProfessionalPerformService(
  professionalRehusSpecialty: string,
  authorizedSpecialtyIds: readonly string[],
): boolean {
  if (isGeneralDentistryService(authorizedSpecialtyIds)) {
    return true
  }
  return authorizedSpecialtyIds.includes(professionalRehusSpecialty)
}

/** Misma regla que realización — evolución clínica incluida. */
export function canProfessionalEvolveService(
  professionalRehusSpecialty: string,
  authorizedSpecialtyIds: readonly string[],
): boolean {
  return canProfessionalPerformService(professionalRehusSpecialty, authorizedSpecialtyIds)
}

export function canProfessionalPerformCupsCode(
  professionalRehusSpecialty: RehusSpecialtyId,
  cupsCode: string | null | undefined,
  authorizedSpecialtyIds?: readonly string[],
): boolean {
  if (authorizedSpecialtyIds?.length) {
    return canProfessionalPerformService(professionalRehusSpecialty, authorizedSpecialtyIds)
  }

  if (isGeneralDentistryCupsCode(cupsCode)) {
    return true
  }

  const requiredSpecialty = resolveRehusSpecialtyForCupsCode(cupsCode)
  if (requiredSpecialty) {
    return professionalRehusSpecialty === requiredSpecialty
  }

  return true
}

export function canProfessionalEvolveCupsCode(
  professionalRehusSpecialty: RehusSpecialtyId,
  cupsCode: string | null | undefined,
  authorizedSpecialtyIds?: readonly string[],
): boolean {
  return canProfessionalPerformCupsCode(
    professionalRehusSpecialty,
    cupsCode,
    authorizedSpecialtyIds,
  )
}

export function getProfessionalServiceAccessDeniedMessage(
  serviceName: string,
  professionalRehusSpecialty: string,
): string {
  return (
    `Su especialidad REHUS (${professionalRehusSpecialty}) no está autorizada para ` +
    `realizar o evolucionar «${serviceName}». Los servicios de Odontología General ` +
    `están disponibles para todos los especialistas.`
  )
}
