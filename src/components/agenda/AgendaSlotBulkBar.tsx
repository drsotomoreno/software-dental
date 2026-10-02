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

/** Acciones compartidas para las casillas marcadas en la agenda. */
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
    <div className="card fixed bottom-3 left-1/2 z-50 w-[min(920px,calc(100%-1.5rem))] -translate-x-1/2 border-dental-200 bg-dental-50/95 shadow-lg backdrop-blur-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-dental-900">
            {count === 0
              ? 'Seleccione casillas para modificarlas en bloque'
              : `${count} casilla${count === 1 ? '' : 's'} seleccionada${count === 1 ? '' : 's'}`}
          </p>
          <p className="text-xs text-dental-800">
            Cada clic marca o quita una casilla, aunque tenga cita. Mayús o el arrastre suman un
            rectángulo sin borrar lo anterior.
          </p>
          {summary.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {summary.slice(0, 6).map((item) => (
                <li
                  key={item}
                  className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700"
                >
                  {item}
                </li>
              ))}
              {summary.length > 6 && (
                <li className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500">
                  +{summary.length - 6}
                </li>
              )}
            </ul>
          )}
          {blockedCount > 0 && (
            <p className="text-xs text-slate-600">
              {blockedCount} de estas casillas ya están bloqueadas.
            </p>
          )}
        </div>

        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-slate-600" htmlFor="agenda-bulk-reason">
            Motivo del bloqueo
          </label>
          <input
            id="agenda-bulk-reason"
            type="text"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Reunión, mantenimiento, vacaciones..."
            className="input-field"
            disabled={saving}
          />
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
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
          className="btn-secondary text-xs"
        >
          Desbloquear selección
        </button>
        {canCreateAppointment && (
          <button
            type="button"
            onClick={onCreateAppointment}
            disabled={saving}
            className="btn-primary text-xs"
          >
            Nueva cita en el rango
          </button>
        )}
        <button
          type="button"
          onClick={onClear}
          disabled={saving || count === 0}
          className="btn-secondary text-xs"
        >
          Limpiar selección
        </button>
        <button type="button" onClick={onExit} disabled={saving} className="btn-secondary text-xs">
          Salir
        </button>
      </div>
    </div>
  )
}
