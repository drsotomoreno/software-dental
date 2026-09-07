import { db } from '@/db/database'
import {
  RDA_DEMO_DIAGNOSES,
  RDA_DEMO_OTP_PIN,
  RDA_DEMO_PROCEDURES,
  RDA_MINSALUD_DELAY_MS,
  RDA_OTP_LENGTH,
  RDA_PRESTADOR_ORIGEN,
  maskPhoneForDisplay,
} from '@/constants/rdaExternalHistory'
import { logAuditEvent } from '@/services/auditService'
import type { AuthUser } from '@/types/auth'
import type { Patient } from '@/types/patient'
import {
  RDA_CONSENT_PURPOSE,
  RDA_EXTERNAL_SOURCE,
  RDA_HASH_ALGORITHM,
  RDA_LEGAL_BASIS,
  type RdaConsentHashPayload,
  type RdaCryptographicConsent,
  type RdaExternalHistory,
} from '@/types/rdaExternalHistory'
import { computeContentHash, generateId, serializeForHash } from '@/utils/crypto'
import { toPatientForeignKey } from '@/utils/patientId'
import { sanitizeDocumentNumber } from '@/utils/professionalDocument'

export type RdaOtpRequestResult =
  | { ok: true; maskedPhone: string }
  | { ok: false; error: string }

export type RdaPinValidationResult = { ok: true } | { ok: false; error: string }

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function validatePatientDocumentForRda(
  patient: Pick<Patient, 'documentType' | 'documentNumber'>,
): { valid: true; normalized: string } | { valid: false; error: string } {
  const documentType = patient.documentType
  const normalized = sanitizeDocumentNumber(patient.documentNumber, documentType)
  if (!documentType) {
    return {
      valid: false,
      error: 'El paciente no tiene un tipo de documento asignado. No se puede consultar el RDA.',
    }
  }
  if (!normalized) {
    return {
      valid: false,
      error: 'El paciente no tiene un documento válido asignado. No se puede consultar el RDA.',
    }
  }
  if (documentType === 'PA') {
    if (normalized.length < 5 || normalized.length > 20) {
      return { valid: false, error: 'El pasaporte del paciente no es válido para la consulta RDA.' }
    }
    return { valid: true, normalized }
  }
  if (normalized.length < 6 || normalized.length > 12) {
    return {
      valid: false,
      error: 'El número de documento debe tener entre 6 y 12 dígitos para consultar el RDA.',
    }
  }
  return { valid: true, normalized }
}

export function validatePatientPhoneForRda(
  phone: string | null | undefined,
): { valid: true; digits: string } | { valid: false; error: string } {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length < 7) {
    return {
      valid: false,
      error: 'El paciente no tiene un teléfono de contacto válido para enviar el OTP.',
    }
  }
  return { valid: true, digits }
}

export async function requestRdaOtp(
  patient: Patient,
  user?: Pick<AuthUser, 'id' | 'email' | 'firstName' | 'lastName' | 'role'> | null,
): Promise<RdaOtpRequestResult> {
  const document = validatePatientDocumentForRda(patient)
  if (!document.valid) {
    await logAuditEvent({
      action: 'REQUEST_RDA_OTP',
      resourceType: 'rda',
      resourceId: patient.id != null ? String(patient.id) : undefined,
      details: document.error,
      success: false,
      user,
    })
    return { ok: false, error: document.error }
  }

  const phone = validatePatientPhoneForRda(patient.phone)
  if (!phone.valid) {
    await logAuditEvent({
      action: 'REQUEST_RDA_OTP',
      resourceType: 'rda',
      resourceId: patient.id != null ? String(patient.id) : undefined,
      details: phone.error,
      success: false,
      user,
    })
    return { ok: false, error: phone.error }
  }

  await delay(RDA_MINSALUD_DELAY_MS)

  const maskedPhone = maskPhoneForDisplay(phone.digits)
  await logAuditEvent({
    action: 'REQUEST_RDA_OTP',
    resourceType: 'rda',
    resourceId: patient.id != null ? String(patient.id) : undefined,
    details: `OTP simulado Minsalud enviado a ${maskedPhone} (${patient.documentType} ${document.normalized})`,
    user,
  })

  return { ok: true, maskedPhone }
}

export function validateRdaPin(pin: string): RdaPinValidationResult {
  const digits = pin.replace(/\D/g, '')
  if (digits.length !== RDA_OTP_LENGTH) {
    return { ok: false, error: 'Ingrese el código de 6 dígitos enviado al celular del paciente.' }
  }
  if (digits !== RDA_DEMO_OTP_PIN) {
    return {
      ok: false,
      error: 'Código rechazado. El PIN no coincide con el enviado por Minsalud.',
    }
  }
  return { ok: true }
}

export async function getLatestRdaHistoryForPatient(
  patientId: string | number,
): Promise<RdaExternalHistory | undefined> {
  const key = toPatientForeignKey(patientId)
  const rows = await db.rdaExternalHistories.where('patientId').equals(key).sortBy('receivedAt')
  return rows.at(-1)
}

export async function getLatestRdaConsentForPatient(
  patientId: string | number,
): Promise<RdaCryptographicConsent | undefined> {
  const key = toPatientForeignKey(patientId)
  const rows = await db.rdaConsents.where('patientId').equals(key).sortBy('createdAt')
  return rows.at(-1)
}

export async function persistSimulatedRdaHistory(input: {
  patient: Patient
  maskedPhone: string
  user?: Pick<AuthUser, 'id' | 'email' | 'firstName' | 'lastName' | 'role'> | null
}): Promise<RdaExternalHistory> {
  const { patient, maskedPhone, user } = input
  if (patient.id == null) {
    throw new Error('El paciente no tiene un identificador persistido.')
  }

  const document = validatePatientDocumentForRda(patient)
  if (!document.valid) {
    throw new Error(document.error)
  }

  const patientId = toPatientForeignKey(patient.id)
  const consentedAt = new Date().toISOString()
  const consentId = generateId()
  const historyId = generateId()

  const hashPayload: RdaConsentHashPayload = {
    patientId,
    documentType: patient.documentType,
    documentNumber: document.normalized,
    maskedPhone,
    purpose: RDA_CONSENT_PURPOSE,
    consentedAt,
    requestedByUserId: user?.id ?? null,
    otpVerified: true,
  }

  const contentHash = await computeContentHash(serializeForHash(hashPayload))
  const requestedByName = user ? `${user.firstName} ${user.lastName}`.trim() : undefined

  const consent: RdaCryptographicConsent = {
    id: consentId,
    patientId,
    documentType: patient.documentType,
    documentNumber: document.normalized,
    maskedPhone,
    purpose: RDA_CONSENT_PURPOSE,
    consentedAt,
    createdAt: consentedAt,
    requestedByUserId: user?.id,
    requestedByName,
    algorithm: RDA_HASH_ALGORITHM,
    contentHash,
    legalBasis: [...RDA_LEGAL_BASIS],
  }

  const performedAt = consentedAt.slice(0, 10)
  const history: RdaExternalHistory = {
    id: historyId,
    patientId,
    consentId,
    source: RDA_EXTERNAL_SOURCE,
    receivedAt: consentedAt,
    diagnoses: RDA_DEMO_DIAGNOSES.map((item) => ({ ...item })),
    procedures: RDA_DEMO_PROCEDURES.map((item) => ({ ...item, performedAt })),
    prestadorOrigen: RDA_PRESTADOR_ORIGEN,
  }

  await db.transaction('rw', db.rdaConsents, db.rdaExternalHistories, async () => {
    await db.rdaConsents.add(consent)
    await db.rdaExternalHistories.add(history)
  })

  await logAuditEvent({
    action: 'IMPORT_EXTERNAL_RDA',
    resourceType: 'rda',
    resourceId: patientId,
    details: `RDA externo persistido (consentimiento ${consentId}, hash ${contentHash.slice(0, 12)}…)`,
    user,
  })

  return history
}
