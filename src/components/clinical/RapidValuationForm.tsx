import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClinicalRecordFormData, Cie10Diagnosis } from '@/types/clinicalRecord'
import type { PatientFormData } from '@/types/patient'
import { addTreatmentPlanItemToBudget, calcClinicalBudgetSummaryWithTax } from '@/utils/budget'
import { createEmptyClinicalForm } from './ClinicalHistoryForm'
import { ChiefComplaintSection } from './ChiefComplaintSection'
import { VitalAlertsSection } from './VitalAlertsSection'
import { Cie10DiagnosisSearchSection } from './Cie10DiagnosisSearchSection'
import { PatientRegistrationSection } from './PatientRegistrationSection'
import { ConsentimientoValoracionSection } from './ConsentimientoValoracionSection'
import { TreatmentPlanForm } from './TreatmentPlanForm'
import { BudgetForm } from './BudgetForm'
import type { OdontogramData } from '@/types/odontogram'

interface RapidValuationFormProps {
  patientData?: PatientFormData
  onPatientDataChange?: (data: PatientFormData) => void
  initialData?: Partial<ClinicalRecordFormData>
  odontogram?: OdontogramData | null
  onChange: (data: ClinicalRecordFormData) => void
  onAcceptTreatment: () => void
  consentAccepted?: boolean
  onConsentAcceptedChange?: (accepted: boolean) => void
  consentRecordedAt?: string | null
  acceptingTreatment?: boolean
  disabled?: boolean
}

export function RapidValuationForm({
  patientData,
  onPatientDataChange,
  initialData,
  odontogram = null,
  onChange,
  onAcceptTreatment,
  consentAccepted = false,
  onConsentAcceptedChange = () => {},
  consentRecordedAt = null,
  acceptingTreatment = false,
  disabled = false,
}: RapidValuationFormProps) {
  const [form, setForm] = useState<ClinicalRecordFormData>(() => ({
    ...createEmptyClinicalForm(),
    ...initialData,
  }))
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const update = (patch: Partial<ClinicalRecordFormData>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch }
      onChangeRef.current(next)
      return next
    })
  }

  const updateDiagnosis = (code: string, patch: Partial<Cie10Diagnosis>) => {
    update({
      diagnoses: form.diagnoses.map((item) => (item.code === code ? { ...item, ...patch } : item)),
    })
  }

  useEffect(() => {
    onChangeRef.current(form)
  }, [])

  const budgetLinkedPlanItemIds = useMemo(
    () =>
      form.budgetItems
        .map((item) => item.treatmentPlanItemId)
        .filter((id): id is string => Boolean(id)),
    [form.budgetItems],
  )

  const moveTreatmentPlanItemToBudget = (itemId: string) => {
    const planItem = form.treatmentPlan.find((item) => item.id === itemId)
    if (!planItem) return

    const nextBudgetItems = addTreatmentPlanItemToBudget(planItem, form.budgetItems)
    if (!nextBudgetItems) return

    update({
      budgetItems: nextBudgetItems,
      budget: calcClinicalBudgetSummaryWithTax(
        nextBudgetItems,
        form.budget.discount,
        form.orthodonticsBudget,
        form.dentalImplantsBudget,
      ),
    })
  }

  return (
    <div className="clinical-history-shell clinical-history space-y-6">
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <strong>Valoración rápida.</strong> Registre los datos de identificación (incluido municipio
        DANE), motivo de consulta, alertas, diagnóstico y presupuesto en un solo flujo.
      </div>

      {patientData && onPatientDataChange && (
        <PatientRegistrationSection
          value={patientData}
          onChange={onPatientDataChange}
          disabled={disabled}
          sectionTitle="1. Datos de Identificación del Paciente"
        />
      )}

      <ChiefComplaintSection
        data={form.anamnesis}
        onChange={(anamnesis) => update({ anamnesis })}
        disabled={disabled}
      />

      <VitalAlertsSection
        anamnesis={form.anamnesis}
        exam={form.stomatologicalExam}
        onAnamnesisChange={(anamnesis) => update({ anamnesis })}
        onExamChange={(stomatologicalExam) => update({ stomatologicalExam })}
        disabled={disabled}
      />

      <Cie10DiagnosisSearchSection
        diagnoses={form.diagnoses}
        enableToothSelection
        onAddDiagnosis={(code, description, affectedTeeth) => {
          if (form.diagnoses.some((item) => item.code === code)) return
          update({
            diagnoses: [
              ...form.diagnoses,
              {
                code,
                description,
                type: form.diagnoses.length === 0 ? 'principal' : 'relacionado',
                certainty: 'impresion',
                source: 'manual',
                affectedTeeth,
              },
            ],
          })
        }}
        onUpdateDiagnosis={updateDiagnosis}
        onRemoveDiagnosis={(code) =>
          update({ diagnoses: form.diagnoses.filter((item) => item.code !== code) })
        }
        disabled={disabled}
      />

      <div id="clinical-section-tratamiento" className="space-y-6">
        <TreatmentPlanForm
          treatmentPlan={form.treatmentPlan}
          treatmentPlanNotes={form.treatmentPlanNotes}
          diagnoses={form.diagnoses}
          odontogram={odontogram}
          affectedTeeth={[...new Set(form.diagnoses.flatMap((d) => d.affectedTeeth ?? []))].sort(
            (a, b) => a - b,
          )}
          budgetLinkedItemIds={budgetLinkedPlanItemIds}
          disabled={disabled}
          onChange={(patch) => update(patch)}
          onMoveToBudget={moveTreatmentPlanItemToBudget}
        />

        <BudgetForm
          budgetItems={form.budgetItems}
          orthodonticsBudget={form.orthodonticsBudget}
          dentalImplantsBudget={form.dentalImplantsBudget}
          budget={form.budget}
          treatmentPlan={form.treatmentPlan}
          disabled={disabled}
          onChange={(patch) => update(patch)}
        />

        <ConsentimientoValoracionSection
          accepted={consentAccepted}
          onAcceptedChange={onConsentAcceptedChange}
          disabled={disabled || Boolean(consentRecordedAt)}
          recordedAt={consentRecordedAt}
        />

        {!disabled && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dental-200 bg-dental-50/50 p-4">
            <p className="text-sm text-slate-700">
              Al aceptar el presupuesto, el paciente pasa a fase de tratamiento y se habilitan
              odontograma, anexos y evolución.
            </p>
            <button
              type="button"
              onClick={onAcceptTreatment}
              disabled={acceptingTreatment || !consentAccepted}
              title={
                !consentAccepted
                  ? 'Debe aceptar el consentimiento de valoración'
                  : undefined
              }
              className="btn-primary whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
            >
              {acceptingTreatment ? 'Procesando...' : 'Aceptar Presupuesto'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
