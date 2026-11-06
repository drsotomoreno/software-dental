import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClinicalRecordFormData, Cie10Diagnosis } from '@/types/clinicalRecord'
import type { Patient, PatientFormData } from '@/types/patient'
import { addTreatmentPlanItemToBudget, calcClinicalBudgetSummaryWithTax } from '@/utils/budget'
import { createEmptyClinicalForm } from './ClinicalHistoryForm'
import { ChiefComplaintSection } from './ChiefComplaintSection'
import { VitalAlertsSection } from './VitalAlertsSection'
import { Cie10DiagnosisSearchSection } from './Cie10DiagnosisSearchSection'
import { PatientRegistrationSection } from './PatientRegistrationSection'
import { ConsentimientoValoracionSection } from './ConsentimientoValoracionSection'
import { applyTabletAnamnesis } from '@/components/kiosk/FillIdentificationOnTablet'
import { TreatmentPlanForm } from './TreatmentPlanForm'
import { BudgetForm } from './BudgetForm'
import { PresupuestoRapido } from './PresupuestoRapido'
import type { OdontogramData } from '@/types/odontogram'
import type { BudgetLineItem } from '@/types/clinicalRecord'

interface RapidValuationFormProps {
  patientData?: PatientFormData
  onPatientDataChange?: (data: PatientFormData) => void
  patient?: Patient | null
  initialData?: Partial<ClinicalRecordFormData>
  odontogram?: OdontogramData | null
  onChange: (data: ClinicalRecordFormData) => void
  /** Si se omite (p. ej. Nuevo Paciente), no se muestra la caja «Aceptar Presupuesto». */
  onAcceptTreatment?: () => void
  consentAccepted?: boolean
  onConsentAcceptedChange?: (accepted: boolean) => void
  consentRecordedAt?: string | null
  acceptingTreatment?: boolean
  disabled?: boolean
  /** Nuevo Paciente: oculta la sección 8 (BudgetForm) y muestra Presupuesto Rápido. */
  replaceBudgetWithQuick?: boolean
}

export function RapidValuationForm({
  patientData,
  onPatientDataChange,
  patient = null,
  initialData,
  onChange,
  onAcceptTreatment,
  consentAccepted = false,
  onConsentAcceptedChange = () => {},
  consentRecordedAt = null,
  acceptingTreatment = false,
  disabled = false,
  replaceBudgetWithQuick = false,
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

  const syncQuickBudgetItems = (
    items: Array<{ id: string; concepto: string; valor: number }>,
  ) => {
    const budgetItems: BudgetLineItem[] = items.map((item) => ({
      id: item.id,
      procedure: item.concepto,
      quantity: 1,
      unitPrice: item.valor,
      source: 'manual',
    }))
    update({
      budgetItems,
      budget: calcClinicalBudgetSummaryWithTax(
        budgetItems,
        form.budget.discount,
        form.orthodonticsBudget,
        form.dentalImplantsBudget,
      ),
    })
  }

  return (
    <div className="clinical-history-shell clinical-history space-y-6">
      <div className="print:hidden space-y-6">
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <strong>Valoración rápida.</strong> Registre los datos de identificación (incluido
          municipio DANE), motivo de consulta, alertas, diagnóstico y presupuesto en un solo flujo.
        </div>

        {patientData && onPatientDataChange && (
          <div className="space-y-3">
            <PatientRegistrationSection
              value={patientData}
              onChange={onPatientDataChange}
              disabled={disabled}
              sectionTitle="Datos de Identificación del Paciente"
              patientRecord={patient}
              canRequestExternalHistory={!disabled}
              onTabletAnamnesis={(answers) => {
                update({ anamnesis: applyTabletAnamnesis(form.anamnesis, answers) })
              }}
            />
          </div>
        )}
      </div>

      <div className="print:hidden space-y-6">
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
          onAddDiagnosis={(code, description, affectedTeeth, anatomicalScope) => {
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
                  anatomicalScope,
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
      </div>

      {/* Nuevo Paciente: Presupuesto Rápido después de la sección 4 (diagnóstico). */}
      {replaceBudgetWithQuick ? (
        <div id="clinical-section-presupuesto">
          <PresupuestoRapido
            patient={patientData ?? null}
            onItemsChange={syncQuickBudgetItems}
          />
        </div>
      ) : null}

      <div id="clinical-section-tratamiento" className="space-y-6">
        {/* Nuevo Paciente: oculta la sección 7; el plan/presupuesto va en Presupuesto Rápido. */}
        {!replaceBudgetWithQuick ? (
          <div className="print:hidden">
            <TreatmentPlanForm
              treatmentPlan={form.treatmentPlan}
              treatmentPlanNotes={form.treatmentPlanNotes}
              diagnoses={form.diagnoses}
              diagnosticChart={form.diagnosticChart}
              specializedAnnexes={form.specializedAnnexes}
              affectedTeeth={[...new Set(form.diagnoses.flatMap((d) => d.affectedTeeth ?? []))].sort(
                (a, b) => a - b,
              )}
              budgetLinkedItemIds={budgetLinkedPlanItemIds}
              disabled={disabled}
              onChange={(patch) => update(patch)}
              onMoveToBudget={moveTreatmentPlanItemToBudget}
            />
          </div>
        ) : null}

        {!replaceBudgetWithQuick ? (
          <div className="print:hidden">
            <BudgetForm
              budgetItems={form.budgetItems}
              orthodonticsBudget={form.orthodonticsBudget}
              dentalImplantsBudget={form.dentalImplantsBudget}
              dentalImplantsAnnex={form.specializedAnnexes?.dentalImplants}
              budget={form.budget}
              treatmentPlan={form.treatmentPlan}
              disabled={disabled}
              onChange={(patch) => update(patch)}
            />
          </div>
        ) : null}

        <div className="print:hidden space-y-6">
          <ConsentimientoValoracionSection
            accepted={consentAccepted}
            onAcceptedChange={onConsentAcceptedChange}
            disabled={disabled || Boolean(consentRecordedAt)}
            recordedAt={consentRecordedAt}
            tabletPatient={
              patientData
                ? {
                    id: patient?.id != null ? String(patient.id) : undefined,
                    firstName: patientData.firstName,
                    lastName: patientData.lastName,
                    documentType: patientData.documentType,
                    documentNumber: patientData.documentNumber,
                    phone: patientData.phone,
                    birthDate: patientData.birthDate,
                  }
                : patient
                  ? {
                      id: patient.id != null ? String(patient.id) : undefined,
                      firstName: patient.firstName,
                      lastName: patient.lastName,
                      documentType: patient.documentType,
                      documentNumber: patient.documentNumber,
                      phone: patient.phone,
                      birthDate: patient.birthDate,
                    }
                  : null
            }
          />

          {/* Nuevo Paciente (replaceBudgetWithQuick): sin caja «Aceptar Presupuesto». */}
          {!disabled && !replaceBudgetWithQuick && onAcceptTreatment && (
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
    </div>
  )
}
