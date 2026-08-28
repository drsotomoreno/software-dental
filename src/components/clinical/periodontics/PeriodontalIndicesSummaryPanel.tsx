import { memo } from 'react'
import { AlertTriangle, Activity, Droplets, Layers } from 'lucide-react'
import type { PeriodontalIndicesSummary } from '@/types/periodonticsAnnex'

interface PeriodontalIndicesSummaryPanelProps {
  summary: PeriodontalIndicesSummary
}

function PeriodontalIndicesSummaryPanelComponent({ summary }: PeriodontalIndicesSummaryPanelProps) {
  const cards = [
    {
      label: 'Índice de sangrado (BoP)',
      value: `${summary.bleedingIndexPercent}%`,
      detail: `${summary.bleedingSites} / ${summary.evaluatedSites} sitios`,
      icon: Droplets,
      tone: summary.bleedingIndexPercent >= 30 ? 'text-red-700 bg-red-50 border-red-200' : 'text-slate-700 bg-white border-slate-200',
    },
    {
      label: 'Índice de placa',
      value: `${summary.plaqueIndexPercent}%`,
      detail: `${summary.plaqueSites} / ${summary.evaluatedSites} sitios`,
      icon: Layers,
      tone: summary.plaqueIndexPercent >= 30 ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-slate-700 bg-white border-slate-200',
    },
    {
      label: 'Bolsas profundas (≥ 5 mm)',
      value: String(summary.deepPocketSites),
      detail:
        summary.deepPocketTeeth.length > 0
          ? `Piezas: ${summary.deepPocketTeeth.join(', ')}`
          : 'Sin sitios ≥ 5 mm',
      icon: AlertTriangle,
      tone:
        summary.deepPocketSites > 0
          ? 'text-red-800 bg-red-50 border-red-300'
          : 'text-emerald-800 bg-emerald-50 border-emerald-200',
    },
    {
      label: 'Sitios evaluados',
      value: String(summary.evaluatedSites),
      detail: 'Con PBS registrada',
      icon: Activity,
      tone: 'text-slate-700 bg-white border-slate-200',
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div key={card.label} className={`rounded-xl border p-4 ${card.tone}`}>
            <div className="mb-2 flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              <p className="text-xs font-medium">{card.label}</p>
            </div>
            <p className="text-2xl font-bold">{card.value}</p>
            <p className="mt-1 text-[11px] opacity-80">{card.detail}</p>
          </div>
        )
      })}
    </div>
  )
}

export const PeriodontalIndicesSummaryPanel = memo(PeriodontalIndicesSummaryPanelComponent)
