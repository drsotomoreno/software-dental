/** Tipos compartidos del modo tableta esclava (sin Dexie). */

export type KioskActionType = 'INTAKE' | 'EVOLUTION' | 'CONSENT'

export type KioskScreenState =
  | 'IDLE'
  | 'SHOW_INTAKE'
  | 'SHOW_EVOLUTION'
  | 'SHOW_CONSENT'
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
  intake?: { id?: string; syncId?: string } | null
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
