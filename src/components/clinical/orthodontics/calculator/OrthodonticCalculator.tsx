import { useOrthodonticCalc } from './useOrthodonticCalc'
import {
  formatCurrency,
  type OrthodonticBudgetState,
  type OrthodonticCalculatorPlan,
} from './types'

export interface OrthodonticCalculatorProps {
  plan: OrthodonticCalculatorPlan
  value: OrthodonticBudgetState | null
  onChange: (value: OrthodonticBudgetState | null) => void
  disabled?: boolean
}

function parseNonNegativeNumber(raw: string): number {
  const parsed = Number(raw.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100) / 100
}

interface NumberFieldProps {
  id: string
  label: string
  value: number
  disabled?: boolean
  onChange: (value: number) => void
}

function NumberField({ id, label, value, disabled = false, onChange }: NumberFieldProps) {
  return (
    <div className="min-w-0">
      <label className="label-field" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        step={0.01}
        disabled={disabled}
        value={value || ''}
        onChange={(event) => onChange(parseNonNegativeNumber(event.target.value))}
        className="input-field text-sm"
      />
    </div>
  )
}

function PlanDerivedField({
  label,
  value,
  emptyLabel = 'Defina este valor en el plan de tratamiento',
}: {
  label: string
  value: number
  emptyLabel?: string
}) {
  return (
    <div className="min-w-0">
      <p className="label-field">{label}</p>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        {value > 0 ? value : emptyLabel}
      </div>
      <p className="mt-1 text-xs text-slate-500">Tomado automáticamente del plan de tratamiento</p>
    </div>
  )
}

export default function OrthodonticCalculator({
  plan,
  value,
  onChange,
  disabled = false,
}: OrthodonticCalculatorProps) {
  const {
    config,
    value: budget,
    total,
    installmentCount,
    phaseCount,
    updateStandardField,
    updatePhaseField,
    updateRetainerPrice,
  } = useOrthodonticCalc({ plan, value, onChange })

  if (!config) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm text-slate-500">
        Seleccione primero un tipo de tratamiento en el plan para habilitar el presupuesto.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h5 className="text-sm font-semibold text-slate-800">
            Presupuesto y Plan de Pago de Ortodoncia
          </h5>
          <p className="mt-1 text-xs text-slate-500">{config.name}</p>
        </div>
        <div className="rounded-lg bg-dental-50 px-3 py-2 text-right">
          <p className="text-[11px] font-medium uppercase tracking-wide text-dental-700">
            Total estimado
          </p>
          <p className="text-lg font-semibold tabular-nums text-dental-800">
            {formatCurrency(total)}
          </p>
        </div>
      </div>

      {budget?.kind === 'standard' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            id="ortho-budget-initial"
            label="Pago inicial"
            value={budget.values.initialPayment}
            disabled={disabled}
            onChange={(initialPayment) => updateStandardField('initialPayment', initialPayment)}
          />
          <PlanDerivedField
            label="Número de cuotas"
            value={installmentCount}
          />
          <NumberField
            id="ortho-budget-control-price"
            label="Precio por cuota"
            value={budget.values.pricePerControl}
            disabled={disabled}
            onChange={(pricePerControl) => updateStandardField('pricePerControl', pricePerControl)}
          />
          <NumberField
            id="ortho-budget-retainer"
            label="Precio del retenedor"
            value={budget.values.retainerPrice}
            disabled={disabled}
            onChange={(retainerPrice) => updateStandardField('retainerPrice', retainerPrice)}
          />
        </div>
      ) : null}

      {budget?.kind === 'multi_phase' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <PlanDerivedField
              label="Número de fases"
              value={phaseCount}
              emptyLabel="Seleccione el número de fases en el plan de tratamiento"
            />
            <PlanDerivedField
              label="Número de cuotas por fase"
              value={installmentCount}
            />
          </div>

          {budget.values.phases.map((phase, phaseIndex) => (
            <div
              key={`phase-${phaseIndex}`}
              className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
            >
              <p className="mb-3 text-sm font-medium text-slate-800">
                {phase.phaseName || `Fase ${phaseIndex + 1}`}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  id={`ortho-phase-${phaseIndex}-initial`}
                  label="Pago inicial"
                  value={phase.initialPayment}
                  disabled={disabled}
                  onChange={(initialPayment) =>
                    updatePhaseField(phaseIndex, 'initialPayment', initialPayment)
                  }
                />
                <NumberField
                  id={`ortho-phase-${phaseIndex}-price`}
                  label="Precio por cuota"
                  value={phase.pricePerControl}
                  disabled={disabled}
                  onChange={(pricePerControl) =>
                    updatePhaseField(phaseIndex, 'pricePerControl', pricePerControl)
                  }
                />
              </div>
            </div>
          ))}

          <div className="max-w-sm">
            <NumberField
              id="ortho-budget-global-retainer"
              label="Precio del retenedor (global)"
              value={budget.values.retainerPrice}
              disabled={disabled}
              onChange={updateRetainerPrice}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
