import { useState } from 'react'
import { specializedAnnexDomId } from '@/constants/specializedAnnexBudgetNav'
import { VoiceDictationButton } from '@/components/voice'
import type {
  DentalImplantsAnnex,
  OrthodonticsAnnex,
  SpecializedAnnexKey,
  SpecializedAnnexes,
} from '@/types/specializedAnnexes'
import { SPECIALIZED_ANNEX_LABELS } from '@/types/specializedAnnexes'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { PeriodonticsAnnexPanel } from './periodontics'
import { RehabilitationAestheticsAnnexPanel } from './rehabilitation'
import { RehabOdontogram } from '@/components/clinical/rehabilitation/rehab-odontogram'
import { EdentulousImplantPlanner } from '@/components/clinical/implants/edentulous-planner'
import { ImplantBoneClassificationSection } from '@/components/clinical/implants/ImplantBoneClassificationSection'
import { ImplantMedicalAnamnesisSection } from '@/components/clinical/implants/ImplantMedicalAnamnesisSection'
import { ImplantPeriodontalAssessmentSection } from '@/components/clinical/implants/ImplantPeriodontalAssessmentSection'
import { OralSurgeryAnnexSection } from '@/components/clinical/oral-surgery'
import { CrowdingSpacingInput, FacialProfileInput, MalocclusionAssessmentInput, MidlineDeviationInput, OrthodonticCalculator, OrthodonticTreatmentPlanInput } from './orthodontics'
import { EndoAnnexForm } from './endodontics'

interface SpecializedAnnexesFormProps {
  data: SpecializedAnnexes
  onChange: (data: SpecializedAnnexes) => void
  disabled?: boolean
  specialistId?: string
}

interface AnnexFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  multiline?: boolean
  inputId?: string
  voiceEnabled?: boolean
}

function AnnexField({
  label,
  value,
  onChange,
  disabled = false,
  placeholder,
  multiline = false,
  inputId,
  voiceEnabled = false,
}: AnnexFieldProps) {
  const fieldId = inputId ?? `annex-${label.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="label-field mb-0" htmlFor={fieldId}>
          {label}
        </label>
        {voiceEnabled && !disabled && (
          <VoiceDictationButton
            targetInputId={fieldId}
            getValue={() => value}
            onValueChange={onChange}
          />
        )}
      </div>
      {multiline ? (
        <textarea
          id={fieldId}
          rows={3}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input-field resize-y text-sm"
        />
      ) : (
        <input
          id={fieldId}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input-field text-sm"
        />
      )}
    </div>
  )
}

const ANNEX_ORDER: SpecializedAnnexKey[] = [
  'periodontics',
  'orthodontics',
  'endodontics',
  'dentalImplants',
  'oralSurgery',
  'rehabilitationAesthetics',
]

export function SpecializedAnnexesForm({
  data,
  onChange,
  disabled = false,
  specialistId = '',
}: SpecializedAnnexesFormProps) {
  const [openAnnexes, setOpenAnnexes] = useState<Set<SpecializedAnnexKey>>(new Set())

  const toggleAnnex = (key: SpecializedAnnexKey) => {
    setOpenAnnexes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const updateOrthodontics = (patch: Partial<OrthodonticsAnnex>) =>
    onChange({ ...data, orthodontics: { ...data.orthodontics, ...patch } })

  const updateEndodontics = (endodontics: SpecializedAnnexes['endodontics']) =>
    onChange({ ...data, endodontics })

  const updateDentalImplants = (patch: Partial<DentalImplantsAnnex>) =>
    onChange({ ...data, dentalImplants: { ...data.dentalImplants, ...patch } })

  const updateOralSurgery = (patch: Partial<SpecializedAnnexes['oralSurgery']>) =>
    onChange({ ...data, oralSurgery: { ...data.oralSurgery, ...patch } })

  return (
    <section className="card">
      <h3 className={`mb-2 ${CLINICAL_SECTION_TITLE_CLASS}`}>
        {clinicalSectionTitle(
          CLINICAL_HISTORY_SECTION_NUMBERS.anexos,
          'Anexos Especializados',
        )}
      </h3>
      <p className="mb-4 text-xs text-slate-500">
        Opcional. Despliegue el anexo correspondiente cuando el caso lo requiera.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {ANNEX_ORDER.map((key) => {
          const isOpen = openAnnexes.has(key)
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => toggleAnnex(key)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                isOpen
                  ? 'bg-dental-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              aria-expanded={isOpen}
            >
              {isOpen ? '▾ ' : '▸ '}
              {SPECIALIZED_ANNEX_LABELS[key]}
            </button>
          )
        })}
      </div>

      {openAnnexes.has('periodontics') && (
        <div
          id={specializedAnnexDomId('periodontics')}
          className="mb-4 scroll-mt-24 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
        >
          <PeriodonticsAnnexPanel
            data={data.periodontics}
            onChange={(periodontics) => onChange({ ...data, periodontics })}
            disabled={disabled}
          />
        </div>
      )}

      {openAnnexes.has('orthodontics') && (
        <div
          id={specializedAnnexDomId('orthodontics')}
          className="mb-4 scroll-mt-24 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
        >
          <h4 className="text-sm font-semibold text-slate-800">
            {SPECIALIZED_ANNEX_LABELS.orthodontics}
          </h4>
          <div className="space-y-4">
            <FacialProfileInput
              value={data.orthodontics.facialProfile}
              onChange={(facialProfile) => updateOrthodontics({ facialProfile })}
              disabled={disabled}
            />
            <MidlineDeviationInput
              value={data.orthodontics.midlineDeviation}
              onChange={(midlineDeviation) => updateOrthodontics({ midlineDeviation })}
              disabled={disabled}
            />
            <CrowdingSpacingInput
              value={data.orthodontics.crowdingSpacingAssessment}
              onChange={(crowdingSpacingAssessment) =>
                updateOrthodontics({ crowdingSpacingAssessment })
              }
              disabled={disabled}
            />
            <MalocclusionAssessmentInput
              value={data.orthodontics.malocclusionAssessment}
              onChange={(malocclusionAssessment) =>
                updateOrthodontics({ malocclusionAssessment })
              }
              disabled={disabled}
            />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <OrthodonticTreatmentPlanInput
              treatmentType={data.orthodontics.treatmentType}
              conventionalBracketType={data.orthodontics.conventionalBracketType}
              alignerTreatmentMode={data.orthodontics.alignerTreatmentMode}
              alignerPhaseCount={data.orthodontics.alignerPhaseCount}
              maxillaryOrthopedicsAppliance={data.orthodontics.maxillaryOrthopedicsAppliance}
              treatmentDurationMonths={data.orthodontics.treatmentDurationMonths}
              onTreatmentPlanChange={(patch) => updateOrthodontics(patch)}
              disabled={disabled}
            />
            <OrthodonticCalculator
              plan={{
                treatmentType: data.orthodontics.treatmentType,
                conventionalBracketType: data.orthodontics.conventionalBracketType,
                alignerTreatmentMode: data.orthodontics.alignerTreatmentMode,
                alignerPhaseCount: data.orthodontics.alignerPhaseCount,
                maxillaryOrthopedicsAppliance: data.orthodontics.maxillaryOrthopedicsAppliance,
                treatmentDurationMonths: data.orthodontics.treatmentDurationMonths,
              }}
              value={data.orthodontics.orthodonticBudget}
              onChange={(orthodonticBudget) => updateOrthodontics({ orthodonticBudget })}
              disabled={disabled}
            />
            <div className="sm:col-span-2">
              <AnnexField
                label="Notas adicionales"
                value={data.orthodontics.notes}
                onChange={(notes) => updateOrthodontics({ notes })}
                disabled={disabled}
                placeholder="Observaciones del anexo de ortodoncia..."
                multiline
                inputId="orthodontics-notes"
                voiceEnabled
              />
            </div>
          </div>
        </div>
      )}

      {openAnnexes.has('endodontics') && (
        <div
          id={specializedAnnexDomId('endodontics')}
          className="mb-4 scroll-mt-24 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
        >
          <EndoAnnexForm
            value={data.endodontics}
            onChange={updateEndodontics}
            disabled={disabled}
            specialistId={specialistId}
          />
        </div>
      )}

      {openAnnexes.has('dentalImplants') && (
        <div
          id={specializedAnnexDomId('dentalImplants')}
          className="scroll-mt-24 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
        >
          <h4 className="text-sm font-semibold text-slate-800">
            {SPECIALIZED_ANNEX_LABELS.dentalImplants}
          </h4>
          <div className="space-y-3">
            <ImplantMedicalAnamnesisSection
              value={data.dentalImplants.medicalAnamnesis}
              onChange={(medicalAnamnesis) => updateDentalImplants({ medicalAnamnesis })}
              disabled={disabled}
            />

            <OralSurgeryAnnexSection
              variant="implants"
              value={data.dentalImplants.surgicalRiskAssessment}
              onChange={(surgicalRiskAssessment) => updateDentalImplants({ surgicalRiskAssessment })}
              disabled={disabled}
            />

            <ImplantPeriodontalAssessmentSection
              value={data.dentalImplants.periodontalAssessment}
              onChange={(periodontalAssessment) => updateDentalImplants({ periodontalAssessment })}
              disabled={disabled}
            />

            <ImplantBoneClassificationSection
                value={data.dentalImplants.implantPlacementPlan.quadrantBoneClassification}
                onChange={(quadrantBoneClassification) =>
                  updateDentalImplants({
                    implantPlacementPlan: {
                      ...data.dentalImplants.implantPlacementPlan,
                      quadrantBoneClassification,
                    },
                  })
                }
                disabled={disabled}
            />

            <EdentulousImplantPlanner
              value={data.dentalImplants.implantPlacementPlan}
              onChange={(implantPlacementPlan) => updateDentalImplants({ implantPlacementPlan })}
              medicalAnamnesis={data.dentalImplants.medicalAnamnesis}
              surgicalRiskAssessment={data.dentalImplants.surgicalRiskAssessment}
              periodontalAssessment={data.dentalImplants.periodontalAssessment}
              disabled={disabled}
            />

            <RehabOdontogram
              variant="implants"
              value={data.dentalImplants.visualTreatmentPlan}
              protesisTotal={data.dentalImplants.protesisTotal}
              protesisParcialRemovible={data.dentalImplants.protesisParcialRemovible}
              onChange={(visualTreatmentPlan) => updateDentalImplants({ visualTreatmentPlan })}
              onProtesisTotalChange={(protesisTotal) => updateDentalImplants({ protesisTotal })}
              onProtesisParcialRemovibleChange={(protesisParcialRemovible) =>
                updateDentalImplants({ protesisParcialRemovible })
              }
              restorationDetails={data.dentalImplants.restorationDetails}
              onRestorationDetailsChange={(restorationDetails) =>
                updateDentalImplants({ restorationDetails })
              }
              title="Esquema de Planificacion de Implantes en Arcos Dentados"
              disabled={disabled}
            />

            <AnnexField
              label="Notas adicionales"
              value={data.dentalImplants.notes}
              onChange={(notes) => updateDentalImplants({ notes })}
              disabled={disabled}
              placeholder="Observaciones del anexo de implantes..."
              multiline
              inputId="implants-notes"
              voiceEnabled
            />
          </div>
        </div>
      )}

      {openAnnexes.has('oralSurgery') && (
        <div
          id={specializedAnnexDomId('oralSurgery')}
          className="mb-4 scroll-mt-24 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
        >
          <OralSurgeryAnnexSection
            value={data.oralSurgery}
            onChange={(oralSurgery) => updateOralSurgery(oralSurgery)}
            disabled={disabled}
          />
        </div>
      )}

      {openAnnexes.has('rehabilitationAesthetics') && (
        <div
          id={specializedAnnexDomId('rehabilitationAesthetics')}
          className="scroll-mt-24 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
        >
          <RehabilitationAestheticsAnnexPanel
            data={data.rehabilitationAesthetics}
            onChange={(rehabilitationAesthetics) => onChange({ ...data, rehabilitationAesthetics })}
            disabled={disabled}
          />
        </div>
      )}
    </section>
  )
}
