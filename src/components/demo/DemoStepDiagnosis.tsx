import { useMemo, useState } from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import { DEMO_CIE10_DIAGNOSES } from './demoTypes'

interface DemoStepDiagnosisProps {
  selectedDiagnosisCode: string | null
  onChange: (code: string | null) => void
}

const LIMIT_MESSAGE =
  'Límite alcanzado en la demo. En la versión paga los diagnósticos son ilimitados.'

/** Paso 4 — Buscador CIE-10 con selección única (demo limitada). */
export function DemoStepDiagnosis({
  selectedDiagnosisCode,
  onChange,
}: DemoStepDiagnosisProps) {
  const [query, setQuery] = useState('')
  const [showLimitWarning, setShowLimitWarning] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return DEMO_CIE10_DIAGNOSES
    return DEMO_CIE10_DIAGNOSES.filter(
      (item) =>
        item.code.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
    )
  }, [query])

  const handleSelect = (code: string) => {
    if (selectedDiagnosisCode === code) {
      onChange(null)
      setShowLimitWarning(false)
      return
    }

    if (selectedDiagnosisCode && selectedDiagnosisCode !== code) {
      setShowLimitWarning(true)
      return
    }

    onChange(code)
    setShowLimitWarning(false)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-dental-600">Paso 4 de 10</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-800">Diagnóstico CIE-10</h2>
      <p className="mt-2 text-sm text-slate-500">
        Busque y seleccione un diagnóstico dental. En esta demo solo puede elegir uno.
      </p>

      <div className="relative mt-8">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por código o descripción (ej. K02, caries…)"
          className="input-field pl-10"
          aria-label="Buscar diagnóstico CIE-10"
        />
      </div>

      <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
        {filtered.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-slate-500">
            No hay coincidencias en la lista de demostración.
          </li>
        ) : (
          filtered.map((item) => {
            const selected = selectedDiagnosisCode === item.code
            const blocked = Boolean(selectedDiagnosisCode && !selected)
            return (
              <li key={item.code}>
                <button
                  type="button"
                  onClick={() => handleSelect(item.code)}
                  aria-pressed={selected}
                  className={[
                    'flex w-full items-start gap-3 px-4 py-3 text-left transition',
                    selected
                      ? 'bg-dental-50'
                      : blocked
                        ? 'bg-white opacity-70 hover:bg-amber-50'
                        : 'bg-white hover:bg-slate-50',
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
                    {selected ? (
                      <span className="h-2 w-2 rounded-full bg-white" />
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">{item.code}</span>
                    <span className="block text-sm text-slate-600">{item.description}</span>
                  </span>
                </button>
              </li>
            )
          })
        )}
      </ul>

      {showLimitWarning && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <p>{LIMIT_MESSAGE}</p>
        </div>
      )}

      {selectedDiagnosisCode && !showLimitWarning && (
        <p className="mt-4 text-sm text-slate-500">
          Seleccionado:{' '}
          <span className="font-medium text-slate-700">
            {DEMO_CIE10_DIAGNOSES.find((d) => d.code === selectedDiagnosisCode)?.code} —{' '}
            {DEMO_CIE10_DIAGNOSES.find((d) => d.code === selectedDiagnosisCode)?.description}
          </span>
          . Pulse de nuevo para quitarlo.
        </p>
      )}
    </div>
  )
}
