import type {
  EndoComplexityLevel,
  EndodonticBudgetState,
  EndoToothBudgetLine,
} from '@/types/endoAnnex.types'
import { ENDO_FDI_TEETH } from '@/types/endoAnnex.types'
import {
  calculateEndoBudget,
  calculateEndoBudgetTotal,
  createEmptyEndodonticBudget,
} from '@/utils/endoAnnex'
import { formatCurrency } from '@/utils/crypto'

interface EndodonticBudgetSectionProps {
  complexityLevel: EndoComplexityLevel | ''
  isRetreatment: boolean
  currentToothNumber: number | null
  value: EndodonticBudgetState | null
  onChange: (value: EndodonticBudgetState) => void
  disabled?: boolean
}

function parsePrice(raw: string): number {
  const parsed = Number(raw.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed)
}

export function EndodonticBudgetSection({
  complexityLevel,
  isRetreatment,
  currentToothNumber,
  value,
  onChange,
  disabled = false,
}: EndodonticBudgetSectionProps) {
  const budget = value ?? createEmptyEndodonticBudget()
  const total = calculateEndoBudgetTotal(budget)
  const suggested = calculateEndoBudget(complexityLevel, isRetreatment)

  const updateBudget = (patch: Partial<EndodonticBudgetState>) => {
    onChange({ ...budget, ...patch })
  }

  const updateLine = (index: number, patch: Partial<EndoToothBudgetLine>) => {
    const toothLines = budget.toothLines.map((line, lineIndex) =>
      lineIndex === index ? { ...line, ...patch } : line,
    )
    updateBudget({ toothLines })
  }

  const removeLine = (index: number) => {
    updateBudget({ toothLines: budget.toothLines.filter((_, lineIndex) => lineIndex !== index) })
  }

  const addLine = () => {
    const nextTooth = currentToothNumber ?? ENDO_FDI_TEETH[0]
    if (budget.toothLines.some((line) => line.toothNumber === nextTooth)) {
      const available = ENDO_FDI_TEETH.find(
        (tooth) => !budget.toothLines.some((line) => line.toothNumber === tooth),
      )
      if (!available) return
      updateBudget({
        toothLines: [
          ...budget.toothLines,
          { toothNumber: available, unitPrice: suggested },
        ].sort((a, b) => a.toothNumber - b.toothNumber),
      })
      return
    }
    updateBudget({
      toothLines: [
        ...budget.toothLines,
        { toothNumber: nextTooth, unitPrice: suggested },
      ].sort((a, b) => a.toothNumber - b.toothNumber),
    })
  }

  const applySuggestedToEmpty = () => {
    if (!suggested) return
    updateBudget({
      toothLines: budget.toothLines.map((line) =>
        line.unitPrice > 0 ? line : { ...line, unitPrice: suggested },
      ),
    })
  }

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h6 className="text-xs font-semibold text-slate-800">Presupuesto Endodóntico</h6>
        <label className="clinical-todo-normal-label">
          <input
            type="checkbox"
            disabled={disabled}
            checked={budget.active}
            onChange={(event) => updateBudget({ active: event.target.checked })}
            className="rounded border-green-300 text-dental-600 focus:ring-dental-500"
          />
          Incluir en presupuesto general
        </label>
      </div>

      {suggested > 0 && (
        <p className="mb-2 text-[11px] text-slate-500">
          Precio sugerido por pieza ({complexityLevel}
          {isRetreatment ? ', reendodoncia' : ''}):{' '}
          <strong>{formatCurrency(suggested)}</strong>
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-1 py-1.5 font-medium">Pieza FDI</th>
              <th className="px-1 py-1.5 font-medium">Precio (COP)</th>
              <th className="px-1 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {budget.toothLines.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-1 py-2 text-slate-500">
                  Agregue piezas para presupuestar endodoncias.
                </td>
              </tr>
            ) : (
              budget.toothLines.map((line, index) => (
                <tr key={`${line.toothNumber}-${index}`} className="border-b border-slate-100">
                  <td className="px-1 py-1">
                    <select
                      disabled={disabled}
                      value={line.toothNumber}
                      onChange={(event) =>
                        updateLine(index, { toothNumber: Number(event.target.value) })
                      }
                      className="input-field w-20 px-1 py-1 text-xs"
                    >
                      {ENDO_FDI_TEETH.map((tooth) => (
                        <option key={tooth} value={tooth}>
                          {tooth}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min={0}
                      disabled={disabled}
                      value={line.unitPrice || ''}
                      onChange={(event) =>
                        updateLine(index, { unitPrice: parsePrice(event.target.value) })
                      }
                      className="input-field w-28 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-1 py-1 text-right">
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => removeLine(index)}
                        className="text-slate-400 hover:text-red-600"
                        aria-label="Quitar pieza"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {!disabled && (
            <>
              <button
                type="button"
                onClick={addLine}
                className="text-xs font-medium text-dental-600 hover:underline"
              >
                + Agregar pieza
              </button>
              {suggested > 0 && (
                <button
                  type="button"
                  onClick={applySuggestedToEmpty}
                  className="text-xs font-medium text-slate-600 hover:underline"
                >
                  Aplicar precio sugerido
                </button>
              )}
            </>
          )}
        </div>
        <p className="text-sm font-bold text-dental-800">
          Total: {formatCurrency(total)}
        </p>
      </div>

      <div className="mt-2">
        <label className="label-field" htmlFor="endo-budget-notes">
          Notas del presupuesto
        </label>
        <input
          id="endo-budget-notes"
          disabled={disabled}
          value={budget.notes}
          onChange={(event) => updateBudget({ notes: event.target.value })}
          placeholder="Ej.: incluye reconstrucción provisional..."
          className="input-field text-sm"
        />
      </div>
    </div>
  )
}
