import type { UserRole } from '@/types/user'

export type Permission =
  | 'patients.read'
  | 'patients.write'
  | 'clinical.read'
  | 'clinical.write'
  | 'clinical.sign'
  | 'odontogram.write'
  | 'agenda.read'
  | 'agenda.write'
  | 'export.rips'
  | 'export.fhir'
  | 'export.portability'
  | 'backups.manage'
  | 'catalogs.manage'
  | 'prices.manage'
  | 'invoices.read'
  | 'profile.edit'
  | 'audit.read'
  | 'users.manage'

/** Roles canónicos del sistema (API y RBAC). */
export type CanonicalRole = 'superadmin' | 'admin' | 'odontologo' | 'recepcion'

const ROLE_PERMISSIONS: Record<CanonicalRole, Permission[]> = {
  superadmin: [
    'patients.read',
    'patients.write',
    'clinical.read',
    'clinical.write',
    'clinical.sign',
    'odontogram.write',
    'agenda.read',
    'agenda.write',
    'export.rips',
    'export.fhir',
    'export.portability',
    'prices.manage',
    'invoices.read',
    'profile.edit',
    'audit.read',
    'users.manage',
    'backups.manage',
    'catalogs.manage',
  ],
  admin: [
    'patients.read',
    'patients.write',
    'clinical.read',
    'clinical.write',
    'clinical.sign',
    'odontogram.write',
    'agenda.read',
    'agenda.write',
    'export.rips',
    'export.fhir',
    'export.portability',
    'prices.manage',
    'invoices.read',
    'profile.edit',
    'audit.read',
    'users.manage',
    'backups.manage',
    'catalogs.manage',
  ],
  odontologo: [
    'patients.read',
    'patients.write',
    'clinical.read',
    'clinical.write',
    'clinical.sign',
    'odontogram.write',
    'agenda.read',
    'agenda.write',
    'export.portability',
    'prices.manage',
    'invoices.read',
    'profile.edit',
  ],
  recepcion: [
    'patients.read',
    'patients.write',
    'agenda.read',
    'agenda.write',
    'invoices.read',
    'profile.edit',
  ],
}

export const ROLE_LABELS: Record<CanonicalRole, string> = {
  superadmin: 'Super Administrador',
  admin: 'Administración',
  odontologo: 'Odontólogo',
  recepcion: 'Recepción',
}

/** Roles que se pueden asignar en Gestión de Usuarios. */
export const ASSIGNABLE_ROLES: CanonicalRole[] = ['admin', 'odontologo', 'recepcion']

export const USERS_MANAGE_DENIED =
  'Solo el administrador de esta clínica o el Super Administrador pueden gestionar el equipo.'

/**
 * Gestión de Usuarios: el titular de la clínica y quienes tienen rol
 * Administración pueden crear, editar y asignar accesos de su propio tenant.
 */
export function canManageUsers(role: UserRole | string | null | undefined): boolean {
  if (!role) return false
  const canonical = normalizeRole(role)
  return canonical === 'admin' || canonical === 'superadmin'
}

export function canManageClinicTeam(
  user:
    | {
        role?: UserRole | string | null
        rol?: string | null
        isClinicOwner?: boolean
        id?: string
        clinicId?: string
      }
    | null
    | undefined,
): boolean {
  if (!user) return false
  const role = user.role ?? user.rol
  if (canManageUsers(role)) return true
  if (user.isClinicOwner) return true
  if (user.id && user.clinicId && String(user.id) === String(user.clinicId)) return true
  return false
}

/** Compatibilidad con roles legacy en IndexedDB. */
export function normalizeRole(role: UserRole | string | undefined): CanonicalRole {
  switch (role) {
    case 'superadmin':
      return 'superadmin'
    case 'admin':
    case 'administrador':
      return 'admin'
    case 'odontologo':
      return 'odontologo'
    case 'recepcion':
    case 'auxiliar':
      return 'recepcion'
    default:
      return 'odontologo'
  }
}

export function mapApiRoleToUserRole(rol: string | undefined): UserRole {
  const normalized = normalizeRole(rol)
  return normalized
}

export function resolveEffectiveRole(
  userRole?: UserRole | string | null,
  apiRole?: string | null,
  storedRole?: string | null,
): CanonicalRole | null {
  const candidate = userRole ?? apiRole ?? storedRole
  if (!candidate) return null
  return normalizeRole(candidate)
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const canonical = normalizeRole(role)
  if (canonical === 'superadmin') return true
  if (permission === 'users.manage') {
    return canManageUsers(role)
  }
  return ROLE_PERMISSIONS[canonical]?.includes(permission) ?? false
}

export function getPermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[normalizeRole(role)] ?? []
}

export function roleHasModule(
  role: UserRole,
  module: 'agenda' | 'clinical' | 'odontogram' | 'budgets' | 'rips' | 'config',
): boolean {
  const canonical = normalizeRole(role)
  if (canonical === 'superadmin') return true
  switch (module) {
    case 'agenda':
      return hasPermission(canonical, 'agenda.read')
    case 'clinical':
      return hasPermission(canonical, 'clinical.read')
    case 'odontogram':
      return hasPermission(canonical, 'odontogram.write')
    case 'budgets':
      return hasPermission(canonical, 'prices.manage')
    case 'rips':
      return hasPermission(canonical, 'export.rips')
    case 'config':
      return (
        hasPermission(canonical, 'catalogs.manage') ||
        hasPermission(canonical, 'users.manage') ||
        hasPermission(canonical, 'backups.manage')
      )
    default:
      return false
  }
}
