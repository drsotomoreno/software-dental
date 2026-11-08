import { useState } from 'react'
import { Calculator, Info, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/utils/crypto'
import { demoTreatmentTotal, type DemoTreatmentRow } from './demoTypes'

interface DemoStepTreatmentPlanProps {
  treatmentRow: DemoTreatmentRow | null
  onChange: (row: DemoTreatmentRow | null) => void
}

const EMPTY_DRAFT = {
  procedureName: '',
  quantity: '1',
  unitCost: '',
}

/** Paso 5 — Plan de tratamiento con calculadora básica (máx. 1 fila). */
export function DemoStepTreatmentPlan({ treatmentRow, onChange }: DemoStepTreatmentPlanProps) {
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [limitMessage, setLimitMessage] = useState(false)

  const quantity = Number(draft.quantity) || 0
  const unitCost = Number(draft.unitCost.replace(/,/g, '.')) || 0
  const previewTotal = Math.max(0, quantity) * Math.max(0, unitCost)
  const hasRow = treatmentRow !== null

  const handleAdd = () => {
    if (hasRow) {
      setLimitMessage(true)
      return
    }
    const name = draft.procedureName.trim()
    if (!name || quantity <= 0 || unitCost < 0) return

    onChange({
      procedureName: name,
      quantity,
      unitCost,
    })
    setDraft(EMPTY_DRAFT)
    setLimitMessage(false)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-dental-600">Paso 5 de 10</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-800">Plan de tratamiento</h2>
      <p className="mt-2 text-sm text-slate-500">
        Agregue un procedimiento y calcule su costo. En esta demo solo se permite una fila.
      </p>

      <div className="mt-6 flex items-start gap-2 rounded-lg border border-dental-200 bg-dental-50 px-4 py-3 text-sm text-dental-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-dental-600" aria-hidden />
        <p>En la versión paga, los procedimientos y calculadoras de presupuesto son ilimitados.</p>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Calculator className="h-4 w-4 text-dental-600" aria-hidden />
          Calculadora básica
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="demo-procedure-name" className="mb-1 block text-sm font-medium text-slate-700">
              Procedimiento
            </label>
            <input
              id="demo-procedure-name"
              type="text"
              value={draft.procedureName}
              onChange={(e) => setDraft((prev) => ({ ...prev, procedureName: e.target.value }))}
              placeholder="Ej. Obturación resina molar"
              disabled={hasRow}
              className="input-field disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>
          <div>
            <label htmlFor="demo-procedure-qty" className="mb-1 block text-sm font-medium text-slate-700">
              Cantidad
            </label>
            <input
              id="demo-procedure-qty"
              type="number"
              min={1}
              step={1}
              value={draft.quantity}
              onChange={(e) => setDraft((prev) => ({ ...prev, quantity: e.target.value }))}
              disabled={hasRow}
              className="input-field disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>
          <div>
            <label htmlFor="demo-procedure-cost" className="mb-1 block text-sm font-medium text-slate-700">
              Costo unitario (COP)
            </label>
            <input
              id="demo-procedure-cost"
              type="number"
              min={0}
              step={1000}
              value={draft.unitCost}
              onChange={(e) => setDraft((prev) => ({ ...prev, unitCost: e.target.value }))}
              placeholder="0"
              disabled={hasRow}
              className="input-field disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-sm text-slate-600">
            Total calculado:{' '}
            <span className="font-semibold text-slate-800">{formatCurrency(previewTotal)}</span>
          </p>
          <button
            type="button"
            onClick={handleAdd}
            disabled={hasRow || !draft.procedureName.trim() || quantity <= 0}
            className="btn-primary disabled:cursor-not-allowed"
          >
            Agregar al plan
          </button>
        </div>
      </div>

      {limitMessage && (
        <p role="alert" className="mt-3 text-sm text-amber-800">
          Solo se permite una fila en la demo. Elimine la fila actual si desea reemplazarla.
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Procedimiento</th>
              <th className="px-4 py-2 font-medium">Cant.</th>
              <th className="px-4 py-2 font-medium">Unitario</th>
              <th className="px-4 py-2 font-medium">Total</th>
              <th className="px-4 py-2 font-medium">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {!treatmentRow ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Aún no hay procedimientos en el plan.
                </td>
              </tr>
            ) : (
              <tr className="bg-white">
                <td className="px-4 py-3 font-medium text-slate-800">{treatmentRow.procedureName}</td>
                <td className="px-4 py-3 text-slate-600">{treatmentRow.quantity}</td>
                <td className="px-4 py-3 text-slate-600">
                  {formatCurrency(treatmentRow.unitCost)}
                </td>
                <td className="px-4 py-3 font-semibold text-dental-700">
                  {formatCurrency(demoTreatmentTotal(treatmentRow))}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      onChange(null)
                      setLimitMessage(false)
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    title="Eliminar fila"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Quitar
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
