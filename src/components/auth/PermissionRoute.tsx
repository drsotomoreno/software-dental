import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { Permission } from '@/utils/permissions'

interface PermissionRouteProps {
  permission: Permission
}

export function PermissionRoute({ permission }: PermissionRouteProps) {
  const { can } = useAuth()

  if (!can(permission)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
