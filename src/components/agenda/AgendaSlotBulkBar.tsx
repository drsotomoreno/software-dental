interface AgendaSlotBulkBarProps {
  count: number
  summary: string[]
  blockedCount: number
  reason: string
  saving: boolean
  error: string
  canCreateAppointment: boolean
  onReasonChange: (value: string) => void
  onBlock: () => void
  onUnblock: () => void
  onCreateAppointment: () => void
  onClear: () => void
  onExit: () => void
}

/** Acciones de las casillas marcadas. Va encima de la grilla, sin taparla. */
export function AgendaSlotBulkBar({
  count,
  summary,
  blockedCount,
  reason,
  saving,
  error,
  canCreateAppointment,
  onReasonChange,
  onBlock,
  onUnblock,
  onCreateAppointment,
  onClear,
  onExit,
}: AgendaSlotBulkBarProps) {
  return (
    <div className="agenda-bulk-bar rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-sky-950">
          {count === 0
            ? 'Arrastre sobre la grilla'
            : `${count} casilla${count === 1 ? '' : 's'}`}
        </p>
        <p className="text-xs text-sky-900">
          Botón izquierdo: un rango, como en una tabla. Botón derecho: suma o quita casillas.
        </p>
        <input
          id="agenda-bulk-reason"
          type="text"
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder="Motivo del bloqueo"
          aria-label="Motivo del bloqueo"
          className="input-field h-8 w-44 py-1 text-xs"
          disabled={saving}
        />
        <button
          type="button"
          onClick={onBlock}
          disabled={saving || count === 0}
          className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Bloquear selección'}
        </button>
        <button
          type="button"
          onClick={onUnblock}
          disabled={saving || blockedCount === 0}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          Desbloquear selección
        </button>
        {canCreateAppointment && (
          <button
            type="button"
            onClick={onCreateAppointment}
            disabled={saving}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            Nueva cita en el rango
          </button>
        )}
        <button
          type="button"
          onClick={onClear}
          disabled={saving || count === 0}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          Limpiar
        </button>
        <button type="button" onClick={onExit} disabled={saving} className="btn-secondary px-3 py-1.5 text-xs">
          Salir
        </button>
      </div>
      {summary.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1">
          {summary.slice(0, 4).map((item) => (
            <li key={item} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
              {item}
            </li>
          ))}
          {summary.length > 4 && (
            <li className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500">
              +{summary.length - 4}
            </li>
          )}
        </ul>
      )}
      {blockedCount > 0 && (
        <p className="mt-1 text-xs text-slate-600">
          {blockedCount} de estas casillas ya están bloqueadas.
        </p>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}
