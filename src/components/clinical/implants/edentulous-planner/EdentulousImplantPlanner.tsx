import { useCallback, useEffect, useRef, useState } from 'react'
import { Crosshair, RotateCcw, RotateCw, Trash2 } from 'lucide-react'
import {
  IMPLANT_FIXTURE_SIZE_OPTIONS,
} from '@/constants/implantPlanning'
import type { EdentulousImplantPlan, PlacedImplant } from '@/types/dentalImplantsPlanning'
import { normalizeEdentulousImplantPlan } from '@/types/dentalImplantsPlanning'
import type { ImplantMedicalAnamnesis } from '@/types/implantMedicalAnamnesis'
import { getImplantPlanningQuadrantWarnings } from '@/types/implantMedicalAnamnesis'
import type { ImplantPeriodontalAssessment } from '@/types/implantPeriodontalAssessment'
import type { OralSurgeryAnnex } from '@/types/oralSurgeryAnnex'
import { getPeriodontalPlanningAlerts } from '@/types/implantPeriodontalAssessment'
import { generateId } from '@/utils/crypto'
import {
  PLANNER_VIEWBOX,
  clientPointToViewBox,
  resolveImplantPlacement,
} from './archGeometry'
import { ImplantClinicalRiskAlert } from '@/components/clinical/implants/ImplantClinicalRiskAlert'
import { ImplantPlanningQuadrantAlert } from './ImplantPlanningQuadrantAlert'
import { EdentulousArchArtwork } from './EdentulousArchArtwork'
import { BoneClassificationSelectors } from './BoneClassificationSelectors'
import { ImplantMarker } from './ImplantMarker'
import { ImplantPlannerSummary } from './ImplantPlannerSummary'
import { EdentulousRehabilitationSelector } from './EdentulousRehabilitationSelector'
import { EdentulousPlanningFinalSummary } from './EdentulousPlanningFinalSummary'

interface EdentulousImplantPlannerProps {
  value: EdentulousImplantPlan
  onChange: (value: EdentulousImplantPlan) => void
  medicalAnamnesis?: ImplantMedicalAnamnesis
  surgicalRiskAssessment?: OralSurgeryAnnex
  periodontalAssessment?: ImplantPeriodontalAssessment
  disabled?: boolean
}

type DragState = {
  implantId: string
  pointerId: number
}

type QuadrantWarningState = {
  quadrant: string
  highRisk: string[]
  standardRisk: string[]
}

export function EdentulousImplantPlanner({
  value,
  onChange,
  medicalAnamnesis,
  surgicalRiskAssessment,
  periodontalAssessment,
  disabled = false,
}: EdentulousImplantPlannerProps) {
  const plan = normalizeEdentulousImplantPlan(value)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quadrantWarning, setQuadrantWarning] = useState<QuadrantWarningState | null>(null)

  const updateQuadrantWarning = useCallback(
    (quadrant: PlacedImplant['quadrant']) => {
      const medicalWarnings = medicalAnamnesis
        ? getImplantPlanningQuadrantWarnings(quadrant, medicalAnamnesis)
        : { highRisk: [], standardRisk: [] }
      const periodontalAlerts = periodontalAssessment
        ? getPeriodontalPlanningAlerts(periodontalAssessment)
        : []

      const highRisk = medicalWarnings.highRisk
      const standardRisk = [...medicalWarnings.standardRisk, ...periodontalAlerts]

      if (highRisk.length === 0 && standardRisk.length === 0) {
        setQuadrantWarning(null)
        return
      }

      setQuadrantWarning({
        quadrant,
        highRisk,
        standardRisk,
      })
    },
    [medicalAnamnesis, periodontalAssessment],
  )

  const updatePlan = useCallback(
    (patch: Partial<EdentulousImplantPlan>) => {
      onChange({ ...plan, ...patch })
    },
    [onChange, plan],
  )

  const updateImplant = useCallback(
    (id: string, patch: Partial<PlacedImplant>) => {
      updatePlan({
        implants: plan.implants.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      })
    },
    [plan.implants, updatePlan],
  )

  const removeImplant = useCallback(
    (id: string) => {
      updatePlan({ implants: plan.implants.filter((item) => item.id !== id) })
      setSelectedId((current) => (current === id ? null : current))
    },
    [plan.implants, updatePlan],
  )

  const clearAllImplants = useCallback(() => {
    if (plan.implants.length === 0) return
    updatePlan({ implants: [] })
    setSelectedId(null)
  }, [plan.implants.length, updatePlan])

  const placeImplantAt = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current
      if (!svg || disabled) return

      const point = clientPointToViewBox(svg, clientX, clientY)
      const placement = resolveImplantPlacement(point.x, point.y)

      const implant: PlacedImplant = {
        id: generateId(),
        quadrant: placement.quadrant,
        arch: placement.arch,
        x: placement.x,
        y: placement.y,
        rotation: 0,
        type: 'standard',
        size: plan.selectedSize,
      }

      updatePlan({ implants: [...plan.implants, implant] })
      setSelectedId(implant.id)
      updateQuadrantWarning(placement.quadrant)
    },
    [disabled, plan.implants, plan.selectedSize, updatePlan, updateQuadrantWarning],
  )

  const handleMarkerPointerDown = (implantId: string, event: React.PointerEvent<SVGGElement>) => {
    if (disabled) return
    dragRef.current = { implantId, pointerId: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      const svg = svgRef.current
      if (!drag || !svg || event.pointerId !== drag.pointerId) return

      const point = clientPointToViewBox(svg, event.clientX, event.clientY)
      const placement = resolveImplantPlacement(point.x, point.y)

      updateImplant(drag.implantId, {
        x: placement.x,
        y: placement.y,
        arch: placement.arch,
        quadrant: placement.quadrant,
      })
      updateQuadrantWarning(placement.quadrant)
    }

    const handlePointerUp = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      dragRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [updateImplant, updateQuadrantWarning])

  const selectedImplant = plan.implants.find((item) => item.id === selectedId) ?? null

  const rotateSelected = (delta: number) => {
    if (!selectedImplant || disabled) return
    updateImplant(selectedImplant.id, {
      rotation: (selectedImplant.rotation + delta + 360) % 360,
    })
  }

  useEffect(() => {
    if (!selectedImplant) return
    updateQuadrantWarning(selectedImplant.quadrant)
  }, [selectedImplant, updateQuadrantWarning])

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Planificación de Implantes Sobre Arcos Edéntulos
            </h3>
            <p className="text-xs text-slate-500">
              Haga clic en el esquema para colocar implantes. Arrastre para ajustar la posición.
            </p>
          </div>
          {!disabled && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[11px] text-slate-500">
                Tamaño
                <select
                  value={plan.selectedSize}
                  onChange={(event) =>
                    updatePlan({
                      selectedSize: event.target.value as EdentulousImplantPlan['selectedSize'],
                    })
                  }
                  className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  {IMPLANT_FIXTURE_SIZE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={clearAllImplants}
                disabled={plan.implants.length === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Quitar todo
              </button>
            </div>
          )}
        </div>
      </header>

      {(medicalAnamnesis || surgicalRiskAssessment || periodontalAssessment) && (
        <ImplantClinicalRiskAlert
          anamnesis={medicalAnamnesis}
          surgicalRiskAssessment={surgicalRiskAssessment}
          periodontalAssessment={periodontalAssessment}
        />
      )}

      {quadrantWarning && (
        <ImplantPlanningQuadrantAlert
          quadrant={quadrantWarning.quadrant}
          highRisk={quadrantWarning.highRisk}
          standardRisk={quadrantWarning.standardRisk}
        />
      )}

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="relative overflow-hidden rounded-xl bg-white">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${PLANNER_VIEWBOX.width} ${PLANNER_VIEWBOX.height}`}
            className="block h-auto w-full touch-none select-none"
            role="img"
            aria-label="Esquema de arcos edéntulos para planificación de implantes"
          >
            <rect width={PLANNER_VIEWBOX.width} height={PLANNER_VIEWBOX.height} fill="#ffffff" />

            <EdentulousArchArtwork disabled={disabled} onCanvasClick={placeImplantAt} />

            {plan.implants.map((implant) => (
              <ImplantMarker
                key={implant.id}
                implant={implant}
                selected={selectedId === implant.id}
                disabled={disabled}
                onSelect={setSelectedId}
                onPointerDown={handleMarkerPointerDown}
              />
            ))}
          </svg>

          {!disabled && (
            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2 py-1 text-[10px] text-slate-500 shadow-sm">
              <Crosshair className="h-3 w-3" aria-hidden />
              Clic en el esquema para colocar
            </div>
          )}
        </div>

        <div className="space-y-3">
          {selectedImplant && !disabled && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-700">Implante seleccionado</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => rotateSelected(-15)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  -15°
                </button>
                <button
                  type="button"
                  onClick={() => rotateSelected(15)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  +15°
                </button>
                <button
                  type="button"
                  onClick={() => removeImplant(selectedImplant.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              </div>
              <div className="mt-2 grid gap-2">
                <label className="text-[11px] text-slate-500">
                  Tamaño
                  <select
                    value={selectedImplant.size}
                    onChange={(event) =>
                      updateImplant(selectedImplant.id, {
                        size: event.target.value as PlacedImplant['size'],
                      })
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  >
                    {IMPLANT_FIXTURE_SIZE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                  <p className="text-[11px] font-medium text-slate-600">
                    Clasificación ósea del implante
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Si no define un valor, se usará el del cuadrante {selectedImplant.quadrant}.
                  </p>
                  <div className="mt-2">
                    <BoneClassificationSelectors
                      value={{
                        lekholmZarb:
                          selectedImplant.boneType ??
                          plan.quadrantBoneClassification[selectedImplant.quadrant].lekholmZarb,
                        ridgeClass:
                          selectedImplant.ridgeClass ??
                          plan.quadrantBoneClassification[selectedImplant.quadrant].ridgeClass,
                      }}
                      onChange={(patch) =>
                        updateImplant(selectedImplant.id, {
                          boneType: patch.lekholmZarb ?? '',
                          ridgeClass: patch.ridgeClass ?? '',
                        })
                      }
                      idPrefix={`implant-${selectedImplant.id}`}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <ImplantPlannerSummary
            plan={plan}
            selectedId={selectedId}
            disabled={disabled}
            onSelect={setSelectedId}
            onRemove={removeImplant}
          />
        </div>
      </div>

      <EdentulousRehabilitationSelector
        value={plan.rehabilitationPlan}
        onChange={(rehabilitationPlan) => updatePlan({ rehabilitationPlan })}
        disabled={disabled}
      />

      <EdentulousPlanningFinalSummary plan={plan} />
    </section>
  )
}
