import { Search, X } from 'lucide-react'
import { formatShownCount, PATIENT_LIST_SEARCH_PLACEHOLDER } from '@/utils/patientListSearch'

type PatientListSearchProps = {
  id: string
  label: string
  query: string
  onQueryChange: (value: string) => void
  shown: number
  total: number
}

export function PatientListSearch({
  id,
  label,
  query,
  onQueryChange,
  shown,
  total,
}: PatientListSearchProps) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative max-w-xl">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          id={id}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={PATIENT_LIST_SEARCH_PLACEHOLDER}
          autoComplete="off"
          className="input-field w-full py-2.5 pl-10 pr-10 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-dental-500"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-slate-500" aria-live="polite">
        {formatShownCount(shown, total)}
      </p>
    </div>
  )
}
