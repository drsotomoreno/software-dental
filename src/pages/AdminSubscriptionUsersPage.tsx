import { useEffect, useState } from 'react'
import { getStoredApiAuth, type ApiSubscriptionUser } from '@/services/apiAuthService'

const STATUS_LABELS: Record<string, string> = {
  exento: 'Exento',
  activo: 'Activo',
  prueba: 'Prueba 7 días',
  pendiente: 'Pendiente',
  vencido: 'Vencido',
  none: 'Sin plan',
}

const STATUS_COLORS: Record<string, string> = {
  exento: 'bg-violet-100 text-violet-800',
  activo: 'bg-emerald-100 text-emerald-800',
  prueba: 'bg-amber-100 text-amber-800',
  pendiente: 'bg-slate-100 text-slate-700',
  vencido: 'bg-red-100 text-red-700',
}

type SubUser = ApiSubscriptionUser & {
  trialStartedAt?: string | null
  trialUsedAt?: string | null
  emailVerifiedAt?: string | null
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function AdminSubscriptionUsersPage() {
  const [users, setUsers] = useState<SubUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const auth = getStoredApiAuth()
    if (!auth?.token) {
      setError('Inicie sesión como administrador.')
      setLoading(false)
      return
    }
    void fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json' },
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(payload.error || 'No se pudieron cargar los usuarios.')
          return
        }
        setUsers(payload.users ?? [])
      })
      .catch(() => setError('No se pudo conectar con el servidor.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Panel de Administración</h1>
      <p className="mb-6 text-sm text-slate-500">
        Listado de usuarios registrados, documento, ReTHUS y estado de suscripción.
      </p>

      {loading && <p className="text-sm text-slate-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!loading && !error && users.length === 0 && (
        <p className="text-sm text-slate-500">No hay usuarios registrados.</p>
      )}

      {users.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Correo</th>
                <th className="px-4 py-3">Documento (Cédula / ReTHUS)</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Vence</th>
                <th className="px-4 py-3">Registrado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{u.nombre}</td>
                  <td className="px-4 py-2.5 text-slate-600">{u.email}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{u.documentNumber || '—'}</td>
                  <td className="px-4 py-2.5 capitalize">{u.rol}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_COLORS[u.estado_pago] ?? 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {STATUS_LABELS[u.estado_pago] ?? u.estado_pago}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 capitalize">{u.plan || '—'}</td>
                  <td className="px-4 py-2.5">{fmtDate(u.fecha_vencimiento)}</td>
                  <td className="px-4 py-2.5">{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
