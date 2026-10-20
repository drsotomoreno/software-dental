export function sanitizeDocumentNumber(
  documentNumber: string | null | undefined,
  documentType?: string,
): string

export function validateProfessionalDocumentNumber(
  documentNumber: string | null | undefined,
  documentType?: string,
): { valid: boolean; message?: string; normalized?: string }

export interface ProfessionalDocumentSigner {
  id?: string | null
  email?: string | null
}

export function professionalDocumentCandidatesForSigner(
  clinical: unknown,
  signer?: ProfessionalDocumentSigner | null,
): Array<string | null | undefined>

export function firstValidProfessionalDocument(
  candidates: Array<string | null | undefined>,
  documentType?: string,
): string

export function dominantProfessionalDocument(
  candidates: Array<string | null | undefined>,
  documentType?: string,
): string

export function keepStoredDocumentNumber(
  current: string | null | undefined,
  incoming: string | null | undefined,
  documentType?: string,
): string
