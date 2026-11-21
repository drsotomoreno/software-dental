/**
 * Fachada tipada del núcleo medicolegal de consentimientos (FASE 1).
 * La lógica ejecutable vive en `shared/consentRecords.js` (Dexie + Postgres + tests Node).
 */
import { getConsentLabel, type ConsentTemplateId } from '@/constants/consentTemplates'
import type { InformedConsent, SignedConsentRecord, ConsentStatus } from '@/types/consent'
import {
  ConsentMedicolegalError,
  assertConsentMutable as assertConsentMutableShared,
  buildConsentHashPayload as buildConsentHashPayloadShared,
  computeConsentContentHash as computeConsentContentHashShared,
  createConsentDraft as createConsentDraftShared,
  isConsentLegallySealed,
  mergeConsentRecords as mergeConsentRecordsShared,
  patchConsentDraft as patchConsentDraftShared,
  projectLegacyInformedConsent as projectLegacyInformedConsentShared,
  revokeConsentRecord as revokeConsentRecordShared,
  signConsentRecord as signConsentRecordShared,
} from '../../shared/consentRecords.js'

export { isConsentLegallySealed, ConsentMedicolegalError }
export {
  parseClinicalConsentPayload,
  signedConsentRecordSchema,
  clinicalConsentPayloadSchema,
} from '../../shared/consentRecordSchema.js'

export type ConsentBearingRecord = {
  informedConsent?: InformedConsent | null
  informedConsents?: SignedConsentRecord[] | null
}

export interface CreateConsentDraftInput {
  templateId: ConsentTemplateId
  renderedTextSnapshot: string
  professionalId: string
  professionalName: string
  professionalDocument: string
  professionalRethus: string
  title?: string
  signerRole?: 'patient' | 'guardian'
  guardianName?: string
  guardianDocument?: string
  guardianRelationship?: string
  id?: string
  createdAt?: string
}

export interface SignConsentRecordInput {
  record: SignedConsentRecord
  patientIsMinor?: boolean
  textAccepted?: boolean
  signerRole?: 'patient' | 'guardian'
  guardianName?: string
  guardianDocument?: string
  guardianRelationship?: string
  patientSignatureDataUrl?: string
  patientSignatureDriveId?: string
  professionalSignatureDataUrl?: string
  professionalSignatureDriveId?: string
  professionalId?: string
  professionalName?: string
  professionalDocument?: string
  professionalRethus?: string
  signedAt?: string
}

export interface RevokeConsentRecordInput {
  record: SignedConsentRecord
  revokedReason: string
  revokedByUserId: string
  revokedAt?: string
}

export function buildConsentHashPayload(
  record: Omit<SignedConsentRecord, 'contentHash' | 'status'> & { status: ConsentStatus },
): Record<string, unknown> {
  return buildConsentHashPayloadShared(record) as Record<string, unknown>
}

export function computeConsentContentHash(
  record: Omit<SignedConsentRecord, 'contentHash' | 'status'> & { status: ConsentStatus },
): string {
  return computeConsentContentHashShared(record)
}

export function assertConsentMutable(record: SignedConsentRecord): void {
  assertConsentMutableShared(record)
}

export function projectLegacyInformedConsent(
  legacy: InformedConsent | null | undefined,
): SignedConsentRecord[] {
  const projected = projectLegacyInformedConsentShared(legacy) as unknown as SignedConsentRecord[]
  return projected.map((item) => ({
    ...item,
    title: getConsentLabel(item.templateId),
    renderedTextSnapshot:
      item.renderedTextSnapshot === item.templateId
        ? getConsentLabel(item.templateId)
        : item.renderedTextSnapshot,
  }))
}

export function getNormalizedConsents(record: ConsentBearingRecord): SignedConsentRecord[] {
  const modern = Array.isArray(record.informedConsents)
    ? record.informedConsents.filter((item): item is SignedConsentRecord =>
        Boolean(item && typeof item === 'object' && String(item.id || '').trim()),
      )
    : []
  const modernTemplateIds = new Set(modern.map((item) => item.templateId))
  const legacyProjected = projectLegacyInformedConsent(record.informedConsent ?? undefined).filter(
    (item) => !modernTemplateIds.has(item.templateId),
  )
  return [...modern, ...legacyProjected]
}

export function createConsentDraft(input: CreateConsentDraftInput): SignedConsentRecord {
  return createConsentDraftShared({
    ...input,
    title: input.title?.trim() || getConsentLabel(input.templateId),
  }) as unknown as SignedConsentRecord
}

export function signConsentRecord(input: SignConsentRecordInput): SignedConsentRecord {
  return signConsentRecordShared(input) as unknown as SignedConsentRecord
}

export function revokeConsentRecord(input: RevokeConsentRecordInput): SignedConsentRecord {
  return revokeConsentRecordShared(input) as unknown as SignedConsentRecord
}

export function mergeConsentRecords(
  existing: SignedConsentRecord[],
  incoming: SignedConsentRecord[],
): SignedConsentRecord[] {
  return mergeConsentRecordsShared(existing, incoming) as unknown as SignedConsentRecord[]
}

export function patchConsentDraft(
  record: SignedConsentRecord,
  patch: Partial<
    Pick<
      SignedConsentRecord,
      | 'textAccepted'
      | 'signerRole'
      | 'guardianName'
      | 'guardianDocument'
      | 'guardianRelationship'
      | 'patientSignatureDataUrl'
      | 'patientSignatureDriveId'
      | 'professionalSignatureDataUrl'
      | 'professionalSignatureDriveId'
      | 'title'
    >
  >,
): SignedConsentRecord {
  return patchConsentDraftShared(record, patch) as unknown as SignedConsentRecord
}
