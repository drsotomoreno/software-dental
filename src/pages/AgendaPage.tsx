import { AgendaScheduler } from '@/components/agenda'

export function AgendaPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Agenda Clínica</h1>
      <AgendaScheduler />
    </div>
  )
}
