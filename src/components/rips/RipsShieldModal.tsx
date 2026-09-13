import { useNavigate } from 'react-router-dom'
import type { RipsShieldMismatch } from '@/types/consultationCheckout'
import { LegalTooltip } from '@/components/ui/LegalTooltip'

interface RipsShieldModalProps {
  open: boolean
  mismatches: RipsShieldMismatch[]
  onChangeProcedure: () => void
}

export function RipsShieldModal({ open, mismatches, onChangeProcedure }: RipsShieldModalProps) {
  const navigate = useNavigate()
  const primary = mismatches[0]

  if (!open || !primary) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="rips-shield-title"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
      >
        <p className="text-3xl" aria-hidden>
          🛡️
        </p>
        <h3 id="rips-shield-title" className="mt-2 text-lg font-bold text-slate-900">
          Procedimiento no autorizado para tu sede
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          El Ministerio rechazará este{' '}
          <span className="inline-flex items-center gap-1 font-medium">
            RIPS
            <LegalTooltip topic="rips" />
          </span>{' '}
          porque intentas cobrar <strong>{primary.cupsName}</strong> (
          <span className="inline-flex items-center gap-1 font-mono text-xs">
            {primary.cupsCode}
            <LegalTooltip topic="cups" />
          </span>
          ) que requiere habilitación en <strong>{primary.requiredSpecialtyLabel}</strong>, pero tu
          clínica está habilitada en <strong>{primary.clinicSpecialtyLabel}</strong>.
        </p>

        {mismatches.length > 1 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
            {mismatches.slice(1).map((item) => (
              <li key={item.itemId}>
                {item.cupsName} ({item.cupsCode}) exige {item.requiredSpecialtyLabel}.
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-secondary flex-1" onClick={onChangeProcedure}>
            ✏️ Cambiar procedimiento
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={() => navigate('/perfil')}
          >
            ⚙️ Actualizar mis permisos REPS
          </button>
        </div>
      </div>
    </div>
  )
}
