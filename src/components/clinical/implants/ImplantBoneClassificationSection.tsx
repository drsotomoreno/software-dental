import type { ImplantFdiQuadrant } from '@/constants/implantPlanning'
import type { QuadrantBoneClassification } from '@/constants/boneClassification'
import { BoneClassificationPanel } from '@/components/clinical/implants/edentulous-planner/BoneClassificationPanel'

interface ImplantBoneClassificationSectionProps {
  value: QuadrantBoneClassification
  onChange: (value: QuadrantBoneClassification) => void
  disabled?: boolean
}

export function ImplantBoneClassificationSection({
  value,
  onChange,
  disabled = false,
}: ImplantBoneClassificationSectionProps) {
  const updateQuadrant = (
    quadrant: ImplantFdiQuadrant,
    patch: Partial<QuadrantBoneClassification[ImplantFdiQuadrant]>,
  ) => {
    onChange({
      ...value,
      [quadrant]: {
        ...value[quadrant],
        ...patch,
      },
    })
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">
          Clasificación ósea (Lekholm y Zarb)
        </h3>
        <p className="text-xs text-slate-500">
          Registre la densidad ósea y la morfología del reborde alveolar por cuadrante.
        </p>
      </header>

      <div className="p-4">
        <BoneClassificationPanel value={value} onChange={updateQuadrant} disabled={disabled} embedded />
      </div>
    </section>
  )
}
