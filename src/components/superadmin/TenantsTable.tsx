import type { SuperadminTenant } from '@/types/superadmin'

function statusClass(status: SuperadminTenant['status']) {
  return status === 'activa'
    ? 'bg-emerald-50 text-emerald-700'
    : 'bg-amber-50 text-amber-800'
}

export function TenantsTable({
  tenants,
  busyId,
  onView,
  onSuspend,
  onSync,
}: {
  tenants: SuperadminTenant[]
  busyId: string | null
  onView: (tenant: SuperadminTenant) => void
  onSuspend: (tenant: SuperadminTenant) => void
  onSync: (tenant: SuperadminTenant) => void
}) {
  if (tenants.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
        No hay clínicas para mostrar.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[960px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Nombre de la Clínica</th>
              <th className="px-4 py-3 font-semibold">Odontólogo Titular</th>
              <th className="px-4 py-3 font-semibold">Código REPS</th>
              <th className="px-4 py-3 font-semibold">Registro ReTHUS</th>
              <th className="px-4 py-3 font-semibold">Plan de Suscripción</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tenants.map((tenant) => {
              const busy = busyId === tenant.id
              const suspended = tenant.status === 'suspendida'
              return (
                <tr key={tenant.id} className="align-top">
                  <td className="px-4 py-3 font-medium text-slate-900">{tenant.clinicName}</td>
                  <td className="px-4 py-3 text-slate-700">{tenant.ownerName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    {tenant.repsCode || '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    {tenant.rethus || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{tenant.plan}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(tenant.status)}`}
                    >
                      {suspended ? 'Suspendida' : 'Activa'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-52 flex-col gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onView(tenant)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Ver Detalles
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onSuspend(tenant)}
                        className="rounded-lg border border-amber-200 px-2.5 py-1.5 text-left text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                      >
                        {suspended ? 'Reactivar cuenta' : 'Suspender Cuenta'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onSync(tenant)}
                        className="rounded-lg border border-sky-200 px-2.5 py-1.5 text-left text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-50"
                      >
                        Forzar Sincronización Offline
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
