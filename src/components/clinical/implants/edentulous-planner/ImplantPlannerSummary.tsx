import {
  alveolarRidgeClassLabel,
  lekholmZarbLabel,
} from '@/constants/boneClassification'
import {
  FDI_QUADRANT_LABELS,
  FDI_QUADRANT_ORDER,
  implantFixtureSizeLabel,
} from '@/constants/implantPlanning'
import type { EdentulousImplantPlan, PlacedImplant } from '@/types/dentalImplantsPlanning'
import { getEffectiveImplantBoneAssessment } from '@/types/dentalImplantsPlanning'

interface ImplantPlannerSummaryProps {
  plan: EdentulousImplantPlan
  selectedId: string | null
  disabled?: boolean
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}

function groupByQuadrant(implants: PlacedImplant[]) {
  return FDI_QUADRANT_ORDER.map((quadrant) => ({
    quadrant,
    items: implants.filter((item) => item.quadrant === quadrant),
  }))
}

export function ImplantPlannerSummary({
  plan,
  selectedId,
  disabled = false,
  onSelect,
  onRemove,
}: ImplantPlannerSummaryProps) {
  const groups = groupByQuadrant(plan.implants)

  return (
    <aside className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Resumen por cuadrante
      </h4>
      <p className="mt-1 text-[11px] text-slate-500">
        {plan.implants.length} implante{plan.implants.length === 1 ? '' : 's'} posicionado
        {plan.implants.length === 1 ? '' : 's'}
      </p>

      <div className="mt-3 space-y-3">
        {groups.map(({ quadrant, items }) => {
          const quadrantBone = plan.quadrantBoneClassification[quadrant]
          const quadrantBoneSummary = [
            quadrantBone.lekholmZarb && lekholmZarbLabel(quadrantBone.lekholmZarb),
            quadrantBone.ridgeClass && alveolarRidgeClassLabel(quadrantBone.ridgeClass),
          ]
            .filter(Boolean)
            .join(' · ')

          return (
          <div key={quadrant}>
            <p className="text-[11px] font-semibold text-slate-700">{FDI_QUADRANT_LABELS[quadrant]}</p>
            {quadrantBoneSummary && (
              <p className="mt-0.5 text-[10px] text-slate-500">{quadrantBoneSummary}</p>
            )}
            {items.length === 0 ? (
              <p className="mt-1 text-[11px] text-slate-400">Sin implantes</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {items.map((item, index) => {
                  const bone = getEffectiveImplantBoneAssessment(item, plan)
                  return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelect(item.id)}
                      className={`flex w-full items-start justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] transition ${
                        selectedId === item.id
                          ? 'border-dental-400 bg-white shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="text-slate-700">
                        <span className="font-medium">#{index + 1}</span> ·{' '}
                        {item.arch === 'upper' ? 'Superior' : 'Inferior'} ·{' '}
                        {implantFixtureSizeLabel(item.size)}
                        {(bone.boneType || bone.ridgeClass) && (
                          <span className="block text-slate-500">
                            {[
                              bone.boneType && lekholmZarbLabel(bone.boneType),
                              bone.ridgeClass && alveolarRidgeClassLabel(bone.ridgeClass),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                        <span className="block text-slate-400">
                          ({Math.round(item.x)}, {Math.round(item.y)}) · {Math.round(item.rotation)}°
                        </span>
                      </span>
                      {!disabled && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation()
                            onRemove(item.id)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              event.stopPropagation()
                              onRemove(item.id)
                            }
                          }}
                          className="shrink-0 text-red-500 hover:text-red-700"
                        >
                          ✕
                        </span>
                      )}
                    </button>
                  </li>
                  )
                })}
              </ul>
            )}
          </div>
          )
        })}
      </div>
    </aside>
  )
}
