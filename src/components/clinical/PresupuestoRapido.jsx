import { useId, useRef, useState } from 'react'
import { AlignVerticalJustifyCenter, Plus, Printer, Sparkles, Trash2, Bone } from 'lucide-react'

const CLINIC_NAME = 'Clínica Dental Dr. Mauricio Soto'

const QUICK_CATEGORIES = [
  {
    id: 'ortodoncia',
    label: 'Ortodoncia',
    concepto: 'Ortodoncia',
    icon: AlignVerticalJustifyCenter,
    accent: 'border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100 focus-visible:ring-sky-400',
  },
  {
    id: 'implantes',
    label: 'Implantes',
    concepto: 'Implantes',
    icon: Bone,
    accent:
      'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 focus-visible:ring-emerald-400',
  },
  {
    id: 'estetica',
    label: 'Restauración / Estética',
    concepto: 'Restauración / Estética',
    icon: Sparkles,
    accent:
      'border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100 focus-visible:ring-violet-400',
  },
]

function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

function buildPatientLabel(patient) {
  if (!patient) return 'Paciente sin identificar'
  const name = [patient.firstName, patient.lastName].filter(Boolean).join(' ').trim()
  return name || 'Paciente sin identificar'
}

function buildDocumentLabel(patient) {
  if (!patient) return '—'
  const type = patient.documentType?.trim() || 'Doc'
  const number = patient.documentNumber?.trim()
  return number ? `${type} ${number}` : '—'
}

/**
 * Presupuesto ágil sin diagnósticos previos.
 * Pensado para la vista de Nuevo Paciente.
 */
export function PresupuestoRapido({ patient = null }) {
  const conceptoId = useId()
  const valorId = useId()
  const valorRef = useRef(null)

  const [concepto, setConcepto] = useState('')
  const [valor, setValor] = useState('')
  const [activeCategory, setActiveCategory] = useState(null)
  const [items, setItems] = useState([])
  const [formError, setFormError] = useState('')

  const total = items.reduce((sum, item) => sum + item.valor, 0)
  const patientName = buildPatientLabel(patient)
  const patientDocument = buildDocumentLabel(patient)
  const emissionDate = new Date().toLocaleDateString('es-CO')

  const selectCategory = (category) => {
    setActiveCategory(category.id)
    setConcepto(category.concepto)
    setFormError('')
    requestAnimationFrame(() => {
      valorRef.current?.focus()
      valorRef.current?.select()
    })
  }

  const addItem = () => {
    const trimmedConcepto = concepto.trim()
    const parsedValor = Number(String(valor).replace(/\./g, '').replace(',', '.'))

    if (!trimmedConcepto) {
      setFormError('Indique el concepto del ítem.')
      return
    }
    if (!Number.isFinite(parsedValor) || parsedValor <= 0) {
      setFormError('Ingrese un valor mayor a cero.')
      valorRef.current?.focus()
      return
    }

    setItems((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        concepto: trimmedConcepto,
        valor: parsedValor,
      },
    ])
    setConcepto('')
    setValor('')
    setActiveCategory(null)
    setFormError('')
  }

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handlePrint = () => {
    window.print()
  }

  const handleValorKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addItem()
    }
  }

  return (
    <section className="presupuesto-rapido rounded-xl border-2 border-teal-300 bg-white shadow-md ring-1 ring-teal-100">
      {/* UI interactiva — oculta al imprimir */}
      <div className="space-y-5 p-5 print:hidden sm:p-6">
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
          <h2 className="text-lg font-bold text-teal-950">Presupuesto Rápido</h2>
          <p className="mt-1 text-sm text-teal-800">
            Cotice al instante sin diagnósticos previos. Elija una categoría, digite el valor y
            agregue.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {QUICK_CATEGORIES.map((category) => {
            const Icon = category.icon
            const isActive = activeCategory === category.id
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => selectCategory(category)}
                className={`flex min-h-[4.5rem] items-center justify-center gap-2 rounded-xl border-2 px-4 py-4 text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 ${category.accent} ${
                  isActive ? 'ring-2 ring-offset-2' : ''
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span className="text-center leading-tight">{category.label}</span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <div>
            <label htmlFor={conceptoId} className="mb-1 block text-xs font-semibold text-slate-600">
              Concepto
            </label>
            <input
              id={conceptoId}
              type="text"
              value={concepto}
              onChange={(event) => setConcepto(event.target.value)}
              placeholder="Ej. Ortodoncia"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
            />
          </div>
          <div>
            <label htmlFor={valorId} className="mb-1 block text-xs font-semibold text-slate-600">
              Valor ($)
            </label>
            <input
              id={valorId}
              ref={valorRef}
              type="number"
              min="0"
              step="1000"
              inputMode="numeric"
              value={valor}
              onChange={(event) => setValor(event.target.value)}
              onKeyDown={handleValorKeyDown}
              placeholder="0"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
            />
          </div>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Agregar
          </button>
        </div>

        {formError ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="px-4 py-3 font-semibold">Concepto</th>
                <th className="px-4 py-3 text-right font-semibold">Valor</th>
                <th className="w-14 px-3 py-3 text-center font-semibold">
                  <span className="sr-only">Eliminar</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                    Aún no hay ítems. Use los botones rápidos o escriba un concepto.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="bg-white">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.concepto}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {formatCOP(item.valor)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="inline-flex rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label={`Eliminar ${item.concepto}`}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-teal-950">
            <span className="text-xs font-semibold uppercase tracking-wide text-teal-700">
              Total
            </span>
            <p className="text-2xl font-bold tabular-nums">{formatCOP(total)}</p>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            disabled={items.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-5 w-5" aria-hidden />
            Imprimir Presupuesto
          </button>
        </div>
      </div>

      {/* Documento de impresión — solo visible en @media print */}
      <div className="hidden print:block print:bg-white print:p-0 print:text-black">
        <header className="mb-8 border-b-2 border-slate-900 pb-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            Presupuesto odontológico
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">{CLINIC_NAME}</h1>
          <p className="mt-1 text-sm text-slate-600">Fecha de emisión: {emissionDate}</p>
        </header>

        <section className="mb-8">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Datos del paciente
          </h2>
          <p className="text-base font-bold text-slate-900">{patientName}</p>
          <p className="text-sm text-slate-700">
            <span className="font-semibold">Identificación:</span> {patientDocument}
          </p>
          {patient?.phone ? (
            <p className="text-sm text-slate-700">
              <span className="font-semibold">Teléfono:</span> {patient.phone}
            </p>
          ) : null}
          {patient?.email ? (
            <p className="text-sm text-slate-700">
              <span className="font-semibold">Email:</span> {patient.email}
            </p>
          ) : null}
        </section>

        <table className="mb-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-900 text-left">
              <th className="py-2 pr-4 font-bold">Concepto</th>
              <th className="py-2 text-right font-bold">Valor</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-200">
                <td className="py-2.5 pr-4 text-slate-900">{item.concepto}</td>
                <td className="py-2.5 text-right tabular-nums text-slate-800">
                  {formatCOP(item.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end border-t-2 border-slate-900 pt-4">
          <div className="min-w-[14rem] text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total</p>
            <p className="text-2xl font-extrabold tabular-nums text-slate-900">{formatCOP(total)}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default PresupuestoRapido
