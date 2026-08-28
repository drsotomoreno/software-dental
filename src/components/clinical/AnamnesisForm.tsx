import type { Anamnesis } from '@/types/anamnesis'
import type { VitalSignsExam } from '@/types/stomatologicalExam'
import {
  CRITICAL_MEDICATION_OPTIONS,
  NO_REPORTA_LABEL,
  SYSTEMIC_DISEASES_OPTIONS,
  normalizeAnamnesis,
} from '@/types/anamnesis'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { VoiceDictationButton } from '@/components/voice'
import { ClinicalPrecautionAlertBanner } from './ClinicalPrecautionAlertBanner'
import { getClinicalPrecautionAlert } from '@/utils/clinicalPrecautionAlerts'
import { NoReportaCheckbox } from './TodoNormalControl'

interface AnamnesisFormProps {
  data: Anamnesis
  onChange: (data: Anamnesis) => void
  disabled?: boolean
  vitalSigns?: VitalSignsExam
}

interface SectionHeaderProps {
  title: string
  noReporta: boolean
  onNoReportaChange: (checked: boolean) => void
  disabled?: boolean
}

function SectionHeader({
  title,
  noReporta,
  onNoReportaChange,
  disabled = false,
}: SectionHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
      <NoReportaCheckbox
        checked={noReporta}
        disabled={disabled}
        onChange={onNoReportaChange}
      />
    </div>
  )
}

interface TextFieldWithNoReportaProps {
  label: string
  fieldId: string
  value: string
  noReporta: boolean
  onChange: (value: string, noReporta: boolean) => void
  disabled?: boolean
  placeholder?: string
  rows?: number
}

function TextFieldWithNoReporta({
  label,
  fieldId,
  value,
  noReporta,
  onChange,
  disabled = false,
  placeholder,
  rows = 2,
}: TextFieldWithNoReportaProps) {
  const handleNoReportaToggle = (checked: boolean) => {
    onChange(checked ? NO_REPORTA_LABEL : '', checked)
  }

  const handleValueChange = (text: string) => {
    const trimmed = text.trim()
    const isNoReporta =
      trimmed === '' ? noReporta : trimmed.toLowerCase() === NO_REPORTA_LABEL.toLowerCase()
    onChange(text, isNoReporta)
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="label-field mb-0">{label}</label>
        <div className="flex items-center gap-2">
          {!disabled && !noReporta && (
            <VoiceDictationButton
              targetInputId={fieldId}
              getValue={() => value}
              onValueChange={(text) => handleValueChange(text)}
            />
          )}
          <NoReportaCheckbox
            checked={noReporta}
            disabled={disabled}
            onChange={handleNoReportaToggle}
          />
        </div>
      </div>
      <textarea
        id={fieldId}
        rows={rows}
        disabled={disabled || noReporta}
        value={noReporta ? NO_REPORTA_LABEL : value}
        onChange={(e) => handleValueChange(e.target.value)}
        placeholder={
          noReporta ? NO_REPORTA_LABEL : placeholder ?? 'Describa o marque "No reporta"...'
        }
        className={`input-field resize-y transition-colors ${
          noReporta ? 'border-green-300 bg-green-50/60' : ''
        }`}
      />
    </div>
  )
}

export function AnamnesisForm({
  data,
  onChange,
  disabled = false,
  vitalSigns,
}: AnamnesisFormProps) {
  const anamnesis = normalizeAnamnesis(data)
  const update = (patch: Partial<Anamnesis>) => onChange({ ...anamnesis, ...patch })

  const updateAllergies = (patch: Partial<Anamnesis['allergies']>) =>
    onChange({ ...anamnesis, allergies: { ...anamnesis.allergies, ...patch }, allergiesNoReporta: false })

  const toggleDisease = (disease: string) => {
    const diseases = anamnesis.systemicDiseases.includes(disease)
      ? anamnesis.systemicDiseases.filter((d) => d !== disease)
      : [...anamnesis.systemicDiseases, disease]
    update({ systemicDiseases: diseases, systemicDiseasesNoReporta: false })
  }

  const toggleCriticalMedication = (medication: string) => {
    const medications = anamnesis.criticalMedications.includes(medication)
      ? anamnesis.criticalMedications.filter((item) => item !== medication)
      : [...anamnesis.criticalMedications, medication]
    update({ criticalMedications: medications })
  }

  const precautionAlert = getClinicalPrecautionAlert(anamnesis, vitalSigns)

  const setAllergiesNoReporta = (checked: boolean) => {
    update({
      allergiesNoReporta: checked,
      allergies: checked
        ? { medications: '', anesthesia: '', other: '' }
        : anamnesis.allergies,
    })
  }

  const setSystemicDiseasesNoReporta = (checked: boolean) => {
    update({
      systemicDiseasesNoReporta: checked,
      systemicDiseases: checked ? [] : anamnesis.systemicDiseases,
      systemicDiseasesOther: checked ? '' : anamnesis.systemicDiseasesOther,
    })
  }

  return (
    <section className="card">
      <h3 className={`mb-4 ${CLINICAL_SECTION_TITLE_CLASS}`}>
        {clinicalSectionTitle(
          CLINICAL_HISTORY_SECTION_NUMBERS.anamnesis,
          'Datos Generales y Anamnesis',
        )}
      </h3>

      <ClinicalPrecautionAlertBanner alert={precautionAlert} className="mb-4" />

      <div className="space-y-6">
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label-field mb-0">
                Motivo de Consulta <span className="text-red-500">*</span>
              </label>
              {!disabled && (
                <VoiceDictationButton
                  targetInputId="anamnesis-chief-complaint"
                  getValue={() => anamnesis.chiefComplaint}
                  onValueChange={(chiefComplaint) => update({ chiefComplaint })}
                />
              )}
            </div>
            <textarea
              id="anamnesis-chief-complaint"
              rows={2}
              disabled={disabled}
              value={anamnesis.chiefComplaint}
              onChange={(e) => update({ chiefComplaint: e.target.value })}
              placeholder="Describa en las propias palabras del paciente..."
              className="input-field resize-y"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label-field mb-0">Enfermedad Actual</label>
              {!disabled && (
                <VoiceDictationButton
                  targetInputId="anamnesis-current-illness"
                  getValue={() => anamnesis.currentIllness}
                  onValueChange={(currentIllness) => update({ currentIllness })}
                />
              )}
            </div>
            <textarea
              id="anamnesis-current-illness"
              rows={3}
              disabled={disabled}
              value={anamnesis.currentIllness}
              onChange={(e) => update({ currentIllness: e.target.value })}
              placeholder="Evolución del cuadro clínico..."
              className="input-field resize-y"
            />
          </div>
        </div>

        <div
          className={`border-t border-slate-100 pt-6 transition-colors ${
            anamnesis.allergiesNoReporta ? 'rounded-lg bg-green-50/30 px-3 pb-3 -mx-3' : ''
          }`}
        >
          <SectionHeader
            title="Antecedentes — Alergias"
            noReporta={anamnesis.allergiesNoReporta ?? false}
            onNoReportaChange={setAllergiesNoReporta}
            disabled={disabled}
          />
          {anamnesis.allergiesNoReporta ? (
            <p className="text-sm text-green-700">{NO_REPORTA_LABEL}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label-field">Medicamentos</label>
                <input
                  disabled={disabled}
                  value={anamnesis.allergies.medications}
                  onChange={(e) => updateAllergies({ medications: e.target.value })}
                  placeholder="Ej: penicilina, AINEs..."
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-field">Anestesia</label>
                <input
                  disabled={disabled}
                  value={anamnesis.allergies.anesthesia}
                  onChange={(e) => updateAllergies({ anesthesia: e.target.value })}
                  placeholder="Ej: lidocaína..."
                  className="input-field"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label-field">Otras Alergias</label>
                <input
                  disabled={disabled}
                  value={anamnesis.allergies.other}
                  onChange={(e) => updateAllergies({ other: e.target.value })}
                  placeholder="Ej: látex, alimentos, materiales..."
                  className="input-field"
                />
              </div>
            </div>
          )}
        </div>

        <div
          className={`border-t border-slate-100 pt-6 transition-colors ${
            anamnesis.systemicDiseasesNoReporta ? 'rounded-lg bg-green-50/30 px-3 pb-3 -mx-3' : ''
          }`}
        >
          <SectionHeader
            title="Antecedentes — Enfermedades Sistémicas"
            noReporta={anamnesis.systemicDiseasesNoReporta ?? false}
            onNoReportaChange={setSystemicDiseasesNoReporta}
            disabled={disabled}
          />
          {anamnesis.systemicDiseasesNoReporta ? (
            <p className="text-sm text-green-700">{NO_REPORTA_LABEL}</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {SYSTEMIC_DISEASES_OPTIONS.map((disease) => (
                  <label key={disease} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={anamnesis.systemicDiseases.includes(disease)}
                      onChange={() => toggleDisease(disease)}
                      className="rounded border-slate-300 text-dental-600 focus:ring-dental-500"
                    />
                    {disease}
                  </label>
                ))}
              </div>
              <div className="mt-3">
                <label className="label-field">Otras Enfermedades</label>
                <input
                  disabled={disabled}
                  value={anamnesis.systemicDiseasesOther}
                  onChange={(e) =>
                    update({
                      systemicDiseasesOther: e.target.value,
                      systemicDiseasesNoReporta: false,
                    })
                  }
                  className="input-field"
                />
              </div>
            </>
          )}
        </div>

        <div className="border-t border-slate-100 pt-6">
          <h4 className="mb-3 text-sm font-semibold text-slate-700">Medicaciones críticas</h4>
          <div className="grid gap-2 sm:grid-cols-1 lg:grid-cols-2">
            {CRITICAL_MEDICATION_OPTIONS.map((medication) => (
              <label key={medication} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={anamnesis.criticalMedications.includes(medication)}
                  onChange={() => toggleCriticalMedication(medication)}
                  className="mt-0.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
                />
                {medication}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-100 pt-6">
          <TextFieldWithNoReporta
            label="Medicamentos Actuales"
            fieldId="anamnesis-current-medications"
            value={anamnesis.currentMedications}
            noReporta={anamnesis.currentMedicationsNoReporta ?? false}
            onChange={(value, noReporta) =>
              update({ currentMedications: value, currentMedicationsNoReporta: noReporta })
            }
            disabled={disabled}
            placeholder="Liste los medicamentos que toma actualmente..."
          />
          <TextFieldWithNoReporta
            label="Antecedentes Odontológicos Previos"
            fieldId="anamnesis-dental-history"
            value={anamnesis.dentalHistory}
            noReporta={anamnesis.dentalHistoryNoReporta ?? false}
            onChange={(value, noReporta) =>
              update({ dentalHistory: value, dentalHistoryNoReporta: noReporta })
            }
            disabled={disabled}
            placeholder="Tratamientos previos, extracciones, ortodoncia..."
          />
          <TextFieldWithNoReporta
            label="Antecedentes Familiares"
            fieldId="anamnesis-family-history"
            value={anamnesis.familyHistory}
            noReporta={anamnesis.familyHistoryNoReporta ?? false}
            onChange={(value, noReporta) =>
              update({ familyHistory: value, familyHistoryNoReporta: noReporta })
            }
            disabled={disabled}
            placeholder="Enfermedades hereditarias relevantes..."
          />
        </div>
      </div>
    </section>
  )
}
