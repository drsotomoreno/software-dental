import {
  getThsSpecialtyDefinition,
  type OdontologyThsSpecialtyId,
} from '@/constants/ripsThsSpecialty'
import {
  isGeneralDentistryCupsCode,
  resolveRehusSpecialtyForCupsCode,
} from '@/constants/generalDentistryCups'
import { GENERAL_DENTISTRY_REHUS_SPECIALTY } from '@/constants/rehusSpecialties'
import type { UserProfile } from '@/types/user'
import { normalizeCupsCode } from '@/services/catalogService'

const CUPS_PATTERN = /^\d{6}$/

export function resolveSedeEnabledSpecialties(
  professional: Pick<UserProfile, 'thsSpecialty' | 'rehusSpecialty' | 'repsEnabledSpecialties'>,
): OdontologyThsSpecialtyId[] {
  const declared = (professional.repsEnabledSpecialties ?? []).filter(Boolean)
  if (declared.length > 0) {
    const unique = new Set(declared)
    unique.add(GENERAL_DENTISTRY_REHUS_SPECIALTY)
    return [...unique]
  }

  const fallback =
    professional.rehusSpecialty ?? professional.thsSpecialty ?? GENERAL_DENTISTRY_REHUS_SPECIALTY
  return fallback === GENERAL_DENTISTRY_REHUS_SPECIALTY
    ? [GENERAL_DENTISTRY_REHUS_SPECIALTY]
    : [GENERAL_DENTISTRY_REHUS_SPECIALTY, fallback]
}

export function resolveProfessionalSpecialty(
  professional: Pick<UserProfile, 'thsSpecialty' | 'rehusSpecialty'>,
): OdontologyThsSpecialtyId {
  return professional.rehusSpecialty ?? professional.thsSpecialty ?? GENERAL_DENTISTRY_REHUS_SPECIALTY
}

export function isCupsMappedForRips(cupsCode: string | null | undefined): boolean {
  const cups = normalizeCupsCode(String(cupsCode ?? ''))
  return CUPS_PATTERN.test(cups)
}

/**
 * Habilitación REPS de la sede: no se factura ni se genera RIPS de especialidad
 * si el servicio no está en el portafolio activo de la sede.
 */
export function validateCupsAgainstRepsPortfolio(
  cupsCode: string | null | undefined,
  enabledSpecialties: readonly OdontologyThsSpecialtyId[],
): { allowed: boolean; requiredSpecialty?: OdontologyThsSpecialtyId; message?: string } {
  if (!isCupsMappedForRips(cupsCode)) {
    return { allowed: true }
  }

  if (isGeneralDentistryCupsCode(cupsCode)) {
    if (!enabledSpecialties.includes(GENERAL_DENTISTRY_REHUS_SPECIALTY)) {
      return {
        allowed: false,
        requiredSpecialty: GENERAL_DENTISTRY_REHUS_SPECIALTY,
        message:
          'La sede no tiene habilitado el servicio de odontología general en REPS. No se puede facturar ni generar RIPS de este procedimiento.',
      }
    }
    return { allowed: true, requiredSpecialty: GENERAL_DENTISTRY_REHUS_SPECIALTY }
  }

  const required = resolveRehusSpecialtyForCupsCode(cupsCode)
  if (!required || required === GENERAL_DENTISTRY_REHUS_SPECIALTY) {
    return { allowed: true }
  }

  if (!enabledSpecialties.includes(required)) {
    const label = getThsSpecialtyDefinition(required)?.label ?? required
    return {
      allowed: false,
      requiredSpecialty: required,
      message:
        `La sede no tiene habilitado el servicio de ${label} en su portafolio REPS. ` +
        'No se puede facturar ni generar RIPS de este procedimiento de especialidad.',
    }
  }

  return { allowed: true, requiredSpecialty: required }
}

/**
 * Competencia clínica RETHUS: el posgrado del profesional debe coincidir con el procedimiento.
 */
export function validateCupsAgainstRethusSpecialty(
  cupsCode: string | null | undefined,
  professionalSpecialty: OdontologyThsSpecialtyId,
): { allowed: boolean; requiredSpecialty?: OdontologyThsSpecialtyId; message?: string } {
  if (!isCupsMappedForRips(cupsCode) || isGeneralDentistryCupsCode(cupsCode)) {
    return { allowed: true }
  }

  const required = resolveRehusSpecialtyForCupsCode(cupsCode)
  if (!required || required === GENERAL_DENTISTRY_REHUS_SPECIALTY) {
    return { allowed: true }
  }

  if (professionalSpecialty === required) {
    return { allowed: true, requiredSpecialty: required }
  }

  const requiredLabel = getThsSpecialtyDefinition(required)?.label ?? required
  const professionalLabel = getThsSpecialtyDefinition(professionalSpecialty)?.label ?? professionalSpecialty
  return {
    allowed: false,
    requiredSpecialty: required,
    message:
      `El procedimiento CUPS ${normalizeCupsCode(String(cupsCode))} exige especialidad RETHUS «${requiredLabel}». ` +
      `El profesional está registrado como «${professionalLabel}».`,
  }
}
