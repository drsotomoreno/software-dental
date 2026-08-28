import { db } from '@/db/database'
import { GENERAL_DENTISTRY_REHUS_SPECIALTY } from '@/constants/rehusSpecialties'
import type { RehusSpecialtyId } from '@/constants/rehusSpecialties'
import { normalizeCupsCode } from '@/services/catalogService'
import type { DentalService, Professional } from '@/types/dentalServiceCatalog'
import {
  canProfessionalEvolveCupsCode,
  canProfessionalEvolveService,
  canProfessionalPerformCupsCode,
  canProfessionalPerformService,
} from '@/utils/dentalServiceCatalogRules'
import { userProfileToOrganizationId } from '@/utils/organizationId'
import type { UserProfile } from '@/types/user'

export async function getProfessionalByUserId(userId: string): Promise<Professional | undefined> {
  return db.professionals.where('userId').equals(userId).first()
}

export async function resolveProfessionalRehusSpecialty(
  user: Pick<UserProfile, 'id' | 'thsSpecialty' | 'rehusSpecialty' | 'providerNit'>,
): Promise<RehusSpecialtyId> {
  const professional = await getProfessionalByUserId(user.id)
  return (
    professional?.rehusSpecialty ??
    user.rehusSpecialty ??
    user.thsSpecialty ??
    GENERAL_DENTISTRY_REHUS_SPECIALTY
  )
}

export async function getAuthorizedSpecialtyIdsForService(
  serviceId: string,
): Promise<RehusSpecialtyId[]> {
  const rows = await db.dentalServiceSpecialties.where('serviceId').equals(serviceId).toArray()
  return rows.map((row) => row.rehusSpecialtyId)
}

export async function findDentalServiceByCups(
  organizationId: string,
  cupsCode: string,
): Promise<DentalService | undefined> {
  const normalized = normalizeCupsCode(cupsCode)
  const byPrimary = await db.dentalServices
    .where('[organizationId+internalCode]')
    .equals([organizationId, normalized])
    .first()

  if (byPrimary) return byPrimary

  return db.dentalServices
    .where('organizationId')
    .equals(organizationId)
    .filter(
      (service) =>
        normalizeCupsCode(service.cupsCode) === normalized ||
        normalizeCupsCode(service.cupsHomologo) === normalized,
    )
    .first()
}

export async function canUserPerformDentalService(
  user: Pick<UserProfile, 'id' | 'thsSpecialty' | 'rehusSpecialty' | 'providerNit'>,
  serviceId: string,
): Promise<boolean> {
  const [professionalSpecialty, authorizedSpecialtyIds] = await Promise.all([
    resolveProfessionalRehusSpecialty(user),
    getAuthorizedSpecialtyIdsForService(serviceId),
  ])
  return canProfessionalPerformService(professionalSpecialty, authorizedSpecialtyIds)
}

export async function canUserEvolveDentalService(
  user: Pick<UserProfile, 'id' | 'thsSpecialty' | 'rehusSpecialty' | 'providerNit'>,
  serviceId: string,
): Promise<boolean> {
  const [professionalSpecialty, authorizedSpecialtyIds] = await Promise.all([
    resolveProfessionalRehusSpecialty(user),
    getAuthorizedSpecialtyIdsForService(serviceId),
  ])
  return canProfessionalEvolveService(professionalSpecialty, authorizedSpecialtyIds)
}

export async function canUserPerformCupsProcedure(
  user: Pick<UserProfile, 'id' | 'thsSpecialty' | 'rehusSpecialty' | 'providerNit'>,
  cupsCode: string,
): Promise<boolean> {
  const organizationId = userProfileToOrganizationId(user)
  const professionalSpecialty = await resolveProfessionalRehusSpecialty(user)
  const service = await findDentalServiceByCups(organizationId, cupsCode)
  const authorizedSpecialtyIds = service
    ? await getAuthorizedSpecialtyIdsForService(service.id)
    : undefined

  return canProfessionalPerformCupsCode(
    professionalSpecialty,
    cupsCode,
    authorizedSpecialtyIds,
  )
}

export async function canUserEvolveCupsProcedure(
  user: Pick<UserProfile, 'id' | 'thsSpecialty' | 'rehusSpecialty' | 'providerNit'>,
  cupsCode: string,
): Promise<boolean> {
  const organizationId = userProfileToOrganizationId(user)
  const professionalSpecialty = await resolveProfessionalRehusSpecialty(user)
  const service = await findDentalServiceByCups(organizationId, cupsCode)
  const authorizedSpecialtyIds = service
    ? await getAuthorizedSpecialtyIdsForService(service.id)
    : undefined

  return canProfessionalEvolveCupsCode(
    professionalSpecialty,
    cupsCode,
    authorizedSpecialtyIds,
  )
}

export async function filterCupsProcedureOptionsForUser<
  T extends { cupsCode: string },
>(user: Pick<UserProfile, 'id' | 'thsSpecialty' | 'rehusSpecialty' | 'providerNit'>, options: T[]): Promise<T[]> {
  const organizationId = userProfileToOrganizationId(user)
  const professionalSpecialty = await resolveProfessionalRehusSpecialty(user)

  const serviceCache = new Map<string, RehusSpecialtyId[]>()

  const results: T[] = []
  for (const option of options) {
    const normalized = normalizeCupsCode(option.cupsCode)
    let service = await findDentalServiceByCups(organizationId, normalized)
    let authorizedSpecialtyIds = service ? serviceCache.get(service.id) : undefined

    if (service && !authorizedSpecialtyIds) {
      authorizedSpecialtyIds = await getAuthorizedSpecialtyIdsForService(service.id)
      serviceCache.set(service.id, authorizedSpecialtyIds)
    }

    if (
      canProfessionalPerformCupsCode(
        professionalSpecialty,
        normalized,
        authorizedSpecialtyIds,
      )
    ) {
      results.push(option)
    }
  }

  return results
}
