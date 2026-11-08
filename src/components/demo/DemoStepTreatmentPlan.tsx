import { useMemo, useState } from 'react'
import { AlertTriangle, Calculator, Info, Search, Trash2 } from 'lucide-react'
import { CUPS_ODONTOLOGIA, type CupsOdontologyEntry } from '@/constants/cupsOdontologyData'
import { formatCurrency } from '@/utils/crypto'
import { demoTreatmentTotal, type DemoTreatmentRow } from './demoTypes'

interface DemoStepTreatmentPlanProps {
  treatmentRow: DemoTreatmentRow | null
  onChange: (row: DemoTreatmentRow | null) => void
}

const LIMIT_MESSAGE =
  'Límite alcanzado en la demo. En la versión paga, los procedimientos y calculadoras de presupuesto son ilimitados.'

const SUGGESTED_CODES = ['890203', '890303', '997102', '997301', '230103', '997201']

function normalizeCupsQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
}

function formatCupsDisplay(code: string): string {
  const digits = code.replace(/\D/g, '').padStart(6, '0').slice(-6)
  if (digits.length !== 6) return code
  return `${digits.slice(0, 2)}.${digits.slice(2, 3)}.${digits.slice(3)}`
}

function searchCupsCatalog(query: string, limit = 40): CupsOdontologyEntry[] {
  const q = normalizeCupsQuery(query)
  if (!q) {
    return SUGGESTED_CODES.map((code) =>
      CUPS_ODONTOLOGIA.find((item) => item.codigo === code),
    ).filter((item): item is CupsOdontologyEntry => Boolean(item))
  }

  const results: CupsOdontologyEntry[] = []
  for (const entry of CUPS_ODONTOLOGIA) {
    const blob = normalizeCupsQuery(`${entry.codigo} ${entry.descripcion} ${entry.categoria}`)
    if (!blob.includes(q) && !entry.codigo.includes(q.replace(/\D/g, ''))) continue
    results.push(entry)
    if (results.length >= limit) break
  }
  return results
}

/** Paso 5 — Plan de tratamiento desde catálogo CUPS (máx. 1 procedimiento). */
export function DemoStepTreatmentPlan({ treatmentRow, onChange }: DemoStepTreatmentPlanProps) {
  const [query, setQuery] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState('')
  const [pending, setPending] = useState<CupsOdontologyEntry | null>(null)
  const [showLimitWarning, setShowLimitWarning] = useState(false)

  const filtered = useMemo(() => searchCupsCatalog(query), [query])
  const qty = Number(quantity) || 0
  const cost = Number(unitCost.replace(/,/g, '.')) || 0
  const previewTotal = Math.max(0, qty) * Math.max(0, cost)
  const hasRow = treatmentRow !== null

  const handlePick = (entry: CupsOdontologyEntry) => {
    if (hasRow) {
      setShowLimitWarning(true)
      return
    }
    setPending(entry)
    setShowLimitWarning(false)
    setQuery('')
  }

  const handleAdd = () => {
    if (hasRow) {
      setShowLimitWarning(true)
      return
    }
    if (!pending || qty <= 0 || cost < 0) return
    onChange({
      cupsCode: pending.codigo,
      procedureName: pending.descripcion,
      quantity: qty,
      unitCost: cost,
    })
    setPending(null)
    setQuantity('1')
    setUnitCost('')
    setShowLimitWarning(false)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-dental-600">Paso 5 de 9</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-800">Plan de tratamiento</h2>
      <p className="mt-2 text-sm text-slate-500">
        Elija un procedimiento del catálogo CUPS odontológico y calcule su costo. En esta demo solo
        se permite un código.
      </p>

      <div className="mt-6 flex items-start gap-2 rounded-lg border border-dental-200 bg-dental-50 px-4 py-3 text-sm text-dental-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-dental-600" aria-hidden />
        <p>En la versión paga, los procedimientos y calculadoras de presupuesto son ilimitados.</p>
      </div>

      <div className="relative mt-6">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar CUPS odontológico (ej. 890203, obturación, exodoncia…)"
          disabled={hasRow}
          className="input-field pl-10 disabled:bg-slate-100 disabled:text-slate-500"
          aria-label="Buscar procedimiento CUPS"
        />
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {query.trim()
          ? `${filtered.length} resultado${filtered.length === 1 ? '' : 's'} del catálogo`
          : `Sugerencias frecuentes · ${CUPS_ODONTOLOGIA.length} códigos CUPS disponibles`}
      </p>

      {!hasRow && (
        <ul className="mt-3 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-slate-500">
              No hay coincidencias en el catálogo CUPS odontológico.
            </li>
          ) : (
            filtered.map((item) => {
              const selected = pending?.codigo === item.codigo
              return (
                <li key={item.codigo}>
                  <button
                    type="button"
                    onClick={() => handlePick(item)}
                    aria-pressed={selected}
                    className={[
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition',
                      selected ? 'bg-dental-50' : 'bg-white hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                        selected
                          ? 'border-dental-600 bg-dental-600 text-white'
                          : 'border-slate-300 bg-white',
                      ].join(' ')}
                      aria-hidden
                    >
                      {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800">
                        {formatCupsDisplay(item.codigo)}
                      </span>
                      <span className="block text-sm text-slate-600">{item.descripcion}</span>
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}

      {pending && !hasRow && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Calculator className="h-4 w-4 text-dental-600" aria-hidden />
            Calculadora básica
          </div>

          <div className="mb-4 rounded-lg border border-dental-100 bg-white px-3 py-2 text-sm">
            <p className="font-semibold text-dental-800">{formatCupsDisplay(pending.codigo)}</p>
            <p className="text-slate-600">{pending.descripcion}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="demo-procedure-qty" className="mb-1 block text-sm font-medium text-slate-700">
                Cantidad
              </label>
              <input
                id="demo-procedure-qty"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="input-field"
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
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0"
                className="input-field"
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
              disabled={qty <= 0}
              className="btn-primary disabled:cursor-not-allowed"
            >
              Agregar al plan
            </button>
          </div>
        </div>
      )}

      {showLimitWarning && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <p>{LIMIT_MESSAGE}</p>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">CUPS</th>
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
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Aún no hay procedimientos en el plan.
                </td>
              </tr>
            ) : (
              <tr className="bg-white">
                <td className="px-4 py-3 font-semibold text-slate-800">
                  {formatCupsDisplay(treatmentRow.cupsCode)}
                </td>
                <td className="px-4 py-3 text-slate-700">{treatmentRow.procedureName}</td>
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
                      setPending(null)
                      setShowLimitWarning(false)
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
