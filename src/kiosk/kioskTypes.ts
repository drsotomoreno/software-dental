/** Tipos compartidos del modo tableta esclava (sin Dexie). */

/**
 * INTAKE: datos + anamnesis + firma del paciente (o acudiente si es menor).
 * CONSENT: texto legal + casillas + firma del paciente o acudiente.
 * PLAN: plan de tratamiento y presupuesto + firma del paciente o acudiente.
 * EVOLUTION: solo lectura en la tableta. La firma es exclusiva del odontólogo
 * (Resolución 1995 de 1999): no hay SignaturePad ni firma de paciente.
 */
export type KioskActionType = 'INTAKE' | 'EVOLUTION' | 'CONSENT' | 'PLAN'

export type KioskScreenState =
  | 'IDLE'
  | 'SHOW_INTAKE'
  | 'SHOW_EVOLUTION'
  | 'SHOW_CONSENT'
  | 'SHOW_PLAN'
  | 'SUCCESS'

export interface KioskTriggerPayload {
  documentId?: string
  patientId?: string
  title?: string
  contentText?: string
  formData?: Record<string, unknown>
}

export interface KioskTriggerEvent {
  actionType: KioskActionType
  /** false en EVOLUTION: la tableta muestra la nota y no pide firma. */
  patientMaySign?: boolean
  payload: KioskTriggerPayload
  sentAt?: string
  fromUserId?: string | null
}

export interface KioskSignatureReceived {
  documentType: KioskActionType
  documentId?: string | null
  patientId?: string | null
  signatureBase64: string
  formData?: Record<string, unknown>
  savedId?: string
  createdAt?: string
  /** Estampado del servidor al guardar la firma de la tableta. */
  signedAt?: string
  /** IP vista por el servidor (trazabilidad). */
  ipAddress?: string
  /** Id de la conexión Socket.io de la tableta. */
  kioskDeviceId?: string
  intake?: { id?: string; syncId?: string } | null
}

/** La evolución no admite firma del paciente. Intake, consentimiento y plan sí. */
export function acceptsKioskPatientSignature(documentType: string): boolean {
  const type = String(documentType || '').trim().toUpperCase()
  return type === 'INTAKE' || type === 'CONSENT' || type === 'PLAN'
}

export interface KioskSubmitSignatureInput {
  documentType: KioskActionType
  documentId?: string
  patientId?: string
  title?: string
  contentText?: string
  signatureBase64: string
  formData?: Record<string, unknown>
}

/** La tableta canceló la acción (inactividad / paciente ausente). */
export interface KioskCancelledEvent {
  actionType: KioskActionType
  documentId?: string
  patientId?: string
  reason: 'inactivity' | 'user' | string
  cancelledAt: string
}
