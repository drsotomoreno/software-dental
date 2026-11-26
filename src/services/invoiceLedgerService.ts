import { db } from '@/db/database'
import type {
  ClinicalRecord,
  OrthodonticsPaymentRecord,
  PaymentDocumentKind,
  PaymentRecord,
} from '@/types/clinicalRecord'
import type { Patient } from '@/types/patient'
import type {
  InvoiceDateRange,
  InvoiceLedgerEntry,
  InvoiceLedgerSource,
  InvoiceReportPreset,
} from '@/types/invoiceLedger'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import {
  clinicalPaymentsNeedAutoInvoices,
  normalizeClinicalRecordPayments,
} from '@/services/paymentInvoiceService'
import { dedupeInvoiceLedgerEntries } from '@/services/invoiceLedgerMath'
import { resolvePaymentDocumentKind } from '@/utils/paymentAbonos'

export { dedupeInvoiceLedgerEntries, summarizeInvoiceLedger } from '@/services/invoiceLedgerMath'

export interface LoadInvoiceLedgerOptions {
  patientId?: string
  liveClinicalData?: Pick<
    ClinicalRecordFormData,
    'paymentControl' | 'orthodonticsPaymentControl'
  > | null
  livePatient?: Patient | null
}

function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function endOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(23, 59, 59, 999)
  return copy
}

function patientLabel(patient?: Patient | null): { name: string; document: string; id: string } {
  if (!patient) {
    return { name: 'Paciente', document: '—', id: '' }
  }
  const id = String(patient.id ?? '')
  return {
    id,
    name: `${patient.firstName} ${patient.lastName}`.trim(),
    document: `${patient.documentType} ${patient.documentNumber}`,
  }
}

function matchesPatientFilter(patientKey: string, filter?: string): boolean {
  if (!filter) return true
  return patientKey === filter || patientKey === String(Number(filter))
}

function resolveEntryDocumentKind(
  payment: { documentKind?: PaymentDocumentKind; invoices?: PaymentRecord['invoices'] },
  invoice: PaymentRecord['invoices'][number],
): PaymentDocumentKind | null {
  return (
    resolvePaymentDocumentKind({
      documentKind: payment.documentKind,
      invoices: [invoice],
    }) ??
    invoice.documentKind ??
    null
  )
}

function pushPaymentInvoices(
  target: InvoiceLedgerEntry[],
  payments: PaymentRecord[],
  patient: Patient | undefined,
  options: {
    source: InvoiceLedgerSource
    recordId?: string | number
    isDraft: boolean
  },
) {
  const { name, document, id } = patientLabel(patient)

  for (const payment of payments) {
    for (const invoice of payment.invoices ?? []) {
      if (invoice.sharedCopy) continue
      if (!invoice.invoiceNumber?.trim() && !invoice.amount) continue

      target.push({
        key: `${options.recordId ?? 'draft'}:${payment.id}:${invoice.id}`,
        invoice,
        invoiceNumber: invoice.invoiceNumber?.trim() || '—',
        invoiceDate: invoice.invoiceDate || payment.paymentDate,
        amount: invoice.amount || 0,
        notes: invoice.notes,
        patientId: id,
        patientRouteId: id,
        patientName: name,
        patientDocument: document,
        paymentReason: payment.paymentReason,
        paymentMethod: payment.paymentMethod,
        paymentDate: payment.paymentDate,
        treatingDentistName: payment.treatingDentistName,
        source: options.source,
        recordId: options.recordId,
        isDraft: options.isDraft,
        documentKind: resolveEntryDocumentKind(payment, invoice),
        isVoided: invoice.status === 'voided_by_credit_note',
      })
    }
  }
}

function pushOrthodonticsInvoices(
  target: InvoiceLedgerEntry[],
  payments: OrthodonticsPaymentRecord[],
  patient: Patient | undefined,
  options: {
    recordId?: string | number
    isDraft: boolean
  },
) {
  const { name, document, id } = patientLabel(patient)

  for (const payment of payments) {
    for (const invoice of payment.invoices ?? []) {
      if (invoice.sharedCopy) continue
      if (!invoice.invoiceNumber?.trim() && !invoice.amount) continue

      target.push({
        key: `${options.recordId ?? 'draft'}:ortho:${payment.id}:${invoice.id}`,
        invoice,
        invoiceNumber: invoice.invoiceNumber?.trim() || '—',
        invoiceDate: invoice.invoiceDate || payment.paymentDate,
        amount: invoice.amount || 0,
        notes: invoice.notes,
        patientId: id,
        patientRouteId: id,
        patientName: name,
        patientDocument: document,
        paymentReason: payment.paymentReason,
        paymentMethod: payment.paymentMethod,
        paymentDate: payment.paymentDate,
        source: 'ortodoncia',
        recordId: options.recordId,
        isDraft: options.isDraft,
        documentKind: resolveEntryDocumentKind(payment, invoice),
        isVoided: invoice.status === 'voided_by_credit_note',
      })
    }
  }
}

function collectFromRecord(
  target: InvoiceLedgerEntry[],
  record: ClinicalRecord,
  patientMap: Map<string, Patient>,
) {
  const patient = patientMap.get(String(record.patientId))
  const normalized = normalizeClinicalRecordPayments(record)

  pushPaymentInvoices(target, normalized.paymentControl ?? [], patient, {
    source: 'control_pagos',
    recordId: record.id,
    isDraft: false,
  })
  pushOrthodonticsInvoices(target, normalized.orthodonticsPaymentControl ?? [], patient, {
    recordId: record.id,
    isDraft: false,
  })
}

function paymentsChanged(
  before: PaymentRecord[] | OrthodonticsPaymentRecord[] | undefined,
  after: PaymentRecord[] | OrthodonticsPaymentRecord[] | undefined,
): boolean {
  return JSON.stringify(before ?? []) !== JSON.stringify(after ?? [])
}

async function backfillClinicalRecordPayments(record: ClinicalRecord): Promise<ClinicalRecord> {
  const normalized = normalizeClinicalRecordPayments(record)
  const changed =
    clinicalPaymentsNeedAutoInvoices(record) ||
    paymentsChanged(record.paymentControl, normalized.paymentControl) ||
    paymentsChanged(record.orthodonticsPaymentControl, normalized.orthodonticsPaymentControl)

  if (!changed) {
    return record
  }

  if (record.id != null) {
    await db.clinicalRecords.update(record.id, {
      paymentControl: normalized.paymentControl,
      orthodonticsPaymentControl: normalized.orthodonticsPaymentControl,
    })
  }

  return normalized
}

async function backfillDraftPayments(draft: {
  patientId: string
  clinicalDraft?: ClinicalRecordFormData
}): Promise<ClinicalRecordFormData | undefined> {
  if (!draft.clinicalDraft) return draft.clinicalDraft

  const normalized = normalizeClinicalRecordPayments(draft.clinicalDraft)
  const changed =
    clinicalPaymentsNeedAutoInvoices(draft.clinicalDraft) ||
    paymentsChanged(draft.clinicalDraft.paymentControl, normalized.paymentControl) ||
    paymentsChanged(
      draft.clinicalDraft.orthodonticsPaymentControl,
      normalized.orthodonticsPaymentControl,
    )

  if (!changed) {
    return draft.clinicalDraft
  }

  await db.patientClinicalDrafts.update(draft.patientId, {
    clinicalDraft: normalized,
  })
  return normalized
}

export async function loadInvoiceLedger(
  options: LoadInvoiceLedgerOptions = {},
): Promise<InvoiceLedgerEntry[]> {
  const { patientId, liveClinicalData, livePatient } = options
  const patients = await db.patients.toArray()
  const patientMap = new Map<string, Patient>()

  for (const patient of patients) {
    patientMap.set(String(patient.id), patient)
  }

  const entries: InvoiceLedgerEntry[] = []
  const patientsWithSavedRecords = new Set<string>()
  const records = await db.clinicalRecords.toArray()

  for (const record of records) {
    if (!matchesPatientFilter(String(record.patientId), patientId)) continue
    patientsWithSavedRecords.add(String(record.patientId))
    const normalizedRecord = await backfillClinicalRecordPayments(record)
    collectFromRecord(entries, normalizedRecord, patientMap)
  }

  const drafts = await db.patientClinicalDrafts.toArray()
  const livePatientKey =
    liveClinicalData && livePatient ? String(livePatient.id) : undefined

  for (const draft of drafts) {
    if (!matchesPatientFilter(draft.patientId, patientId)) continue
    if (livePatientKey && draft.patientId === livePatientKey) continue
    // Si ya hay historia firmada, el borrador no debe duplicar los mismos comprobantes.
    if (patientsWithSavedRecords.has(String(draft.patientId))) continue
    const patient = patientMap.get(draft.patientId)
    const clinicalDraft = (await backfillDraftPayments(draft)) ?? draft.clinicalDraft
    if (!clinicalDraft) continue

    const normalizedDraft = normalizeClinicalRecordPayments(clinicalDraft)

    pushPaymentInvoices(entries, normalizedDraft.paymentControl ?? [], patient, {
      source: 'borrador',
      isDraft: true,
    })
    pushOrthodonticsInvoices(entries, normalizedDraft.orthodonticsPaymentControl ?? [], patient, {
      isDraft: true,
    })
  }

  if (liveClinicalData && livePatient && matchesPatientFilter(String(livePatient.id), patientId)) {
    const normalizedLive = normalizeClinicalRecordPayments(liveClinicalData)
    pushPaymentInvoices(entries, normalizedLive.paymentControl ?? [], livePatient, {
      source: 'borrador',
      isDraft: true,
    })
    pushOrthodonticsInvoices(
      entries,
      normalizedLive.orthodonticsPaymentControl ?? [],
      livePatient,
      { isDraft: true },
    )
  }

  return dedupeInvoiceLedgerEntries(entries)
}

export function getDateRangeForPreset(
  preset: InvoiceReportPreset,
  customStart?: string,
  customEnd?: string,
): InvoiceDateRange | null {
  const now = new Date()

  if (preset === 'all') {
    return null
  }

  if (preset === 'daily') {
    return {
      start: startOfDay(now),
      end: endOfDay(now),
      label: 'Hoy',
    }
  }

  if (preset === 'weekly') {
    const start = new Date(now)
    const weekday = start.getDay()
    const daysFromMonday = weekday === 0 ? 6 : weekday - 1
    start.setDate(start.getDate() - daysFromMonday)
    return {
      start: startOfDay(start),
      end: endOfDay(now),
      label: 'Esta semana',
    }
  }

  if (preset === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return {
      start: startOfDay(start),
      end: endOfDay(now),
      label: 'Este mes',
    }
  }

  if (!customStart || !customEnd) {
    return null
  }

  const start = startOfDay(new Date(customStart))
  const end = endOfDay(new Date(customEnd))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return null
  }

  return {
    start,
    end,
    label: `${customStart} — ${customEnd}`,
  }
}

export function filterLedgerByDateRange(
  entries: InvoiceLedgerEntry[],
  range: InvoiceDateRange | null,
): InvoiceLedgerEntry[] {
  if (!range) return entries

  return entries.filter((entry) => {
    const invoiceDate = new Date(entry.invoiceDate)
    if (Number.isNaN(invoiceDate.getTime())) return false
    return invoiceDate >= range.start && invoiceDate <= range.end
  })
}

export const INVOICE_SOURCE_LABELS: Record<InvoiceLedgerSource, string> = {
  control_pagos: 'Control de pagos',
  ortodoncia: 'Ortodoncia',
  borrador: 'Borrador',
}
