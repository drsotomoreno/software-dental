export const UNIQUE_SUPERADMIN_EMAIL: 'doctormauriciosoto@gmail.com'

export function isUniqueSuperAdminAccount(
  userOrEmail?: { email?: string | null } | string | null,
): boolean
