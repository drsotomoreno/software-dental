import { useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { logAuditEvent } from '@/services/auditService'
import type { AuditAction, AuditResourceType } from '@/types/audit'
import type { Permission } from '@/utils/permissions'

export function useAudit() {
  const { user, can } = useAuth()

  const audit = useCallback(
    async (input: {
      action: AuditAction
      resourceType: AuditResourceType
      resourceId?: string
      details?: string
      success?: boolean
    }) => {
      await logAuditEvent({ ...input, user })
    },
    [user],
  )

  const logAccessDenied = useCallback(
    async (permission: Permission, details?: string) => {
      await logAuditEvent({
        action: 'ACCESS_DENIED',
        resourceType: 'route',
        details: details ?? `Permiso requerido: ${permission}`,
        success: false,
        user,
      })
    },
    [user],
  )

  return { audit, logAccessDenied, can, user }
}
