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
  const isSuperAdmin =
    localStorage.getItem('doctorSEO_rol') === 'superadmin' || isApiSuperAdmin(apiAuth?.user)

  if (isSuperAdmin || can(permission)) {
    return <Outlet />
  }

  return <Navigate to="/" replace />
}
