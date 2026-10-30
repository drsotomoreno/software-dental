import { useMemo } from 'react'
import type { TreatmentPlanAuthorization } from '@/types/treatmentPlanAuthorization'
import { DigitalSignatureCanvas } from '@/components/signature'
import {
  MinorPatientAuthorizationFields,
  patientOrGuardianSignatureHeading,
} from '@/components/clinical/MinorPatientAuthorizationFields'
import type { SignatureCaptureResult } from '@/types/signature'
import {
  esMenorDeEdad,
  guardianAuthorizationComplete,
} from '@/utils/patientMinorAge'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'

interface TreatmentPlanAuthorizationFormProps {
  data: TreatmentPlanAuthorization
  onChange: (data: TreatmentPlanAuthorization) => void
  /** Fecha de nacimiento del paciente actual (`birthDate` / fechaNacimiento). */
  patientBirthDate?: string
  disabled?: boolean
}

export function TreatmentPlanAuthorizationForm({
  data,
  onChange,
  patientBirthDate = '',
  disabled = false,
}: TreatmentPlanAuthorizationFormProps) {
  const menor = useMemo(() => esMenorDeEdad(patientBirthDate), [patientBirthDate])
  const signatureLabel = patientOrGuardianSignatureHeading(menor)
  const guardianOk = guardianAuthorizationComplete(
    menor,
    data.guardianName,
    data.guardianDocument,
  )

  const update = (patch: Partial<TreatmentPlanAuthorization>) =>
    onChange({ ...data, ...patch })

  const applySignature = (
    field: 'patient' | 'professional',
    result: SignatureCaptureResult | null,
  ) => {
    if (!result?.dataUrl) return
    if (field === 'patient' && !guardianOk) return
    const signedAt = data.signedAt?.trim() || new Date().toISOString()
    if (field === 'patient') {
      update({
        patientSignatureDataUrl: result.dataUrl,
        patientSignatureMeta: result.metadata,
        signedAt,
        textAccepted: true,
      })
      return
    }
    update({
      professionalSignatureDataUrl: result.dataUrl,
      professionalSignatureMeta: result.metadata,
      signedAt,
    })
  }

  return (
    <section className="card">
      <h3 className={`mb-2 ${CLINICAL_SECTION_TITLE_CLASS}`}>
        {clinicalSectionTitle(
          CLINICAL_HISTORY_SECTION_NUMBERS.tratamiento,
          'Autorización del Plan de Tratamiento / Presupuesto',
        )}
      </h3>
      <p className="mb-4 text-xs text-slate-500">
        Firma conjunta del odontólogo y del paciente (o representante legal si es menor de 18).
        Requerida para validar el plan y el presupuesto (Res. 1995/1999).
      </p>

      <label className="mb-6 flex items-start gap-2">
        <input
          type="checkbox"
          disabled={disabled}
          checked={data.textAccepted}
          onChange={(event) => update({ textAccepted: event.target.checked })}
          className="mt-0.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
        />
        <span className="text-sm text-slate-700">
          {menor
            ? 'El representante legal ha leído y acepta el plan de tratamiento y el presupuesto '
            : 'El paciente ha leído y acepta el plan de tratamiento y el presupuesto '}
          <span className="text-red-500">*</span>
        </span>
      </label>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <MinorPatientAuthorizationFields
            esMenorDeEdad={menor}
            guardianName={data.guardianName ?? ''}
            guardianDocument={data.guardianDocument ?? ''}
            disabled={disabled}
            idPrefix="plan-guardian"
            onGuardianNameChange={(guardianName) => update({ guardianName })}
            onGuardianDocumentChange={(guardianDocument) => update({ guardianDocument })}
          />
          <DigitalSignatureCanvas
            title={signatureLabel}
            ariaLabel={signatureLabel}
            value={data.patientSignatureDataUrl}
            onSignatureChange={(result) => applySignature('patient', result)}
            disabled={disabled || !guardianOk}
            width={400}
            height={150}
            showDetails={false}
          />
          {menor && !guardianOk && !disabled && (
            <p className="mt-2 text-xs text-amber-700">
              Complete nombre y documento del acudiente para habilitar la firma y el guardado.
            </p>
          )}
        </div>

        <div>
          <div className="mb-3">
            <label className="label-field">Número de Documento (Cédula / ReTHUS)</label>
            <input
              disabled={disabled}
              value={data.professionalLicense}
              onChange={(event) => update({ professionalLicense: event.target.value })}
              placeholder="Cédula del profesional"
              className="input-field font-mono"
            />
          </div>
          <DigitalSignatureCanvas
            title="Firma del odontólogo"
            ariaLabel="Firma del odontólogo"
            value={data.professionalSignatureDataUrl}
            onSignatureChange={(result) => applySignature('professional', result)}
            disabled={disabled}
            width={400}
            height={150}
            showDetails={false}
          />
        </div>
      </div>
    </section>
  )
}
