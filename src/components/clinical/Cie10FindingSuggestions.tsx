import { useMemo } from 'react'
import { getDefaultCie10SearchEngine } from '@/services/Cie10SearchEngine'

export interface Cie10Option {
  code: string
  description: string
}

interface Cie10FindingSuggestionsProps {
  query: string
  onSelect: (option: Cie10Option) => void
  disabled?: boolean
  minLength?: number
}

const cie10Engine = getDefaultCie10SearchEngine()

export function Cie10FindingSuggestions({
  query,
  onSelect,
  disabled = false,
  minLength = 2,
}: Cie10FindingSuggestionsProps) {
  const trimmed = query.trim()

  const options = useMemo(() => {
    if (trimmed.length < minLength) return []
    return cie10Engine.search(trimmed, 12)
  }, [minLength, trimmed])

  if (trimmed.length < minLength) return null

  return (
    <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
      {options.length === 0 ? (
        <li className="px-3 py-2 text-xs text-slate-500">Sin coincidencias en CIE-10</li>
      ) : (
        options.map((option) => (
          <li key={`${option.code}-${option.description}`}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(option)}
              className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
            >
              <span className="font-mono font-medium text-dental-700">{option.code}</span>
              <span className="ml-1.5 text-slate-700">{option.description}</span>
            </button>
          </li>
        ))
      )}
    </ul>
  )
}

interface SelectedCie10BadgeProps {
  value: Cie10Option
  onClear?: () => void
  disabled?: boolean
}

export function SelectedCie10Badge({ value, onClear, disabled = false }: SelectedCie10BadgeProps) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-2 rounded-md border border-dental-200 bg-dental-50/60 px-2 py-1">
      <span className="text-[11px] text-dental-800">
        <span className="font-mono font-semibold">{value.code}</span>
        <span className="text-slate-600"> — {value.description}</span>
      </span>
      {!disabled && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] font-medium text-slate-500 hover:text-red-600"
        >
          Quitar
        </button>
      )}
    </div>
  )
}
