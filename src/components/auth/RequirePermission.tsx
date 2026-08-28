import { useAudit } from '@/hooks/useAudit'
import type { Permission } from '@/utils/permissions'

interface RequirePermissionProps {
  permission: Permission
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function RequirePermission({
  permission,
  children,
  fallback = (
    <div className="card border-amber-200 bg-amber-50 text-sm text-amber-900">
      No tiene permisos para acceder a esta sección.
    </div>
  ),
}: RequirePermissionProps) {
  const { can } = useAudit()

  if (!can(permission)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
