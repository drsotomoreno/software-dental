import { Building2, CircleDollarSign, Users } from 'lucide-react'
import { InfraStatusCards } from '@/components/superadmin/InfraStatusCards'
import { MetricCard } from '@/components/superadmin/MetricCard'
import { ServiceStatusCard } from '@/components/superadmin/ServiceStatusCard'
import { useSuperadminResource } from '@/hooks/useSuperadminResource'
import { fetchDashboardMetrics, fetchInfrastructure } from '@/services/superadminApi'

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const integer = new Intl.NumberFormat('es-CO')

export function SuperAdminDashboardPage() {
  const metrics = useSuperadminResource(fetchDashboardMetrics)
  const infra = useSuperadminResource(fetchInfrastructure)

  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-sm text-slate-600">
        Gestión global de la plataforma. Las clínicas y los pacientes se leen de PostgreSQL cuando
        RDS responde. El ingreso recurrente sigue en demostración hasta la tabla de suscripciones.
      </p>

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
                <ServiceStatusCard key={service.id} service={service} />
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
