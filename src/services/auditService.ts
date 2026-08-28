import { db } from '@/db/database'
import type { AuditAction, AuditLogEntry, AuditResourceType } from '@/types/audit'
import type { AuthUser } from '@/types/auth'
import { generateId } from '@/utils/crypto'

export interface AuditEventInput {
  action: AuditAction
  resourceType: AuditResourceType
  resourceId?: string
  details?: string
  success?: boolean
  user?: Pick<AuthUser, 'id' | 'email' | 'firstName' | 'lastName' | 'role'> | null
}

export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  const user = input.user
  const entry: AuditLogEntry = {
    id: generateId(),
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    userName: user ? `${user.firstName} ${user.lastName}`.trim() : null,
    userRole: user?.role ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    details: input.details,
    success: input.success ?? true,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  }

  await db.auditLogs.add(entry)
}

export async function getRecentAuditLogs(limit = 200): Promise<AuditLogEntry[]> {
  return db.auditLogs.orderBy('timestamp').reverse().limit(limit).toArray()
}
