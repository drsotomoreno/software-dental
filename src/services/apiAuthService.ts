import {
  hasPermission,
  mapApiRoleToUserRole,
  resolveEffectiveRole,
  type Permission,
} from '@/utils/permissions'
import type { UserRole } from '@/types/user'
import { splitPersonName } from '@/utils/personName'

export const API_AUTH_TOKEN_KEY = 'doctorSEO_token'
export const API_AUTH_USER_KEY = 'doctorSEO_user'
export const API_ROLE_KEY = 'doctorSEO_rol'

const LEGACY_TOKEN_KEY = 'doctorseolabs_api_token'
const LEGACY_USER_KEY = 'doctorseolabs_api_user'

export interface ApiSubscriptionUser {
  id: string
  nombre: string
  email: string
  rol: 'superadmin' | 'admin' | 'odontologo' | 'recepcion'
  estado_pago: 'pendiente' | 'activo' | 'vencido' | 'exento' | 'prueba'
  fecha_vencimiento: string | null
  plan?: string | null
  documentType?: string
  documentNumber?: string
  rethusNumber?: string
  rethusStatus?: 'activo' | 'inactivo' | 'pendiente'
  firstName?: string
  lastName?: string
  repsCode?: string
  repsStatus?: 'activo' | 'inactivo'
  thsSpecialty?: string
  repsEnabledSpecialties?: string[]
  providerNit?: string
  clinicName?: string
  legalName?: string
  providerType?: 'institucion' | 'profesional_independiente'
  prestadorVerifiedAt?: string | null
  trialLimited?: boolean
  trialLimits?: { maxPatients: number; maxVoiceNotesPerField: number } | null
  createdAt?: string
  updatedAt?: string
}

export const SUPERADMIN_EMAIL = 'doctormauriciosoto@gmail.com'
export const MASTER_PASSWORD = 'Dragon1976%'

export function isMasterCredentials(email: string, password: string): boolean {
  return String(email ?? '').trim().toLowerCase() === SUPERADMIN_EMAIL && password === MASTER_PASSWORD
}

export function isApiSuperAdmin(user: ApiSubscriptionUser | null | undefined): boolean {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(API_ROLE_KEY) === 'superadmin') {
    return true
  }
  if (!user) return false
  const email = String(user.email ?? '').trim().toLowerCase()
  const rol = String(user.rol ?? '').trim().toLowerCase()
  return email === SUPERADMIN_EMAIL || rol === 'superadmin' || user.estado_pago === 'exento'
}

export function grantMasterLocalSession(token?: string): { token: string; user: ApiSubscriptionUser } {
  const sessionToken = token || `superadmin-local-${Date.now()}`
  const names = splitPersonName({ nombre: 'Dr. Mauricio Soto' })
  const user: ApiSubscriptionUser = {
    id: 'superadmin-session',
    nombre: [names.firstName, names.lastName].filter(Boolean).join(' '),
    firstName: names.firstName,
    lastName: names.lastName,
    email: SUPERADMIN_EMAIL,
    rol: 'superadmin',
    estado_pago: 'exento',
    fecha_vencimiento: null,
  }
  setStoredApiAuth(sessionToken, user)
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.superadmin = 'true'
  }
  return { token: sessionToken, user }
}

export function getStoredApiAuth():
  | { token: string; user: ApiSubscriptionUser }
  | null {
  const token =
    localStorage.getItem(API_AUTH_TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY)
  const rawUser =
    localStorage.getItem(API_AUTH_USER_KEY) || localStorage.getItem(LEGACY_USER_KEY)
  if (!token || !rawUser) return null

  try {
    const user = JSON.parse(rawUser) as ApiSubscriptionUser
    return { token, user }
  } catch {
    return null
  }
}

export function setStoredApiAuth(token: string, user: ApiSubscriptionUser): void {
  localStorage.setItem(API_AUTH_TOKEN_KEY, token)
  localStorage.setItem(API_AUTH_USER_KEY, JSON.stringify(user))
  localStorage.setItem(LEGACY_TOKEN_KEY, token)
  localStorage.setItem(LEGACY_USER_KEY, JSON.stringify(user))
  if (isApiSuperAdmin(user)) {
    localStorage.setItem(API_ROLE_KEY, 'superadmin')
  } else {
    localStorage.setItem(API_ROLE_KEY, user.rol)
  }
}

export function clearStoredApiAuth(): void {
  localStorage.removeItem(API_AUTH_TOKEN_KEY)
  localStorage.removeItem(API_AUTH_USER_KEY)
  localStorage.removeItem(API_ROLE_KEY)
  localStorage.removeItem(LEGACY_TOKEN_KEY)
  localStorage.removeItem(LEGACY_USER_KEY)
}

export async function validateApiSession(token: string) {
  const response = await fetch('/api/sesion', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (response.status === 402) {
    const payload = await response.json().catch(() => ({}))
    const user = payload.user as ApiSubscriptionUser | undefined
    if (isApiSuperAdmin(user)) {
      return {
        ok: true as const,
        user: user!,
        expiresAt: null as unknown as string,
        rol: 'superadmin' as const,
      }
    }
    return {
      ok: false as const,
      requiresPayment: true,
      user,
      error: payload.error as string | undefined,
    }
  }

  if (!response.ok) {
    const stored = getStoredApiAuth()
    if (stored && isApiSuperAdmin(stored.user)) {
      return {
        ok: true as const,
        user: stored.user,
        expiresAt: null as unknown as string,
        rol: 'superadmin' as const,
      }
    }
    return { ok: false as const, requiresPayment: false }
  }

  const payload = await response.json()
  return {
    ok: true as const,
    user: payload.user as ApiSubscriptionUser,
    expiresAt: payload.expiresAt as string,
    rol: payload.rol as ApiSubscriptionUser['rol'] | undefined,
  }
}

export function getEffectiveRole(userRole?: UserRole | string | null): UserRole | null {
  const apiAuth = getStoredApiAuth()
  const resolved = resolveEffectiveRole(
    userRole,
    apiAuth?.user?.rol,
    localStorage.getItem(API_ROLE_KEY),
  )
  return resolved
}

export function canWithEffectiveRole(
  permission: Permission,
  userRole?: UserRole | string | null,
): boolean {
  const role = getEffectiveRole(userRole)
  return role ? hasPermission(role, permission) : false
}

export function mapApiUserToAuthUser(
  user: ApiSubscriptionUser,
  token: string,
): import('@/types/auth').AuthUser {
  const names = splitPersonName({
    nombre: user.nombre,
    firstName: user.firstName,
    lastName: user.lastName,
  })
  const firstName = names.firstName
  const lastName = names.lastName

  return {
    id: user.id,
    email: user.email,
    firstName,
    lastName,
    documentType: user.documentType || 'CC',
    documentNumber: user.documentNumber || '',
    role: mapApiRoleToUserRole(user.rol),
    clinicName: user.clinicName || user.legalName || '',
    legalName: user.legalName || user.clinicName || '',
    providerType: user.providerType === 'institucion' ? 'institucion' : 'profesional_independiente',
    sessionId: token,
    providerNit: user.providerNit,
    repsCode: user.repsCode,
    repsStatus: user.repsStatus,
    rethusNumber: user.rethusNumber,
    rethusStatus: user.rethusStatus ?? (user.rethusNumber ? 'activo' : undefined),
    thsSpecialty: user.thsSpecialty as import('@/constants/ripsThsSpecialty').OdontologyThsSpecialtyId | undefined,
    rehusSpecialty: user.thsSpecialty as import('@/constants/ripsThsSpecialty').OdontologyThsSpecialtyId | undefined,
    repsEnabledSpecialties: user.repsEnabledSpecialties as
      | import('@/constants/ripsThsSpecialty').OdontologyThsSpecialtyId[]
      | undefined,
  }
}
