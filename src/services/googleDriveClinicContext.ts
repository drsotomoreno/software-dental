import { getStoredApiAuth } from '@/services/apiAuthService'
import { getCurrentClinicId } from '@/services/clinicalSyncState'

/**
 * clinicSyncId / clinicId activo — mismo valor que debe usar Perfil y Exámenes.
 */
export function resolveActiveDriveClinicId(): string {
  const auth = getStoredApiAuth()
  return String(
    getCurrentClinicId() ||
      auth?.user?.clinicId ||
      auth?.user?.id ||
      auth?.user?.email ||
      '',
  ).trim()
}

/** Query `?clinicId=` para status/upload/file (igual que Perfil cuando aplica). */
export function driveClinicQuery(clinicId = resolveActiveDriveClinicId()): string {
  const id = String(clinicId || '').trim()
  return id ? `?clinicId=${encodeURIComponent(id)}` : ''
}

/** Headers de identidad + X-Clinic-Id explícito. */
export function driveIdentityHeaders(clinicId = resolveActiveDriveClinicId()): HeadersInit {
  const auth = getStoredApiAuth()
  const id = String(clinicId || '').trim()
  return {
    Accept: 'application/json',
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    ...(auth?.user?.email ? { 'X-Client-Email': String(auth.user.email) } : {}),
    ...(auth?.user?.id ? { 'X-Client-User-Id': String(auth.user.id) } : {}),
    ...(auth?.user?.documentNumber
      ? { 'X-Client-Document': String(auth.user.documentNumber) }
      : {}),
    ...(id ? { 'X-Clinic-Id': id } : {}),
  }
}
