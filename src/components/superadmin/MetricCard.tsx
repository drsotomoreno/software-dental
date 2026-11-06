import type { LucideIcon } from 'lucide-react'

type Tone = 'sky' | 'teal' | 'indigo'

const TONE: Record<Tone, string> = {
  sky: 'bg-sky-50 text-sky-700',
  teal: 'bg-teal-50 text-teal-700',
  indigo: 'bg-indigo-50 text-indigo-700',
}

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'sky',
}: {
  label: string
  value: string
  hint?: string
  icon: LucideIcon
  tone?: Tone
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${TONE[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p>}
    </article>
  )
}
