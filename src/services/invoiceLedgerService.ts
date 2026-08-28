import { db } from '@/db/database'
import type {
  ClinicalRecord,
  OrthodonticsPaymentRecord,
  PaymentRecord,
} from '@/types/clinicalRecord'
import type { Patient } from '@/types/patient'
import type {
  InvoiceDateRange,
  InvoiceLedgerEntry,
  InvoiceLedgerSource,
  InvoiceLedgerSummary,
  InvoiceReportPreset,
} from '@/types/invoiceLedger'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import {
  clinicalPaymentsNeedAutoInvoices,
  normalizeClinicalRecordPayments,
} from '@/services/paymentInvoiceService'

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

async function backfillClinicalRecordPayments(record: ClinicalRecord): Promise<ClinicalRecord> {
  if (!clinicalPaymentsNeedAutoInvoices(record)) {
    return record
  }

  const normalized = normalizeClinicalRecordPayments(record)
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
  if (!draft.clinicalDraft || !clinicalPaymentsNeedAutoInvoices(draft.clinicalDraft)) {
    return draft.clinicalDraft
  }

  const normalized = normalizeClinicalRecordPayments(draft.clinicalDraft)
  await db.patientClinicalDrafts.update(draft.patientId, {
    clinicalDraft: normalized,
  })
  return normalized
}

function sortLedgerEntries(entries: InvoiceLedgerEntry[]): InvoiceLedgerEntry[] {
  return [...entries].sort((left, right) => {
    const dateCompare = left.invoiceDate.localeCompare(right.invoiceDate)
    if (dateCompare !== 0) return dateCompare

    const leftNumber = Number.parseInt(left.invoiceNumber.replace(/\D/g, ''), 10) || 0
    const rightNumber = Number.parseInt(right.invoiceNumber.replace(/\D/g, ''), 10) || 0
    if (leftNumber !== rightNumber) return leftNumber - rightNumber

    return left.invoiceNumber.localeCompare(right.invoiceNumber, 'es-CO')
  })
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
  const records = await db.clinicalRecords.toArray()

  for (const record of records) {
    if (!matchesPatientFilter(String(record.patientId), patientId)) continue
    const normalizedRecord = await backfillClinicalRecordPayments(record)
    collectFromRecord(entries, normalizedRecord, patientMap)
  }

  const drafts = await db.patientClinicalDrafts.toArray()
  const livePatientKey =
    liveClinicalData && livePatient ? String(livePatient.id) : undefined

  for (const draft of drafts) {
    if (!matchesPatientFilter(draft.patientId, patientId)) continue
    if (livePatientKey && draft.patientId === livePatientKey) continue
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

  return sortLedgerEntries(entries)
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

export function summarizeInvoiceLedger(entries: InvoiceLedgerEntry[]): InvoiceLedgerSummary {
  return {
    invoiceCount: entries.length,
    totalAmount: entries.reduce((sum, entry) => sum + (entry.amount || 0), 0),
  }
}

export const INVOICE_SOURCE_LABELS: Record<InvoiceLedgerSource, string> = {
  control_pagos: 'Control de pagos',
  ortodoncia: 'Ortodoncia',
  borrador: 'Borrador',
}
