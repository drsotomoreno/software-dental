/** Nota Crédito Electrónica vinculada a una FEV-Salud (DIAN / Res. 2275 de 2023). */
export type CreditNoteStatus = 'draft' | 'issued' | 'submitted'

export interface ElectronicCreditNote {
  id: string
  creditNoteNumber: string
  issueDate: string
  /** Motivo narrativo de anulación / devolución (obligatorio). */
  reason: string
  /** Código motivo DIAN (opcional). */
  reasonCode?: string

  originalInvoiceId: string
  originalInvoiceNumber: string
  originalCufe?: string | null
  originalCuv?: string | null

  amount: number
  currency: 'COP'

  patientId: string
  professionalId: string

  /** Referencia al comprobante de pago local si aplica. */
  paymentInvoiceId?: string | null
  clinicalRecordId?: string | number | null

  status: CreditNoteStatus
  createdAt: string
  updatedAt: string
}

export const CREDIT_NOTE_IMMUTABILITY_MESSAGE =
  'Por disposición tributaria de la DIAN y normatividad en salud, las facturas electrónicas emitidas no se pueden eliminar de la base de datos.'
