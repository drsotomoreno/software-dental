export type AgendaViewMode = 'day' | 'week' | 'month'

interface AgendaViewTabsProps {
  activeView: AgendaViewMode
  onChange: (view: AgendaViewMode) => void
}

const VIEWS: { id: AgendaViewMode; label: string }[] = [
  { id: 'day', label: 'Día' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
]

export function AgendaViewTabs({ activeView, onChange }: AgendaViewTabsProps) {
  return (
    <div
      className="agenda-view-tabs inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1"
      role="tablist"
      aria-label="Vista de calendario"
    >
      {VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          role="tab"
          aria-selected={activeView === view.id}
          onClick={() => onChange(view.id)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            activeView === view.id
              ? 'bg-dental-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-white hover:text-slate-800'
          }`}
        >
          {view.label}
        </button>
      ))}
    </div>
  )
}
