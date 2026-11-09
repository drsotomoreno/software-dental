import { useMemo, useState } from 'react'
import { Download, MessageCircle, Search, Users } from 'lucide-react'
import { useSuperadminResource } from '@/hooks/useSuperadminResource'
import { fetchRegisteredUsers, type RegisteredSubscriptionUser } from '@/services/subscriptionService'
import { SUPERADMIN_EMAIL } from '@/services/apiAuthService'
import { ROLE_LABELS, type CanonicalRole } from '@/utils/permissions'

type SalesFilter = 'all' | 'leads' | 'trial' | 'paid' | 'whatsapp'

const STATUS_LABELS: Record<string, string> = {
  exento: 'Exento',
  activo: 'Activo',
  prueba: 'Prueba',
  pendiente: 'Sin plan',
  vencido: 'Vencido',
}

const STATUS_COLORS: Record<string, string> = {
  exento: 'bg-violet-100 text-violet-800',
  activo: 'bg-emerald-100 text-emerald-800',
  prueba: 'bg-amber-100 text-amber-800',
  pendiente: 'bg-sky-100 text-sky-800',
  vencido: 'bg-red-100 text-red-700',
}

const WHATSAPP_LABELS: Record<string, string> = {
  sent: 'Enviado',
  delivered: 'Entregado',
  read: 'Leído',
  failed: 'Falló',
  pending: 'Pendiente',
  skipped: 'Sin celular',
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
  if (!iso) return '—'
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

function phoneDigits(user: RegisteredSubscriptionUser) {
  return String(user.phone_number || user.phone || '').replace(/\D/g, '')
}

function formatWhatsAppDisplay(digits: string) {
  if (!digits) return '—'
  if (digits.startsWith('57') && digits.length === 12) {
    return `+57 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  }
  return digits
}

function whatsappHref(digits: string) {
  if (!digits) return null
  const withCountry = digits.startsWith('57') ? digits : digits.length === 10 ? `57${digits}` : digits
  return `https://wa.me/${withCountry}`
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

async function loadRegistrations() {
  const result = await fetchRegisteredUsers()
  if (!result.ok) throw new Error(result.error)
  return { users: result.users }
}

export function SuperAdminRegistrationsPage() {
  const { data, error, loading } = useSuperadminResource(loadRegistrations)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SalesFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const users = useMemo(() => {
    const list = data?.users ?? []
    return list.filter((user) => {
      const email = String(user.email || '')
        .trim()
        .toLowerCase()
      if (email === SUPERADMIN_EMAIL) return false
      if (user.rol === 'superadmin') return false
      return true
    })
  }, [data?.users])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((item) => {
      const digits = phoneDigits(item)
      const status = String(item.estado_pago || 'pendiente')
      if (filter === 'leads' && status !== 'pendiente' && status !== 'vencido') return false
      if (filter === 'trial' && status !== 'prueba') return false
      if (filter === 'paid' && status !== 'activo') return false
      if (filter === 'whatsapp' && !digits) return false
      if (!q) return true
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
        digits,
        item.whatsapp_status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [users, query, filter])

  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null

  const stats = useMemo(() => {
    const withWhatsApp = users.filter((item) => phoneDigits(item)).length
    const leads = users.filter((item) => {
      const status = String(item.estado_pago || 'pendiente')
      return status === 'pendiente' || status === 'vencido'
    }).length
    const trial = users.filter((item) => item.estado_pago === 'prueba').length
    const paid = users.filter((item) => item.estado_pago === 'activo').length
    return { total: users.length, withWhatsApp, leads, trial, paid }
  }, [users])

  function exportCsv() {
    const headers = [
      'Nombre',
      'Correo',
      'WhatsApp',
      'WhatsApp verificado',
      'Estado WhatsApp',
      'Estado pago',
      'Plan',
      'Clínica',
      'Documento',
      'ReTHUS',
      'NIT',
      'REPS',
      'Rol',
      'Titular',
      'Correo verificado',
      'Registrado',
    ]
    const rows = filtered.map((item) => {
      const digits = phoneDigits(item)
      return [
        item.nombre || '',
        item.email || '',
        formatWhatsAppDisplay(digits),
        item.whatsapp_verified ? 'Sí' : 'No',
        WHATSAPP_LABELS[String(item.whatsapp_status || '')] || item.whatsapp_status || '',
        STATUS_LABELS[String(item.estado_pago || 'pendiente')] || item.estado_pago || '',
        item.planName || item.plan || 'Sin plan',
        item.clinicName || item.legalName || '',
        [item.documentType, item.documentNumber].filter(Boolean).join(' '),
        item.rethusNumber || '',
        item.providerNit || '',
        item.repsCode || '',
        roleLabel(item.rol),
        item.isClinicOwner ? 'Sí' : 'No',
        item.emailVerifiedAt || '',
        item.createdAt || '',
      ].map(csvEscape)
    })
    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `registros-ventas-mihistoriadental-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const filterButtons: Array<{ id: SalesFilter; label: string; count: number }> = [
    { id: 'all', label: 'Todos', count: stats.total },
    { id: 'leads', label: 'Sin plan / leads', count: stats.leads },
    { id: 'trial', label: 'En prueba', count: stats.trial },
    { id: 'paid', label: 'Con plan', count: stats.paid },
    { id: 'whatsapp', label: 'Con WhatsApp', count: stats.withWhatsApp },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <p className="max-w-3xl text-sm text-slate-600">
          Personas con registro exitoso en mihistoriadental, incluidas las que aún no compraron plan.
          El celular/WhatsApp queda visible para el equipo de ventas.
        </p>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden />
          Exportar CSV
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Users className="h-4 w-4 text-sky-600" aria-hidden />
            {stats.total} registros
          </div>
          <p className="mt-1 text-xs text-slate-500">Cuentas creadas (sin Superadmin)</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">{stats.leads} leads sin plan</p>
          <p className="mt-1 text-xs text-slate-500">Pendiente o vencido — prioridad ventas</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">{stats.withWhatsApp} con WhatsApp</p>
          <p className="mt-1 text-xs text-slate-500">Celular capturado en el registro</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">
            {stats.trial} prueba · {stats.paid} activos
          </p>
          <p className="mt-1 text-xs text-slate-500">Embudo comercial actual</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, correo, WhatsApp, clínica, documento…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none ring-sky-500 focus:ring-2"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filterButtons.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                filter === item.id
                  ? 'bg-sky-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label} ({item.count})
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? <p className="text-sm text-slate-500">Cargando registros…</p> : null}
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {!loading && !error && filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
          No hay registros que coincidan con el filtro.
        </p>
      ) : null}

      {filtered.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-3">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Registrado</th>
                    <th className="px-4 py-3">WhatsApp</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((item) => {
                    const active = selected?.id === item.id
                    const digits = phoneDigits(item)
                    const href = whatsappHref(digits)
                    return (
                      <tr
                        key={item.id}
                        className={`cursor-pointer transition ${
                          active ? 'bg-sky-50' : 'hover:bg-slate-50'
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
                        <td className="px-4 py-3">
                          {digits ? (
                            <div className="space-y-1">
                              {href ? (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:underline"
                                >
                                  <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                                  {formatWhatsAppDisplay(digits)}
                                </a>
                              ) : (
                                <span className="font-medium text-slate-800">
                                  {formatWhatsAppDisplay(digits)}
                                </span>
                              )}
                              <p className="text-xs text-slate-500">
                                {item.whatsapp_verified
                                  ? 'Verificado'
                                  : WHATSAPP_LABELS[String(item.whatsapp_status || 'pending')] ||
                                    'Pendiente'}
                              </p>
                            </div>
                          ) : (
                            <span className="text-slate-400">Sin celular</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={item.estado_pago} />
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {item.planName || item.plan || 'Sin plan'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatDateShort(item.createdAt)}</td>
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
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                    Ficha comercial
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    {selected.nombre || 'Sin nombre'}
                  </h2>
                  <p className="text-sm text-slate-500">{selected.email || 'Sin correo'}</p>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    WhatsApp / celular
                  </p>
                  {phoneDigits(selected) ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-lg font-semibold text-slate-900">
                        {formatWhatsAppDisplay(phoneDigits(selected))}
                      </p>
                      <p className="text-sm text-slate-600">
                        Estado:{' '}
                        {selected.whatsapp_verified
                          ? 'Verificado'
                          : WHATSAPP_LABELS[String(selected.whatsapp_status || 'pending')] ||
                            selected.whatsapp_status ||
                            'Pendiente'}
                      </p>
                      {whatsappHref(phoneDigits(selected)) ? (
                        <a
                          href={whatsappHref(phoneDigits(selected))!}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                        >
                          <MessageCircle className="h-4 w-4" aria-hidden />
                          Abrir WhatsApp
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">
                      Este registro no capturó celular (posible cuenta antigua o staff).
                    </p>
                  )}
                </div>

                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Estado pago</dt>
                    <dd className="mt-0.5">
                      <StatusBadge status={selected.estado_pago} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Plan</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {selected.planName || selected.plan || 'Sin plan adquirido'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Rol</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">{roleLabel(selected.rol)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Titular clínica</dt>
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
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Clínica</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {selected.clinicName || selected.legalName || '—'}
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
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Vence</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {formatDateShort(selected.fecha_vencimiento)}
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
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Acceso</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {selected.accessEnabled === false ? 'Deshabilitado' : 'Habilitado'}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Seleccione un registro para ver el detalle.</p>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  )
}
