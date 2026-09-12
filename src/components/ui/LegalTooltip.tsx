import { useId, useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { LEGAL_TOOLTIP_COPY } from '@/constants/legalTooltips'

export type LegalTooltipTopic = keyof typeof LEGAL_TOOLTIP_COPY

interface LegalTooltipProps {
  topic: LegalTooltipTopic
  className?: string
}

export function LegalTooltip({ topic, className = '' }: LegalTooltipProps) {
  const copy = LEGAL_TOOLTIP_COPY[topic]
  const tooltipId = useId()
  const [open, setOpen] = useState(false)

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        className="inline-flex items-center rounded-full p-0.5 text-dental-700 hover:bg-dental-50 focus:outline-none focus:ring-2 focus:ring-dental-400"
        aria-label={`Qué es ${copy.label}`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => setOpen((value) => !value)}
        onBlur={() => setOpen(false)}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute left-0 top-6 z-30 w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs leading-relaxed text-slate-700 shadow-lg"
        >
          <span className="font-semibold text-slate-900">{copy.label}. </span>
          {copy.text}
        </span>
      )}
    </span>
  )
}
