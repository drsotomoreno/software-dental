import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react'
import type {
  ClinicalRecordFormData,
  Cie10Diagnosis,
} from '@/types/clinicalRecord'
import {
  syncClinicalDataFromOdontogram,
  syncClinicalDataFromOrthodonticsAnnex,
  syncClinicalDataFromEndodonticsAnnex,
  createEmptyOrthodonticsBudget,
  createEmptyDentalImplantsBudget,
} from '@/utils'
import {
  addTreatmentPlanItemToBudget,
  calcClinicalBudgetSummaryWithTax,
} from '@/utils/budget'

function syncClinicalDataFromAnnexes(data: ClinicalRecordFormData): ClinicalRecordFormData {
  return syncClinicalDataFromOrthodonticsAnnex(syncClinicalDataFromEndodonticsAnnex(data))
}
import type { OdontogramData } from '@/types/odontogram'
import { createEmptyAnamnesis } from '@/types/anamnesis'
import type { Anamnesis } from '@/types/anamnesis'
import { normalizeAnamnesis } from '@/types/anamnesis'
import type { StomatologicalExam } from '@/types/stomatologicalExam'
import type { SpecializedAnnexes } from '@/types/specializedAnnexes'
import { createEmptySpecializedAnnexes } from '@/types/specializedAnnexes'
import { createEmptyStomatologicalExam } from '@/types/stomatologicalExam'
import { createEmptyClinicalDiagnosticChart, normalizeClinicalDiagnosticChart } from '@/types/clinicalDiagnosticChart'
import type { EvolutionNote } from '@/types/evolutionNote'
import type { InformedConsent } from '@/types/consent'
import type { UserProfile } from '@/types/user'
import { createEmptyConsent } from '@/types/consent'
import { AnamnesisForm } from './AnamnesisForm'
import { StomatologicalExamForm } from './StomatologicalExamForm'
import { SpecializedAnnexesForm } from './SpecializedAnnexesForm'
import { EvolutionNotesForm } from './EvolutionNotesForm'
import { InformedConsentForm } from './InformedConsentForm'
import { TreatmentPlanForm } from './TreatmentPlanForm'
import { BudgetForm } from './BudgetForm'
import { PaymentPlanForm } from './PaymentPlanForm'
import { PaymentControlForm } from './PaymentControlForm'
import { Odontogram } from '@/components/odontogram'
import { DiagnosticOdontogramSection } from '@/components/clinical/diagnostics'
import { DiagnosticAidsSection } from './DiagnosticAidsSection'

interface ClinicalHistoryFormProps {
  initialData?: Partial<ClinicalRecordFormData>
  odontogram?: OdontogramData | null
  onChange: (data: ClinicalRecordFormData) => void
  disabled?: boolean
  /** Si es true, congela también odontograma, plan y exámenes. Por defecto no: Res. 1995/1999. */
  lockLivingChart?: boolean
  professionalName?: string
  professionalLicense?: string
  authorUserId?: string
  authorEmail?: string
  activeSection?: string
  exportSection?: ReactNode
  onOdontogramChange?: (data: OdontogramData) => void
  patientId?: string
  encounterId?: string
  clinicalRecordId?: string | number
  clinicalUser?: UserProfile | null
  patientName?: string
  patientDocument?: string
}

function showClinicalSection(activeSection: string, section: string): boolean {
  return activeSection === 'all' || activeSection === section
}

export function createEmptyClinicalForm(
  professionalLicense = '',
  professionalRegistry = '',
): ClinicalRecordFormData {
  return {
    anamnesis: createEmptyAnamnesis(),
    stomatologicalExam: createEmptyStomatologicalExam(),
    specializedAnnexes: createEmptySpecializedAnnexes(),
    diagnosticChart: createEmptyClinicalDiagnosticChart(),
    diagnoses: [],
    diagnosisNotes: '',
    findings: '',
    treatmentPlan: [],
    treatmentPlanNotes: '',
    budgetItems: [],
    orthodonticsBudget: createEmptyOrthodonticsBudget(),
    dentalImplantsBudget: createEmptyDentalImplantsBudget(),
    budget: { subtotal: 0, discount: 0, total: 0, currency: 'COP' },
    paymentPlan: [],
    paymentControl: [],
    orthodonticsPaymentControl: [],
    evolutionNotes: [],
    informedConsent: createEmptyConsent(professionalLicense, professionalRegistry),
  }
}

export function ClinicalHistoryForm({
  initialData,
  odontogram,
  onChange,
  disabled = false,
  lockLivingChart = false,
  professionalName = '',
  professionalLicense = '',
  authorUserId = '',
  authorEmail = '',
  activeSection = 'all',
  exportSection,
  onOdontogramChange,
  patientId = '',
  encounterId = '',
  clinicalRecordId,
  clinicalUser = null,
  patientName = '',
  patientDocument = '',
}: ClinicalHistoryFormProps) {
  const snapshotLocked = disabled
  const livingLocked = lockLivingChart
  const [form, setForm] = useState<ClinicalRecordFormData>(() => {
    const emptyForm = createEmptyClinicalForm(professionalLicense)
    const base = {
      ...emptyForm,
      ...initialData,
      anamnesis: normalizeAnamnesis({ ...emptyForm.anamnesis, ...initialData?.anamnesis }),
      diagnosticChart: normalizeClinicalDiagnosticChart(initialData?.diagnosticChart),
    }
    try {
      return syncClinicalDataFromAnnexes(base)
    } catch {
      return base
    }
  })

  const orthodonticsSyncRef = useRef(false)

  const odontogramSyncRef = useRef<string>('')
  const onChangeRef = useRef(onChange)
  const disabledRef = useRef(disabled)
  const loadedPatientIdRef = useRef(patientId)
  onChangeRef.current = onChange
  disabledRef.current = disabled

  useEffect(() => {
    if (!initialData || !patientId || loadedPatientIdRef.current === patientId) return
    loadedPatientIdRef.current = patientId

    const emptyForm = createEmptyClinicalForm(professionalLicense)
    const base = {
      ...emptyForm,
      ...initialData,
      anamnesis: normalizeAnamnesis({ ...emptyForm.anamnesis, ...initialData?.anamnesis }),
      diagnosticChart: normalizeClinicalDiagnosticChart(initialData?.diagnosticChart),
    }

    try {
      setForm(syncClinicalDataFromAnnexes(base))
    } catch {
      setForm(base)
    }

    orthodonticsSyncRef.current = false
    odontogramSyncRef.current = ''
  }, [patientId, initialData, professionalLicense])

  // Sincronizar diagnósticos y hallazgos desde el odontograma
  useEffect(() => {
    if (!odontogram || livingLocked) return

    const syncKey =
      JSON.stringify(odontogram.teeth) +
      JSON.stringify(odontogram.supplementaryFindings) +
      odontogram.updatedAt
    if (odontogramSyncRef.current === syncKey) return
    odontogramSyncRef.current = syncKey

    setForm((prev) => {
      const synced = syncClinicalDataFromOdontogram(prev, odontogram)
      if (
        JSON.stringify(synced.diagnoses) === JSON.stringify(prev.diagnoses) &&
        synced.findings === prev.findings
      ) {
        return prev
      }
      const next = { ...prev, ...synced }
      if (!livingLocked) {
        onChangeRef.current(next)
      }
      return next
    })
  }, [odontogram, livingLocked])

  useEffect(() => {
    if (orthodonticsSyncRef.current) return
    orthodonticsSyncRef.current = true

    setForm((prev) => {
      try {
        const synced = syncClinicalDataFromAnnexes(prev)
        if (JSON.stringify(synced) === JSON.stringify(prev)) return prev
        if (!disabledRef.current) {
          onChangeRef.current(synced)
        }
        return synced
      } catch {
        return prev
      }
    })
  }, [])

  const update = (patch: Partial<ClinicalRecordFormData>) => {
    setForm((prev) => {
      const merged = { ...prev, ...patch }
      const next =
        patch.specializedAnnexes != null
          ? syncClinicalDataFromAnnexes(merged)
          : merged
      onChangeRef.current(next)
      return next
    })
  }

  const updateDiagnosis = (code: string, patch: Partial<Cie10Diagnosis>) => {
    update({
      diagnoses: form.diagnoses.map((d) => (d.code === code ? { ...d, ...patch } : d)),
    })
  }

  const affectedTeeth = useMemo(
    () =>
      [...new Set(form.diagnoses.flatMap((d) => d.affectedTeeth ?? []))].sort((a, b) => a - b),
    [form.diagnoses],
  )

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
      {showClinicalSection(activeSection, 'anamnesis') && (
        <div id="clinical-section-anamnesis">
          <AnamnesisForm
            data={form.anamnesis}
            vitalSigns={form.stomatologicalExam.vitalSigns}
            onChange={(anamnesis: Anamnesis) => update({ anamnesis: normalizeAnamnesis(anamnesis) })}
            disabled={snapshotLocked}
          />
        </div>
      )}

      {showClinicalSection(activeSection, 'examen') && (
        <div id="clinical-section-examen">
          <StomatologicalExamForm
            data={form.stomatologicalExam}
            anamnesis={form.anamnesis}
            showPrecautionAlert={activeSection === 'examen'}
            onChange={(stomatologicalExam: StomatologicalExam) => update({ stomatologicalExam })}
            disabled={snapshotLocked}
          />
        </div>
      )}

      {showClinicalSection(activeSection, 'odontograma') && odontogram && onOdontogramChange && (
        <div id="clinical-section-odontograma" className="space-y-4">
          <Odontogram
            data={odontogram}
            onChange={onOdontogramChange}
            disabled={livingLocked}
          />
        </div>
      )}

      {showClinicalSection(activeSection, 'diagnosticos') && (
        <DiagnosticOdontogramSection
          value={form.diagnosticChart}
          diagnoses={form.diagnoses}
          onChange={(diagnosticChart) => update({ diagnosticChart })}
          onEnsureDiagnosis={({ code, description, toothId }) => {
            const toothNumber = Number(toothId)
            const existing = form.diagnoses.find((diagnosis) => diagnosis.code === code)
            if (!existing) {
              update({
                diagnoses: [
                  ...form.diagnoses,
                  {
                    code,
                    description,
                    type: form.diagnoses.length === 0 ? 'principal' : 'relacionado',
                    certainty: 'impresion',
                    source: 'manual',
                    affectedTeeth: [toothNumber],
                  },
                ],
              })
              return
            }
            const affectedTeeth = [...new Set([...(existing.affectedTeeth ?? []), toothNumber])].sort(
              (a, b) => a - b,
            )
            updateDiagnosis(code, { affectedTeeth })
          }}
          onAddAdditionalDiagnosis={(code, description) => {
            if (form.diagnoses.some((diagnosis) => diagnosis.code === code)) return
            update({
              diagnoses: [
                ...form.diagnoses,
                {
                  code,
                  description,
                  type: form.diagnoses.length === 0 ? 'principal' : 'relacionado',
                  certainty: 'impresion',
                  source: 'manual',
                },
              ],
            })
          }}
          onUpdateDiagnosis={updateDiagnosis}
          onRemoveAdditionalDiagnosis={(code) => {
            update({ diagnoses: form.diagnoses.filter((diagnosis) => diagnosis.code !== code) })
          }}
          disabled={livingLocked}
        />
      )}

      {showClinicalSection(activeSection, 'examenes') && patientId && (
          <DiagnosticAidsSection
            patientId={patientId}
            encounterId={encounterId || `patient-${patientId}`}
            disabled={livingLocked}
            user={clinicalUser}
          />
      )}

      {showClinicalSection(activeSection, 'anexos') && (
        <div id="clinical-section-anexos">
          <SpecializedAnnexesForm
            data={form.specializedAnnexes}
            onChange={(specializedAnnexes: SpecializedAnnexes) => update({ specializedAnnexes })}
            disabled={livingLocked}
          />
        </div>
      )}

      {showClinicalSection(activeSection, 'tratamiento') && (
        <div id="clinical-section-tratamiento" className="space-y-6">
      <TreatmentPlanForm
        treatmentPlan={form.treatmentPlan}
        treatmentPlanNotes={form.treatmentPlanNotes}
        diagnoses={form.diagnoses}
        odontogram={odontogram}
        affectedTeeth={affectedTeeth}
        budgetLinkedItemIds={budgetLinkedPlanItemIds}
        disabled={livingLocked}
        onChange={(patch) => update(patch)}
        onMoveToBudget={moveTreatmentPlanItemToBudget}
      />

      <BudgetForm
        budgetItems={form.budgetItems}
        orthodonticsBudget={form.orthodonticsBudget}
        dentalImplantsBudget={form.dentalImplantsBudget}
        budget={form.budget}
        treatmentPlan={form.treatmentPlan}
        disabled={livingLocked}
        onChange={(patch) => update(patch)}
      />
        </div>
      )}

      {showClinicalSection(activeSection, 'plan-pagos') && (
        <div id="clinical-section-plan-pagos">
          <PaymentPlanForm
            paymentPlan={form.paymentPlan}
            budgetItems={form.budgetItems}
            orthodonticsBudget={form.orthodonticsBudget}
            dentalImplantsBudget={form.dentalImplantsBudget}
            disabled={livingLocked}
          />
        </div>
      )}

      {showClinicalSection(activeSection, 'consentimiento') && (
        <div id="clinical-section-consentimiento">
      <InformedConsentForm
        data={form.informedConsent}
        onChange={(informedConsent: InformedConsent) => update({ informedConsent })}
        disabled={snapshotLocked}
      />
        </div>
      )}

      {showClinicalSection(activeSection, 'evolucion') && (
        <div id="clinical-section-evolucion">
      <EvolutionNotesForm
        notes={form.evolutionNotes}
        onChange={(evolutionNotes: EvolutionNote[]) => update({ evolutionNotes })}
        patientId={patientId}
        parentRecordId={clinicalRecordId != null ? String(clinicalRecordId) : undefined}
        professionalName={professionalName}
        professionalLicense={professionalLicense}
        authorUserId={authorUserId}
        authorEmail={authorEmail}
        disabled={livingLocked}
        allowNewNotes
        allowAddendums
      />
        </div>
      )}

      {showClinicalSection(activeSection, 'control-pagos') && (
        <div id="clinical-section-control-pagos">
          <PaymentControlForm
            paymentControl={form.paymentControl}
            orthodonticsPaymentControl={form.orthodonticsPaymentControl}
            orthodonticsBudget={form.orthodonticsBudget}
            paymentPlan={form.paymentPlan}
            budget={form.budget}
            disabled={snapshotLocked}
            patientId={patientId}
            clinicalRecordId={clinicalRecordId}
            patientName={patientName}
            patientDocument={patientDocument}
            onChange={(paymentControl) => update({ paymentControl })}
            onOrthodonticsPaymentControlChange={(orthodonticsPaymentControl) =>
              update({ orthodonticsPaymentControl })
            }
          />
        </div>
      )}

      {activeSection === 'all' && exportSection && (
        <div id="clinical-section-exportacion">{exportSection}</div>
      )}
    </div>
  )
}
