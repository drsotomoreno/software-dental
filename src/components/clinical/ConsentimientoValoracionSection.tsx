import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  VALUATION_CONSENT_CHECKBOX_LABEL,
  VALUATION_CONSENT_KEY_POINTS,
  VALUATION_CONSENT_SUMMARY,
  VALUATION_CONSENT_TITLE,
} from '@/constants/valuationConsentText'

interface ConsentimientoValoracionSectionProps {
  accepted: boolean
  onAcceptedChange: (accepted: boolean) => void
  disabled?: boolean
  recordedAt?: string | null
}

export function ConsentimientoValoracionSection({
  accepted,
  onAcceptedChange,
  disabled = false,
  recordedAt = null,
}: ConsentimientoValoracionSectionProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        aria-expanded={expanded}
      >
        <div>
          <p className="text-xs font-semibold text-slate-800">{VALUATION_CONSENT_TITLE}</p>
          <p className="text-[11px] text-slate-500">{VALUATION_CONSENT_SUMMARY}</p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
          <ul className="space-y-2">
            {VALUATION_CONSENT_KEY_POINTS.map((point) => (
              <li key={point.title}>
                <strong className="text-slate-700">{point.title}.</strong> {point.text}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-slate-400">
            Ley 1581 de 2012 — Protección de datos personales (habeas data).
          </p>
        </div>
      )}

      <div className="border-t border-slate-100 px-3 py-2.5">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            disabled={disabled}
            checked={accepted}
            onChange={(event) => onAcceptedChange(event.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
          />
          <span className="text-xs text-slate-700">{VALUATION_CONSENT_CHECKBOX_LABEL}</span>
        </label>
        {recordedAt && (
          <p className="mt-1.5 text-[10px] text-teal-700">
            Consentimiento registrado: {new Date(recordedAt).toLocaleString('es-CO')}
          </p>
        )}
        {!accepted && !disabled && (
          <p className="mt-1 text-[10px] text-amber-700">
            Debe aceptar el consentimiento para habilitar la aceptación del presupuesto.
          </p>
        )}
      </div>
    </section>
  )
}
