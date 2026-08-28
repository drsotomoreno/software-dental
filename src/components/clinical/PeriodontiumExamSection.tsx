import type {
  DentalMobilityAssessment,
  ExamCie10Link,
  ExamFindingCie10Map,
  GingivitisAssessment,
  GingivitisType,
  InflammationBleedingAssessment,
  OralHygieneLevel,
  PeriodontiumExam,
  PeriodontiumYesNo,
  PlaqueCalculusAssessment,
} from '@/types/stomatologicalExam'
import {
  GINGIVITIS_TYPE_OPTIONS,
  ORAL_HYGIENE_OPTIONS,
  PERIODONTIUM_YES_NO_OPTIONS,
  getExamFindingCie10,
} from '@/types/stomatologicalExam'
import { ExamFindingInputWithCie10 } from './ExamFindingInputWithCie10'
import { VoiceDictationButton } from '@/components/voice'

interface PeriodontiumExamSectionProps {
  data: PeriodontiumExam
  disabled?: boolean
  findingCie10: ExamFindingCie10Map
  onFindingCie10Change: (key: string, link: ExamCie10Link | null) => void
  onChange: (value: PeriodontiumExam) => void
}

function optionClass(active: boolean, disabled?: boolean): string {
  if (disabled) return 'bg-slate-100 text-slate-400 cursor-not-allowed'
  if (active) return 'bg-dental-600 text-white shadow-sm'
  return 'bg-slate-100 text-slate-700 hover:bg-slate-200'
}

function HygieneSelect({
  value,
  disabled,
  onChange,
}: {
  value: OralHygieneLevel
  disabled?: boolean
  onChange: (value: OralHygieneLevel) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-600">Higiene bucal</p>
      <div className="flex flex-wrap gap-2">
        {ORAL_HYGIENE_OPTIONS.map((option) => (
          <button
            key={`hygiene-${option.value}`}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === option.value ? '' : option.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${optionClass(
              value === option.value,
              disabled,
            )}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function YesNoSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: PeriodontiumYesNo
  disabled?: boolean
  onChange: (value: PeriodontiumYesNo) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-600">{label}</p>
      <div className="flex flex-wrap gap-2">
        {PERIODONTIUM_YES_NO_OPTIONS.map((option) => (
          <button
            key={`${label}-${option.value}`}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === option.value ? '' : option.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${optionClass(
              value === option.value,
              disabled,
            )}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function GingivitisTypeSelect({
  value,
  disabled,
  onChange,
}: {
  value: GingivitisType
  disabled?: boolean
  onChange: (value: GingivitisType) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-600">Tipo de gingivitis</p>
      <div className="flex flex-wrap gap-2">
        {GINGIVITIS_TYPE_OPTIONS.map((option) => (
          <button
            key={`gingivitis-type-${option.value}`}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === option.value ? '' : option.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${optionClass(
              value === option.value,
              disabled,
            )}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function PeriodontiumExamSection({
  data,
  disabled = false,
  findingCie10,
  onFindingCie10Change,
  onChange,
}: PeriodontiumExamSectionProps) {
  const update = (patch: Partial<PeriodontiumExam>) =>
    onChange({ ...data, ...patch, isNormal: false })

  const updatePlaqueCalculus = (patch: Partial<PlaqueCalculusAssessment>) =>
    update({ plaqueCalculus: { ...data.plaqueCalculus, ...patch } })

  const updateInflammationBleeding = (patch: Partial<InflammationBleedingAssessment>) =>
    update({ inflammationBleeding: { ...data.inflammationBleeding, ...patch } })

  const updateGingivitis = (patch: Partial<GingivitisAssessment>) =>
    update({ gingivitis: { ...data.gingivitis, ...patch } })

  const updateMobility = (patch: Partial<DentalMobilityAssessment>) =>
    update({ mobility: { ...data.mobility, ...patch } })

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h5 className="mb-3 text-sm font-semibold text-slate-800">
          Presencia/Absencia de placa y cálculo
        </h5>
        <div className="grid gap-4 sm:grid-cols-2">
          <HygieneSelect
            value={data.plaqueCalculus.hygiene}
            disabled={disabled}
            onChange={(hygiene) => updatePlaqueCalculus({ hygiene })}
          />
          <YesNoSelect
            label="Presencia de cálculos"
            value={data.plaqueCalculus.calculusPresent}
            disabled={disabled}
            onChange={(calculusPresent) => updatePlaqueCalculus({ calculusPresent })}
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h5 className="mb-3 text-sm font-semibold text-slate-800">
          Signos de inflamación y sangrado
        </h5>
        <div className="grid gap-4 sm:grid-cols-2">
          <YesNoSelect
            label="Sangrado al cepillado"
            value={data.inflammationBleeding.bleedingOnBrushing}
            disabled={disabled}
            onChange={(bleedingOnBrushing) =>
              updateInflammationBleeding({ bleedingOnBrushing })
            }
          />
          <YesNoSelect
            label="Sangrado a la exploración"
            value={data.inflammationBleeding.bleedingOnProbing}
            disabled={disabled}
            onChange={(bleedingOnProbing) =>
              updateInflammationBleeding({ bleedingOnProbing })
            }
          />
          <YesNoSelect
            label="Eritema"
            value={data.inflammationBleeding.erythema}
            disabled={disabled}
            onChange={(erythema) => updateInflammationBleeding({ erythema })}
          />
          <YesNoSelect
            label="Edema"
            value={data.inflammationBleeding.edema}
            disabled={disabled}
            onChange={(edema) => updateInflammationBleeding({ edema })}
          />
          <YesNoSelect
            label="Gingivitis"
            value={data.gingivitis.present}
            disabled={disabled}
            onChange={(present) =>
              updateGingivitis({
                present,
                type: present === 'si' ? data.gingivitis.type : '',
              })
            }
          />
          {data.gingivitis.present === 'si' && (
            <GingivitisTypeSelect
              value={data.gingivitis.type}
              disabled={disabled}
              onChange={(type) => updateGingivitis({ type })}
            />
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h5 className="mb-3 text-sm font-semibold text-slate-800">Movilidad dental</h5>
        <div className="grid gap-4 sm:grid-cols-2">
          <YesNoSelect
            label="¿Existe movilidad?"
            value={data.mobility.present}
            disabled={disabled}
            onChange={(present) =>
              updateMobility({
                present,
                affectedTeeth: present === 'si' ? data.mobility.affectedTeeth : '',
              })
            }
          />
          {data.mobility.present === 'si' && (
            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="label-field mb-0" htmlFor="periodontium-mobility-teeth">
                  Dientes afectados (FDI)
                </label>
                {!disabled && (
                  <VoiceDictationButton
                    targetInputId="periodontium-mobility-teeth"
                    getValue={() => data.mobility.affectedTeeth}
                    onValueChange={(affectedTeeth) => updateMobility({ affectedTeeth })}
                  />
                )}
              </div>
              <input
                id="periodontium-mobility-teeth"
                disabled={disabled}
                value={data.mobility.affectedTeeth}
                onChange={(e) => updateMobility({ affectedTeeth: e.target.value })}
                placeholder="Ej.: 11, 12, 36..."
                className="input-field text-sm"
              />
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="label-field">Notas de periodonto</label>
        <ExamFindingInputWithCie10
          inputId="exam-periodontium-notes"
          value={data.notes}
          onChange={(notes) => update({ notes })}
          cie10={getExamFindingCie10(findingCie10, 'periodontium.notes')}
          onCie10Change={(link) => onFindingCie10Change('periodontium.notes', link)}
          disabled={disabled}
          placeholder="Observaciones adicionales..."
          className={`input-field ${data.isNormal ? 'border-green-300 bg-green-50/60' : ''}`}
          showSuggestions={!data.isNormal || Boolean(data.notes.trim())}
        />
      </div>
    </div>
  )
}
