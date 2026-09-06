import { db } from '@/db/database'
import { logAuditEvent } from '@/services/auditService'
import type { AuthUser } from '@/types/auth'
import type {
  IhceCie10Diagnosis,
  IhceCupsProcedure,
  IhceDelegatedConsent,
  IhceRdaRecord,
} from '@/types/ihce'
import {
  IHCE_OTP_MAX_ATTEMPTS,
  IHCE_OTP_TTL_MS,
  IHCE_SIMULATED_OTP,
  buildOtpSentAlert,
  maskPhoneLastTwo,
} from '@/types/ihce'
import type { Patient } from '@/types/patient'
import { resolveClientIpAddress } from '@/utils/clientContext'
import { computeContentHash, generateId, serializeForHash } from '@/utils/crypto'
import { toPatientForeignKey } from '@/utils/patientId'

export { IHCE_SIMULATED_OTP, buildOtpSentAlert, maskPhoneLastTwo }

const MOCK_LATENCY_MS = 400

export class IhceInteropError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'PATIENT_REQUIRED'
      | 'DOCUMENT_REQUIRED'
      | 'CONSENT_NOT_FOUND'
      | 'CONSENT_EXPIRED'
      | 'CONSENT_DENIED'
      | 'INVALID_OTP'
      | 'NOT_AUTHORIZED'
      | 'ALREADY_CONSUMED',
  ) {
    super(message)
    this.name = 'IhceInteropError'
  }
}

export interface RequestOtpResult {
  consent: IhceDelegatedConsent
  alertMessage: string
}

export interface VerifyOtpResult {
  consent: IhceDelegatedConsent
  remainingAttempts: number
}

type PatientIdentity = Pick<
  Patient,
  'id' | 'documentType' | 'documentNumber' | 'phone' | 'firstName' | 'lastName'
>

function omitOtpHash(consent: IhceDelegatedConsent): IhceDelegatedConsent {
  const next = { ...consent }
  delete next.otpHash
  return next
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function hashOtp(pin: string, consentId: string, documentNumber: string): Promise<string> {
  return computeContentHash(`${pin}:${consentId}:${documentNumber}`)
}

async function hashConsentPayload(
  consent: Pick<
    IhceDelegatedConsent,
    | 'documentNumber'
    | 'requestedAt'
    | 'authorizedAt'
    | 'ipAddress'
    | 'nonce'
    | 'status'
  >,
): Promise<string> {
  return computeContentHash(
    serializeForHash({
      documentNumber: consent.documentNumber,
      requestedAt: consent.requestedAt,
      authorizedAt: consent.authorizedAt ?? null,
      ipAddress: consent.ipAddress,
      nonce: consent.nonce,
      status: consent.status,
    }),
  )
}

async function expireIfNeeded(consent: IhceDelegatedConsent): Promise<IhceDelegatedConsent> {
  if (consent.status !== 'pending') return consent
  if (Date.now() <= new Date(consent.expiresAt).getTime()) return consent

  const expired = omitOtpHash({
    ...consent,
    status: 'expired',
    consentHash: await hashConsentPayload({ ...consent, status: 'expired' }),
  })
  await db.ihceConsents.put(expired)
  return expired
}

function buildSimulatedDiagnoses(): IhceCie10Diagnosis[] {
  return [
    {
      code: 'K02.1',
      description: 'Caries de la dentina',
      type: 'principal',
      certainty: 'confirmado',
    },
    {
      code: 'K05.10',
      description: 'Gingivitis crónica',
      type: 'relacionado',
      certainty: 'confirmado',
    },
  ]
}

function buildSimulatedProcedures(): IhceCupsProcedure[] {
  const performedAt = '2025-11-12'
  return [
    {
      cupsCode: '890203',
      description: 'Consulta de primera vez por odontología general',
      performedAt,
      performerName: 'IPS Nacional (simulado)',
    },
    {
      cupsCode: '232102',
      description: 'Obturación dental con resina de fotocurado',
      performedAt,
      performerName: 'IPS Nacional (simulado)',
    },
  ]
}

export async function getLatestRdaForPatient(
  patientId: string | number,
): Promise<IhceRdaRecord | undefined> {
  const key = toPatientForeignKey(patientId)
  const rows = await db.ihceRdaRecords.where('patientId').equals(key).toArray()
  return rows.sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt))[0]
}

export async function listRdaForPatient(patientId: string | number): Promise<IhceRdaRecord[]> {
  const key = toPatientForeignKey(patientId)
  const rows = await db.ihceRdaRecords.where('patientId').equals(key).toArray()
  return rows.sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt))
}

/**
 * Simula la API del Ministerio: envía OTP al celular registrado y persiste
 * el consentimiento temporal (PIN solo como SHA-256).
 */
export async function requestOtp(
  patient: PatientIdentity,
  user?: Pick<AuthUser, 'id' | 'email' | 'firstName' | 'lastName' | 'role'> | null,
): Promise<RequestOtpResult> {
  if (!patient?.id) {
    throw new IhceInteropError('El paciente no tiene identificador local.', 'PATIENT_REQUIRED')
  }
  const documentNumber = String(patient.documentNumber ?? '').trim()
  if (!documentNumber) {
    throw new IhceInteropError('La cédula del paciente es obligatoria.', 'DOCUMENT_REQUIRED')
  }

  await delay(MOCK_LATENCY_MS)

  const patientId = toPatientForeignKey(patient.id)
  const pending = await db.ihceConsents
    .where('patientId')
    .equals(patientId)
    .filter((row) => row.status === 'pending')
    .toArray()

  for (const row of pending) {
    const expired = await expireIfNeeded(row)
    if (expired.status === 'pending') {
      const forced = omitOtpHash({
        ...expired,
        status: 'expired',
      })
      forced.consentHash = await hashConsentPayload(forced)
      await db.ihceConsents.put(forced)
    }
  }

  const now = new Date()
  const consentId = generateId()
  const nonce = generateId()
  const ipAddress = await resolveClientIpAddress()
  const maskedPhone = maskPhoneLastTwo(patient.phone)
  const otpHash = await hashOtp(IHCE_SIMULATED_OTP, consentId, documentNumber)

  const draft: IhceDelegatedConsent = {
    id: consentId,
    patientId,
    documentType: patient.documentType,
    documentNumber,
    requestedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + IHCE_OTP_TTL_MS).toISOString(),
    ipAddress,
    userAgent: navigator.userAgent,
    requestedByUserId: user?.id ?? null,
    maskedPhone,
    otpHash,
    consentHash: '',
    nonce,
    status: 'pending',
    attemptCount: 0,
  }
  draft.consentHash = await hashConsentPayload(draft)

  await db.ihceConsents.add(draft)

  await logAuditEvent({
    action: 'IHCE_OTP_REQUESTED',
    resourceType: 'ihce',
    resourceId: consentId,
    details: `OTP IHCE solicitado para ${patient.documentType} ${documentNumber} (${maskedPhone})`,
    user,
  })

  return {
    consent: draft,
    alertMessage: buildOtpSentAlert(maskedPhone),
  }
}

export async function verifyOtp(
  consentId: string,
  pin: string,
  user?: Pick<AuthUser, 'id' | 'email' | 'firstName' | 'lastName' | 'role'> | null,
): Promise<VerifyOtpResult> {
  await delay(MOCK_LATENCY_MS)

  const stored = await db.ihceConsents.get(consentId)
  if (!stored) {
    throw new IhceInteropError('No hay una solicitud de consentimiento vigente.', 'CONSENT_NOT_FOUND')
  }

  const consent = await expireIfNeeded(stored)

  if (consent.status === 'expired') {
    await logAuditEvent({
      action: 'IHCE_OTP_FAILED',
      resourceType: 'ihce',
      resourceId: consentId,
      details: 'OTP IHCE expirado',
      success: false,
      user,
    })
    throw new IhceInteropError('El código de autorización expiró. Solicite uno nuevo.', 'CONSENT_EXPIRED')
  }

  if (consent.status === 'denied') {
    throw new IhceInteropError(
      'Se superó el número de intentos. Solicite un nuevo código.',
      'CONSENT_DENIED',
    )
  }

  if (consent.status !== 'pending' || !consent.otpHash) {
    throw new IhceInteropError('El consentimiento ya no admite validación de PIN.', 'NOT_AUTHORIZED')
  }

  const normalizedPin = pin.replace(/\D/g, '')
  const candidateHash = await hashOtp(normalizedPin, consent.id, consent.documentNumber)
  const matches = candidateHash === consent.otpHash

  if (!matches) {
    const attemptCount = consent.attemptCount + 1
    const denied = attemptCount >= IHCE_OTP_MAX_ATTEMPTS
    const next: IhceDelegatedConsent = denied
      ? omitOtpHash({
          ...consent,
          attemptCount,
          status: 'denied',
        })
      : {
          ...consent,
          attemptCount,
          status: 'pending',
        }
    if (denied) {
      next.consentHash = await hashConsentPayload(next)
    }
    await db.ihceConsents.put(next)

    await logAuditEvent({
      action: 'IHCE_OTP_FAILED',
      resourceType: 'ihce',
      resourceId: consentId,
      details: denied
        ? `OTP IHCE denegado tras ${attemptCount} intentos`
        : `OTP IHCE inválido (intento ${attemptCount}/${IHCE_OTP_MAX_ATTEMPTS})`,
      success: false,
      user,
    })

    if (denied) {
      throw new IhceInteropError(
        'Se superó el número de intentos. Solicite un nuevo código.',
        'CONSENT_DENIED',
      )
    }

    throw new IhceInteropError(
      `Código incorrecto. Quedan ${IHCE_OTP_MAX_ATTEMPTS - attemptCount} intento(s).`,
      'INVALID_OTP',
    )
  }

  const authorizedAt = new Date().toISOString()
  const authorized = omitOtpHash({
    ...consent,
    status: 'authorized',
    authorizedAt,
    attemptCount: consent.attemptCount + 1,
  })
  authorized.consentHash = await hashConsentPayload(authorized)
  await db.ihceConsents.put(authorized)

  await logAuditEvent({
    action: 'IHCE_OTP_VERIFIED',
    resourceType: 'ihce',
    resourceId: consentId,
    details: `Consentimiento delegado autorizado para ${consent.documentType} ${consent.documentNumber}`,
    user,
  })

  return {
    consent: authorized,
    remainingAttempts: IHCE_OTP_MAX_ATTEMPTS - authorized.attemptCount,
  }
}

/**
 * Descarga el RDA simulado y lo cachea en IndexedDB para lectura offline.
 */
export async function downloadRda(
  consentId: string,
  user?: Pick<AuthUser, 'id' | 'email' | 'firstName' | 'lastName' | 'role'> | null,
): Promise<IhceRdaRecord> {
  await delay(MOCK_LATENCY_MS)

  const stored = await db.ihceConsents.get(consentId)
  if (!stored) {
    throw new IhceInteropError('No hay consentimiento para descargar el RDA.', 'CONSENT_NOT_FOUND')
  }

  if (stored.status === 'consumed') {
    const existing = await db.ihceRdaRecords.where('consentId').equals(consentId).first()
    if (existing) return existing
    throw new IhceInteropError('El consentimiento ya fue utilizado.', 'ALREADY_CONSUMED')
  }

  if (stored.status !== 'authorized') {
    throw new IhceInteropError(
      'El consentimiento no está autorizado para descargar el RDA.',
      'NOT_AUTHORIZED',
    )
  }

  const diagnoses = buildSimulatedDiagnoses()
  const procedures = buildSimulatedProcedures()
  const compositionId = generateId()
  const downloadedAt = new Date().toISOString()
  const payload = {
    documentNumber: stored.documentNumber,
    consentId,
    downloadedAt,
    diagnoses,
    procedures,
    compositionId,
  }
  const record: IhceRdaRecord = {
    id: generateId(),
    patientId: stored.patientId,
    documentNumber: stored.documentNumber,
    consentId,
    downloadedAt,
    source: 'minsalud-simulado',
    payloadHash: await computeContentHash(serializeForHash(payload)),
    diagnoses,
    procedures,
    compositionId,
    rawBundle: {
      resourceType: 'Bundle',
      type: 'document',
      id: compositionId,
      timestamp: downloadedAt,
      entry: [
        {
          resource: {
            resourceType: 'Composition',
            id: compositionId,
            status: 'final',
            title: 'Resumen Digital de Atención (simulado)',
          },
        },
      ],
    },
  }

  const consumed = omitOtpHash({
    ...stored,
    status: 'consumed',
    consumedAt: downloadedAt,
  })
  consumed.consentHash = await hashConsentPayload(consumed)

  await db.transaction('rw', db.ihceConsents, db.ihceRdaRecords, async () => {
    await db.ihceRdaRecords.add(record)
    await db.ihceConsents.put(consumed)
  })

  await logAuditEvent({
    action: 'IHCE_RDA_DOWNLOADED',
    resourceType: 'ihce',
    resourceId: record.id,
    details: `RDA cacheado offline (${diagnoses.length} CIE-10, ${procedures.length} CUPS) para ${stored.documentNumber}`,
    user,
  })

  return record
}
