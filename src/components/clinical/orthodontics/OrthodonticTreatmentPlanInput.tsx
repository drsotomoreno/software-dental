import {
  ALIGNER_PHASE_COUNT_OPTIONS,
  ALIGNER_TREATMENT_MODE_OPTIONS,
  orthodonticTreatmentTypeUsesAligners,
  orthodonticTreatmentTypeUsesBrackets,
  orthodonticTreatmentTypeUsesMaxillaryOrthopedics,
  ORTHODONTIC_TREATMENT_TYPE_OPTIONS,
  CONVENTIONAL_BRACKET_TYPE_OPTIONS,
  MAXILLARY_ORTHOPEDICS_APPLIANCE_TYPE_OPTIONS,
  getOrthodonticTreatmentDurationMonthOptions,
  createEmptyMaxillaryOrthopedicsAppliance,
  type AlignerPhaseCount,
  type AlignerTreatmentMode,
  type ConventionalBracketType,
  type MaxillaryOrthopedicsAppliance,
  type MaxillaryOrthopedicsApplianceType,
  type OrthodonticTreatmentType,
} from '@/types/orthodonticsAnnex'

export interface OrthodonticTreatmentPlanInputProps {
  treatmentType: OrthodonticTreatmentType
  conventionalBracketType: ConventionalBracketType
  alignerTreatmentMode: AlignerTreatmentMode
  alignerPhaseCount: AlignerPhaseCount
  maxillaryOrthopedicsAppliance: MaxillaryOrthopedicsAppliance
  treatmentDurationMonths: number | null
  onTreatmentPlanChange: (patch: {
    treatmentType?: OrthodonticTreatmentType
    conventionalBracketType?: ConventionalBracketType
    alignerTreatmentMode?: AlignerTreatmentMode
    alignerPhaseCount?: AlignerPhaseCount
    maxillaryOrthopedicsAppliance?: MaxillaryOrthopedicsAppliance
    treatmentDurationMonths?: number | null
  }) => void
  disabled?: boolean
}

function optionClass(active: boolean, disabled?: boolean): string {
  if (disabled) return 'bg-slate-100 text-slate-400 cursor-not-allowed'
  if (active) return 'bg-dental-600 text-white shadow-sm'
  return 'bg-slate-100 text-slate-700 hover:bg-slate-200'
}

function clearTreatmentSubtypes(): {
  conventionalBracketType: ConventionalBracketType
  alignerTreatmentMode: AlignerTreatmentMode
  alignerPhaseCount: AlignerPhaseCount
  maxillaryOrthopedicsAppliance: MaxillaryOrthopedicsAppliance
} {
  return {
    conventionalBracketType: '',
    alignerTreatmentMode: '',
    alignerPhaseCount: '',
    maxillaryOrthopedicsAppliance: createEmptyMaxillaryOrthopedicsAppliance(),
  }
}

export default function OrthodonticTreatmentPlanInput({
  treatmentType,
  conventionalBracketType,
  alignerTreatmentMode,
  alignerPhaseCount,
  maxillaryOrthopedicsAppliance,
  treatmentDurationMonths,
  onTreatmentPlanChange,
  disabled = false,
}: OrthodonticTreatmentPlanInputProps) {
  const handleTreatmentType = (type: Exclude<OrthodonticTreatmentType, ''>) => {
    if (treatmentType === type) {
      onTreatmentPlanChange({ treatmentType: '', ...clearTreatmentSubtypes() })
      return
    }

    onTreatmentPlanChange({
      treatmentType: type,
      conventionalBracketType: orthodonticTreatmentTypeUsesBrackets(type)
        ? conventionalBracketType
        : '',
      alignerTreatmentMode: orthodonticTreatmentTypeUsesAligners(type) ? alignerTreatmentMode : '',
      alignerPhaseCount:
        orthodonticTreatmentTypeUsesAligners(type) && alignerTreatmentMode === 'por_fases'
          ? alignerPhaseCount
          : '',
      maxillaryOrthopedicsAppliance: orthodonticTreatmentTypeUsesMaxillaryOrthopedics(type)
        ? maxillaryOrthopedicsAppliance
        : createEmptyMaxillaryOrthopedicsAppliance(),
    })
  }

  const showBracketSelector = orthodonticTreatmentTypeUsesBrackets(treatmentType)
  const showAlignerSelector = orthodonticTreatmentTypeUsesAligners(treatmentType)
  const showMaxillaryOrthopedicsSelector =
    orthodonticTreatmentTypeUsesMaxillaryOrthopedics(treatmentType)
  const showAlignerPhaseSelector = showAlignerSelector && alignerTreatmentMode === 'por_fases'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
      <h5 className="mb-3 text-sm font-semibold text-slate-800">
        Plan de Tratamiento de Ortodoncia
      </h5>

      <div className="space-y-4">
        <div>
          <p className="label-field mb-2">Tipo de Tratamiento de Ortodoncia</p>
          <div className="flex flex-wrap gap-2">
            {ORTHODONTIC_TREATMENT_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                onClick={() => handleTreatmentType(option.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${optionClass(
                  treatmentType === option.value,
                  disabled,
                )}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {showBracketSelector ? (
          <div>
            <label className="label-field" htmlFor="orthodontics-bracket-type">
              Tipo de brackets
            </label>
            <select
              id="orthodontics-bracket-type"
              disabled={disabled}
              value={conventionalBracketType}
              onChange={(event) =>
                onTreatmentPlanChange({
                  conventionalBracketType: event.target.value as ConventionalBracketType,
                })
              }
              className="input-field text-sm"
            >
              <option value="">Seleccione una opción</option>
              {CONVENTIONAL_BRACKET_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {showAlignerSelector ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <label className="label-field" htmlFor="orthodontics-aligner-mode">
                Modalidad de tratamiento con alineadores
              </label>
              <select
                id="orthodontics-aligner-mode"
                disabled={disabled}
                value={alignerTreatmentMode}
                onChange={(event) => {
                  const mode = event.target.value as AlignerTreatmentMode
                  onTreatmentPlanChange({
                    alignerTreatmentMode: mode,
                    alignerPhaseCount: mode === 'por_fases' ? alignerPhaseCount : '',
                  })
                }}
                className="input-field text-sm"
              >
                <option value="">Seleccione una opción</option>
                {ALIGNER_TREATMENT_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0">
              <label className="label-field" htmlFor="orthodontics-aligner-phases">
                Número de fases
              </label>
              <select
                id="orthodontics-aligner-phases"
                disabled={disabled || !showAlignerPhaseSelector}
                value={alignerPhaseCount}
                onChange={(event) =>
                  onTreatmentPlanChange({
                    alignerPhaseCount: event.target.value as AlignerPhaseCount,
                  })
                }
                className="input-field text-sm"
              >
                <option value="">
                  {showAlignerPhaseSelector ? 'Seleccione una opción' : 'No aplica'}
                </option>
                {ALIGNER_PHASE_COUNT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {showMaxillaryOrthopedicsSelector ? (
          <div className="space-y-4">
            <div>
              <label className="label-field" htmlFor="orthodontics-maxillary-appliance-type">
                Tipo de aparato de ortopedia
              </label>
              <select
                id="orthodontics-maxillary-appliance-type"
                disabled={disabled}
                value={maxillaryOrthopedicsAppliance.type}
                onChange={(event) =>
                  onTreatmentPlanChange({
                    maxillaryOrthopedicsAppliance: {
                      ...maxillaryOrthopedicsAppliance,
                      type: event.target.value as MaxillaryOrthopedicsApplianceType,
                    },
                  })
                }
                className="input-field text-sm"
              >
                <option value="">Seleccione una opción</option>
                {MAXILLARY_ORTHOPEDICS_APPLIANCE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label-field" htmlFor="orthodontics-maxillary-appliance-name">
                  Nombre del aparato
                </label>
                <input
                  id="orthodontics-maxillary-appliance-name"
                  type="text"
                  disabled={disabled}
                  value={maxillaryOrthopedicsAppliance.name}
                  onChange={(event) =>
                    onTreatmentPlanChange({
                      maxillaryOrthopedicsAppliance: {
                        ...maxillaryOrthopedicsAppliance,
                        name: event.target.value,
                      },
                    })
                  }
                  placeholder="Ej.: Expansor tipo Hyrax, Máscara de tracción..."
                  className="input-field text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label
                  className="label-field"
                  htmlFor="orthodontics-maxillary-appliance-description"
                >
                  Descripción del aparato
                </label>
                <textarea
                  id="orthodontics-maxillary-appliance-description"
                  rows={3}
                  disabled={disabled}
                  value={maxillaryOrthopedicsAppliance.description}
                  onChange={(event) =>
                    onTreatmentPlanChange({
                      maxillaryOrthopedicsAppliance: {
                        ...maxillaryOrthopedicsAppliance,
                        description: event.target.value,
                      },
                    })
                  }
                  placeholder="Indicación, ajustes, protocolo de uso..."
                  className="input-field resize-y text-sm"
                />
              </div>
            </div>
          </div>
        ) : null}

        <div>
          <label className="label-field" htmlFor="orthodontics-treatment-duration">
            Detalles del plan — Duración del tratamiento en meses
          </label>
          <select
            id="orthodontics-treatment-duration"
            disabled={disabled}
            value={treatmentDurationMonths ?? ''}
            onChange={(event) => {
              const raw = event.target.value
              onTreatmentPlanChange({
                treatmentDurationMonths: raw ? Number(raw) : null,
              })
            }}
            className="input-field text-sm"
          >
            <option value="">Seleccione una opción</option>
            {getOrthodonticTreatmentDurationMonthOptions().map((month) => (
              <option key={month} value={month}>
                {month} meses
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
