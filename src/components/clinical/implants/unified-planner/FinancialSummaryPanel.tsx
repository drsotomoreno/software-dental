import type { UnifiedImplantPlan, UnifiedImplantUnitPrices } from '@/types/unifiedImplantPlan'
import { calcUnifiedFinancialSummary } from '@/types/unifiedImplantPlan'
import { formatCurrency } from '@/utils/crypto'
import { fieldControlClass, fieldLabelClass } from './fieldStyles'

interface FinancialSummaryPanelProps {
  plan: UnifiedImplantPlan
  disabled?: boolean
  tabIndexBase?: number
  onPricesChange: (prices: UnifiedImplantUnitPrices) => void
}

export function FinancialSummaryPanel({
  plan,
  disabled = false,
  tabIndexBase = 60,
  onPricesChange,
}: FinancialSummaryPanelProps) {
  const summary = calcUnifiedFinancialSummary(plan)
  const prices = plan.preciosReferencia

  const updatePrice = (key: keyof UnifiedImplantUnitPrices, raw: string) => {
    const parsed = Number(raw)
    onPricesChange({
      ...prices,
      [key]: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
    })
  }

  const priceFields = [
    ['implante', 'Implante', 0],
    ['pilar', 'Pilar', 1],
    ['corona', 'Corona', 2],
  ] as const

  return (
    <aside className="sticky bottom-0 z-10 space-y-3 rounded-xl border border-teal-200 bg-white/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/90 lg:sticky lg:top-4 lg:bottom-auto">
      <div>
        <h4 className="text-sm font-semibold text-teal-900">Resumen financiero</h4>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Tiempo real · Implante = base + pilar + corona · Póntico = solo corona
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {priceFields.map(([key, label, offset]) => (
          <label key={key} className={fieldLabelClass}>
            <span className="text-[10px]">{label} (COP)</span>
            <input
              type="number"
              min={0}
              step={1000}
              inputMode="numeric"
              disabled={disabled}
              tabIndex={disabled ? -1 : tabIndexBase + offset}
              aria-label={`Precio base ${label}`}
              value={prices[key]}
              onChange={(e) => updatePrice(key, e.target.value)}
              className={`${fieldControlClass} bg-slate-50 px-2 py-1.5 text-xs font-medium`}
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
          {summary.implantCount} implante{summary.implantCount === 1 ? '' : 's'}
        </span>
        <span className="rounded-full bg-orange-50 px-2 py-0.5 font-medium text-orange-800">
          {summary.ponticCount} póntico{summary.ponticCount === 1 ? '' : 's'}
        </span>
      </div>

      <ul className="max-h-40 space-y-1.5 overflow-y-auto text-xs" aria-live="polite">
        {summary.lines.length === 0 ? (
          <li className="text-slate-400">Sin posiciones planificadas.</li>
        ) : (
          summary.lines.map((line) => (
            <li
              key={`${line.arch}-${line.treatment.id}`}
              className="flex items-start justify-between gap-2 border-b border-slate-100 pb-1.5"
            >
              <span className="min-w-0 flex-1 text-slate-600">{line.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                {formatCurrency(line.cost.total)}
              </span>
            </li>
          ))
        )}
      </ul>

      <dl className="space-y-1 border-t border-slate-200 pt-2 text-xs">
        <div className="flex justify-between text-slate-600">
          <dt>Fase quirúrgica</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(summary.surgicalTotal)}</dd>
        </div>
        <div className="flex justify-between text-slate-600">
          <dt>Fase protésica</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(summary.prostheticTotal)}</dd>
        </div>
        <div className="flex justify-between text-sm font-semibold text-teal-900">
          <dt>Total estimado</dt>
          <dd className="tabular-nums">{formatCurrency(summary.grandTotal)}</dd>
        </div>
      </dl>
    </aside>
  )
}
