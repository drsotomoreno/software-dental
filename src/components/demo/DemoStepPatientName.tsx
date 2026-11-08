import { DemoMicButton } from './DemoMicButton'
import { useDemoVoiceField } from './useDemoVoiceField'

interface DemoStepPatientNameProps {
  value: string
  onChange: (value: string) => void
}

/** Paso 1 — Nombre del paciente con dictado por voz. */
export function DemoStepPatientName({ value, onChange }: DemoStepPatientNameProps) {
  const voice = useDemoVoiceField({ value, onChange })

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-dental-600">Paso 1 de 9</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-800">Nombre del paciente</h2>
      <p className="mt-2 text-sm text-slate-500">
        Escriba el nombre o pulse el micrófono para dictarlo. La transcripción se guarda en la guía.
      </p>

      <div className="mt-8 space-y-2">
        <div className="flex items-end justify-between gap-3">
          <label htmlFor={voice.targetId} className="text-sm font-medium text-slate-700">
            Nombre completo
          </label>
          <DemoMicButton
            listening={voice.listening}
            supported={voice.supported}
            errorMessage={voice.errorMessage}
            onToggle={voice.toggle}
            label="Dictar nombre del paciente"
          />
        </div>
        <input
          id={voice.targetId}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Ej. María Fernanda López"
          autoComplete="name"
          className={[
            'input-field',
            voice.listening ? 'border-red-300 ring-1 ring-red-200' : '',
          ].join(' ')}
        />
      </div>
    </div>
  )
}
