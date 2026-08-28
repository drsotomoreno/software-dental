import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import type { PatientFormData } from '@/types/patient'
import { DEFAULT_PATIENT_PHASE } from '@/types/patient'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { OdontogramData } from '@/types/odontogram'
import type { ValuationConsentMetadata } from '@/types/valuationConsent'
import { ALL_TEETH_NUMBERS } from '@/constants/dental'
import { RapidValuationForm, createEmptyClinicalForm } from '@/components/clinical'
import { createDefaultOdontogram } from '@/types/odontogram'
import { useToast } from '@/hooks/useToast'
import { Toast } from '@/components/ui/Toast'
import { validateAcceptTreatment } from '@/utils/patientPhase'
import {
  buildValuationConsentMetadata,
  recordValuationConsentAudit,
} from '@/utils/valuationConsent'
import { savePatientValuationDraft } from '@/utils/patientClinicalDraft'

const initialForm: PatientFormData = {
  documentType: 'CC',
  documentNumber: '',
  firstName: '',
  lastName: '',
  birthDate: '',
  gender: 'M',
  phone: '',
  email: '',
  address: '',
  city: '',
  insurer: '',
  regime: 'particular',
  municipalityCode: '',
  occupation: '',
  companionName: '',
  companionPhone: '',
  companionRelationship: '',
}

function validatePatientForm(form: PatientFormData): string | null {
  if (!form.documentNumber.trim()) return 'El número de documento es obligatorio.'
  if (!form.firstName.trim()) return 'Los nombres son obligatorios.'
  if (!form.lastName.trim()) return 'Los apellidos son obligatorios.'
  if (!form.birthDate) return 'La fecha de nacimiento es obligatoria.'
  if (!form.phone.trim()) return 'El teléfono es obligatorio.'
  return null
}

export function NewPatientPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { audit } = useAudit()

  const [form, setForm] = useState<PatientFormData>(initialForm)
  const [odontogram] = useState<OdontogramData>(() =>
    createDefaultOdontogram('draft', ALL_TEETH_NUMBERS, 'permanente'),
  )
  const [clinicalData, setClinicalData] = useState<ClinicalRecordFormData | null>(null)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [consentMetadata, setConsentMetadata] = useState<ValuationConsentMetadata | null>(null)
  const [budgetAccepted, setBudgetAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { toastMessage, showToast, clearToast } = useToast()

  const professionalLicense = user?.professionalLicense ?? ''
  const patientFormError = validatePatientForm(form)

  useEffect(() => {
    if (!clinicalData) {
      setClinicalData(createEmptyClinicalForm(professionalLicense, professionalLicense))
    }
  }, [clinicalData, professionalLicense])

  const resetValuationProgress = () => {
    setBudgetAccepted(false)
    setConsentAccepted(false)
    setConsentMetadata(null)
    setClinicalData((prev) => (prev ? { ...prev, valuationConsent: null } : prev))
  }

  const ensureClinicalData = (): ClinicalRecordFormData => {
    if (clinicalData) return clinicalData
    const empty = createEmptyClinicalForm(professionalLicense, professionalLicense)
    setClinicalData(empty)
    return empty
  }

  const registerPatient = async (withHistory: boolean): Promise<string | null> => {
    const validationError = validatePatientForm(form)
    if (validationError) {
      setError(validationError)
      return null
    }

    const existing = await db.patients.where('documentNumber').equals(form.documentNumber).first()
    if (existing) {
      setError('Ya existe un paciente con este número de documento.')
      return null
    }

    const now = new Date().toISOString()
    const id = await db.patients.add({
      ...form,
      phase: withHistory && budgetAccepted ? 'TRATAMIENTO_ACEPTADO' : DEFAULT_PATIENT_PHASE,
      valuationOnly: !withHistory,
      valuationConsent: consentMetadata ?? undefined,
      createdAt: now,
      updatedAt: now,
    })

    const patientRouteId = String(id)

    await audit({
      action: 'CREATE_PATIENT',
      resourceType: 'patient',
      resourceId: patientRouteId,
      details: `${form.documentType} ${form.documentNumber} — ${form.firstName} ${form.lastName}`,
    })

    if (consentMetadata) {
      await recordValuationConsentAudit({
        user: user ?? null,
        resourceId: patientRouteId,
        metadata: consentMetadata,
        patientLabel: `${form.documentType} ${form.documentNumber}`,
      })
    }

    await db.odontograms.add({
      ...odontogram,
      patientId: patientRouteId,
      updatedAt: new Date().toISOString(),
    })

    if (withHistory) {
      const draft = ensureClinicalData()
      navigate(`/pacientes/${patientRouteId}`, {
        state: {
          draftClinicalData: {
            ...draft,
            valuationConsent: consentMetadata,
          },
          resetHistoryView: true,
        },
      })
    } else {
      const draft = ensureClinicalData()
      const valuationDraft = {
        ...draft,
        valuationConsent: consentMetadata,
      }
      await savePatientValuationDraft(patientRouteId, valuationDraft)
      showToast('Paciente guardado en Pacientes Valorados.')
      navigate('/pacientes-valorados')
    }

    return patientRouteId
  }

  const handleSubmitWithHistory = async () => {
    setError('')
    setSaving(true)
    try {
      ensureClinicalData()
      await registerPatient(true)
    } catch {
      setError('Error al guardar el paciente y la historia.')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitDatosOnly = async () => {
    setError('')
    setSaving(true)
    try {
      await registerPatient(false)
    } catch {
      setError('Error al guardar el paciente.')
    } finally {
      setSaving(false)
    }
  }

  const handleAcceptTreatment = async () => {
    const patientError = validatePatientForm(form)
    if (patientError) {
      setError(`Complete los datos del paciente: ${patientError}`)
      return
    }

    if (!consentAccepted) {
      setError('Debe aceptar el consentimiento de valoración.')
      return
    }

    const data = ensureClinicalData()
    const validationError = validateAcceptTreatment(data)
    if (validationError) {
      setError(validationError)
      return
    }

    const metadata = buildValuationConsentMetadata(user?.id)
    setConsentMetadata(metadata)
    setClinicalData({ ...data, valuationConsent: metadata })
    setBudgetAccepted(true)
    setError('')
    showToast(
      'Consentimiento y presupuesto registrados. Puede pasar a la historia completa cuando lo desee.',
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Nuevo Paciente</h1>
      <p className="mb-6 text-sm text-slate-500">
        Complete en un solo formulario los datos del paciente y la valoración rápida antes de abrir
        la historia clínica detallada.
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {clinicalData && (
        <RapidValuationForm
          patientData={form}
          onPatientDataChange={(data) => {
            setForm(data)
            resetValuationProgress()
          }}
          initialData={clinicalData}
          onChange={(data) => {
            setClinicalData(data)
            resetValuationProgress()
          }}
          consentAccepted={consentAccepted}
          onConsentAcceptedChange={(accepted) => {
            setConsentAccepted(accepted)
            if (!accepted) {
              setBudgetAccepted(false)
              setConsentMetadata(null)
            }
          }}
          consentRecordedAt={consentMetadata?.consentimientoTimestamp ?? null}
          onAcceptTreatment={handleAcceptTreatment}
          disabled={false}
        />
      )}

      {budgetAccepted && consentMetadata && (
        <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          Consentimiento y presupuesto aceptados. Puede pasar a la historia completa cuando lo desee.
        </div>
      )}

      <div className="sticky bottom-4 mt-6 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
        <button
          type="button"
          onClick={handleSubmitWithHistory}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? 'Guardando...' : 'Pasar a Historia Completa'}
        </button>
        <button
          type="button"
          onClick={handleSubmitDatosOnly}
          disabled={saving}
          className="btn-secondary"
        >
          {saving ? 'Guardando...' : 'Solo Valoración (Registrar Solo Datos)'}
        </button>
        <button type="button" onClick={() => navigate('/pacientes')} className="btn-secondary">
          Cancelar
        </button>
      </div>

      <Toast message={toastMessage} onDismiss={clearToast} />
    </div>
  )
}
