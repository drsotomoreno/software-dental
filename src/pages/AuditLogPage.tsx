import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { useAudit } from '@/hooks/useAudit'
import { AUDIT_ACTION_LABELS } from '@/types/audit'
import { ROLE_LABELS } from '@/utils/permissions'
import { formatDate } from '@/utils'

export function AuditLogPage() {
  const { audit } = useAudit()
  const logs = useLiveQuery(() => db.auditLogs.orderBy('timestamp').reverse().limit(300).toArray())

  useEffect(() => {
    audit({
      action: 'VIEW_AUDIT_LOG',
      resourceType: 'audit_log',
      details: 'Consulta de bitácora de accesos',
    })
  }, [audit])

  return (
    <RequirePermission permission="audit.read">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bitácora de auditoría</h1>
          <p className="mt-1 text-sm text-slate-600">
            Registro de accesos, consultas de historia clínica, exportaciones y eventos de seguridad.
          </p>
        </div>

        <div className="card overflow-hidden p-0">
          {!logs ? (
            <p className="p-4 text-sm text-slate-500">Cargando registros...</p>
          ) : logs.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No hay eventos registrados aún.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 font-medium text-slate-600">Fecha</th>
                    <th className="px-3 py-2 font-medium text-slate-600">Usuario</th>
                    <th className="px-3 py-2 font-medium text-slate-600">Rol</th>
                    <th className="px-3 py-2 font-medium text-slate-600">Acción</th>
                    <th className="px-3 py-2 font-medium text-slate-600">Recurso</th>
                    <th className="px-3 py-2 font-medium text-slate-600">Detalle</th>
                    <th className="px-3 py-2 font-medium text-slate-600">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className={log.success ? undefined : 'bg-red-50/50'}>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                        {formatDate(log.timestamp)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">
                          {log.userName ?? '—'}
                        </div>
                        <div className="text-xs text-slate-500">{log.userEmail ?? 'Anónimo'}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {log.userRole
                          ? ROLE_LABELS[log.userRole as keyof typeof ROLE_LABELS] ?? log.userRole
                          : '—'}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {AUDIT_ACTION_LABELS[log.action]}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {log.resourceType}
                        {log.resourceId ? (
                          <span className="block font-mono text-xs text-slate-400">
                            {log.resourceId.slice(0, 20)}
                            {log.resourceId.length > 20 ? '…' : ''}
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-xs truncate px-3 py-2 text-slate-600">
                        {log.details ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            log.success
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {log.success ? 'OK' : 'Fallo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </RequirePermission>
  )
}
