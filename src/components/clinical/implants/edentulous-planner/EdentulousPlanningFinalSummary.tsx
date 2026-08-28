import {
  FDI_QUADRANT_LABELS,
  FDI_QUADRANT_ORDER,
  implantFixtureSizeLabel,
} from '@/constants/implantPlanning'
import type { EdentulousImplantPlan, PlacedImplant } from '@/types/dentalImplantsPlanning'
import {
  EDENTULOUS_ARCH_LABELS,
  getArchRehabilitationSummaryDetails,
  type EdentulousArchKey,
} from '@/types/implantRehabilitationModality'

interface EdentulousPlanningFinalSummaryProps {
  plan: EdentulousImplantPlan
}

function SummaryPill({
  color,
  label,
  detail,
}: {
  color: string
  label: string
  detail: string
}) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span>
        {label}: {detail}
      </span>
    </span>
  )
}

function formatImplantSizeCounts(implants: PlacedImplant[]): string {
  const counts = new Map<string, number>()
  for (const implant of implants) {
    const label = implantFixtureSizeLabel(implant.size)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([label, count]) => (count > 1 ? `${label} (×${count})` : label))
    .join(', ')
}

function getArchImplantSummary(arch: 'upper' | 'lower', implants: PlacedImplant[]) {
  const archImplants = implants.filter((item) => item.arch === arch)
  if (archImplants.length === 0) return null

  const byQuadrant = FDI_QUADRANT_ORDER.map((quadrant) => ({
    quadrant,
    items: archImplants.filter((item) => item.quadrant === quadrant),
  })).filter((group) => group.items.length > 0)

  const quadrantDetails = byQuadrant
    .map((group) => `${FDI_QUADRANT_LABELS[group.quadrant]} (${group.items.length})`)
    .join(', ')

  return {
    count: archImplants.length,
    sizes: formatImplantSizeCounts(archImplants),
    quadrants: quadrantDetails,
  }
}

const ARCH_IMPLANT_COLORS: Record<'upper' | 'lower', string> = {
  upper: '#0ea5e9',
  lower: '#6366f1',
}

const ARCH_KEYS: { arch: 'upper' | 'lower'; key: EdentulousArchKey; label: string }[] = [
  { arch: 'upper', key: 'maxilla', label: EDENTULOUS_ARCH_LABELS.maxilla },
  { arch: 'lower', key: 'mandible', label: EDENTULOUS_ARCH_LABELS.mandible },
]

export function EdentulousPlanningFinalSummary({ plan }: EdentulousPlanningFinalSummaryProps) {
  const implantSummaries = ARCH_KEYS.map(({ arch, label }) => ({
    label,
    summary: getArchImplantSummary(arch, plan.implants),
    color: ARCH_IMPLANT_COLORS[arch],
  })).filter((item) => item.summary !== null)

  const rehabilitationSummaries = ARCH_KEYS.map(({ key, label }) => ({
    label,
    color: key === 'maxilla' ? '#14b8a6' : '#8b5cf6',
    ...getArchRehabilitationSummaryDetails(plan.rehabilitationPlan[key]),
  })).filter((item) => item.hasContent)

  const hasImplants = plan.implants.length > 0
  const hasRehabilitation = rehabilitationSummaries.length > 0

  if (!hasImplants && !hasRehabilitation) {
    return (
      <footer className="border-t border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Resumen del plan
        </p>
        <p className="mt-2 text-[11px] text-slate-400">
          Aún no hay implantes posicionados ni modalidad de rehabilitación definida.
        </p>
      </footer>
    )
  }

  return (
    <footer className="border-t border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Resumen del plan
      </p>

      <div className="mt-3 space-y-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold text-slate-600">Implantes colocados</p>
          {hasImplants ? (
            <div className="flex flex-col gap-2">
              {implantSummaries.map((item) => (
                <div key={item.label} className="space-y-1">
                  <SummaryPill
                    color={item.color}
                    label={item.label}
                    detail={`${item.summary!.count} implante${item.summary!.count === 1 ? '' : 's'} — ${item.summary!.sizes}`}
                  />
                  <p className="pl-1 text-[10px] text-slate-500">
                    Cuadrantes: {item.summary!.quadrants}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">Sin implantes posicionados en el esquema.</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold text-slate-600">
            Modalidad de rehabilitación protésica
          </p>
          {hasRehabilitation ? (
            <div className="flex flex-col gap-2">
              {rehabilitationSummaries.map((item) => (
                <div key={item.label} className="space-y-1">
                  <SummaryPill
                    color={item.color}
                    label={item.label}
                    detail={item.categoryLabel || 'Opción seleccionada'}
                  />
                  {item.details.length > 0 && (
                    <ul className="list-inside list-disc space-y-0.5 pl-1 text-[10px] text-slate-500">
                      {item.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">
              Sin modalidad de rehabilitación definida para ningún arco.
            </p>
          )}
        </div>
      </div>
    </footer>
  )
}
