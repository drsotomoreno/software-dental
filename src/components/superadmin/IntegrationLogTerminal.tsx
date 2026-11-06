import type { IntegrationLogEvent } from '@/types/superadmin'

const LEVEL_CLASS = {
  info: 'text-emerald-300',
  warning: 'text-amber-300',
  error: 'text-red-300',
} as const

function formatTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('es-CO', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function IntegrationLogTerminal({ events }: { events: IntegrationLogEvent[] }) {
  return (
    <div
      className="max-h-[28rem] overflow-auto rounded-2xl bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200 shadow-inner"
      role="log"
      aria-live="polite"
      aria-label="Registros de integraciones"
    >
      {events.length === 0 ? (
        <p className="text-slate-400">Sin eventos.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <li key={event.id} className="grid grid-cols-1 gap-1 sm:grid-cols-[9.5rem_6.5rem_1fr]">
              <span className="text-slate-500">{formatTime(event.at)}</span>
              <span className={LEVEL_CLASS[event.level]}>
                {event.source} · {event.level}
              </span>
              <span className="text-slate-100">{event.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
