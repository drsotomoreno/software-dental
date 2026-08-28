import {

  SAGITAL_CLASS_OPTIONS,

  TRANSVERSAL_DENTAL_OPTIONS,

  TRANSVERSAL_SKELETAL_OPTIONS,

  VERTICAL_SKELETAL_OPTIONS,

  type MalocclusionAssessment,

} from '@/types/orthodonticsAnnex'

import OverbiteInput from './OverbiteInput'

import OverjetInput from './OverjetInput'



export interface MalocclusionAssessmentInputProps {

  value: MalocclusionAssessment

  onChange: (value: MalocclusionAssessment) => void

  disabled?: boolean

}



function optionClass(active: boolean, disabled?: boolean): string {

  if (disabled) return 'bg-slate-100 text-slate-400 cursor-not-allowed'

  if (active) return 'bg-dental-600 text-white shadow-sm'

  return 'bg-slate-100 text-slate-700 hover:bg-slate-200'

}



function SagitalClassSelect({

  label,

  fieldKey,

  value,

  disabled,

  onChange,

}: {

  label: string

  fieldKey: 'sagitalDental' | 'sagitalEsqueletica'

  value: MalocclusionAssessment

  disabled?: boolean

  onChange: (value: MalocclusionAssessment) => void

}) {

  const selected = value[fieldKey]



  return (

    <div>

      <p className="label-field mb-2">{label}</p>

      <div className="flex flex-wrap gap-2">

        {SAGITAL_CLASS_OPTIONS.map((option) => (

          <button

            key={`${fieldKey}-${option.value}`}

            type="button"

            disabled={disabled}

            onClick={() =>

              onChange({

                ...value,

                [fieldKey]: selected === option.value ? '' : option.value,

              })

            }

            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${optionClass(

              selected === option.value,

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



function VerticalSkeletalSelect({

  value,

  disabled,

  onChange,

}: {

  value: MalocclusionAssessment

  disabled?: boolean

  onChange: (value: MalocclusionAssessment) => void

}) {

  const selected = value.verticalEsqueletica



  return (

    <div>

      <p className="label-field mb-2">Maloclusión vertical esquelética</p>

      <div className="flex flex-wrap gap-2">

        {VERTICAL_SKELETAL_OPTIONS.map((option) => (

          <button

            key={`vertical-skeletal-${option.value}`}

            type="button"

            disabled={disabled}

            onClick={() =>

              onChange({

                ...value,

                verticalEsqueletica: selected === option.value ? '' : option.value,

              })

            }

            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${optionClass(

              selected === option.value,

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



function TransversalDentalSelect({

  value,

  disabled,

  onChange,

}: {

  value: MalocclusionAssessment

  disabled?: boolean

  onChange: (value: MalocclusionAssessment) => void

}) {

  const selected = value.transversalDental



  return (

    <div className="sm:col-span-2">

      <p className="label-field mb-2">Maloclusión transversal dental</p>

      <div className="flex flex-wrap gap-2">

        {TRANSVERSAL_DENTAL_OPTIONS.map((option) => (

          <button

            key={`transversal-dental-${option.value}`}

            type="button"

            disabled={disabled}

            onClick={() =>

              onChange({

                ...value,

                transversalDental: selected === option.value ? '' : option.value,

              })

            }

            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${optionClass(

              selected === option.value,

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



function TransversalSkeletalSelect({

  value,

  disabled,

  onChange,

}: {

  value: MalocclusionAssessment

  disabled?: boolean

  onChange: (value: MalocclusionAssessment) => void

}) {

  const selected = value.transversalEsqueletica



  return (

    <div className="sm:col-span-2">

      <p className="label-field mb-2">Maloclusión transversal esquelética</p>

      <div className="flex flex-wrap gap-2">

        {TRANSVERSAL_SKELETAL_OPTIONS.map((option) => (

          <button

            key={`transversal-skeletal-${option.value}`}

            type="button"

            disabled={disabled}

            onClick={() =>

              onChange({

                ...value,

                transversalEsqueletica: selected === option.value ? '' : option.value,

              })

            }

            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${optionClass(

              selected === option.value,

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



export default function MalocclusionAssessmentInput({

  value,

  onChange,

  disabled = false,

}: MalocclusionAssessmentInputProps) {

  return (

    <div className="space-y-4">

      <div className="rounded-xl border border-slate-200 bg-white p-4">

        <h5 className="mb-3 text-sm font-semibold text-slate-800">Maloclusión Dental</h5>

        <div className="grid gap-3 sm:grid-cols-2">

          <SagitalClassSelect

            label="Maloclusión sagital dental"

            fieldKey="sagitalDental"

            value={value}

            disabled={disabled}

            onChange={onChange}

          />

          <div className="sm:col-span-2 grid gap-4 lg:grid-cols-2">

            <OverjetInput

              embedded

              value={value.overjet}

              onChange={(overjet) => onChange({ ...value, overjet })}

              disabled={disabled}

            />

            <OverbiteInput

              embedded

              value={value.overbite}

              onChange={(overbite) => onChange({ ...value, overbite })}

              disabled={disabled}

            />

          </div>

          <TransversalDentalSelect value={value} disabled={disabled} onChange={onChange} />

        </div>

      </div>



      <div className="rounded-xl border border-slate-200 bg-white p-4">

        <h5 className="mb-3 text-sm font-semibold text-slate-800">Maloclusión Esquelética</h5>

        <div className="grid gap-3 sm:grid-cols-2">

          <SagitalClassSelect

            label="Maloclusión sagital esquelética"

            fieldKey="sagitalEsqueletica"

            value={value}

            disabled={disabled}

            onChange={onChange}

          />

          <VerticalSkeletalSelect value={value} disabled={disabled} onChange={onChange} />

          <TransversalSkeletalSelect value={value} disabled={disabled} onChange={onChange} />

        </div>

      </div>

    </div>

  )

}


