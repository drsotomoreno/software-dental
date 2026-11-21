export const CIE10_RIPS_PATTERN: RegExp
export const CUPS_RIPS_PATTERN: RegExp

export type CanonicalRipsValidationMode = 'sign' | 'send'
export type CanonicalBillingMode = 'fev' | 'sin_factura' | 'valor_cero' | 'non_rips'

export interface CanonicalRipsValidationError {
  code: string
  field: string
  message: string
  fix?: string
  scope?: 'patient' | 'clinical' | 'billing' | 'professional'
}

export interface CanonicalRipsValidationResult {
  valid: boolean
  errors: CanonicalRipsValidationError[]
}

export interface CanonicalEvolutionRipsPatient {
  documentType: string
  documentNumber: string
  birthDate: string
  gender: string
  municipalityCode: string
  regime: string
}

export interface CanonicalEvolutionRipsResolved {
  noteId: string | null
  requiresRips: boolean
  cupsCodes: string[]
  primaryCups: string
  cie10Principal: string
  tipoVinculacion: string
  billingMode: CanonicalBillingMode
  idFacturaElectronica: string | null
  idReciboAsociado: string | null
  numeroSoportePago: string | null
  fechaAtencion: string
  ripsEstado: string
  finalidadTecnologia: string
  causaMotivoAtencion: string
  conceptoRecaudo: string
  isLocked: boolean
  patient: CanonicalEvolutionRipsPatient
  clinic: {
    providerNit: string
    repsCode: string
    documentType: string
    documentNumber: string
  }
}

export function compactCie10Code(value: unknown): string
export function normalizeCupsDigits(value: unknown): string
export function isValidCupsCode(value: unknown): boolean
export function isValidCie10Code(value: unknown): boolean
export function cupsFromText(value: unknown): string[]
export function resolveCanonicalCupsCodes(note: object | null | undefined): string[]
export function resolveCanonicalCie10Principal(note: object | null | undefined): string
export function resolveCanonicalEvolutionRips(
  note: object | null | undefined,
  patient?: object,
  clinicConfig?: object,
): CanonicalEvolutionRipsResolved
export function validateCanonicalEvolutionRips(
  resolved: CanonicalEvolutionRipsResolved | null | undefined,
  mode?: CanonicalRipsValidationMode,
): CanonicalRipsValidationResult
export function resolveAndValidateCanonicalEvolutionRips(
  note: object | null | undefined,
  patient?: object,
  clinicConfig?: object,
  mode?: CanonicalRipsValidationMode,
): {
  resolved: CanonicalEvolutionRipsResolved
  validation: CanonicalRipsValidationResult
}
export function applySinFacturaBillingContract(
  rips: object | null | undefined,
  numNotaSeed?: string | number,
): object | null | undefined
