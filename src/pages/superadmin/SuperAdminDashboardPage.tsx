import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, CircleDollarSign, UserPlus, Users } from 'lucide-react'
import { InfraStatusCards } from '@/components/superadmin/InfraStatusCards'
import { MetricCard } from '@/components/superadmin/MetricCard'
import { ServiceStatusCard } from '@/components/superadmin/ServiceStatusCard'
import { useSuperadminResource } from '@/hooks/useSuperadminResource'
import {
  fetchDashboardMetrics,
  fetchInfrastructure,
  forceGlobalOfflineSync,
  pingMinsaludEndpoint,
  verifyDianCredentials,
} from '@/services/superadminApi'
import type { ServiceStatus } from '@/types/superadmin'

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const integer = new Intl.NumberFormat('es-CO')

const outlineButtonClass =
  'inline-flex items-center justify-center rounded-lg border border-sky-700 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-60'

export function SuperAdminDashboardPage() {
  const metrics = useSuperadminResource(fetchDashboardMetrics)
  const infra = useSuperadminResource(fetchInfrastructure)
  const [syncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState('')
  const [syncError, setSyncError] = useState('')
  const [pinging, setPinging] = useState(false)
  const [pingNotice, setPingNotice] = useState('')
  const [checkingDian, setCheckingDian] = useState(false)
  const [dianNotice, setDianNotice] = useState('')

  async function handleGlobalSync() {
    setSyncing(true)
    setSyncNotice('')
    setSyncError('')
    try {
      const result = await forceGlobalOfflineSync()
      setSyncNotice(result.message)
    } catch (cause) {
      setSyncError(cause instanceof Error ? cause.message : 'No se pudo encolar la sincronización.')
    } finally {
      setSyncing(false)
    }
  }

  async function handlePing() {
    setPinging(true)
    setPingNotice('')
    try {
      const result = await pingMinsaludEndpoint()
      setPingNotice(result.event.message)
    } catch (cause) {
      setPingNotice(cause instanceof Error ? cause.message : 'El ping no se completó.')
    } finally {
      setPinging(false)
    }
  }

  async function handleDianCheck() {
    setCheckingDian(true)
    setDianNotice('')
    try {
      const result = await verifyDianCredentials()
      setDianNotice(result.message)
    } catch (cause) {
      setDianNotice(cause instanceof Error ? cause.message : 'No se pudieron verificar las credenciales.')
    } finally {
      setCheckingDian(false)
    }
  }

  function serviceAction(service: ServiceStatus) {
    if (service.id === 'muv') {
      return (
        <div className="space-y-2">
          <button type="button" className={outlineButtonClass} disabled={pinging} onClick={() => void handlePing()}>
            {pinging ? 'Haciendo ping...' : 'Hacer Ping a MinSalud'}
          </button>
          {pingNotice ? <p className="text-xs leading-relaxed text-slate-500">{pingNotice}</p> : null}
        </div>
      )
    }
    if (service.id === 'dian') {
      return (
        <div className="space-y-2">
          <button
            type="button"
            className={outlineButtonClass}
            disabled={checkingDian}
            onClick={() => void handleDianCheck()}
          >
            {checkingDian ? 'Verificando...' : 'Verificar Credenciales DIAN'}
          </button>
          {dianNotice ? <p className="text-xs leading-relaxed text-slate-500">{dianNotice}</p> : null}
        </div>
      )
    }
    return undefined
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Gestión global de la plataforma. Las clínicas y los pacientes se leen de PostgreSQL cuando
            RDS responde. El ingreso recurrente sigue en demostración hasta la tabla de suscripciones.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Link
            to="/superadmin/registros"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-50"
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            Registros / Ventas
          </Link>
          <button
            type="button"
            onClick={() => void handleGlobalSync()}
            disabled={syncing}
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {syncing ? 'Sincronizando...' : 'Forzar Sincronización Global'}
          </button>
        </div>
      </div>
      {syncNotice ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {syncNotice}
        </p>
      ) : null}
      {syncError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{syncError}</p>
      ) : null}

      {metrics.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {metrics.error}
        </p>
      )}

      {metrics.loading && !metrics.data ? (
        <p className="text-sm text-slate-500">Cargando métricas...</p>
      ) : metrics.data ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <MetricCard
              label="Clínicas activas"
              value={integer.format(metrics.data.activeClinics)}
              hint={
                metrics.data.source === 'postgres'
                  ? 'Conteo en PostgreSQL (clínicas no suspendidas).'
                  : 'Cifra de demostración: PostgreSQL no devolvió clínicas.'
              }
              icon={Building2}
              tone="sky"
            />
            <MetricCard
              label="Pacientes registrados"
              value={integer.format(metrics.data.registeredPatients)}
              hint={
                metrics.data.source === 'postgres'
                  ? 'Historias con clinica_id en toda la plataforma.'
                  : 'Suma de demostración mientras la base no responde.'
              }
              icon={Users}
              tone="teal"
            />
            <MetricCard
              label="Ingresos mensuales recurrentes"
              value={cop.format(metrics.data.mrrCop)}
              hint="Suscripciones activas de demostración. Aún no se factura el SaaS desde RDS."
              icon={CircleDollarSign}
              tone="indigo"
            />
          </div>

          <section aria-labelledby="services-heading">
            <h2 id="services-heading" className="mb-3 text-base font-semibold text-slate-900">
              Estado de los servicios API
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {metrics.data.services.map((service) => (
                <ServiceStatusCard key={service.id} service={service} action={serviceAction(service)} />
              ))}
            </div>
          </section>
        </>
      ) : null}

      {infra.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {infra.error}
        </p>
      )}
      {infra.loading && !infra.data ? (
        <p className="text-sm text-slate-500">Cargando infraestructura...</p>
      ) : infra.data ? (
        <InfraStatusCards infra={infra.data} />
      ) : null}
    </div>
  )
}
