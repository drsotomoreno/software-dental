import type { EvolutionNote } from '@/types/evolutionNote'
import type { UserProfile } from '@/types/user'
import type { CheckoutLineItem, RipsShieldMismatch } from '@/types/consultationCheckout'
import {
  getThsSpecialtyDefinition,
  type OdontologyThsSpecialtyId,
} from '@/constants/ripsThsSpecialty'
import {
  resolveSedeEnabledSpecialties,
  validateCupsAgainstRepsPortfolio,
} from '@/constants/repsServicePortfolio'
import { getEvolutionCatalogServices } from '@/utils/evolutionCatalogServices'
import { normalizeCupsCode } from '@/services/catalogService'

const CUPS_PATTERN = /^\d{6}$/

function specialtyLabel(id: OdontologyThsSpecialtyId | undefined): string {
  if (!id) return 'sin especialidad declarada'
  return getThsSpecialtyDefinition(id)?.label ?? id
}

function formatClinicSpecialtyLabel(ids: OdontologyThsSpecialtyId[]): string {
  if (ids.length === 0) return 'sin portafolio REPS declarado'
  return ids.map((id) => specialtyLabel(id)).join(', ')
}

export interface CupsShieldCandidate {
  itemId: string
  cupsCode: string
  cupsName: string
}

export function collectCupsFromEvolutionNote(note: EvolutionNote): CupsShieldCandidate[] {
  const services = getEvolutionCatalogServices(note)
  const fromServices = services
    .map((service) => {
      const cups = normalizeCupsCode(String(service.cupsCode ?? ''))
      if (!CUPS_PATTERN.test(cups) || service.requiereCupsRips === false) return null
      return {
        itemId: service.id || note.id,
        cupsCode: cups,
        cupsName: service.serviceName || service.procedure || `CUPS ${cups}`,
      }
    })
    .filter((item): item is CupsShieldCandidate => item !== null)

  if (fromServices.length > 0) return fromServices

  const cups = normalizeCupsCode(String(note.cupsCode ?? ''))
  if (!CUPS_PATTERN.test(cups) || note.requiereCupsRips === false) return []
  return [
    {
      itemId: note.id,
      cupsCode: cups,
      cupsName: note.serviceName || note.procedure || `CUPS ${cups}`,
    },
  ]
}

export function collectCupsFromCheckoutCart(cart: CheckoutLineItem[]): CupsShieldCandidate[] {
  return cart
    .filter((item) => item.kind === 'cups')
    .map((item) => {
      const cups = normalizeCupsCode(String(item.cupsCode ?? ''))
      return CUPS_PATTERN.test(cups)
        ? { itemId: item.id, cupsCode: cups, cupsName: item.name || `CUPS ${cups}` }
        : null
    })
    .filter((item): item is CupsShieldCandidate => item !== null)
}

export function evaluateRipsShield(
  candidates: CupsShieldCandidate[],
  professional: Pick<UserProfile, 'thsSpecialty' | 'rehusSpecialty' | 'repsEnabledSpecialties'>,
): RipsShieldMismatch[] {
  const clinicSpecialtyIds = resolveSedeEnabledSpecialties(professional)
  const clinicSpecialtyLabel = formatClinicSpecialtyLabel(clinicSpecialtyIds)
  const mismatches: RipsShieldMismatch[] = []

  for (const candidate of candidates) {
    const check = validateCupsAgainstRepsPortfolio(candidate.cupsCode, clinicSpecialtyIds)
    if (check.allowed) continue

    const requiredSpecialtyId = check.requiredSpecialty
    mismatches.push({
      itemId: candidate.itemId,
      cupsCode: candidate.cupsCode,
      cupsName: candidate.cupsName,
      requiredSpecialtyId: requiredSpecialtyId ?? 'otras_especialidades',
      requiredSpecialtyLabel: specialtyLabel(requiredSpecialtyId),
      clinicSpecialtyIds,
      clinicSpecialtyLabel,
    })
  }

  return mismatches
}

export function evaluateEvolutionRipsShield(
  note: EvolutionNote,
  professional: Pick<UserProfile, 'thsSpecialty' | 'rehusSpecialty' | 'repsEnabledSpecialties'>,
): RipsShieldMismatch[] {
  return evaluateRipsShield(collectCupsFromEvolutionNote(note), professional)
}

export function evaluateCheckoutRipsShield(
  cart: CheckoutLineItem[],
  professional: Pick<UserProfile, 'thsSpecialty' | 'rehusSpecialty' | 'repsEnabledSpecialties'>,
): RipsShieldMismatch[] {
  return evaluateRipsShield(collectCupsFromCheckoutCart(cart), professional)
}
