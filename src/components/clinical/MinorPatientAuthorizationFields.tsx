import {
  MINOR_PATIENT_SIGNATURE_WARNING,
  etiquetaFirmaPacienteOAcudiente,
} from '@/utils/patientMinorAge'

export interface MinorPatientAuthorizationFieldsProps {
  esMenorDeEdad: boolean
  guardianName: string
  guardianDocument: string
  disabled?: boolean
  onGuardianNameChange: (value: string) => void
  onGuardianDocumentChange: (value: string) => void
  /** Prefijo de id para inputs (accesibilidad). */
  idPrefix?: string
}

/**
 * Banner + datos del acudiente cuando el paciente es menor de 18 años (Res. 1995/1999).
 * Renderizar inmediatamente encima del canvas de firma del paciente/representante.
 */
export function MinorPatientAuthorizationFields({
  esMenorDeEdad,
  guardianName,
  guardianDocument,
  disabled = false,
  onGuardianNameChange,
  onGuardianDocumentChange,
  idPrefix = 'guardian',
}: MinorPatientAuthorizationFieldsProps) {
  if (!esMenorDeEdad) return null

  return (
    <div className="mb-4 space-y-4">
      <div
        role="alert"
        className="rounded border-l-4 border-amber-500 bg-amber-100 p-4 text-amber-800"
      >
        {MINOR_PATIENT_SIGNATURE_WARNING}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-name`} className="label-field">
            Nombre Completo del Acudiente <span className="text-red-500">*</span>
          </label>
          <input
            id={`${idPrefix}-name`}
            type="text"
            disabled={disabled}
            required
            value={guardianName}
            onChange={(event) => onGuardianNameChange(event.target.value)}
            placeholder="Nombre y apellidos del representante legal"
            className="input-field"
            autoComplete="name"
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-document`} className="label-field">
            Documento del Acudiente <span className="text-red-500">*</span>
          </label>
          <input
            id={`${idPrefix}-document`}
            type="text"
            disabled={disabled}
            required
            value={guardianDocument}
            onChange={(event) => onGuardianDocumentChange(event.target.value)}
            placeholder="Cédula del padre, madre o representante"
            className="input-field font-mono"
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  )
}

export function patientOrGuardianSignatureHeading(esMenorDeEdad: boolean): string {
  return etiquetaFirmaPacienteOAcudiente(esMenorDeEdad)
}
