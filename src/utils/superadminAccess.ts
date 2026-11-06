import { getStoredApiAuth, isApiSuperAdmin, SUPERADMIN_EMAIL } from '@/services/apiAuthService'

type Identity = { email?: string | null } | null | undefined

/**
 * God Mode del panel global.
 * La sesión solo es superadministrador si el correo es la cuenta maestra
 * (`doctormauriciosoto@gmail.com`). Un `rol === 'superadmin'` guardado en
 * el navegador, o un admin de clínica, no abre este panel.
 */
export function sessionIsSuperAdmin(user?: Identity): boolean {
  const email = String(user?.email ?? '').trim().toLowerCase()
  if (email) return email === SUPERADMIN_EMAIL
  return isApiSuperAdmin(getStoredApiAuth()?.user)
}
