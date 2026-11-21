export class ConsentMedicolegalError extends Error {
  constructor(message: string)
}

export function isConsentLegallySealed(record: unknown): boolean

export function mergeConsentRecords(existing: unknown, incoming: unknown): object[]

export function mergeConsentFieldsInForm(
  left: Record<string, unknown> | null | undefined,
  right: Record<string, unknown> | null | undefined,
): { informedConsents: object[] }

export function buildConsentHashPayload(record: Record<string, unknown>): Record<string, unknown>

export function computeConsentContentHash(record: Record<string, unknown>): string

export function assertConsentMutable(record: object): void

export function projectLegacyInformedConsent(legacy: unknown): object[]

export function getNormalizedConsents(record: {
  informedConsent?: unknown
  informedConsents?: unknown
}): object[]

export function createConsentDraft(input: object): object

export function signConsentRecord(input: object): object

export function revokeConsentRecord(input: object): object

export function patchConsentDraft(record: object, patch: object): object
