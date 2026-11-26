import type { PaymentDocumentKind, PaymentInvoice, PaymentMethod } from '@/types/clinicalRecord'

export type InvoiceLedgerSource = 'control_pagos' | 'ortodoncia' | 'borrador'

export type InvoiceReportPreset = 'daily' | 'weekly' | 'monthly' | 'custom' | 'all'

export interface InvoiceLedgerEntry {
  key: string
  invoice: PaymentInvoice
  invoiceNumber: string
  invoiceDate: string
  amount: number
  notes?: string
  patientId: string
  patientRouteId: string
  patientName: string
  patientDocument: string
  paymentReason: string
  paymentMethod: PaymentMethod
  paymentDate: string
  treatingDentistName?: string
  source: InvoiceLedgerSource
  recordId?: string | number
  isDraft: boolean
  /** Tipo resuelto del comprobante (FEV vs recibo de caja interno). */
  documentKind: PaymentDocumentKind | null
  /** Anulada por Nota Crédito: no suma al total facturado activo. */
  isVoided: boolean
}

export interface InvoiceLedgerSummary {
  /** Documentos visibles en el periodo (incluye anulados y recibos). */
  invoiceCount: number
  /** Suma bruta de todos los montos visibles (compatibilidad). */
  totalAmount: number
  /** Solo FEV/facturas de venta no anuladas. */
  fevCount: number
  fevTotal: number
  /** Solo recibos de caja internos no anulados. */
  receiptCount: number
  receiptTotal: number
  /** Anuladas por Nota Crédito (excluidas del total activo). */
  voidedCount: number
  voidedTotal: number
  /** Total activo = FEV + recibos (sin anuladas). */
  activeTotal: number
}

export interface InvoiceDateRange {
  start: Date
  end: Date
  label: string
}
