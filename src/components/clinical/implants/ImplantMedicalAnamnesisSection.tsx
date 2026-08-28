import { FDI_QUADRANT_ORDER } from '@/constants/implantPlanning'
import type { ImplantFdiQuadrant } from '@/constants/implantPlanning'
import {
  IMPLANT_CRITICAL_MEDICATION_OPTIONS,
  IMPLANT_LOCAL_PATHOLOGY_OPTIONS,
  IMPLANT_SMOKING_STATUS_OPTIONS,
  IMPLANT_SYSTEMIC_RISK_CONDITION_OPTIONS,
  IMPLANT_TOXIC_HABIT_OPTIONS,
  type ImplantCriticalMedicationId,
  type ImplantLocalPathologyId,
  type ImplantMedicalAnamnesis,
  type ImplantSystemicRiskConditionId,
} from '@/types/implantMedicalAnamnesis'

interface ImplantMedicalAnamnesisSectionProps {
  value: ImplantMedicalAnamnesis
  onChange: (value: ImplantMedicalAnamnesis) => void
  disabled?: boolean
}

function toggleCondition(
  value: ImplantMedicalAnamnesis,
  id: ImplantSystemicRiskConditionId,
  checked: boolean,
): ImplantMedicalAnamnesis {
  return {
    ...value,
    systemicRiskConditions: {
      ...value.systemicRiskConditions,
      [id]: checked,
    },
  }
}

function toggleMedication(
  value: ImplantMedicalAnamnesis,
  id: ImplantCriticalMedicationId,
  checked: boolean,
): ImplantMedicalAnamnesis {
  return {
    ...value,
    criticalMedications: {
      ...value.criticalMedications,
      [id]: checked,
    },
  }
}

function toggleLocalPathology(
  value: ImplantMedicalAnamnesis,
  id: ImplantLocalPathologyId,
  present: boolean,
): ImplantMedicalAnamnesis {
  return {
    ...value,
    localPathologies: {
      ...value.localPathologies,
      [id]: {
        present,
        affectedQuadrants: present ? value.localPathologies[id].affectedQuadrants : [],
      },
    },
  }
}

function toggleLocalPathologyQuadrant(
  value: ImplantMedicalAnamnesis,
  id: ImplantLocalPathologyId,
  quadrant: ImplantFdiQuadrant,
): ImplantMedicalAnamnesis {
  const current = value.localPathologies[id].affectedQuadrants
  const affectedQuadrants = current.includes(quadrant)
    ? current.filter((item) => item !== quadrant)
    : [...current, quadrant]

  return {
    ...value,
    localPathologies: {
      ...value.localPathologies,
      [id]: {
        present: true,
        affectedQuadrants,
      },
    },
  }
}

export function ImplantMedicalAnamnesisSection({
  value,
  onChange,
  disabled = false,
}: ImplantMedicalAnamnesisSectionProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">
          Anamnesis Médica y Evaluación de Riesgo Sistémico
        </h3>
        <p className="text-xs text-slate-500">
          Evaluación previa a la colocación de implantes. Registre antecedentes, medicaciones y
          patologías locales relevantes.
        </p>
      </header>

      <div className="space-y-5 p-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Antecedentes de radioterapia
          </h4>
          <p className="mt-1 text-[11px] text-slate-500">
            Región de cabeza y cuello. Riesgo elevado de osteorradionecrosis.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: 'No', hasHistory: false },
              { label: 'Sí', hasHistory: true },
            ].map((option) => {
              const active = value.radiotherapyHistory.hasHistory === option.hasHistory
              return (
                <button
                  key={option.label}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      ...value,
                      radiotherapyHistory: {
                        ...value.radiotherapyHistory,
                        hasHistory: option.hasHistory,
                        ...(option.hasHistory
                          ? {}
                          : {
                              irradiatedZone: '',
                              approximateDoseGy: '',
                              timeSinceTreatment: '',
                            }),
                      },
                    })
                  }
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? option.hasHistory
                        ? 'border-red-300 bg-red-50 text-red-800'
                        : 'border-dental-500 bg-dental-50 text-dental-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>

          {value.radiotherapyHistory.hasHistory && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="text-[11px] text-slate-500">
                Zona irradiada
                <input
                  type="text"
                  value={value.radiotherapyHistory.irradiatedZone}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      radiotherapyHistory: {
                        ...value.radiotherapyHistory,
                        irradiatedZone: event.target.value,
                      },
                    })
                  }
                  placeholder="Ej. maxilar superior derecho"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
                />
              </label>
              <label className="text-[11px] text-slate-500">
                Dosis aproximada (Gy)
                <input
                  type="text"
                  value={value.radiotherapyHistory.approximateDoseGy}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      radiotherapyHistory: {
                        ...value.radiotherapyHistory,
                        approximateDoseGy: event.target.value,
                      },
                    })
                  }
                  placeholder="Ej. 60"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
                />
              </label>
              <label className="text-[11px] text-slate-500">
                Tiempo desde el tratamiento
                <input
                  type="text"
                  value={value.radiotherapyHistory.timeSinceTreatment}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      radiotherapyHistory: {
                        ...value.radiotherapyHistory,
                        timeSinceTreatment: event.target.value,
                      },
                    })
                  }
                  placeholder="Ej. 3 años"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
                />
              </label>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Patologías locales ocultas y focos infecciosos
          </h4>
          <p className="mt-1 text-[11px] text-slate-500">
            Marque los hallazgos presentes e indique el cuadrante afectado.
          </p>

          <ul className="mt-3 space-y-3">
            {IMPLANT_LOCAL_PATHOLOGY_OPTIONS.map((option) => {
              const record = value.localPathologies[option.id]
              const quadrants = option.applicableQuadrants ?? FDI_QUADRANT_ORDER

              return (
                <li key={option.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={record.present}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange(toggleLocalPathology(value, option.id, event.target.checked))
                      }
                      className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
                    />
                    <span>{option.label}</span>
                  </label>

                  {record.present && (
                    <div className="mt-2 pl-5">
                      <p className="text-[10px] font-medium text-slate-500">Cuadrante afectado</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {quadrants.map((quadrant) => {
                          const active = record.affectedQuadrants.includes(quadrant)
                          return (
                            <button
                              key={quadrant}
                              type="button"
                              disabled={disabled}
                              onClick={() =>
                                onChange(toggleLocalPathologyQuadrant(value, option.id, quadrant))
                              }
                              className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                                active
                                  ? 'border-amber-400 bg-amber-50 text-amber-900'
                                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              {quadrant}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Antecedentes de tabaquismo y hábitos tóxicos
          </h4>
          <p className="mt-1 text-[11px] text-slate-500">
            Evalúe el hábito tabáquico y sustancias que puedan afectar la osteointegración.
          </p>

          <div className="mt-3 space-y-2">
            {IMPLANT_SMOKING_STATUS_OPTIONS.map((option) => {
              const active = value.smokingAssessment.status === option.id
              return (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                    active
                      ? option.id === 'moderate_heavy_smoker'
                        ? 'border-amber-400 bg-amber-50 text-amber-900'
                        : 'border-dental-500 bg-dental-50 text-dental-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="implant-smoking-status"
                    checked={active}
                    disabled={disabled}
                    onChange={() =>
                      onChange({
                        ...value,
                        smokingAssessment: {
                          ...value.smokingAssessment,
                          status: option.id,
                          cessationTime:
                            option.id === 'former_smoker' ? value.smokingAssessment.cessationTime : '',
                        },
                      })
                    }
                    className="mt-0.5 h-3.5 w-3.5 border-slate-300 text-dental-600 focus:ring-dental-500"
                  />
                  <span>{option.label}</span>
                </label>
              )
            })}
          </div>

          {value.smokingAssessment.status === 'former_smoker' && (
            <label className="mt-3 block text-[11px] text-slate-500">
              Tiempo de cesación
              <input
                type="text"
                value={value.smokingAssessment.cessationTime}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    smokingAssessment: {
                      ...value.smokingAssessment,
                      cessationTime: event.target.value,
                    },
                  })
                }
                placeholder="Ej. 2 años"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
              />
            </label>
          )}

          <label className="mt-3 block text-[11px] text-slate-500">
            Índice de paquetes-año (opcional)
            <input
              type="text"
              value={value.smokingAssessment.packYears}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  smokingAssessment: {
                    ...value.smokingAssessment,
                    packYears: event.target.value,
                  },
                })
              }
              placeholder="Ej. 15"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
            />
          </label>

          <div className="mt-4">
            <p className="text-[11px] font-medium text-slate-600">Otros hábitos tóxicos relevantes</p>
            <ul className="mt-2 space-y-2">
              {IMPLANT_TOXIC_HABIT_OPTIONS.map((option) => (
                <li key={option.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={value.toxicHabits[option.id]}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({
                          ...value,
                          toxicHabits: {
                            ...value.toxicHabits,
                            [option.id]: event.target.checked,
                          },
                        })
                      }
                      className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
                    />
                    <span>{option.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <label className="mt-2 block text-[11px] text-slate-500">
              Detalle de otras sustancias
              <input
                type="text"
                value={value.toxicHabits.otherSubstancesNotes}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    toxicHabits: {
                      ...value.toxicHabits,
                      otherSubstancesNotes: event.target.value,
                    },
                  })
                }
                placeholder="Especificar sustancia, frecuencia y observaciones..."
                className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
              />
            </label>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Condiciones sistémicas de riesgo
          </h4>
          <ul className="mt-2 space-y-2">
            {IMPLANT_SYSTEMIC_RISK_CONDITION_OPTIONS.map((option) => (
              <li key={option.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={value.systemicRiskConditions[option.id]}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange(toggleCondition(value, option.id, event.target.checked))
                    }
                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
                  />
                  <span>{option.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Medicaciones críticas
          </h4>
          <ul className="mt-2 space-y-2">
            {IMPLANT_CRITICAL_MEDICATION_OPTIONS.map((option) => (
              <li key={option.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={value.criticalMedications[option.id]}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange(toggleMedication(value, option.id, event.target.checked))
                    }
                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
                  />
                  <span>{option.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <label className="block text-[11px] text-slate-500">
          Observaciones clínicas adicionales
          <textarea
            value={value.clinicalNotes}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, clinicalNotes: event.target.value })}
            rows={3}
            placeholder="Interconsulta médica, controles, medicación específica, observaciones..."
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700"
          />
        </label>
      </div>
    </section>
  )
}
