import type { PaymentInvoice, PaymentMethod } from '@/types/clinicalRecord'

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
}

export interface InvoiceLedgerSummary {
  invoiceCount: number
  totalAmount: number
}

export interface InvoiceDateRange {
  start: Date
  end: Date
  label: string
}
