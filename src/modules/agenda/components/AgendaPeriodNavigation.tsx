import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AgendaViewMode } from './AgendaViewTabs'

const NAV_LABELS: Record<AgendaViewMode, { prev: string; next: string }> = {
  day: { prev: 'Día anterior', next: 'Día siguiente' },
  week: { prev: 'Semana anterior', next: 'Semana siguiente' },
  month: { prev: 'Mes anterior', next: 'Mes siguiente' },
}

interface AgendaPeriodArrowProps {
  direction: 'prev' | 'next'
  label: string
  onClick: () => void
}

function AgendaPeriodArrow({ direction, label, onClick }: AgendaPeriodArrowProps) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-100 text-violet-800 shadow-sm transition hover:bg-violet-200/80 focus:outline-none focus:ring-2 focus:ring-dental-500 focus:ring-offset-2"
    >
      <Icon className="h-6 w-6" aria-hidden="true" />
    </button>
  )
}

interface AgendaPeriodNavigationProps {
  activeView: AgendaViewMode
  periodLabel: string
  onPrevious: () => void
  onNext: () => void
}

export function AgendaPeriodNavigation({
  activeView,
  periodLabel,
  onPrevious,
  onNext,
}: AgendaPeriodNavigationProps) {
  const labels = NAV_LABELS[activeView]

  return (
    <div className="flex items-center gap-3">
      <AgendaPeriodArrow direction="prev" label={labels.prev} onClick={onPrevious} />

      <div className="min-w-0 flex-1 text-center">
        <p className="truncate text-base font-semibold capitalize text-slate-900 sm:text-lg">
          {periodLabel}
        </p>
        <p className="text-xs text-slate-500">
          {activeView === 'day' && 'Vista diaria'}
          {activeView === 'week' && 'Vista semanal'}
          {activeView === 'month' && 'Vista mensual'}
        </p>
      </div>

      <AgendaPeriodArrow direction="next" label={labels.next} onClick={onNext} />
    </div>
  )
}

interface AgendaPeriodNavigationFrameProps {
  activeView: AgendaViewMode
  periodLabel: string
  onPrevious: () => void
  onNext: () => void
  children: ReactNode
}

export function AgendaPeriodNavigationFrame({
  activeView,
  periodLabel,
  onPrevious,
  onNext,
  children,
}: AgendaPeriodNavigationFrameProps) {
  const labels = NAV_LABELS[activeView]

  return (
    <div className="flex items-stretch gap-2 sm:gap-3">
      <div className="flex items-center">
        <AgendaPeriodArrow direction="prev" label={labels.prev} onClick={onPrevious} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="text-center">
          <p className="truncate text-base font-semibold capitalize text-slate-900 sm:text-lg">
            {periodLabel}
          </p>
          <p className="text-xs text-slate-500">
            {activeView === 'day' && 'Vista diaria'}
            {activeView === 'week' && 'Vista semanal'}
            {activeView === 'month' && 'Vista mensual'}
          </p>
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      <div className="flex items-center">
        <AgendaPeriodArrow direction="next" label={labels.next} onClick={onNext} />
      </div>
    </div>
  )
}
