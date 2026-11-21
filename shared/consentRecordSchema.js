/**
 * Validación Zod de consentimientos (legacy + individuales).
 * Acepta historias previas con `informedConsent` y nuevas con `informedConsents`.
 */
import { z } from 'zod'

export const consentStatusSchema = z.enum(['draft', 'signed', 'revoked'])

export const signedConsentRecordSchema = z
  .object({
    id: z.string().min(1),
    templateId: z.string().min(1),
    title: z.string(),
    renderedTextSnapshot: z.string(),
    status: consentStatusSchema,
    textAccepted: z.boolean(),
    signerRole: z.enum(['patient', 'guardian']),
    guardianName: z.string().optional(),
    guardianDocument: z.string().optional(),
    guardianRelationship: z.string().optional(),
    patientSignatureDataUrl: z.string().optional(),
    patientSignatureDriveId: z.string().optional(),
    professionalSignatureDataUrl: z.string().optional(),
    professionalSignatureDriveId: z.string().optional(),
    professionalId: z.string(),
    professionalName: z.string(),
    professionalDocument: z.string(),
    professionalRethus: z.string(),
    createdAt: z.string(),
    signedAt: z.string().optional(),
    contentHash: z.string().optional(),
    revokedAt: z.string().optional(),
    revokedReason: z.string().optional(),
    revokedByUserId: z.string().optional(),
    isLegacyUnified: z.boolean().optional(),
  })
  .passthrough()

/** Campo unificado legado: objeto flexible para no romper historias firmadas. */
export const legacyInformedConsentSchema = z.object({}).passthrough()

/**
 * Fragmento de payload clínico: ambos campos son opcionales y coexisten.
 * Usar `.passthrough()` en el esquema padre para no rechazar el resto de la HCE.
 */
export const clinicalConsentPayloadSchema = z
  .object({
    informedConsent: legacyInformedConsentSchema.optional().nullable(),
    informedConsents: z.array(signedConsentRecordSchema).optional().nullable(),
  })
  .passthrough()

/**
 * @param {unknown} payload
 * @returns {{ success: true, data: unknown } | { success: false, error: import('zod').ZodError }}
 */
export function parseClinicalConsentPayload(payload) {
  return clinicalConsentPayloadSchema.safeParse(payload)
}
