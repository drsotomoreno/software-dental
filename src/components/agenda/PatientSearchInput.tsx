import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Patient } from '@/types/patient'
import {
  formatPatientLabel,
  formatPatientFullName,
  searchPatients,
} from '@/hooks/usePatientsList'

interface PatientSearchInputProps {
  patients: Patient[]
  isLoading?: boolean
  query: string
  selectedPatientId?: string
  onQueryChange: (query: string) => void
  onSelectPatient: (patient: Patient) => void
  onClearPatient: () => void
  disabled?: boolean
}

export function PatientSearchInput({
  patients,
  isLoading = false,
  query,
  selectedPatientId,
  onQueryChange,
  onSelectPatient,
  onClearPatient,
  disabled = false,
}: PatientSearchInputProps) {
  const listboxId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const selectedPatient = useMemo(
    () => patients.find((patient) => String(patient.id ?? '') === selectedPatientId),
    [patients, selectedPatientId],
  )

  const results = useMemo(() => searchPatients(patients, query), [patients, query])

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

  const handleSelect = (patient: Patient) => {
    onSelectPatient(patient)
    onQueryChange(formatPatientFullName(patient))
    setIsOpen(false)
    setActiveIndex(-1)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      if (query.trim()) setIsOpen(true)
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

  const showDropdown = isOpen && query.trim().length > 0 && !disabled

  return (
    <div ref={containerRef} className="relative">
      <label className="label-field" htmlFor="appointment-patient-search">
        Paciente
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          id="appointment-patient-search"
          type="search"
          value={query}
          disabled={disabled || isLoading}
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            showDropdown && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          placeholder="Escriba apellido o nombre…"
          className="input-field pr-10"
          onFocus={() => {
            if (query.trim()) setIsOpen(true)
          }}
          onChange={(event) => {
            onQueryChange(event.target.value)
            setIsOpen(true)
            if (selectedPatientId) onClearPatient()
          }}
          onKeyDown={handleKeyDown}
        />

        {selectedPatient && (
          <button
            type="button"
            onClick={() => {
              onClearPatient()
              onQueryChange('')
              setIsOpen(false)
              inputRef.current?.focus()
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Quitar paciente seleccionado"
            title="Quitar selección"
          >
            ×
          </button>
        )}
      </div>

      {isLoading && <p className="mt-1 text-xs text-slate-500">Cargando pacientes…</p>}

      {!isLoading && patients.length === 0 && (
        <p className="mt-1 text-xs text-slate-500">
          No hay pacientes registrados. Escriba el nombre manualmente abajo.
        </p>
      )}

      {!isLoading && patients.length > 0 && !selectedPatient && query.trim() && (
        <p className="mt-1 text-xs text-slate-500">
          Escriba desde la primera letra del apellido o nombre. Si no aparece, use el nombre manual.
        </p>
      )}

      {selectedPatient && (
        <div className="mt-2 rounded-lg border border-dental-200 bg-dental-50 px-3 py-2 text-sm text-dental-900">
          <span className="font-medium">Registrado:</span> {formatPatientLabel(selectedPatient)}
        </div>
      )}

      {showDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">
              Sin coincidencias para &quot;{query.trim()}&quot;
            </li>
          ) : (
            results.map((patient, index) => {
              const isActive = index === activeIndex
              return (
                <li key={String(patient.id)} role="presentation">
                  <button
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => handleSelect(patient)}
                    className={`flex w-full flex-col px-3 py-2 text-left text-sm transition ${
                      isActive ? 'bg-dental-50 text-dental-900' : 'text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-medium">
                      {patient.lastName}, {patient.firstName}
                    </span>
                    <span className="text-xs text-slate-500">
                      {patient.documentType} {patient.documentNumber}
                      {patient.phone ? ` · ${patient.phone}` : ''}
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
