import { MidlineDeviationInput } from '@/components/clinical/orthodontics'
import type { RehabInitialFindings } from '@/types/rehabilitationAestheticsAnnex'
import { DarkenedTeethPicker } from './DarkenedTeethPicker'
import { SmileAnalysisSection } from './SmileAnalysisSection'
import { VitaClassicShadePicker } from './VitaClassicShadePicker'

interface InitialFindingsSectionProps {
  value: RehabInitialFindings
  onChange: (value: RehabInitialFindings) => void
  disabled?: boolean
}

export function InitialFindingsSection({
  value,
  onChange,
  disabled = false,
}: InitialFindingsSectionProps) {
  return (
    <section className="space-y-4 rounded-xl border border-violet-200 bg-gradient-to-b from-violet-50/60 to-white p-4">
      <div>
        <h5 className="text-sm font-semibold text-slate-800">Hallazgos iniciales</h5>
        <p className="text-xs text-slate-500">
          Color dental actual por arcada, dientes oscurecidos, desviación de línea media y análisis de sonrisa.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <VitaClassicShadePicker
          label="Color actual de los dientes superiores"
          inputId="rehab-vita-shade-upper"
          value={value.upperToothColor}
          onChange={(upperToothColor) => onChange({ ...value, upperToothColor })}
          disabled={disabled}
        />
        <VitaClassicShadePicker
          label="Color actual de los dientes inferiores"
          inputId="rehab-vita-shade-lower"
          value={value.lowerToothColor}
          onChange={(lowerToothColor) => onChange({ ...value, lowerToothColor })}
          disabled={disabled}
        />
        <DarkenedTeethPicker
          value={value.darkenedTeeth}
          onChange={(darkenedTeeth) => onChange({ ...value, darkenedTeeth })}
          disabled={disabled}
        />
      </div>

      <MidlineDeviationInput
        value={value.midlineDeviation}
        onChange={(midlineDeviation) => onChange({ ...value, midlineDeviation })}
        disabled={disabled}
      />

      <SmileAnalysisSection
        value={value.smileAnalysis}
        onChange={(smileAnalysis) => onChange({ ...value, smileAnalysis })}
        disabled={disabled}
      />
    </section>
  )
}
