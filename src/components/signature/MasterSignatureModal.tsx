import { useState } from 'react'
import { DigitalSignatureCanvas } from '@/components/signature/DigitalSignatureCanvas'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { SignatureCaptureResult } from '@/types/signature'
import type { MasterSignatureAcceptance } from '@/utils/masterSignature'
import {
  isAnamnesisLegallyLocked,
  isConsentLegallyLocked,
  isFirstAppointment,
  isTreatmentLegallyLocked,
} from '@/utils/masterSignature'

interface MasterSignatureModalProps {
  clinicalData: ClinicalRecordFormData
  saving?: boolean
  onSave: (input: {
    acceptance: MasterSignatureAcceptance
    patientSignature: SignatureCaptureResult | null
    professionalSignature: SignatureCaptureResult | null
  }) => Promise<string | null>
}

const ANAMNESIS_LABEL = 'Certifico que los datos de salud suministrados en la anamnesis son reales.'
const TREATMENT_LABEL = 'Acepto el plan de tratamiento, odontograma y el presupuesto propuesto.'
const CONSENT_LABEL = 'Comprendo los riesgos y autorizo el consentimiento informado.'

export function MasterSignatureModal({
  clinicalData,
  saving = false,
  onSave,
}: MasterSignatureModalProps) {
  const anamnesisLocked = isAnamnesisLegallyLocked(clinicalData.anamnesis)
  const treatmentLocked = isTreatmentLegallyLocked(clinicalData)
  const consentLocked = isConsentLegallyLocked(clinicalData.informedConsent)
  const firstAppointment = isFirstAppointment(clinicalData)
  const allLocked = anamnesisLocked && treatmentLocked && consentLocked

  const [open, setOpen] = useState(false)
  const [hasAcceptedAnamnesis, setHasAcceptedAnamnesis] = useState(false)
  const [hasAcceptedTreatment, setHasAcceptedTreatment] = useState(false)
  const [hasAcceptedConsent, setHasAcceptedConsent] = useState(false)
  const [patientSignature, setPatientSignature] = useState<SignatureCaptureResult | null>(null)
  const [professionalSignature, setProfessionalSignature] = useState<SignatureCaptureResult | null>(null)
  const [error, setError] = useState('')

  const close = () => {
    if (saving) return
    setOpen(false)
    setError('')
  }

  const handleSave = async () => {
    setError('')
    const message = await onSave({
      acceptance: {
        hasAcceptedAnamnesis: !anamnesisLocked && hasAcceptedAnamnesis,
        hasAcceptedTreatment: !treatmentLocked && hasAcceptedTreatment,
        hasAcceptedConsent: !consentLocked && hasAcceptedConsent,
      },
      patientSignature,
      professionalSignature,
    })
    if (message) {
      setError(message)
      return
    }
    setHasAcceptedAnamnesis(false)
    setHasAcceptedTreatment(false)
    setHasAcceptedConsent(false)
    setPatientSignature(null)
    setProfessionalSignature(null)
    setOpen(false)
  }

  return (
    <div className="border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {allLocked ? 'Secciones firmadas y bloqueadas.' : 'Firma de cierre de la cita'}
        </p>
        {!allLocked && (
          <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
            Firmar
          </button>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <div
            id="master-signature-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="master-signature-title"
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 id="master-signature-title" className="text-base font-semibold text-slate-900">
                Firma y bloqueo
              </h3>
              <button
                type="button"
                onClick={close}
                className="text-sm text-slate-500 hover:text-slate-800"
                disabled={saving}
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-3">
              <AcceptanceCheckbox
                checked={anamnesisLocked || hasAcceptedAnamnesis}
                disabled={anamnesisLocked || saving}
                locked={anamnesisLocked}
                required={firstAppointment && !anamnesisLocked}
                label={ANAMNESIS_LABEL}
                onChange={setHasAcceptedAnamnesis}
              />
              <AcceptanceCheckbox
                checked={treatmentLocked || hasAcceptedTreatment}
                disabled={treatmentLocked || saving}
                locked={treatmentLocked}
                label={TREATMENT_LABEL}
                onChange={setHasAcceptedTreatment}
              />
              <AcceptanceCheckbox
                checked={consentLocked || hasAcceptedConsent}
                disabled={consentLocked || saving}
                locked={consentLocked}
                label={CONSENT_LABEL}
                onChange={setHasAcceptedConsent}
              />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-medium text-slate-800">Paciente</h4>
                <DigitalSignatureCanvas
                  onSignatureChange={setPatientSignature}
                  disabled={saving}
                  width={320}
                  height={140}
                />
              </div>
              <div>
                <h4 className="mb-2 text-sm font-medium text-slate-800">Odontólogo</h4>
                <DigitalSignatureCanvas
                  onSignatureChange={setProfessionalSignature}
                  disabled={saving}
                  width={320}
                  height={140}
                />
              </div>
            </div>

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? 'Guardando…' : 'Guardar y Bloquear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AcceptanceCheckbox({
  checked,
  disabled,
  locked,
  required = false,
  label,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  locked: boolean
  required?: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        className="mt-0.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        {label}
        {required && <span className="text-red-500"> *</span>}
        {locked && <span className="ml-2 text-xs text-slate-400">Bloqueado</span>}
      </span>
    </label>
  )
}
