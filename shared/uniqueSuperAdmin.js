/** Única cuenta de superadministrador del sistema. */
export const UNIQUE_SUPERADMIN_EMAIL = 'doctormauriciosoto@gmail.com'

/**
 * El segmento «Correo de verificación» del perfil es visible solo para esta cuenta.
 * El rol superadmin, por sí solo, no alcanza.
 */
export function isUniqueSuperAdminAccount(userOrEmail) {
  const raw =
    userOrEmail && typeof userOrEmail === 'object' ? userOrEmail.email : userOrEmail
  return String(raw ?? '').trim().toLowerCase() === UNIQUE_SUPERADMIN_EMAIL
}
