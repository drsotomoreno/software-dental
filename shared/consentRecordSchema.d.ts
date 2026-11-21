import type { ZodError, ZodTypeAny } from 'zod'

export const consentStatusSchema: ZodTypeAny
export const signedConsentRecordSchema: ZodTypeAny
export const legacyInformedConsentSchema: ZodTypeAny
export const clinicalConsentPayloadSchema: ZodTypeAny

export function parseClinicalConsentPayload(
  payload: unknown,
): { success: true; data: unknown } | { success: false; error: ZodError }
