import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Search, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { getStoredApiAuth, SUPERADMIN_EMAIL } from '@/services/apiAuthService'
import {
  fetchRegisteredUsers,
  type RegisteredSubscriptionUser,
} from '@/services/subscriptionService'
import { ROLE_LABELS, type CanonicalRole } from '@/utils/permissions'

const STATUS_LABELS: Record<string, string> = {
  exento: 'Exento',
  activo: 'Activo',
  prueba: 'Prueba',
  pendiente: 'Pendiente',
  vencido: 'Vencido',
}

const STATUS_COLORS: Record<string, string> = {
  exento: 'bg-violet-100 text-violet-800',
  activo: 'bg-emerald-100 text-emerald-800',
  prueba: 'bg-amber-100 text-amber-800',
  pendiente: 'bg-slate-100 text-slate-700',
  vencido: 'bg-red-100 text-red-700',
}

function formatDate(iso?: string | null) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateShort(iso?: string | null) {
  if (!iso) return 'Sin vencimiento'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function roleLabel(rol?: string) {
  const key = String(rol ?? '').toLowerCase() as CanonicalRole
  return ROLE_LABELS[key] ?? rol ?? '—'
}

function StatusBadge({ status }: { status?: string }) {
  const key = String(status ?? 'pendiente')
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_COLORS[key] ?? 'bg-slate-100 text-slate-700'
      }`}
    >
      {STATUS_LABELS[key] ?? key}
    </span>
  )
}

function activePackages(user: RegisteredSubscriptionUser) {
  return (user.messagePackages ?? []).filter((item) => item.status === 'activo')
}

function isSuperAdminViewer(role?: string | null, email?: string | null) {
  const apiAuth = getStoredApiAuth()
  const storedRole = localStorage.getItem('doctorSEO_rol')
  const effectiveRole = String(role || apiAuth?.user?.rol || storedRole || '').toLowerCase()
  const effectiveEmail = String(email || apiAuth?.user?.email || '')
    .trim()
    .toLowerCase()
  return effectiveRole === 'superadmin' || effectiveEmail === SUPERADMIN_EMAIL
}

export function RegisteredUsersAdminPage() {
  const { user, hasRole } = useAuth()
  const allowed = hasRole('superadmin') || isSuperAdminViewer(user?.role, user?.email)

  const [users, setUsers] = useState<RegisteredSubscriptionUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    void fetchRegisteredUsers().then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setError(result.error)
        setUsers([])
      } else {
        setUsers(
          [...result.users].sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
            return bTime - aTime
          }),
        )
        setError('')
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [allowed])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((item) => {
      const haystack = [
        item.nombre,
        item.email,
        item.clinicName,
        item.legalName,
        item.documentNumber,
        item.rethusNumber,
        item.providerNit,
        item.repsCode,
        item.plan,
        item.planName,
        item.rol,
        item.estado_pago,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [users, query])

  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null

  useEffect(() => {
    if (!selected) {
      setSelectedId(null)
      return
    }
    if (selectedId !== selected.id) setSelectedId(selected.id)
  }, [selected, selectedId])

  if (!allowed) {
    return <Navigate to="/app" replace />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-dental-700">
            Superadministrador
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Usuarios registrados</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Todas las cuentas del sistema con sus datos de registro y el detalle de su
            suscripción. Solo visible para {user?.email || 'el superadministrador'}.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <Users className="h-4 w-4 text-dental-600" />
            {users.length} cuenta{users.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre, correo, clínica, documento o plan…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none ring-dental-500 focus:ring-2"
        />
      </div>

      {loading && <p className="text-sm text-slate-500">Cargando usuarios registrados…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
          No hay usuarios que coincidan con la búsqueda.
        </p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-3">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Usuario</th>
                    <th className="px-4 py-3">Rol</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Vence</th>
                    <th className="px-4 py-3">Registro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((item) => {
                    const active = selected?.id === item.id
                    return (
                      <tr
                        key={item.id}
                        className={`cursor-pointer transition ${
                          active ? 'bg-dental-50' : 'hover:bg-slate-50'
                        }`}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{item.nombre || 'Sin nombre'}</p>
                          <p className="text-xs text-slate-500">{item.email || 'Sin correo'}</p>
                          {item.clinicName ? (
                            <p className="text-xs text-slate-500">{item.clinicName}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{roleLabel(item.rol)}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {item.planName || item.plan || 'Sin plan'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={item.estado_pago} />
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDateShort(item.fecha_vencimiento)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(item.createdAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
            {selected ? (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-dental-700">
                    Detalle de registro
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    {selected.nombre || 'Sin nombre'}
                  </h2>
                  <p className="text-sm text-slate-500">{selected.email || 'Sin correo'}</p>
                </div>

                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Rol</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">{roleLabel(selected.rol)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Titular</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {selected.isClinicOwner ? 'Sí' : 'No'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Documento</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {[selected.documentType, selected.documentNumber].filter(Boolean).join(' ') ||
                        '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Teléfono</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">{selected.phone || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Clínica</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {selected.clinicName || selected.legalName || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Tipo prestador</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {selected.providerType === 'institucion'
                        ? 'Institución'
                        : selected.providerType === 'profesional_independiente'
                          ? 'Profesional independiente'
                          : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">NIT</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {selected.providerNit || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">REPS</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">{selected.repsCode || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">ReTHUS</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {selected.rethusNumber || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Acceso</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {selected.accessEnabled === false ? 'Deshabilitado' : 'Habilitado'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Registrado</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {formatDate(selected.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">
                      Última actualización
                    </dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {formatDate(selected.updatedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">
                      Correo verificado
                    </dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {formatDate(selected.emailVerifiedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">
                      Prueba iniciada
                    </dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {formatDate(selected.trialStartedAt)}
                    </dd>
                  </div>
                </dl>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-dental-700">
                    Suscripción
                  </p>
                  <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">
                        {selected.planName || selected.plan || 'Sin plan adquirido'}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Vence: {formatDateShort(selected.fecha_vencimiento)}
                      </p>
                      {selected.customMaxRethus != null && (
                        <p className="mt-1 text-sm text-slate-600">
                          Tope ReTHUS personalizado: {selected.customMaxRethus}
                        </p>
                      )}
                      {selected.customMaxAssistants != null && (
                        <p className="mt-1 text-sm text-slate-600">
                          Tope auxiliares personalizado: {selected.customMaxAssistants}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={selected.estado_pago} />
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Paquetes de mensajes TTC
                    </p>
                    {activePackages(selected).length === 0 &&
                    (selected.messagePackages ?? []).length === 0 ? (
                      <p className="mt-2 text-sm text-slate-600">Sin paquetes comprados.</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {(selected.messagePackages ?? []).map((pack) => (
                          <li
                            key={pack.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <div>
                              <p className="font-medium text-slate-900">{pack.name}</p>
                              <p className="text-xs text-slate-500">
                                {pack.messages} mensajes · Comprado {formatDate(pack.purchasedAt)} ·
                                Vence {formatDateShort(pack.expiresAt)}
                              </p>
                            </div>
                            <StatusBadge status={pack.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Seleccione un usuario para ver el detalle.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
