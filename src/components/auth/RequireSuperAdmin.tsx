import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getStoredApiAuth } from '@/services/apiAuthService'
import { sessionIsSuperAdmin } from '@/utils/superadminAccess'
import { SuperAdminForbidden } from '@/components/superadmin/SuperAdminForbidden'

/**
 * Guardia de ruta del panel global.
 * Sin sesión redirige a /login. Con sesión de clínica muestra 403.
 * No usa `role === 'superadmin'` ni `localStorage` como fuente de verdad:
 * solo la cuenta maestra (`is_superadmin` / correo maestro).
 */
export function RequireSuperAdmin() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  const apiAuth = getStoredApiAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">
        Verificando permisos del superadministrador...
      </div>
    )
  }

  const authenticated = Boolean(user || apiAuth?.token)
  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!sessionIsSuperAdmin(user)) {
    return <SuperAdminForbidden />
  }

  return <Outlet />
}
