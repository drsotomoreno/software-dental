import { useEffect, useId, useMemo, useState } from 'react'
import { getDefaultCie10SearchEngine } from '@/services/Cie10SearchEngine'
import { useCatalogSearch } from '@/hooks/useCatalogSearch'

interface Cie10PrincipalComboboxProps {
  value: string
  disabled?: boolean
  label?: string
  required?: boolean
  onChange: (code: string, description?: string) => void
}

const engine = getDefaultCie10SearchEngine()

function compactCie10(code: string): string {
  return code.replace(/[.\s]/g, '').toUpperCase()
}

function describirCie10(code: string): { code: string; description: string } | null {
  const compact = compactCie10(code)
  if (!compact) return null
  const dotted = compact.length > 3 ? `${compact.slice(0, 3)}.${compact.slice(3)}` : compact
  const candidatos = [...engine.search(dotted, 20), ...engine.search(compact, 20)]
  return candidatos.find((item) => compactCie10(item.code) === compact) ?? null
}

export function Cie10PrincipalCombobox({
  value,
  disabled = false,
  label = 'Diagnóstico principal (CIE-10)',
  required = true,
  onChange,
}: Cie10PrincipalComboboxProps) {
  const listId = useId()
  const inputId = useId()
  const seleccionado = describirCie10(value)
  const [query, setQuery] = useState('')
  const [abierto, setAbierto] = useState(false)
  const catalogo = useCatalogSearch('cie10', query, 12)

  useEffect(() => {
    const encontrado = describirCie10(value)
    setQuery(encontrado ? `${encontrado.code} — ${encontrado.description}` : value)
  }, [value])

  const opciones = useMemo(() => {
    const texto = query.trim()
    if (texto.length < 1 || (seleccionado && texto === `${seleccionado.code} — ${seleccionado.description}`)) {
      return []
    }
    const vistos = new Set<string>()
    const lista: Array<{ code: string; description: string }> = []
    for (const item of [...(catalogo ?? []), ...engine.search(texto, 12)]) {
      const clave = compactCie10(item.code)
      if (!clave || vistos.has(clave)) continue
      vistos.add(clave)
      lista.push({ code: item.code, description: item.description })
    }
    return lista.slice(0, 12)
  }, [catalogo, query, seleccionado])

  const elegir = (code: string, description: string) => {
    onChange(code, description)
    setQuery(`${code} — ${description}`)
    setAbierto(false)
  }

  return (
    <div>
      <label className="label-field" htmlFor={inputId}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={abierto && opciones.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          value={query}
          placeholder="Busque por código o nombre, por ejemplo K07.4 o caries"
          className="input-field"
          onFocus={() => setAbierto(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setAbierto(true)
            if (!event.target.value.trim()) onChange('', '')
          }}
          onBlur={() => {
            window.setTimeout(() => setAbierto(false), 120)
          }}
        />
        {abierto && query.trim().length > 0 && opciones.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            {opciones.map((opcion) => (
              <li key={compactCie10(opcion.code)} role="option">
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-dental-50"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => elegir(opcion.code, opcion.description)}
                >
                  <span className="font-mono font-medium text-dental-700">{opcion.code}</span>
                  <span className="text-slate-700"> — {opcion.description}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {seleccionado ? (
        <p className="mt-1 text-xs text-dental-800">
          Seleccionado: <span className="font-mono font-semibold">{seleccionado.code}</span>
          {' — '}
          {seleccionado.description}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          {required ? 'Obligatorio para preparar el RIPS.' : 'Diagnóstico complementario de esta sesión.'}
        </p>
      )}
    </div>
  )
}
