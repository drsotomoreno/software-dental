import {
  VITAL_SIGNS_NORMAL_RANGES,
  createNormalVitalSignsExam,
  isVitalSignsWithinNormalRange,
  type ExamCie10Link,
  type VitalSignsExam,
} from '@/types/stomatologicalExam'
import { FieldVoiceHeader } from '@/components/voice'
import { parseDictatedInteger } from '@/utils/voiceDictation'
import { ExamFindingInputWithCie10 } from './ExamFindingInputWithCie10'
import { TodoNormalButton } from './TodoNormalControl'

interface VitalSignsExamSectionProps {
  data: VitalSignsExam
  onChange: (data: VitalSignsExam) => void
  disabled?: boolean
  findingCie10?: ExamCie10Link | null
  onFindingCie10Change?: (link: ExamCie10Link | null) => void
}

function parseNumericInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

function NumericInput({
  id,
  label,
  suffix,
  value,
  disabled,
  onChange,
  min,
  max,
}: {
  id: string
  label: string
  suffix: string
  value: number | null
  disabled?: boolean
  onChange: (value: number | null) => void
  min: number
  max: number
}) {
  return (
    <div>
      <FieldVoiceHeader
        label={label}
        targetInputId={id}
        disabled={disabled}
        getValue={() => (value != null ? String(value) : '')}
        onValueChange={(text) => {
          const parsed = parseDictatedInteger(text)
          if (parsed != null) onChange(parsed)
        }}
      />
      <div className="relative">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          disabled={disabled}
          value={value ?? ''}
          onChange={(event) => onChange(parseNumericInput(event.target.value))}
          placeholder="—"
          className="input-field pr-14 font-mono tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] text-slate-400">
          {suffix}
        </span>
      </div>
    </div>
  )
}

export function VitalSignsExamSection({
  data,
  onChange,
  disabled = false,
  findingCie10 = null,
  onFindingCie10Change,
}: VitalSignsExamSectionProps) {
  const withinRange = isVitalSignsWithinNormalRange(
    data.systolicPressure,
    data.diastolicPressure,
    data.heartRate,
  )

  const hasValues =
    data.systolicPressure !== null ||
    data.diastolicPressure !== null ||
    data.heartRate !== null

  const updateVitalSigns = (patch: Partial<VitalSignsExam>) => {
    const next: VitalSignsExam = { ...data, ...patch }
    const allFilled =
      next.systolicPressure !== null &&
      next.diastolicPressure !== null &&
      next.heartRate !== null
    const nextWithinRange = isVitalSignsWithinNormalRange(
      next.systolicPressure,
      next.diastolicPressure,
      next.heartRate,
    )

    onChange({
      ...next,
      isNormal: allFilled && nextWithinRange,
    })
  }

  const applyNormalPreset = () => {
    onFindingCie10Change?.(null)
    onChange(createNormalVitalSignsExam())
  }

  const showOutOfRangeWarning = hasValues && !withinRange

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        data.isNormal && withinRange
          ? 'border-green-200 bg-green-50/50'
          : showOutOfRangeWarning
            ? 'border-amber-200 bg-amber-50/40'
            : 'border-slate-200 bg-slate-50/60'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">
            Signos Vitales y Estado General
          </h4>
          <p className="mt-0.5 text-xs text-slate-500">
            Filtro de seguridad legal — registro obligatorio antes de procedimientos invasivos o
            anestesia local.
          </p>
        </div>
        {!disabled && <TodoNormalButton onClick={applyNormalPreset} />}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <NumericInput
          id="vital-signs-systolic"
          label="PA sistólica"
          suffix="mmHg"
          value={data.systolicPressure}
          disabled={disabled}
          onChange={(systolicPressure) => updateVitalSigns({ systolicPressure })}
          min={VITAL_SIGNS_NORMAL_RANGES.systolic.min}
          max={220}
        />
        <NumericInput
          id="vital-signs-diastolic"
          label="PA diastólica"
          suffix="mmHg"
          value={data.diastolicPressure}
          disabled={disabled}
          onChange={(diastolicPressure) => updateVitalSigns({ diastolicPressure })}
          min={VITAL_SIGNS_NORMAL_RANGES.diastolic.min}
          max={140}
        />
        <NumericInput
          id="vital-signs-heart-rate"
          label="Frecuencia cardíaca (FC)"
          suffix="lpm"
          value={data.heartRate}
          disabled={disabled}
          onChange={(heartRate) => updateVitalSigns({ heartRate })}
          min={VITAL_SIGNS_NORMAL_RANGES.heartRate.min}
          max={200}
        />
      </div>

      <p className="mt-2 text-[10px] text-slate-500">
        Referencia normal: PA {VITAL_SIGNS_NORMAL_RANGES.systolic.min}–
        {VITAL_SIGNS_NORMAL_RANGES.systolic.max}/
        {VITAL_SIGNS_NORMAL_RANGES.diastolic.min}–{VITAL_SIGNS_NORMAL_RANGES.diastolic.max} mmHg · FC{' '}
        {VITAL_SIGNS_NORMAL_RANGES.heartRate.min}–{VITAL_SIGNS_NORMAL_RANGES.heartRate.max} lpm.
        El botón Todo Normal registra 120/80 mmHg y FC 72 lpm.
      </p>

      {hasValues && (
        <p
          className={`mt-2 text-xs font-medium ${
            withinRange ? 'text-green-700' : 'text-amber-800'
          }`}
        >
          {withinRange
            ? 'Valores dentro de parámetros de referencia.'
            : 'Valores fuera de parámetros de referencia — documente observaciones y valore contraindicación.'}
        </p>
      )}

      <div className="mt-3">
        <label htmlFor="vital-signs-notes" className="label-field">
          Observaciones de signos vitales
        </label>
        <ExamFindingInputWithCie10
          inputId="vital-signs-notes"
          value={data.notes}
          onChange={(notes) => updateVitalSigns({ notes })}
          cie10={findingCie10}
          onCie10Change={(link) => onFindingCie10Change?.(link)}
          disabled={disabled}
          multiline
          rows={2}
          placeholder="Ej.: hipertensión controlada, paciente en tratamiento antihipertensivo..."
          className="input-field resize-y text-sm"
          showSuggestions={showOutOfRangeWarning || Boolean(data.notes.trim())}
        />
      </div>
    </div>
  )
}
