import type { ReactNode } from 'react'
import { Cloud, FileCheck2, RadioTower } from 'lucide-react'
import type { ServiceStatus } from '@/types/superadmin'

const STATUS_LABEL = {
  operativo: 'Operativo',
  degradado: 'Degradado',
  caido: 'Caído',
  pendiente: 'Pendiente',
} as const

const STATUS_CLASS = {
  operativo: 'bg-emerald-50 text-emerald-700',
  degradado: 'bg-amber-50 text-amber-800',
  caido: 'bg-red-50 text-red-700',
  pendiente: 'bg-slate-100 text-slate-600',
} as const

const ICONS = {
  muv: RadioTower,
  dian: FileCheck2,
  googleDrive: Cloud,
} as const

export function ServiceStatusCard({
  service,
  action,
}: {
  service: ServiceStatus
  action?: ReactNode
}) {
  const Icon = ICONS[service.id]
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <h3 className="text-sm font-semibold text-slate-900">{service.label}</h3>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[service.status]}`}
        >
          {STATUS_LABEL[service.status]}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{service.detail}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </article>
  )
}
