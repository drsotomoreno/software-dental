import { DemoMicButton } from './DemoMicButton'
import { useDemoVoiceField } from './useDemoVoiceField'

interface DemoStepChiefComplaintProps {
  value: string
  onChange: (value: string) => void
}

/** Paso 2 — Motivo de consulta con dictado por voz. */
export function DemoStepChiefComplaint({ value, onChange }: DemoStepChiefComplaintProps) {
  const voice = useDemoVoiceField({ value, onChange })

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-dental-600">Paso 2 de 9</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-800">Motivo de consulta</h2>
      <p className="mt-2 text-sm text-slate-500">
        Describa por qué acude el paciente o use el micrófono para dictar el motivo.
      </p>

      <div className="mt-8 space-y-2">
        <div className="flex items-end justify-between gap-3">
          <label htmlFor={voice.targetId} className="text-sm font-medium text-slate-700">
            Motivo de consulta
          </label>
          <DemoMicButton
            listening={voice.listening}
            supported={voice.supported}
            errorMessage={voice.errorMessage}
            onToggle={voice.toggle}
            label="Dictar motivo de consulta"
          />
        </div>
        <textarea
          id={voice.targetId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={6}
          placeholder="Ej. Dolor en molar inferior derecho de tres días de evolución..."
          className={[
            'input-field min-h-[9rem] resize-y',
            voice.listening ? 'border-red-300 ring-1 ring-red-200' : '',
          ].join(' ')}
        />
      </div>
    </div>
  )
}
