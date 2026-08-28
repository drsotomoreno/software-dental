import { db } from '@/db/database'
import type { PaymentInvoice } from '@/types/clinicalRecord'
import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { ElectronicCreditNote } from '@/types/creditNote'
import type { ElectronicInvoice } from '@/types/invoice'
import type { UserProfile } from '@/types/user'
import { generateId } from '@/utils/crypto'
import { enqueueCreditNoteOutbox } from '@/services/invoiceOutboxService'
import {
  assertElectronicInvoiceMutableUpdate,
  isPaymentInvoiceImmutable,
} from '@/services/invoiceImmutabilityService'
import { saveElectronicInvoice } from '@/services/invoiceService'

const CREDIT_NOTE_SEQ_KEY = 'dental_emr_credit_note_seq'
const CREDIT_NOTE_PREFIX_KEY = 'dental_emr_credit_note_prefix'
const DEFAULT_CREDIT_NOTE_PREFIX = 'NC'

function sequenceStorageKey(userId?: string): string {
  return userId ? `${CREDIT_NOTE_SEQ_KEY}_${userId}` : CREDIT_NOTE_SEQ_KEY
}

export function getCreditNotePrefix(): string {
  if (typeof window === 'undefined') return DEFAULT_CREDIT_NOTE_PREFIX
  return localStorage.getItem(CREDIT_NOTE_PREFIX_KEY)?.trim() || DEFAULT_CREDIT_NOTE_PREFIX
}

export function reserveNextCreditNoteNumber(userId?: string): string {
  const prefix = getCreditNotePrefix()
  const key = sequenceStorageKey(userId)

  if (typeof window === 'undefined') {
    return `${prefix}${String(Date.now()).slice(-8)}`
  }

  const current = Number.parseInt(localStorage.getItem(key) || '0', 10)
  const next = Number.isFinite(current) ? current + 1 : 1
  localStorage.setItem(key, String(next))
  return `${prefix}${String(next).padStart(8, '0')}`
}

export interface CreateCreditNoteInput {
  reason: string
  professional: UserProfile
  patientId: string
  amount: number
  originalInvoiceId: string
  originalInvoiceNumber: string
  originalCufe?: string | null
  originalCuv?: string | null
  paymentInvoiceId?: string
  clinicalRecordId?: string | number
}

export function buildCreditNoteRecord(input: CreateCreditNoteInput): ElectronicCreditNote {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    creditNoteNumber: reserveNextCreditNoteNumber(input.professional.id),
    issueDate: now.slice(0, 10),
    reason: input.reason.trim(),
    originalInvoiceId: input.originalInvoiceId,
    originalInvoiceNumber: input.originalInvoiceNumber,
    originalCufe: input.originalCufe ?? null,
    originalCuv: input.originalCuv ?? null,
    amount: Math.max(0, input.amount),
    currency: 'COP',
    patientId: input.patientId,
    professionalId: input.professional.id,
    paymentInvoiceId: input.paymentInvoiceId ?? null,
    clinicalRecordId: input.clinicalRecordId ?? null,
    status: 'issued',
    createdAt: now,
    updatedAt: now,
  }
}

export async function saveCreditNote(creditNote: ElectronicCreditNote): Promise<void> {
  await db.electronicCreditNotes.add(creditNote)
}

export async function createCreditNoteForElectronicInvoice(
  invoice: ElectronicInvoice,
  reason: string,
  professional: UserProfile,
): Promise<ElectronicCreditNote> {
  if (invoice.status === 'voided_by_credit_note') {
    throw new Error('Esta factura ya fue anulada mediante Nota Crédito.')
  }

  const creditNote = buildCreditNoteRecord({
    reason,
    professional,
    patientId: invoice.patientId,
    amount: invoice.netPayable,
    originalInvoiceId: invoice.id,
    originalInvoiceNumber: invoice.invoiceNumber,
    originalCufe: invoice.cufe,
    originalCuv: invoice.cuv,
  })

  const previous = await db.electronicInvoices.get(invoice.id)
  const updatedInvoice: ElectronicInvoice = {
    ...invoice,
    status: 'voided_by_credit_note',
    creditNoteId: creditNote.id,
    creditNoteNumber: creditNote.creditNoteNumber,
    voidReason: reason.trim(),
    updatedAt: new Date().toISOString(),
  }

  assertElectronicInvoiceMutableUpdate(previous, updatedInvoice)
  await saveCreditNote(creditNote)
  await saveElectronicInvoice(updatedInvoice)
  await enqueueCreditNoteOutbox(creditNote)

  try {
    await fetch('/api/invoices/credit-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creditNote, originalInvoice: updatedInvoice }),
    })
  } catch {
    // Offline: queda en syncOutbox
  }

  return creditNote
}

function patchPaymentInvoiceInRecord(
  record: ClinicalRecord,
  paymentInvoiceId: string,
  patch: Partial<PaymentInvoice>,
): ClinicalRecord | null {
  let changed = false

  const paymentControl = (record.paymentControl ?? []).map((payment) => {
    const invoices = payment.invoices.map((invoice) => {
      if (invoice.id !== paymentInvoiceId) return invoice
      changed = true
      return { ...invoice, ...patch }
    })
    return { ...payment, invoices }
  })

  const orthodonticsPaymentControl = (record.orthodonticsPaymentControl ?? []).map((payment) => {
    const invoices = payment.invoices.map((invoice) => {
      if (invoice.id !== paymentInvoiceId) return invoice
      changed = true
      return { ...invoice, ...patch }
    })
    return { ...payment, invoices }
  })

  if (!changed) return null

  return {
    ...record,
    paymentControl,
    orthodonticsPaymentControl,
  }
}

export async function createCreditNoteForPaymentInvoice(input: {
  paymentInvoice: PaymentInvoice
  reason: string
  professional: UserProfile
  patientId: string
  clinicalRecordId?: string | number
}): Promise<ElectronicCreditNote> {
  const { paymentInvoice, reason, professional, patientId, clinicalRecordId } = input

  if (!isPaymentInvoiceImmutable(paymentInvoice)) {
    throw new Error('Solo se puede anular con Nota Crédito una factura ya registrada con consecutivo.')
  }
  if (paymentInvoice.status === 'voided_by_credit_note') {
    throw new Error('Esta factura ya fue anulada mediante Nota Crédito.')
  }
  if (!paymentInvoice.invoiceNumber?.trim()) {
    throw new Error('La factura debe tener número consecutivo para generar Nota Crédito.')
  }

  const creditNote = buildCreditNoteRecord({
    reason,
    professional,
    patientId,
    amount: paymentInvoice.amount,
    originalInvoiceId: paymentInvoice.id,
    originalInvoiceNumber: paymentInvoice.invoiceNumber,
    paymentInvoiceId: paymentInvoice.id,
    clinicalRecordId,
  })

  const invoicePatch: Partial<PaymentInvoice> = {
    status: 'voided_by_credit_note',
    creditNoteId: creditNote.id,
    creditNoteNumber: creditNote.creditNoteNumber,
    voidReason: reason.trim(),
  }

  await saveCreditNote(creditNote)
  await enqueueCreditNoteOutbox(creditNote)

  if (clinicalRecordId != null) {
    const record = await db.clinicalRecords.get(clinicalRecordId)
    if (record) {
      const patched = patchPaymentInvoiceInRecord(record, paymentInvoice.id, invoicePatch)
      if (patched && record.id != null) {
        await db.clinicalRecords.update(record.id, {
          paymentControl: patched.paymentControl,
          orthodonticsPaymentControl: patched.orthodonticsPaymentControl,
        })
      }
    }
  }

  try {
    await fetch('/api/invoices/credit-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creditNote,
        paymentInvoice: { ...paymentInvoice, ...invoicePatch },
      }),
    })
  } catch {
    // Offline
  }

  return creditNote
}

export function voidPaymentInvoiceLocally(
  paymentInvoice: PaymentInvoice,
  creditNote: ElectronicCreditNote,
): PaymentInvoice {
  return {
    ...paymentInvoice,
    status: 'voided_by_credit_note',
    creditNoteId: creditNote.id,
    creditNoteNumber: creditNote.creditNoteNumber,
    voidReason: creditNote.reason,
  }
}
