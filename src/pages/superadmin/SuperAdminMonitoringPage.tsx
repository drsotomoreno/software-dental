import { useState } from 'react'
import { IntegrationLogTerminal } from '@/components/superadmin/IntegrationLogTerminal'
import { useSuperadminResource } from '@/hooks/useSuperadminResource'
import { fetchIntegrationLogs, pingMinsaludEndpoint } from '@/services/superadminApi'
import type { IntegrationLogEvent, LogSource } from '@/types/superadmin'

const FILTERS: Array<{ id: 'todos' | LogSource; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'RIPS', label: 'RIPS' },
  { id: 'MinSalud', label: 'MinSalud' },
  { id: 'DIAN', label: 'DIAN' },
]

export function SuperAdminMonitoringPage() {
  const { data, error, loading } = useSuperadminResource(fetchIntegrationLogs)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('todos')
  const [pinging, setPinging] = useState(false)
  const [pingError, setPingError] = useState('')
  const [extra, setExtra] = useState<IntegrationLogEvent[]>([])

  const events = [...extra, ...(data?.events ?? [])].filter((event) =>
    filter === 'todos' ? true : event.source === filter,
  )

  async function handlePing() {
    setPinging(true)
    setPingError('')
    try {
      const result = await pingMinsaludEndpoint()
      setExtra((current) => [result.event, ...current])
      if (!result.ok) setPingError(result.error || result.event.message)
    } catch (cause) {
      setPingError(cause instanceof Error ? cause.message : 'El ping no se completó.')
    } finally {
      setPinging(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-2xl text-sm text-slate-600">
          Errores al armar el JSON de RIPS, rechazos del endpoint de MinSalud y fallos de
          facturación DIAN. Si la bitácora de radicación tiene filas, se muestran esas. Si no,
          eventos de demostración.
        </p>
        <button
          type="button"
          onClick={() => void handlePing()}
          disabled={pinging}
          className="inline-flex items-center justify-center rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
        >
          {pinging ? 'Haciendo ping...' : 'Hacer Ping a MinSalud MUV Endpoint'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filter === item.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {data?.source === 'fixture' && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Registros de demostración. Todavía no hay radicaciones recientes en la bitácora.
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}
      {pingError && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {pingError}
        </p>
      )}
      {loading && !data ? (
        <p className="text-sm text-slate-500">Cargando registros...</p>
      ) : (
        <IntegrationLogTerminal events={events} />
      )}
    </div>
  )
}
