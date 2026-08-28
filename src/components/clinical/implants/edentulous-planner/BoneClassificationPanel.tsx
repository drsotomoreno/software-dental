import { FDI_QUADRANT_LABELS, FDI_QUADRANT_ORDER } from '@/constants/implantPlanning'
import type { ImplantFdiQuadrant } from '@/constants/implantPlanning'
import type { QuadrantBoneClassification } from '@/constants/boneClassification'
import { BoneClassificationSelectors } from './BoneClassificationSelectors'

interface BoneClassificationPanelProps {
  value: QuadrantBoneClassification
  onChange: (quadrant: ImplantFdiQuadrant, patch: Partial<QuadrantBoneClassification[ImplantFdiQuadrant]>) => void
  disabled?: boolean
  embedded?: boolean
}

export function BoneClassificationPanel({
  value,
  onChange,
  disabled = false,
  embedded = false,
}: BoneClassificationPanelProps) {
  const content = (
    <div className={embedded ? '' : 'rounded-xl border border-slate-200 bg-white p-3'}>
      {!embedded && (
        <>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Clasificación ósea (Lekholm y Zarb)
          </h4>
          <p className="mt-1 text-[11px] text-slate-500">
            Registre la densidad ósea y, si aplica, la morfología del reborde por cuadrante.
          </p>
        </>
      )}

      <div className={`grid gap-3 sm:grid-cols-2 ${embedded ? '' : 'mt-3'}`}>
        {FDI_QUADRANT_ORDER.map((quadrant) => (
          <div key={quadrant} className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
            <p className="text-[11px] font-semibold text-slate-700">{FDI_QUADRANT_LABELS[quadrant]}</p>
            <div className="mt-2">
              <BoneClassificationSelectors
                value={value[quadrant]}
                onChange={(patch) => onChange(quadrant, patch)}
                disabled={disabled}
                compact
                idPrefix={`bone-${quadrant}`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  if (embedded) return content

  return <aside>{content}</aside>
}
