/**
 * Pasa la firma de la tableta a la historia abierta (Dexie).
 * El hook de sincronización marca pendingSync y empuja el documento a PostgreSQL.
 * La evolución no recibe firma de paciente (Resolución 1995 de 1999).
 */
import { db } from '@/db/database'
import {
  acceptsKioskPatientSignature,
  type KioskSignatureReceived,
} from '@/kiosk/kioskTypes'
import type { InformedConsent } from '@/types/consent'
import { normalizeConsent } from '@/types/consent'
import type { KioskIntakeSignature } from '@/types/patient'
import type { DigitalSignature, SignatureCaptureMetadata } from '@/types/signature'
import { normalizeTreatmentPlanAuthorization } from '@/types/treatmentPlanAuthorization'
import { signatureMetaFromKioskForm } from '@/utils/kioskSignatureMeta'
import { getLatestClinicalRecord, listPatientClinicalRecords } from '@/utils/clinicalRecordSnapshot'
import { getPatientByRouteId, toPatientForeignKey } from '@/utils/patientId'
import { getPatientClinicalDraft, savePatientClinicalDraft } from '@/utils/patientClinicalDraft'

export const KIOSK_SIGNATURE_APPLIED_EVENT = 'mhd:kiosk-signature-applied'

export interface KioskSignatureAppliedDetail {
  documentType: 'INTAKE' | 'CONSENT' | 'PLAN'
  patientId: string
  signatureBase64: string
  signedAt: string
  ipAddress: string
  kioskDeviceId: string
  signerName: string
  signerDocument: string
  signerIsGuardian: boolean
  signatureMeta?: SignatureCaptureMetadata
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stampTime(event: KioskSignatureReceived): string {
  const raw = text(event.signedAt) || text(event.createdAt)
  const parsed = new Date(raw || Date.now())
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

async function findPatient(patientId: string) {
  const direct = await getPatientByRouteId(patientId)
  if (direct) return direct
  return (
    (await db.patients.filter((item) => item.syncId === patientId || String(item.id) === patientId).first()) ??
    null
  )
}

function signerFromEvent(
  event: KioskSignatureReceived,
  patientName: string,
  patientDocument: string,
): { signerName: string; signerDocument: string; signerIsGuardian: boolean } {
  const form = asRecord(event.formData)
  const datos = asRecord(form.datosBasicos)
  const guardianName = text(form.guardianName) || text(datos.guardianName)
  const guardianDocument = text(form.guardianDocument) || text(datos.guardianDocument)
  const minor =
    form.esMenorDeEdad === true || datos.esMenorDeEdad === true || Boolean(guardianName && guardianDocument)
  if (minor && guardianName && guardianDocument) {
    return { signerName: guardianName, signerDocument: guardianDocument, signerIsGuardian: true }
  }
  const intakeName = [text(datos.firstName), text(datos.lastName)].filter(Boolean).join(' ')
  const intakeDocument = [text(datos.documentType), text(datos.documentNumber)].filter(Boolean).join(' ')
  return {
    signerName: intakeName || patientName,
    signerDocument: intakeDocument || patientDocument,
    signerIsGuardian: false,
  }
}

async function rememberKioskLedger(
  recordId: string,
  signature: string,
  detail: KioskSignatureAppliedDetail,
  recordType: 'consent' | 'budget',
): Promise<void> {
  const row: DigitalSignature = {
    recordId,
    recordType,
    signatureDataUrl: signature,
    signedBy: detail.signerName,
    signedByDocument: detail.signerDocument,
    signedAt: detail.signedAt,
    deviceInfo: detail.kioskDeviceId || 'kiosk',
    ipAddress: detail.ipAddress || undefined,
    contentHash: text(detail.kioskDeviceId) || 'kiosk-signature',
    isValid: true,
  }
  await db.signatures.add(row)
}

export async function applyKioskSignature(
  event: KioskSignatureReceived,
): Promise<KioskSignatureAppliedDetail | null> {
  if (!acceptsKioskPatientSignature(event.documentType)) return null
  const signature = text(event.signatureBase64)
  if (!signature.startsWith('data:image/')) return null

  const patientKey = text(event.patientId)
  if (!patientKey) return null

  const patient = await findPatient(patientKey)
  const routeId = patient?.id != null ? String(patient.id) : patientKey
  const patientName = patient ? `${patient.firstName} ${patient.lastName}`.trim() : ''
  const patientDocument = patient ? `${patient.documentType} ${patient.documentNumber}`.trim() : ''
  const signer = signerFromEvent(event, patientName, patientDocument)
  const signedAt = stampTime(event)
  const documentType =
    event.documentType === 'INTAKE' ? 'INTAKE' : event.documentType === 'PLAN' ? 'PLAN' : 'CONSENT'
  const detail: KioskSignatureAppliedDetail = {
    documentType,
    patientId: routeId,
    signatureBase64: signature,
    signedAt,
    ipAddress: text(event.ipAddress),
    kioskDeviceId: text(event.kioskDeviceId),
    signatureMeta: signatureMetaFromKioskForm(event.formData),
    ...signer,
  }

  if (detail.documentType === 'INTAKE') {
    if (patient?.id != null) {
      const stamp: KioskIntakeSignature = {
        patientSignatureDataUrl: signature,
        signedAt,
        signerName: detail.signerName,
        signerDocument: detail.signerDocument,
        signerIsGuardian: detail.signerIsGuardian,
        ipAddress: detail.ipAddress || undefined,
        kioskDeviceId: detail.kioskDeviceId || undefined,
      }
      await db.patients.update(patient.id, {
        kioskIntakeSignature: stamp,
        updatedAt: signedAt,
      })
    }
    window.dispatchEvent(new CustomEvent(KIOSK_SIGNATURE_APPLIED_EVENT, { detail }))
    return detail
  }

  const records = await listPatientClinicalRecords(routeId)
  const extra =
    patient?.syncId && patient.syncId !== routeId
      ? await listPatientClinicalRecords(patient.syncId)
      : []
  const record =
    (await getLatestClinicalRecord(routeId)) ??
    [...records, ...extra].sort((a, b) =>
      (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    )[0] ??
    null

  const draft = await getPatientClinicalDraft(toPatientForeignKey(routeId))
  const guardianPatch = detail.signerIsGuardian
    ? { guardianName: detail.signerName, guardianDocument: detail.signerDocument }
    : {}

  if (detail.documentType === 'PLAN') {
    const baseAuth = normalizeTreatmentPlanAuthorization(
      draft?.clinicalDraft?.treatmentPlanAuthorization ?? record?.treatmentPlanAuthorization,
    )
    const nextAuth = {
      ...baseAuth,
      patientSignatureDataUrl: signature,
      ...(detail.signatureMeta ? { patientSignatureMeta: detail.signatureMeta } : {}),
      textAccepted: true,
      signedAt: baseAuth.professionalSignatureDataUrl?.trim()
        ? baseAuth.signedAt?.trim() || signedAt
        : baseAuth.signedAt,
      ...guardianPatch,
    }
    if (record?.id != null) {
      await db.clinicalRecords.update(record.id, {
        treatmentPlanAuthorization: nextAuth,
        updatedAt: signedAt,
      })
      await rememberKioskLedger(String(record.id), signature, detail, 'budget')
    }
    if (draft?.clinicalDraft) {
      await savePatientClinicalDraft(
        routeId,
        { ...draft.clinicalDraft, treatmentPlanAuthorization: nextAuth },
        draft.odontogramDraft,
      )
    }
    window.dispatchEvent(new CustomEvent(KIOSK_SIGNATURE_APPLIED_EVENT, { detail }))
    return detail
  }

  const baseConsent = draft?.clinicalDraft?.informedConsent ?? record?.informedConsent
  const nextConsent: InformedConsent = {
    ...normalizeConsent(baseConsent),
    patientSignatureDataUrl: signature,
    ...(detail.signatureMeta ? { patientSignatureMeta: detail.signatureMeta } : {}),
    textAccepted: true,
    signedAt,
    kioskDeviceId: detail.kioskDeviceId || undefined,
    signatureIp: detail.ipAddress || undefined,
    ...guardianPatch,
  }

  if (record?.id != null) {
    await db.clinicalRecords.update(record.id, {
      informedConsent: nextConsent,
      updatedAt: signedAt,
    })
    await rememberKioskLedger(String(record.id), signature, detail, 'consent')
  }

  if (draft?.clinicalDraft) {
    await savePatientClinicalDraft(
      routeId,
      { ...draft.clinicalDraft, informedConsent: nextConsent },
      draft.odontogramDraft,
    )
  }

  window.dispatchEvent(new CustomEvent(KIOSK_SIGNATURE_APPLIED_EVENT, { detail }))
  return detail
}
