import type { RehabArchProsthesisPlan, RehabQuadrantId, RehabTreatmentPlanEntry } from './types'
import { REHAB_QUADRANT_LABELS } from './constants'
import { getArchProsthesisTintColor, isArchInProsthesisScope } from './archProsthesis'
import { RehabToothFigure } from './RehabToothFigure'

interface RehabOdontogramQuadrantProps {
  quadrantId: RehabQuadrantId
  teeth: number[]
  arch: 'upper' | 'lower'
  selectedToothId: string | null
  plan: RehabTreatmentPlanEntry[]
  protesisTotal?: RehabArchProsthesisPlan | null
  protesisParcialRemovible?: RehabArchProsthesisPlan | null
  disabled?: boolean
  onSelectTooth: (dienteId: string) => void
}

export function RehabOdontogramQuadrant({
  quadrantId,
  teeth,
  arch,
  selectedToothId,
  plan,
  protesisTotal = null,
  protesisParcialRemovible = null,
  disabled = false,
  onSelectTooth,
}: RehabOdontogramQuadrantProps) {
  const planByTooth = new Map(plan.map((entry) => [entry.dienteId, entry]))
  const archInProtesisTotal =
    protesisTotal && isArchInProsthesisScope(arch, protesisTotal.scope)
  const archInPpr =
    protesisParcialRemovible &&
    isArchInProsthesisScope(arch, protesisParcialRemovible.scope)
  const archTintColor = getArchProsthesisTintColor(arch, [
    protesisTotal,
    protesisParcialRemovible,
  ])

  return (
    <div
      className={`min-w-0 rounded-xl border p-2 shadow-sm sm:p-3 ${
        archInProtesisTotal && archInPpr
          ? 'border-amber-400 bg-amber-50/25 ring-1 ring-teal-300'
          : archInPpr
            ? 'border-amber-400 bg-amber-50/40'
            : archInProtesisTotal
              ? 'border-teal-300 bg-teal-50/40'
              : 'border-slate-200 bg-white'
      }`}
    >
      <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {REHAB_QUADRANT_LABELS[quadrantId]}
      </p>
      <div className="flex flex-nowrap items-end justify-center gap-0.5 overflow-x-auto pb-1">
        {teeth.map((fdi) => {
          const dienteId = String(fdi)
          const entry = planByTooth.get(dienteId)
          return (
            <RehabToothFigure
              key={fdi}
              fdi={fdi}
              arch={arch}
              isSelected={selectedToothId === dienteId}
              eliminado={entry?.eliminado}
              treatment={entry?.tratamiento}
              treatmentColor={entry?.color ?? archTintColor}
              disabled={disabled}
              onClick={() => onSelectTooth(dienteId)}
            />
          )
        })}
      </div>
    </div>
  )
}
