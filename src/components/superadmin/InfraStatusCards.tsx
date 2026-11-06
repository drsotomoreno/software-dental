import { Database, Server } from 'lucide-react'
import type { InfraSnapshot } from '@/types/superadmin'

function barColor(percent: number) {
  if (percent >= 85) return 'bg-red-500'
  if (percent >= 70) return 'bg-amber-500'
  return 'bg-sky-600'
}

function UsageCard({
  label,
  value,
  percent,
  detail,
  icon: Icon,
}: {
  label: string
  value: string
  percent: number
  detail: string
  icon: typeof Server
}) {
  const width = Math.max(0, Math.min(100, percent))
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
          <p className="text-xs text-slate-500">{detail}</p>
        </div>
      </div>
      <p className="mt-4 text-2xl font-semibold text-slate-900">{value}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className={`h-full rounded-full ${barColor(width)}`} style={{ width: `${width}%` }} />
      </div>
    </article>
  )
}

export function InfraStatusCards({ infra }: { infra: InfraSnapshot }) {
  const rdsPercent =
    infra.rdsAllocatedGb > 0 ? Math.round((infra.rdsUsedGb / infra.rdsAllocatedGb) * 100) : 0

  return (
    <section aria-labelledby="infra-heading">
      <div className="mb-3">
        <h2 id="infra-heading" className="text-base font-semibold text-slate-900">
          Estado de infraestructura
        </h2>
        <p className="mt-1 text-sm text-slate-500">{infra.note}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <UsageCard
          label="AWS EC2 · CPU"
          value={`${infra.cpuPercent}%`}
          percent={infra.cpuPercent}
          detail="Uso simulado del procesador"
          icon={Server}
        />
        <UsageCard
          label="AWS EC2 · RAM"
          value={`${infra.ramPercent}%`}
          percent={infra.ramPercent}
          detail="Memoria simulada de la instancia"
          icon={Server}
        />
        <UsageCard
          label="AWS RDS PostgreSQL"
          value={`${infra.rdsUsedGb} / ${infra.rdsAllocatedGb} GB`}
          percent={rdsPercent}
          detail="Almacenamiento simulado"
          icon={Database}
        />
      </div>
    </section>
  )
}
