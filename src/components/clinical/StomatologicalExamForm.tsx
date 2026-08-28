import type { Anamnesis } from '@/types/anamnesis'
import type {
  AngleClass,
  AtmDeviationMovement,
  AtmLaterality,
  CrossbiteType,
  ExamCie10Link,
  ExamField,
  StomatologicalExam,
} from '@/types/stomatologicalExam'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import {
  ANGLE_CLASS_OPTIONS,
  ANGLE_OCCLUSION_FIELD_LABELS,
  ATM_DEVIATION_MOVEMENT_OPTIONS,
  ATM_LATERALITY_OPTIONS,
  CROSSBITE_TYPE_OPTIONS,
  SOFT_TISSUE_FIELD_LABELS,
  clearExamFindingCie10ByPrefix,
  getExamFindingCie10,
  setExamFindingCie10,
} from '@/types/stomatologicalExam'
import { ExamFindingInputWithCie10 } from './ExamFindingInputWithCie10'
import { ClinicalPrecautionAlertBanner } from './ClinicalPrecautionAlertBanner'
import { getClinicalPrecautionAlert } from '@/utils/clinicalPrecautionAlerts'
import { PeriodontiumExamSection } from './PeriodontiumExamSection'
import { TodoNormalButton } from './TodoNormalControl'
import { VitalSignsExamSection } from './VitalSignsExamSection'

interface StomatologicalExamFormProps {
  data: StomatologicalExam
  onChange: (data: StomatologicalExam) => void
  disabled?: boolean
  anamnesis?: Anamnesis
  showPrecautionAlert?: boolean
}

interface ExaminableFieldRowProps {
  label: string
  fieldKey: string
  field: ExamField
  cie10: ExamCie10Link | null
  onChange: (field: ExamField) => void
  onCie10Change: (link: ExamCie10Link | null) => void
  disabled?: boolean
  placeholder?: string
}

function ExaminableFieldRow({
  label,
  fieldKey,
  field,
  cie10,
  onChange,
  onCie10Change,
  disabled = false,
  placeholder = 'Describa hallazgos o anomalías...',
}: ExaminableFieldRowProps) {
  const handleNormalToggle = (checked: boolean) => {
    if (checked) onCie10Change(null)
    onChange({
      isNormal: checked,
      description: checked ? (field.description || 'Normal') : field.description,
    })
  }

  const handleDescriptionChange = (description: string) => {
    const trimmed = description.trim()
    const isNormal =
      trimmed === '' ? field.isNormal : trimmed.toLowerCase() === 'normal'
    onChange({ isNormal, description })
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="label-field mb-0">{label}</label>
        <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            disabled={disabled}
            checked={field.isNormal}
            onChange={(e) => handleNormalToggle(e.target.checked)}
            className="rounded border-slate-300 text-dental-600 focus:ring-dental-500"
          />
          Normal
        </label>
      </div>
      <ExamFindingInputWithCie10
        inputId={`exam-soft-tissue-${fieldKey}`}
        value={field.description}
        onChange={handleDescriptionChange}
        cie10={cie10}
        onCie10Change={onCie10Change}
        disabled={disabled}
        placeholder={
          field.isNormal
            ? 'Normal — describa anomalías si las hay'
            : placeholder
        }
        className={`input-field transition-colors ${
          field.isNormal ? 'border-green-300 bg-green-50/60' : ''
        }`}
        showSuggestions={!field.isNormal}
      />
    </div>
  )
}

function atmOptionClass(active: boolean, disabled?: boolean): string {
  if (disabled) return 'bg-slate-100 text-slate-400 cursor-not-allowed'
  if (active) return 'bg-dental-600 text-white shadow-sm'
  return 'bg-slate-100 text-slate-700 hover:bg-slate-200'
}

function AtmLateralityField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: AtmLaterality
  disabled?: boolean
  onChange: (value: AtmLaterality) => void
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {ATM_LATERALITY_OPTIONS.map((option) => (
          <button
            key={`${label}-${option.value}`}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === option.value ? '' : option.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${atmOptionClass(
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

function AtmDeviationField({
  value,
  disabled,
  onChange,
}: {
  value: AtmDeviationMovement
  disabled?: boolean
  onChange: (value: AtmDeviationMovement) => void
}) {
  return (
    <div className="sm:col-span-2">
      <p className="mb-2 text-sm font-medium text-slate-700">Desviación</p>
      <div className="flex flex-wrap gap-2">
        {ATM_DEVIATION_MOVEMENT_OPTIONS.map((option) => (
          <button
            key={`deviation-${option.value}`}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === option.value ? '' : option.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${atmOptionClass(
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

function isAlteredAngleClass(value: AngleClass): boolean {
  return value === 'II' || value === 'III'
}

export function StomatologicalExamForm({
  data,
  onChange,
  disabled = false,
  anamnesis,
  showPrecautionAlert = false,
}: StomatologicalExamFormProps) {
  const update = (patch: Partial<StomatologicalExam>) => onChange({ ...data, ...patch })
  const precautionAlert = getClinicalPrecautionAlert(anamnesis, data.vitalSigns)

  const updateFindingCie10 = (key: string, link: ExamCie10Link | null) => {
    update({ findingCie10: setExamFindingCie10(data.findingCie10, key, link) })
  }

  const updateAtm = (patch: Partial<StomatologicalExam['atm']>) => {
    const next = { ...data.atm, ...patch }
    const hasAlteration =
      Boolean(next.clicks) || Boolean(next.pain) || Boolean(next.deviation)

    onChange({
      ...data,
      atm: {
        ...next,
        isNormal: hasAlteration ? false : next.isNormal,
      },
    })
  }

  const markAtmNormal = () => {
    update({
      atm: {
        ...data.atm,
        isNormal: true,
        clicks: '',
        pain: '',
        deviation: '',
      },
      findingCie10: clearExamFindingCie10ByPrefix(data.findingCie10, 'atm.'),
    })
  }

  const updateSoftTissues = (patch: Partial<StomatologicalExam['softTissues']>) =>
    onChange({ ...data, softTissues: { ...data.softTissues, ...patch } })

  const updateOcclusion = (patch: Partial<StomatologicalExam['occlusion']>) =>
    onChange({ ...data, occlusion: { ...data.occlusion, ...patch } })

  const markAllSoftTissuesNormal = () => {
    const updated = { ...data.softTissues }
    for (const { key } of SOFT_TISSUE_FIELD_LABELS) {
      updated[key] = { isNormal: true, description: 'Normal' }
    }
    update({
      softTissues: updated,
      findingCie10: clearExamFindingCie10ByPrefix(data.findingCie10, 'softTissues.'),
    })
  }

  const markAllPeriodontiumNormal = () => {
    update({
      periodontium: {
        isNormal: true,
        plaqueCalculus: { hygiene: 'buena', calculusPresent: 'no' },
        inflammationBleeding: {
          bleedingOnBrushing: 'no',
          bleedingOnProbing: 'no',
          erythema: 'no',
          edema: 'no',
        },
        gingivitis: { present: 'no', type: '' },
        mobility: { present: 'no', affectedTeeth: '' },
        notes: '',
      },
      findingCie10: clearExamFindingCie10ByPrefix(data.findingCie10, 'periodontium.'),
    })
  }

  const findingCie10 = data.findingCie10

  return (
    <div className="space-y-6">
      <section className="card">
        <h3 className={`mb-4 ${CLINICAL_SECTION_TITLE_CLASS}`}>
          {clinicalSectionTitle(
            CLINICAL_HISTORY_SECTION_NUMBERS.examen,
            'Examen Estomatológico / Examen Físico',
          )}
        </h3>

        <div className="space-y-6">
          {showPrecautionAlert && (
            <ClinicalPrecautionAlertBanner alert={precautionAlert} />
          )}

          <VitalSignsExamSection
            data={data.vitalSigns}
            disabled={disabled}
            onChange={(vitalSigns) => update({ vitalSigns })}
            findingCie10={getExamFindingCie10(findingCie10, 'vitalSigns.abnormal')}
            onFindingCie10Change={(link) => updateFindingCie10('vitalSigns.abnormal', link)}
          />

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="clinical-label-raw text-sm font-semibold text-slate-700">
                ATM (Articulación Temporomandibular)
              </h4>
              {!disabled && <TodoNormalButton onClick={markAtmNormal} />}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <AtmLateralityField
                  label="Clics"
                  value={data.atm.clicks}
                  disabled={disabled}
                  onChange={(clicks) => updateAtm({ clicks })}
                />
                <AtmLateralityField
                  label="Dolor"
                  value={data.atm.pain}
                  disabled={disabled}
                  onChange={(pain) => updateAtm({ pain })}
                />
                <AtmDeviationField
                  value={data.atm.deviation}
                  disabled={disabled}
                  onChange={(deviation) => updateAtm({ deviation })}
                />
              </div>

            <div className="mt-2">
              <label className="label-field">Notas ATM</label>
              <ExamFindingInputWithCie10
                inputId="exam-atm-notes"
                value={data.atm.notes}
                onChange={(notes) => updateAtm({ notes })}
                cie10={getExamFindingCie10(findingCie10, 'atm.notes')}
                onCie10Change={(link) => updateFindingCie10('atm.notes', link)}
                disabled={disabled}
                placeholder="Describa hallazgos o anomalías..."
                className={`input-field ${data.atm.isNormal ? 'border-green-300 bg-green-50/60' : ''}`}
                showSuggestions={!data.atm.isNormal || Boolean(data.atm.notes.trim())}
              />
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-700">Tejidos blandos</h4>
              {!disabled && (
                <TodoNormalButton onClick={markAllSoftTissuesNormal} />
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {SOFT_TISSUE_FIELD_LABELS.map(({ key, label }) => {
                const findingKey = `softTissues.${key}`
                return (
                  <ExaminableFieldRow
                    key={key}
                    fieldKey={key}
                    label={label}
                    field={data.softTissues[key]}
                    cie10={getExamFindingCie10(findingCie10, findingKey)}
                    disabled={disabled}
                    onChange={(field) => updateSoftTissues({ [key]: field })}
                    onCie10Change={(link) => updateFindingCie10(findingKey, link)}
                  />
                )
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-700">Oclusión</h4>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={data.occlusion.isNormal}
                  onChange={(e) =>
                    update({
                      occlusion: {
                        ...data.occlusion,
                        isNormal: e.target.checked,
                        crossbite: false,
                        crossbiteType: null,
                        openbite: false,
                        deepBite: false,
                        molarRight: e.target.checked ? 'I' : data.occlusion.molarRight,
                        molarLeft: e.target.checked ? 'I' : data.occlusion.molarLeft,
                        canineLeft: e.target.checked ? 'I' : data.occlusion.canineLeft,
                        canineRight: e.target.checked ? 'I' : data.occlusion.canineRight,
                        notes: e.target.checked
                          ? data.occlusion.notes || 'Oclusión normal'
                          : data.occlusion.notes,
                      },
                      findingCie10: e.target.checked
                        ? clearExamFindingCie10ByPrefix(data.findingCie10, 'occlusion.')
                        : data.findingCie10,
                    })
                  }
                  className="rounded border-slate-300 text-dental-600"
                />
                Normal
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {ANGLE_OCCLUSION_FIELD_LABELS.map(({ key, label }) => (
                <div key={key}>
                  <label className="label-field">{label}</label>
                  <select
                    disabled={disabled}
                    value={data.occlusion[key]}
                    onChange={(e) => {
                      const nextValue = e.target.value as AngleClass
                      if (!isAlteredAngleClass(nextValue)) {
                        updateFindingCie10(`occlusion.${key}`, null)
                      }
                      updateOcclusion({
                        [key]: nextValue,
                        isNormal: false,
                      })
                    }}
                    className="input-field"
                  >
                    {ANGLE_CLASS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="flex flex-wrap items-end gap-4 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={disabled || data.occlusion.isNormal}
                    checked={data.occlusion.crossbite}
                    onChange={(e) => {
                      if (!e.target.checked) updateFindingCie10('occlusion.crossbite', null)
                      updateOcclusion({
                        crossbite: e.target.checked,
                        crossbiteType: e.target.checked
                          ? data.occlusion.crossbiteType ?? 'anterior'
                          : null,
                        isNormal: false,
                      })
                    }}
                    className="rounded border-slate-300 text-dental-600"
                  />
                  Mordida cruzada
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={disabled || data.occlusion.isNormal}
                    checked={data.occlusion.openbite}
                    onChange={(e) => {
                      if (!e.target.checked) updateFindingCie10('occlusion.openbite', null)
                      updateOcclusion({ openbite: e.target.checked, isNormal: false })
                    }}
                    className="rounded border-slate-300 text-dental-600"
                  />
                  Mordida abierta
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={disabled || data.occlusion.isNormal}
                    checked={data.occlusion.deepBite}
                    onChange={(e) => {
                      if (!e.target.checked) updateFindingCie10('occlusion.deepBite', null)
                      updateOcclusion({ deepBite: e.target.checked, isNormal: false })
                    }}
                    className="rounded border-slate-300 text-dental-600"
                  />
                  Mordida profunda
                </label>
              </div>
              {data.occlusion.crossbite && !data.occlusion.isNormal && (
                <div className="sm:col-span-2">
                  <label className="label-field">Tipo de mordida cruzada</label>
                  <div className="flex flex-wrap gap-3">
                    {CROSSBITE_TYPE_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className="flex items-center gap-2 text-sm text-slate-700"
                      >
                        <input
                          type="radio"
                          name="occlusion-crossbite-type"
                          disabled={disabled}
                          checked={data.occlusion.crossbiteType === option.value}
                          onChange={() =>
                            updateOcclusion({
                              crossbiteType: option.value as CrossbiteType,
                              isNormal: false,
                            })
                          }
                          className="border-slate-300 text-dental-600 focus:ring-dental-500"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="label-field">Notas de oclusión</label>
                <ExamFindingInputWithCie10
                  inputId="exam-occlusion-notes"
                  value={data.occlusion.notes}
                  onChange={(notes) =>
                    updateOcclusion({
                      notes,
                      isNormal:
                        notes.trim().toLowerCase() === 'normal' ||
                        notes.trim().toLowerCase() === 'oclusión normal',
                    })
                  }
                  cie10={getExamFindingCie10(findingCie10, 'occlusion.notes')}
                  onCie10Change={(link) => updateFindingCie10('occlusion.notes', link)}
                  disabled={disabled}
                  placeholder="Describa hallazgos o anomalías..."
                  className={`input-field ${data.occlusion.isNormal ? 'border-green-300 bg-green-50/60' : ''}`}
                  showSuggestions={!data.occlusion.isNormal || Boolean(data.occlusion.notes.trim())}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-700">Periodonto</h4>
              {!disabled && (
                <TodoNormalButton onClick={markAllPeriodontiumNormal} />
              )}
            </div>
            <PeriodontiumExamSection
              data={data.periodontium}
              disabled={disabled}
              findingCie10={findingCie10}
              onFindingCie10Change={updateFindingCie10}
              onChange={(periodontium) => onChange({ ...data, periodontium })}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
