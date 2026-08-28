import type { UserProfile } from '@/types/user'

/** NIT prestador normalizado — clave de organización para catálogo compartido. */
export function normalizeOrganizationId(
  providerNit?: string | null,
  fallbackUserId?: string,
): string {
  const nit = String(providerNit ?? '').replace(/\D/g, '')
  if (nit.length >= 6) return nit
  return fallbackUserId ?? 'clinic-default'
}

export function dentalServiceSpecialtyId(serviceId: string, rehusSpecialtyId: string): string {
  return `${serviceId}:${rehusSpecialtyId}`
}

export function userProfileToOrganizationId(user: Pick<UserProfile, 'providerNit' | 'id'>): string {
  return normalizeOrganizationId(user.providerNit, user.id)
}
