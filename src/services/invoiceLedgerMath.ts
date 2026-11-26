import type { InvoiceLedgerEntry, InvoiceLedgerSummary } from '../types/invoiceLedger.ts'

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

/** Evita contar el mismo comprobante dos veces (historia firmada + borrador). */
export function dedupeInvoiceLedgerEntries(entries: InvoiceLedgerEntry[]): InvoiceLedgerEntry[] {
  const byInvoiceId = new Map<string, InvoiceLedgerEntry>()
  const byFingerprint = new Map<string, InvoiceLedgerEntry>()

  const prefer = (current: InvoiceLedgerEntry | undefined, next: InvoiceLedgerEntry) => {
    if (!current) return next
    if (current.isDraft && !next.isDraft) return next
    if (!current.isDraft && next.isDraft) return current
    return current
  }

  for (const entry of entries) {
    const invoiceId = entry.invoice.id?.trim()
    if (invoiceId) {
      byInvoiceId.set(invoiceId, prefer(byInvoiceId.get(invoiceId), entry))
      continue
    }

    const fingerprint = [
      entry.patientId,
      entry.invoiceNumber.trim().toUpperCase(),
      entry.invoiceDate,
      String(Math.round(entry.amount || 0)),
      entry.documentKind ?? '',
    ].join('|')
    byFingerprint.set(fingerprint, prefer(byFingerprint.get(fingerprint), entry))
  }

  const merged = [...byInvoiceId.values(), ...byFingerprint.values()]
  return sortLedgerEntries(merged)
}

export function summarizeInvoiceLedger(entries: InvoiceLedgerEntry[]): InvoiceLedgerSummary {
  let fevCount = 0
  let fevTotal = 0
  let receiptCount = 0
  let receiptTotal = 0
  let voidedCount = 0
  let voidedTotal = 0
  let activeTotal = 0
  let totalAmount = 0

  for (const entry of entries) {
    const amount = entry.amount || 0
    totalAmount += amount

    if (entry.isVoided) {
      voidedCount += 1
      voidedTotal += amount
      continue
    }

    activeTotal += amount
    if (entry.documentKind === 'factura') {
      fevCount += 1
      fevTotal += amount
    } else if (entry.documentKind === 'recibo_interno') {
      receiptCount += 1
      receiptTotal += amount
    }
  }

  return {
    invoiceCount: entries.length,
    totalAmount,
    fevCount,
    fevTotal,
    receiptCount,
    receiptTotal,
    voidedCount,
    voidedTotal,
    activeTotal,
  }
}
