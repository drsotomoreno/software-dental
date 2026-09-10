interface PatientListSearchProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function PatientListSearch({ value, onChange, disabled = false }: PatientListSearchProps) {
  return (
    <div className="relative mb-4 mt-4 max-w-xl">
      <label className="sr-only" htmlFor="patient-list-search">
        Buscar paciente por nombre, apellido o documento
      </label>
      <input
        id="patient-list-search"
        type="search"
        value={value}
        disabled={disabled}
        autoComplete="off"
        placeholder="Buscar por nombre, apellido o documento"
        className="input-field pr-10"
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Limpiar búsqueda"
          title="Limpiar búsqueda"
        >
          ×
        </button>
      ) : null}
    </div>
  )
}

export function PatientListNoMatches({ query }: { query: string }) {
  return (
    <div className="card text-center">
      <p className="text-slate-500">Ningún paciente coincide con “{query.trim()}”.</p>
    </div>
  )
}
