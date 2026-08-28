import { useMemo, useState } from 'react'
import { Layers3 } from 'lucide-react'
import { DEFAULT_IMPLANT_FIXTURE_SIZE, type ImplantFixtureSize } from '@/constants/implantPlanning'
import { REHAB_ODONTOGRAM_TEETH, REHAB_PLANNING_OPTIONS, IMPLANT_ODONTOGRAM_PLANNING_OPTIONS } from './constants'
import { RehabOdontogramQuadrant } from './RehabOdontogramQuadrant'
import { RehabTreatmentSummary } from './RehabTreatmentSummary'
import { RehabTreatmentPanel } from './RehabTreatmentPanel'
import type {
  RehabArchProsthesisPlan,
  RehabOdontogramProps,
  RehabTreatmentPlanEntry,
  RehabTreatmentType,
} from './types'

export function RehabOdontogram({
  value = [],
  protesisTotal = null,
  protesisParcialRemovible = null,
  onChange,
  onProtesisTotalChange,
  onProtesisParcialRemovibleChange,
  restorationDetails = {},
  onRestorationDetailsChange,
  title = 'Esquema de Planificación — Rehabilitación y Estética',
  variant = 'rehabilitation',
  disabled = false,
  className = '',
}: RehabOdontogramProps) {
  const isImplantsVariant = variant === 'implants'
  const planningOptions = isImplantsVariant
    ? IMPLANT_ODONTOGRAM_PLANNING_OPTIONS
    : REHAB_PLANNING_OPTIONS
  const [selectedToothId, setSelectedToothId] = useState<string | null>(null)

  const plan = value
  const selectedEntry = useMemo(
    () => plan.find((entry) => entry.dienteId === selectedToothId),
    [plan, selectedToothId],
  )

  const updatePlan = (nextPlan: RehabTreatmentPlanEntry[]) => {
    onChange?.(nextPlan)
  }

  const handleSelectTooth = (dienteId: string) => {
    if (disabled) return
    setSelectedToothId((current) => (current === dienteId ? null : dienteId))
  }

  const handleApplyTreatment = (tratamiento: RehabTreatmentType, color: string) => {
    if (!selectedToothId || disabled) return

    const existing = plan.find((entry) => entry.dienteId === selectedToothId)
    if (existing?.eliminado && !['implante', 'pontico_ppf'].includes(tratamiento)) return

    const withoutCurrent = plan.filter((entry) => entry.dienteId !== selectedToothId)
    if (existing?.tratamiento === tratamiento) {
      if (existing.eliminado) {
        updatePlan([...withoutCurrent, { dienteId: selectedToothId, eliminado: true }])
      } else {
        updatePlan(withoutCurrent)
      }
      return
    }

    updatePlan([
      ...withoutCurrent,
      {
        dienteId: selectedToothId,
        tratamiento,
        color,
        ...(tratamiento === 'implante' && isImplantsVariant
          ? { implantSize: existing?.implantSize ?? DEFAULT_IMPLANT_FIXTURE_SIZE }
          : {}),
        ...(existing?.eliminado ? { eliminado: true } : {}),
      },
    ])
  }

  const handleImplantSizeChange = (implantSize: ImplantFixtureSize) => {
    if (!selectedToothId || disabled) return
    updatePlan(
      plan.map((entry) =>
        entry.dienteId === selectedToothId && entry.tratamiento === 'implante'
          ? { ...entry, implantSize }
          : entry,
      ),
    )
  }

  const handleDeleteTooth = () => {
    if (!selectedToothId || disabled) return
    const withoutCurrent = plan.filter((entry) => entry.dienteId !== selectedToothId)
    updatePlan([...withoutCurrent, { dienteId: selectedToothId, eliminado: true }])
  }

  const handleClearTooth = () => {
    if (!selectedToothId || disabled) return
    updatePlan(plan.filter((entry) => entry.dienteId !== selectedToothId))
  }

  const handleClearAll = () => {
    if (disabled) return
    updatePlan([])
    onProtesisTotalChange?.(null)
    onProtesisParcialRemovibleChange?.(null)
    onRestorationDetailsChange?.({})
    setSelectedToothId(null)
  }

  const handleArchPlanChange = (
    handler: ((plan: RehabArchProsthesisPlan | null) => void) | undefined,
    next: RehabArchProsthesisPlan | null,
  ) => {
    if (disabled) return
    handler?.(next)
  }

  const quadrantProps = {
    selectedToothId,
    plan,
    protesisTotal,
    protesisParcialRemovible,
    disabled,
    onSelectTooth: handleSelectTooth,
  }

  return (
    <section
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers3 className="h-5 w-5 text-dental-600" aria-hidden />
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              {title}
            </h3>
            <p className="text-xs text-slate-500">
              32 piezas permanentes (FDI) · Vista sagital/lateral · 8 piezas por cuadrante en fila única
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <div className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-2">
            <RehabOdontogramQuadrant
              quadrantId="upperRight"
              teeth={REHAB_ODONTOGRAM_TEETH.upperRight}
              arch="upper"
              {...quadrantProps}
            />
            <RehabOdontogramQuadrant
              quadrantId="upperLeft"
              teeth={REHAB_ODONTOGRAM_TEETH.upperLeft}
              arch="upper"
              {...quadrantProps}
            />
          </div>

          <div className="flex items-center justify-center">
            <div className="h-px w-full max-w-3xl border-t-2 border-dashed border-slate-300" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <RehabOdontogramQuadrant
              quadrantId="lowerLeft"
              teeth={REHAB_ODONTOGRAM_TEETH.lowerLeft}
              arch="lower"
              {...quadrantProps}
            />
            <RehabOdontogramQuadrant
              quadrantId="lowerRight"
              teeth={REHAB_ODONTOGRAM_TEETH.lowerRight}
              arch="lower"
              {...quadrantProps}
            />
          </div>

          <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            {planningOptions.map((option) => (
              <div key={option.id} className="flex items-center gap-2 text-xs text-slate-600">
                <span
                  className="h-3 w-3 rounded-full border border-white shadow-sm"
                  style={{ backgroundColor: option.color }}
                />
                {option.label}
              </div>
            ))}
          </div>
        </div>

        <RehabTreatmentPanel
          selectedToothId={selectedToothId}
          selectedEntry={selectedEntry}
          protesisTotal={protesisTotal}
          protesisParcialRemovible={protesisParcialRemovible}
          planningOptions={planningOptions}
          variant={variant}
          disabled={disabled}
          onApplyTreatment={handleApplyTreatment}
          onImplantSizeChange={handleImplantSizeChange}
          onProtesisTotalChange={(next) => handleArchPlanChange(onProtesisTotalChange, next)}
          onProtesisParcialRemovibleChange={(next) =>
            handleArchPlanChange(onProtesisParcialRemovibleChange, next)
          }
          onDeleteTooth={handleDeleteTooth}
          onClearTooth={handleClearTooth}
          onClearAll={handleClearAll}
        />
      </div>

      <RehabTreatmentSummary
        plan={plan}
        protesisTotal={protesisTotal}
        protesisParcialRemovible={protesisParcialRemovible}
        restorationDetails={restorationDetails}
        onRestorationDetailsChange={onRestorationDetailsChange}
        variant={variant}
        disabled={disabled}
      />
    </section>
  )
}
