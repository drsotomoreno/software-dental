interface ArchEdentulousToggleProps {
  id: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  label?: string
  /** Orden de tabulación relativo al arco */
  tabIndex?: number
}

export function ArchEdentulousToggle({
  id,
  checked,
  disabled = false,
  onChange,
  label = 'Modo Arco Edéntulo',
  tabIndex = 0,
}: ArchEdentulousToggleProps) {
  return (
    <div className="flex items-center justify-end gap-3 py-0.5">
      <label
        htmlFor={id}
        className={`inline-flex select-none items-center gap-2.5 text-xs font-medium ${
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer text-slate-700'
        }`}
      >
        <span
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            checked ? 'bg-teal-600' : 'bg-slate-300'
          } ${disabled ? '' : 'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-500/40 has-[:focus-visible]:ring-offset-2'}`}
        >
          <input
            id={id}
            type="checkbox"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            checked={checked}
            disabled={disabled}
            tabIndex={disabled ? -1 : tabIndex}
            onChange={(e) => onChange(e.target.checked)}
            onKeyDown={(e) => {
              if (disabled) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onChange(!checked)
              }
            }}
            className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
          <span
            aria-hidden
            className={`pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </span>
        <span>{label}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            checked ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {checked ? 'Edéntulo' : 'Dentado'}
        </span>
      </label>
    </div>
  )
}
