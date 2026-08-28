import { useMemo } from 'react'

import type { Anamnesis } from '@/types/anamnesis'

import {
  CRITICAL_MEDICATION_OPTIONS,
  SYSTEMIC_DISEASES_OPTIONS,
  normalizeAnamnesis,
} from '@/types/anamnesis'

import type { StomatologicalExam } from '@/types/stomatologicalExam'

import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'

import { FieldVoiceHeader } from '@/components/voice'
import { ClinicalPrecautionAlertBanner } from './ClinicalPrecautionAlertBanner'
import { getBloodPressurePrecautionReasons, getClinicalPrecautionAlert } from '@/utils/clinicalPrecautionAlerts'
import { VitalSignsExamSection } from './VitalSignsExamSection'

interface VitalAlertsSectionProps {
  anamnesis: Anamnesis
  exam: StomatologicalExam
  onAnamnesisChange: (data: Anamnesis) => void
  onExamChange: (data: StomatologicalExam) => void
  disabled?: boolean
}

export function VitalAlertsSection({
  anamnesis,
  exam,
  onAnamnesisChange,
  onExamChange,
  disabled = false,
}: VitalAlertsSectionProps) {
  const safeAnamnesis = normalizeAnamnesis(anamnesis)
  const update = (patch: Partial<Anamnesis>) => onAnamnesisChange({ ...safeAnamnesis, ...patch })

  const updateAllergies = (patch: Partial<Anamnesis['allergies']>) =>
    update({
      allergies: { ...safeAnamnesis.allergies, ...patch },
      allergiesNoReporta: false,
    })

  const toggleDisease = (disease: string) => {
    const diseases = safeAnamnesis.systemicDiseases.includes(disease)
      ? safeAnamnesis.systemicDiseases.filter((item) => item !== disease)
      : [...safeAnamnesis.systemicDiseases, disease]
    update({ systemicDiseases: diseases, systemicDiseasesNoReporta: false })
  }

  const toggleCriticalMedication = (medication: string) => {
    const medications = safeAnamnesis.criticalMedications.includes(medication)
      ? safeAnamnesis.criticalMedications.filter((item) => item !== medication)
      : [...safeAnamnesis.criticalMedications, medication]
    update({ criticalMedications: medications })
  }

  const allergyFieldsLocked = disabled || Boolean(safeAnamnesis.allergiesNoReporta)

  const precautionAlert = useMemo(
    () => getClinicalPrecautionAlert(safeAnamnesis, exam.vitalSigns),
    [safeAnamnesis, exam.vitalSigns],
  )

  const vitalAbnormal =
    exam.vitalSigns.isNormal === false &&
    getBloodPressurePrecautionReasons(exam.vitalSigns).length === 0

  return (
    <section className="card space-y-4">
      <div>
        <h3 className={`mb-1 ${CLINICAL_SECTION_TITLE_CLASS}`}>
          {clinicalSectionTitle(
            CLINICAL_HISTORY_SECTION_NUMBERS.examen,
            'Alertas Vitales y Seguridad',
          )}
        </h3>
        <p className="text-xs text-slate-500">
          Signos vitales, alergias y antecedentes relevantes antes de proponer tratamiento.
        </p>
      </div>

      <ClinicalPrecautionAlertBanner alert={precautionAlert} />

      {vitalAbnormal && !precautionAlert.active && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Signos vitales fuera de rango — revise antes de continuar.
        </div>
      )}

      <VitalSignsExamSection
        data={exam.vitalSigns}
        onChange={(vitalSigns) => onExamChange({ ...exam, vitalSigns })}
        disabled={disabled}
      />

      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Antecedentes — Alergias</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldVoiceHeader
              label="Medicamentos"
              targetInputId="rapid-allergy-meds"
              disabled={allergyFieldsLocked}
              getValue={() =>
                safeAnamnesis.allergiesNoReporta ? '' : safeAnamnesis.allergies.medications
              }
              onValueChange={(medications) => updateAllergies({ medications })}
            />
            <input
              id="rapid-allergy-meds"
              disabled={allergyFieldsLocked}
              value={
                safeAnamnesis.allergiesNoReporta ? 'No reporta' : safeAnamnesis.allergies.medications
              }
              onChange={(event) => updateAllergies({ medications: event.target.value })}
              placeholder="Ej: penicilina, AINEs..."
              className="input-field text-sm"
            />
          </div>
          <div>
            <FieldVoiceHeader
              label="Anestesia"
              targetInputId="rapid-allergy-anesthesia"
              disabled={allergyFieldsLocked}
              getValue={() =>
                safeAnamnesis.allergiesNoReporta ? '' : safeAnamnesis.allergies.anesthesia
              }
              onValueChange={(anesthesia) => updateAllergies({ anesthesia })}
            />
            <input
              id="rapid-allergy-anesthesia"
              disabled={allergyFieldsLocked}
              value={
                safeAnamnesis.allergiesNoReporta ? 'No reporta' : safeAnamnesis.allergies.anesthesia
              }
              onChange={(event) => updateAllergies({ anesthesia: event.target.value })}
              placeholder="Ej: lidocaína..."
              className="input-field text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <FieldVoiceHeader
              label="Otras Alergias"
              targetInputId="rapid-allergy-other"
              disabled={allergyFieldsLocked}
              getValue={() =>
                safeAnamnesis.allergiesNoReporta ? '' : safeAnamnesis.allergies.other
              }
              onValueChange={(other) => updateAllergies({ other })}
            />
            <input
              id="rapid-allergy-other"
              disabled={allergyFieldsLocked}
              value={safeAnamnesis.allergiesNoReporta ? 'No reporta' : safeAnamnesis.allergies.other}
              onChange={(event) => updateAllergies({ other: event.target.value })}
              placeholder="Ej: látex, alimentos, materiales..."
              className="input-field text-sm"
            />
          </div>
        </div>
        <label className="clinical-todo-normal-label mt-2">
          <input
            type="checkbox"
            disabled={disabled}
            checked={Boolean(safeAnamnesis.allergiesNoReporta)}
            onChange={(event) =>
              update({
                allergiesNoReporta: event.target.checked,
                allergies: event.target.checked
                  ? { medications: '', anesthesia: '', other: '' }
                  : safeAnamnesis.allergies,
              })
            }
            className="rounded border-green-300 text-dental-600 focus:ring-dental-500"
          />
          No reporta alergias
        </label>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">
          Antecedentes — Enfermedades Sistémicas
        </h4>
        {safeAnamnesis.systemicDiseasesNoReporta ? (
          <p className="text-sm text-green-700">No reporta</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SYSTEMIC_DISEASES_OPTIONS.map((disease) => (
                <label key={disease} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={safeAnamnesis.systemicDiseases.includes(disease)}
                    onChange={() => toggleDisease(disease)}
                    className="mt-0.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
                  />
                  {disease}
                </label>
              ))}
            </div>
            <div className="mt-3">
              <FieldVoiceHeader
                label="Otras Enfermedades"
                targetInputId="rapid-systemic-other"
                disabled={disabled}
                getValue={() => safeAnamnesis.systemicDiseasesOther}
                onValueChange={(systemicDiseasesOther) =>
                  update({
                    systemicDiseasesOther,
                    systemicDiseasesNoReporta: false,
                  })
                }
              />
              <input
                id="rapid-systemic-other"
                disabled={disabled}
                value={safeAnamnesis.systemicDiseasesOther}
                onChange={(event) =>
                  update({
                    systemicDiseasesOther: event.target.value,
                    systemicDiseasesNoReporta: false,
                  })
                }
                className="input-field text-sm"
              />
            </div>
          </>
        )}
        <label className="clinical-todo-normal-label mt-2">
          <input
            type="checkbox"
            disabled={disabled}
            checked={Boolean(safeAnamnesis.systemicDiseasesNoReporta)}
            onChange={(event) =>
              update({
                systemicDiseasesNoReporta: event.target.checked,
                systemicDiseases: event.target.checked ? [] : safeAnamnesis.systemicDiseases,
                systemicDiseasesOther: event.target.checked ? '' : safeAnamnesis.systemicDiseasesOther,
              })
            }
            className="rounded border-green-300 text-dental-600 focus:ring-dental-500"
          />
          No reporta enfermedades sistémicas
        </label>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Medicaciones críticas</h4>
        <div className="grid gap-2 sm:grid-cols-1 lg:grid-cols-2">
          {CRITICAL_MEDICATION_OPTIONS.map((medication) => (
            <label key={medication} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                disabled={disabled}
                checked={safeAnamnesis.criticalMedications.includes(medication)}
                onChange={() => toggleCriticalMedication(medication)}
                className="mt-0.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
              />
              {medication}
            </label>
          ))}
        </div>
        <div className="mt-3">
          <FieldVoiceHeader
            label="Medicamentos actuales / otras medicaciones"
            targetInputId="rapid-current-medications"
            disabled={disabled || Boolean(safeAnamnesis.currentMedicationsNoReporta)}
            getValue={() =>
              safeAnamnesis.currentMedicationsNoReporta ? '' : safeAnamnesis.currentMedications
            }
            onValueChange={(currentMedications) =>
              update({ currentMedications, currentMedicationsNoReporta: false })
            }
          />
          <textarea
            id="rapid-current-medications"
            rows={2}
            disabled={disabled || Boolean(safeAnamnesis.currentMedicationsNoReporta)}
            value={
              safeAnamnesis.currentMedicationsNoReporta
                ? 'No reporta'
                : safeAnamnesis.currentMedications
            }
            onChange={(event) =>
              update({
                currentMedications: event.target.value,
                currentMedicationsNoReporta: false,
              })
            }
            placeholder="Liste los medicamentos que toma actualmente..."
            className="input-field resize-y text-sm"
          />
          <label className="clinical-todo-normal-label mt-2">
            <input
              type="checkbox"
              disabled={disabled}
              checked={Boolean(safeAnamnesis.currentMedicationsNoReporta)}
              onChange={(event) =>
                update({
                  currentMedicationsNoReporta: event.target.checked,
                  currentMedications: event.target.checked ? '' : safeAnamnesis.currentMedications,
                })
              }
              className="rounded border-green-300 text-dental-600 focus:ring-dental-500"
            />
            No reporta medicamentos actuales
          </label>
        </div>
      </div>
    </section>
  )
}
