import { useMemo, useState } from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import { CIE10_DATA } from '@/data/cie10Data'
import { getDefaultCie10SearchEngine } from '@/services/Cie10SearchEngine'
import type { DemoDiagnosis } from './demoTypes'

interface DemoStepDiagnosisProps {
  selectedDiagnosis: DemoDiagnosis | null
  onChange: (diagnosis: DemoDiagnosis | null) => void
}

const LIMIT_MESSAGE =
  'Límite alcanzado en la demo. En la versión paga los diagnósticos son ilimitados.'

const SUGGESTED_CODES = ['K02.1', 'K04.0', 'K05.1', 'K05.3', 'K07.6', 'K08.1', 'S02.5', 'Z01.20']

function findCie10Entry(code: string): DemoDiagnosis | null {
  const entry = CIE10_DATA.find((item) => item.code === code)
  return entry ? { code: entry.code, description: entry.description } : null
}

const SUGGESTED_DIAGNOSES: DemoDiagnosis[] = SUGGESTED_CODES.map(findCie10Entry).filter(
  (item): item is DemoDiagnosis => Boolean(item),
)

/** Paso 4 — Buscador del catálogo CIE-10 odontológico (selección única). */
export function DemoStepDiagnosis({ selectedDiagnosis, onChange }: DemoStepDiagnosisProps) {
  const [query, setQuery] = useState('')
  const [showLimitWarning, setShowLimitWarning] = useState(false)
  const engine = useMemo(() => getDefaultCie10SearchEngine(), [])

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return SUGGESTED_DIAGNOSES
    return engine.search(q, 40)
  }, [engine, query])

  const handleSelect = (item: DemoDiagnosis) => {
    if (selectedDiagnosis?.code === item.code) {
      onChange(null)
      setShowLimitWarning(false)
      return
    }

    if (selectedDiagnosis && selectedDiagnosis.code !== item.code) {
      setShowLimitWarning(true)
      return
    }

    onChange(item)
    setShowLimitWarning(false)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-dental-600">Paso 4 de 9</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-800">Diagnóstico CIE-10</h2>
      <p className="mt-2 text-sm text-slate-500">
        Busque cualquier diagnóstico del catálogo CIE odontológico. En esta demo solo puede
        seleccionar un código.
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
          placeholder="Buscar en el catálogo CIE-10 (ej. K02, caries, pulpitis, ATM…)"
          className="input-field pl-10"
          aria-label="Buscar diagnóstico CIE-10"
        />
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {query.trim()
          ? `${filtered.length} resultado${filtered.length === 1 ? '' : 's'} del catálogo`
          : `Sugerencias frecuentes · ${CIE10_DATA.length} códigos disponibles en el catálogo`}
      </p>

      <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
        {filtered.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-slate-500">
            No hay coincidencias en el catálogo CIE odontológico.
          </li>
        ) : (
          filtered.map((item) => {
            const selected = selectedDiagnosis?.code === item.code
            const blocked = Boolean(selectedDiagnosis && !selected)
            return (
              <li key={item.code}>
                <button
                  type="button"
                  onClick={() => handleSelect(item)}
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
                    {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
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

      {selectedDiagnosis && !showLimitWarning && (
        <p className="mt-4 text-sm text-slate-500">
          Seleccionado:{' '}
          <span className="font-medium text-slate-700">
            {selectedDiagnosis.code} — {selectedDiagnosis.description}
          </span>
          . Pulse de nuevo para quitarlo.
        </p>
      )}
    </div>
  )
}
