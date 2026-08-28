import { db } from '@/db/database'
import { buildValuationConsentTextSnapshot } from '@/constants/valuationConsentText'
import type { ValuationConsentMetadata } from '@/types/valuationConsent'
import { VALUATION_CONSENT_VERSION } from '@/types/valuationConsent'
import type { UserProfile } from '@/types/user'
import { logAuditEvent } from '@/services/auditService'
import { generateId } from './crypto'
import { toDexiePrimaryKey } from './patientId'

const DEVICE_ID_STORAGE_KEY = 'dental-emr-device-id'

/** Identificador persistente del dispositivo de registro (entorno local/Electron). */
export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY)
    if (existing) return existing
    const id = `dev-${generateId()}`
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id)
    return id
  } catch {
    return `dev-session-${generateId()}`
  }
}

export function buildValuationConsentMetadata(
  userId?: string,
): ValuationConsentMetadata {
  return {
    consentimientoValoracionAceptado: true,
    consentimientoTimestamp: new Date().toISOString(),
    dispositivoId: getOrCreateDeviceId(),
    consentVersion: VALUATION_CONSENT_VERSION,
    acceptedByUserId: userId,
    textSnapshot: buildValuationConsentTextSnapshot(),
  }
}

export async function persistValuationConsentOnPatient(
  patientId: number | string,
  metadata: ValuationConsentMetadata,
): Promise<void> {
  await db.patients.update(toDexiePrimaryKey(String(patientId)), {
    valuationConsent: metadata,
    updatedAt: new Date().toISOString(),
  })
}

export async function recordValuationConsentAudit(input: {
  user: UserProfile | null
  resourceId: string
  metadata: ValuationConsentMetadata
  patientLabel?: string
}): Promise<void> {
  const { user, resourceId, metadata, patientLabel } = input
  await logAuditEvent({
    action: 'ACCEPT_VALUATION_CONSENT',
    resourceType: 'patient',
    resourceId,
    details: [
      'Consentimiento para Valoración y Diagnóstico Integral aceptado',
      patientLabel ? `Paciente: ${patientLabel}` : '',
      `Timestamp: ${metadata.consentimientoTimestamp}`,
      `Dispositivo: ${metadata.dispositivoId}`,
      `Versión: ${metadata.consentVersion}`,
    ]
      .filter(Boolean)
      .join(' · '),
    success: true,
    user,
  })
}
