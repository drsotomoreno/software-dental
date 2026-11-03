import { useEffect, useId, useRef, useState } from 'react'
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

const ORTHO_MODALITIES = [
  { id: 'brackets_metalicos', label: 'Ortodoncia con Brackets Metálicos' },
  { id: 'brackets_esteticos', label: 'Ortodoncia con Brackets Estéticos' },
  { id: 'alineadores', label: 'Ortodoncia con Alineadores' },
  { id: 'ortopedia_maxilar', label: 'Ortopedia Maxilar' },
]

const ORTHO_COST_ROWS = [
  { key: 'cuota_inicial', label: 'Cuota inicial', defaultQuantity: 1 },
  { key: 'controles', label: 'Controles', defaultQuantity: 1 },
  { key: 'retenedores', label: 'Retenedores', defaultQuantity: 1 },
]

function emptyOrthoCosts() {
  return {
    cuota_inicial: { quantity: 1, unitPrice: '' },
    controles: { quantity: 1, unitPrice: '' },
    retenedores: { quantity: 1, unitPrice: '' },
  }
}

function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

function parseMoney(value) {
  const parsed = Number(String(value).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : NaN
}

function parseQuantity(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.floor(parsed))
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

function newItemId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Presupuesto ágil sin diagnósticos previos.
 * Pensado para la vista de Nuevo Paciente (sustituye visualmente la sección 8).
 */
export function PresupuestoRapido({ patient = null, onItemsChange }) {
  const conceptoId = useId()
  const valorId = useId()
  const valorRef = useRef(null)
  const onItemsChangeRef = useRef(onItemsChange)
  onItemsChangeRef.current = onItemsChange

  const [concepto, setConcepto] = useState('')
  const [valor, setValor] = useState('')
  const [activeCategory, setActiveCategory] = useState(null)
  const [orthoModality, setOrthoModality] = useState(null)
  const [orthoCosts, setOrthoCosts] = useState(emptyOrthoCosts)
  const [items, setItems] = useState([])
  const [formError, setFormError] = useState('')

  const total = items.reduce((sum, item) => sum + item.valor, 0)
  const patientName = buildPatientLabel(patient)
  const patientDocument = buildDocumentLabel(patient)
  const emissionDate = new Date().toLocaleDateString('es-CO')
  const showOrthoPanel = activeCategory === 'ortodoncia'
  const showSimpleForm = activeCategory === 'implantes' || activeCategory === 'estetica'
  const selectedModality = ORTHO_MODALITIES.find((item) => item.id === orthoModality) ?? null

  useEffect(() => {
    onItemsChangeRef.current?.(items)
  }, [items])

  const selectCategory = (category) => {
    setFormError('')
    setActiveCategory(category.id)

    if (category.id === 'ortodoncia') {
      setConcepto('')
      setValor('')
      setOrthoModality(null)
      setOrthoCosts(emptyOrthoCosts())
      return
    }

    setOrthoModality(null)
    setOrthoCosts(emptyOrthoCosts())
    setConcepto(category.concepto)
    setValor('')
    requestAnimationFrame(() => {
      valorRef.current?.focus()
      valorRef.current?.select()
    })
  }

  const selectOrthoModality = (modality) => {
    setOrthoModality(modality.id)
    setFormError('')
  }

  const updateOrthoCost = (key, patch) => {
    setOrthoCosts((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }))
  }

  const addItem = () => {
    const trimmedConcepto = concepto.trim()
    const parsedValor = parseMoney(valor)

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
        id: newItemId(),
        concepto: trimmedConcepto,
        valor: parsedValor,
      },
    ])
    setConcepto('')
    setValor('')
    setActiveCategory(null)
    setFormError('')
  }

  const addOrthoPackage = () => {
    if (!selectedModality) {
      setFormError('Seleccione el tipo de ortodoncia.')
      return
    }

    const lines = []
    for (const row of ORTHO_COST_ROWS) {
      const cost = orthoCosts[row.key]
      const quantity = parseQuantity(cost.quantity)
      const unitPrice = parseMoney(cost.unitPrice)
      if (!quantity || !Number.isFinite(unitPrice) || unitPrice <= 0) continue
      const lineTotal = quantity * unitPrice
      const qtyLabel = quantity > 1 ? ` × ${quantity}` : ''
      lines.push({
        id: newItemId(),
        concepto: `${selectedModality.label} — ${row.label}${qtyLabel}`,
        valor: lineTotal,
      })
    }

    if (lines.length === 0) {
      setFormError('Asigne valor a cuota inicial, controles y/o retenedores.')
      return
    }

    setItems((prev) => [...prev, ...lines])
    setOrthoCosts(emptyOrthoCosts())
    setOrthoModality(null)
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
            Cotice al instante sin diagnósticos previos. En ortodoncia elija modalidad y asigne
            valores a cuota inicial, controles y retenedores.
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

        {showOrthoPanel ? (
          <div className="space-y-4 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-800">
                Tipo de ortodoncia
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ORTHO_MODALITIES.map((modality) => {
                  const isSelected = orthoModality === modality.id
                  return (
                    <button
                      key={modality.id}
                      type="button"
                      onClick={() => selectOrthoModality(modality)}
                      className={`rounded-lg border-2 px-3 py-3 text-left text-sm font-semibold transition ${
                        isSelected
                          ? 'border-sky-500 bg-white text-sky-950 ring-2 ring-sky-300'
                          : 'border-sky-200 bg-white/80 text-sky-900 hover:border-sky-400 hover:bg-white'
                      }`}
                    >
                      {modality.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {selectedModality ? (
              <div className="space-y-3 rounded-lg border border-sky-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-800">
                  {selectedModality.label}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    Asigne cantidad y valor a cada rubro
                  </span>
                </p>

                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Rubro</th>
                        <th className="w-24 px-3 py-2 font-semibold">Cant.</th>
                        <th className="w-36 px-3 py-2 font-semibold">Valor unit. ($)</th>
                        <th className="w-32 px-3 py-2 text-right font-semibold">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ORTHO_COST_ROWS.map((row) => {
                        const cost = orthoCosts[row.key]
                        const quantity = parseQuantity(cost.quantity)
                        const unitPrice = parseMoney(cost.unitPrice)
                        const subtotal =
                          quantity > 0 && Number.isFinite(unitPrice) && unitPrice > 0
                            ? quantity * unitPrice
                            : 0
                        return (
                          <tr key={row.key}>
                            <td className="px-3 py-2.5 font-medium text-slate-900">{row.label}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                aria-label={`Cantidad de ${row.label}`}
                                value={cost.quantity}
                                onChange={(event) =>
                                  updateOrthoCost(row.key, { quantity: event.target.value })
                                }
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="1000"
                                inputMode="numeric"
                                aria-label={`Valor de ${row.label}`}
                                value={cost.unitPrice}
                                onChange={(event) =>
                                  updateOrthoCost(row.key, { unitPrice: event.target.value })
                                }
                                placeholder="0"
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                              {subtotal > 0 ? formatCOP(subtotal) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={addOrthoPackage}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Agregar ortodoncia
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-sky-800">
                Seleccione una modalidad para cargar cuota inicial, controles y retenedores.
              </p>
            )}
          </div>
        ) : null}

        {showSimpleForm ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <div>
              <label
                htmlFor={conceptoId}
                className="mb-1 block text-xs font-semibold text-slate-600"
              >
                Concepto
              </label>
              <input
                id={conceptoId}
                type="text"
                value={concepto}
                onChange={(event) => setConcepto(event.target.value)}
                placeholder="Ej. Implantes"
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
        ) : null}

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
                    Aún no hay ítems. Use los botones rápidos para cotizar.
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
