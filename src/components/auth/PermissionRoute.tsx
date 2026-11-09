import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { isApiSuperAdmin, getStoredApiAuth } from '@/services/apiAuthService'
import type { Permission } from '@/utils/permissions'

interface PermissionRouteProps {
  permission: Permission
}

export function PermissionRoute({ permission }: PermissionRouteProps) {
  const { can } = useAuth()
  const apiAuth = getStoredApiAuth()
  // Solo correo maestro. Un rol localStorage "superadmin" no abre rutas privilegiadas.
  if (isApiSuperAdmin(apiAuth?.user) || can(permission)) {
    return <Outlet />
  }

  return <Navigate to="/app" replace />
}
