import { useMemo, useState } from 'react'
import { TenantsTable } from '@/components/superadmin/TenantsTable'
import { useSuperadminResource } from '@/hooks/useSuperadminResource'
import {
  fetchTenants,
  forceTenantOfflineSync,
  suspendTenantAccount,
} from '@/services/superadminApi'
import type { SuperadminTenant } from '@/types/superadmin'

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

export function SuperAdminClinicsPage() {
  const { data, error, loading, setData } = useSuperadminResource(fetchTenants)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [selected, setSelected] = useState<SuperadminTenant | null>(null)
  const [pendingStatus, setPendingStatus] = useState<SuperadminTenant | null>(null)

  const tenants = data?.tenants ?? []
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return tenants
    return tenants.filter((tenant) =>
      [tenant.clinicName, tenant.ownerName, tenant.repsCode, tenant.rethus, tenant.plan]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [query, tenants])

  function replaceTenant(next: SuperadminTenant) {
    setData((current) => {
      if (!current) return current
      return {
        ...current,
        tenants: current.tenants.map((tenant) => (tenant.id === next.id ? next : tenant)),
      }
    })
    setSelected((current) => (current?.id === next.id ? next : current))
  }

  function handleSuspend(tenant: SuperadminTenant) {
    setPendingStatus(tenant)
  }

  async function confirmStatusChange() {
    const tenant = pendingStatus
    if (!tenant) return
    const nextStatus = tenant.status === 'suspendida' ? 'activa' : 'suspendida'
    setPendingStatus(null)
    setBusyId(tenant.id)
    setActionError('')
    setNotice('')
    try {
      const result = await suspendTenantAccount(tenant.id, nextStatus)
      replaceTenant(result.tenant)
      setNotice(result.message || 'Estado actualizado.')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSync(tenant: SuperadminTenant) {
    setBusyId(tenant.id)
    setActionError('')
    setNotice('')
    try {
      const result = await forceTenantOfflineSync(tenant.id)
      replaceTenant(result.tenant)
      setNotice(result.message || 'Sincronización encolada.')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo encolar la sincronización.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-2xl text-sm text-slate-600">
          Sedes suscritas a la plataforma. Si PostgreSQL responde, la tabla sale de las clínicas y
          del odontólogo titular. Si no, se muestran clínicas de demostración.
        </p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar clínica, REPS o ReTHUS"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-sky-600 focus:ring-2 sm:max-w-xs"
          aria-label="Buscar clínicas"
        />
      </div>

      {data?.source === 'fixture' && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Datos de demostración. PostgreSQL no devolvió clínicas en este momento.
        </p>
      )}
      {data?.source === 'postgres' && (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          El plan de suscripción queda en «Por conectar» hasta existir la tabla de planes SaaS.
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}
      {actionError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </p>
      )}
      {notice && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {pendingStatus && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {pendingStatus.status === 'suspendida'
              ? `¿Reactivar la cuenta de ${pendingStatus.clinicName}?`
              : `¿Suspender la cuenta de ${pendingStatus.clinicName}?`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPendingStatus(null)}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirmStatusChange()}
              className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}

      {loading && !data ? (
        <p className="text-sm text-slate-500">Cargando clínicas...</p>
      ) : (
        <TenantsTable
          tenants={visible}
          busyId={busyId}
          onView={setSelected}
          onSuspend={(tenant) => void handleSuspend(tenant)}
          onSync={(tenant) => void handleSync(tenant)}
        />
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tenant-detail-title"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 id="tenant-detail-title" className="text-lg font-semibold text-slate-900">
              {selected.clinicName}
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Odontólogo titular</dt>
                <dd className="text-right text-slate-900">{selected.ownerName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Código REPS</dt>
                <dd className="font-mono text-slate-900">{selected.repsCode || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Registro ReTHUS</dt>
                <dd className="font-mono text-slate-900">{selected.rethus || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Plan</dt>
                <dd className="text-slate-900">{selected.plan}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Estado</dt>
                <dd className="text-slate-900">{selected.status === 'activa' ? 'Activa' : 'Suspendida'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Pacientes</dt>
                <dd className="text-slate-900">{selected.patientCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">MRR</dt>
                <dd className="text-slate-900">{selected.mrrCop ? cop.format(selected.mrrCop) : '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Última orden de sync</dt>
                <dd className="text-right text-slate-900">
                  {selected.lastSyncAt
                    ? new Date(selected.lastSyncAt).toLocaleString('es-CO')
                    : 'Sin orden en esta sesión'}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
