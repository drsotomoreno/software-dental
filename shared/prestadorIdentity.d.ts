export function normalizeLegalName(value?: string | null): string
export function normalizeRazonSocial(value?: string | null): string
export function namesCorrespond(left?: string | null, right?: string | null): boolean
export function razonSocialCorresponds(left?: string | null, right?: string | null): boolean
export function sanitizeRethusInput(value?: string | null): string
export function sanitizeRepsInput(value?: string | null): string
export function validatePrestadorIdentityFields(input?: {
  providerType?: string
  firstName?: string
  lastName?: string
  legalName?: string
  documentType?: string
  documentNumber?: string
  clinicName?: string
  providerNit?: string
  repsCode?: string
  rethusNumber?: string
}): {
  valid: boolean
  errors: string[]
  fieldErrors?: Record<string, string>
  message?: string
  identity: {
    providerType: 'institucion' | 'profesional_independiente'
    firstName: string
    lastName: string
    legalName: string
    documentType: string
    documentNumber: string
    clinicName: string
    providerNit: string
    providerNitDisplay: string
    repsCode: string
    repsDisplay: string
    rethusNumber: string
    rethusDigits: string
  }
}
