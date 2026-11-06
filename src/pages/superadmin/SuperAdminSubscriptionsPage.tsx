import { useSuperadminResource } from '@/hooks/useSuperadminResource'
import { fetchSubscriptions } from '@/services/superadminApi'

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function SuperAdminSubscriptionsPage() {
  const { data, error, loading } = useSuperadminResource(fetchSubscriptions)
  const total = (data?.subscriptions ?? [])
    .filter((row) => row.status === 'activa')
    .reduce((sum, row) => sum + row.mrrCop, 0)

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-slate-600">
        Suscripciones de la plataforma. {data?.note}
      </p>
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}
      {loading && !data ? (
        <p className="text-sm text-slate-500">Cargando suscripciones...</p>
      ) : data ? (
        <>
          <p className="text-sm font-medium text-slate-700">
            MRR de demostración: {cop.format(total)}
          </p>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Clínica</th>
                    <th className="px-4 py-3 font-semibold">Plan</th>
                    <th className="px-4 py-3 font-semibold">Valor mensual</th>
                    <th className="px-4 py-3 font-semibold">Próximo cobro</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.subscriptions.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.clinicName}</td>
                      <td className="px-4 py-3 text-slate-700">{row.plan}</td>
                      <td className="px-4 py-3 text-slate-700">{cop.format(row.mrrCop)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatDate(row.renewsAt)}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.status === 'activa' ? 'Activa' : row.status === 'prueba' ? 'Prueba' : 'Suspendida'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
