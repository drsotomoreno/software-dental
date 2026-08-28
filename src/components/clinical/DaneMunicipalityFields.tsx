import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import {
  findDaneMunicipalityByCode,
  resolveDaneMunicipality,
  searchDaneMunicipalities,
  type DaneMunicipality,
} from '@/utils/daneMunicipality'

interface DaneMunicipalityFieldsProps {
  city: string
  municipalityCode: string
  onChange: (patch: { city?: string; municipalityCode?: string }) => void
  disabled?: boolean
  cityInputId?: string
  municipalityInputId?: string
}

export function DaneMunicipalityFields({
  city,
  municipalityCode,
  onChange,
  disabled = false,
  cityInputId = 'patient-city',
  municipalityInputId = 'patient-municipality',
}: DaneMunicipalityFieldsProps) {
  const listboxId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [departmentHint, setDepartmentHint] = useState<string | null>(null)

  const results = useMemo(() => searchDaneMunicipalities(city), [city])

  useEffect(() => {
    setActiveIndex(results.length > 0 ? 0 : -1)
  }, [results])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  useEffect(() => {
    if (!municipalityCode.trim()) {
      setDepartmentHint(null)
      return
    }

    const municipality = findDaneMunicipalityByCode(municipalityCode)
    setDepartmentHint(municipality?.departmentName ?? null)
  }, [municipalityCode])

  const applyMunicipality = (municipality: DaneMunicipality) => {
    onChange({
      city: municipality.name,
      municipalityCode: municipality.code,
    })
    setDepartmentHint(municipality.departmentName)
    setStatusMessage(`Código DANE ${municipality.code} asignado automáticamente.`)
    setIsOpen(false)
    setActiveIndex(-1)
  }

  const handleCityBlur = () => {
    window.setTimeout(() => {
      if (!city.trim()) {
        setStatusMessage(null)
        return
      }

      const resolved = resolveDaneMunicipality(city)
      if (resolved) {
        if (resolved.code !== municipalityCode || resolved.name !== city) {
          applyMunicipality(resolved)
        }
        return
      }

      if (results.length > 1) {
        setStatusMessage('Hay varias coincidencias. Seleccione el municipio correcto en la lista.')
        return
      }

      if (results.length === 0) {
        setStatusMessage('No se encontró un municipio con ese nombre en el catálogo DANE.')
        return
      }

      setStatusMessage(null)
    }, 120)
  }

  const handleMunicipalityBlur = () => {
    const trimmedCode = municipalityCode.trim()
    if (!trimmedCode) return

    const municipality = findDaneMunicipalityByCode(trimmedCode)
    if (!municipality) {
      setStatusMessage('El código DANE ingresado no corresponde a un municipio válido.')
      return
    }

    const normalizedCode = municipality.code
    if (normalizedCode !== municipalityCode || municipality.name !== city) {
      onChange({
        municipalityCode: normalizedCode,
        city: municipality.name,
      })
      setDepartmentHint(municipality.departmentName)
      setStatusMessage(`Municipio identificado: ${municipality.name}.`)
    }
  }

  const handleSelect = (municipality: DaneMunicipality) => {
    applyMunicipality(municipality)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      if (city.trim().length >= 2) setIsOpen(true)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, results.length - 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
      return
    }

    if (event.key === 'Enter' && isOpen && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault()
      handleSelect(results[activeIndex])
      return
    }

    if (event.key === 'Escape') {
      setIsOpen(false)
      setActiveIndex(-1)
    }
  }

  const showDropdown = isOpen && city.trim().length >= 2 && results.length > 0 && !disabled

  return (
    <>
      <div ref={containerRef} className="relative">
        <label className="label-field" htmlFor={cityInputId}>
          Ciudad / Municipio
        </label>
        <input
          id={cityInputId}
          value={city}
          onChange={(event) => {
            onChange({ city: event.target.value })
            setStatusMessage(null)
            setIsOpen(true)
          }}
          onFocus={() => {
            if (city.trim().length >= 2) setIsOpen(true)
          }}
          onBlur={handleCityBlur}
          onKeyDown={handleKeyDown}
          className="input-field"
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            showDropdown && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          placeholder="Ej: Medellín, Bogotá…"
        />

        {showDropdown && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {results.map((municipality, index) => (
              <li key={`${municipality.code}-${municipality.name}`}>
                <button
                  type="button"
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-dental-50 ${
                    index === activeIndex ? 'bg-dental-50 text-dental-900' : 'text-slate-700'
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(municipality)}
                >
                  <span className="block font-medium">{municipality.name}</span>
                  <span className="block text-xs text-slate-500">
                    {municipality.departmentName} · DANE {municipality.code}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {city.trim().length >= 2 && results.length === 0 && !disabled && (
          <p className="mt-1 text-xs text-amber-700">Sin coincidencias en el catálogo DANE.</p>
        )}
      </div>

      <div>
        <label className="label-field" htmlFor={municipalityInputId}>
          Código municipio DANE
        </label>
        <input
          id={municipalityInputId}
          value={municipalityCode}
          onChange={(event) => {
            onChange({ municipalityCode: event.target.value.replace(/\D/g, '').slice(0, 5) })
            setStatusMessage(null)
          }}
          onBlur={handleMunicipalityBlur}
          className="input-field font-mono"
          placeholder="Ej: 11001"
          disabled={disabled}
          inputMode="numeric"
          maxLength={5}
        />
        {departmentHint && (
          <p className="mt-1 text-xs text-slate-500">Departamento: {departmentHint}</p>
        )}
      </div>

      {statusMessage && (
        <p className="sm:col-span-2 text-xs text-slate-600" role="status">
          {statusMessage}
        </p>
      )}
    </>
  )
}
