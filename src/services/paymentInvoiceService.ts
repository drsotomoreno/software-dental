import type {
  OrthodonticsPaymentRecord,
  PaymentDocumentKind,
  PaymentInvoice,
  PaymentRecord,
} from '../types/clinicalRecord.ts'
import { generateId } from '../utils/crypto.ts'
import { resolvePaymentDocumentKind } from '../utils/paymentAbonos.ts'

const INVOICE_SEQ_KEY = 'dental_emr_payment_invoice_seq'
const INVOICE_PREFIX_KEY = 'dental_emr_payment_invoice_prefix'
export const DEFAULT_INVOICE_PREFIX = 'FV'
export const DEFAULT_RECEIPT_PREFIX = 'RC'

function sequenceStorageKey(userId: string | undefined, kind: 'fev' | 'recibo'): string {
  const base = userId ? `${INVOICE_SEQ_KEY}_${userId}` : INVOICE_SEQ_KEY
  // La FEV conserva la secuencia que ya estaba en uso. El recibo no la comparte.
  return kind === 'fev' ? base : `${base}_recibo`
}

export function getPaymentInvoicePrefix(): string {
  if (typeof window === 'undefined') return DEFAULT_INVOICE_PREFIX
  return localStorage.getItem(INVOICE_PREFIX_KEY)?.trim() || DEFAULT_INVOICE_PREFIX
}

export function setPaymentInvoicePrefix(prefix: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(INVOICE_PREFIX_KEY, prefix.trim().toUpperCase() || DEFAULT_INVOICE_PREFIX)
}

export function prefixForPaymentDocumentKind(documentKind: PaymentDocumentKind): string {
  return documentKind === 'factura' ? getPaymentInvoicePrefix() : DEFAULT_RECEIPT_PREFIX
}

export function formatPaymentDocumentNumber(prefix: string, sequence: number): string {
  return `${prefix}${String(Math.max(1, sequence)).padStart(8, '0')}`
}

export function parsePaymentDocumentSequence(invoiceNumber: string | undefined | null): number {
  const digits = String(invoiceNumber ?? '').replace(/\D/g, '')
  if (!digits) return 0
  const parsed = Number.parseInt(digits, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

export function paymentDocumentNumberPrefix(invoiceNumber: string | undefined | null): string {
  const match = /^([A-Za-z]+)/.exec(String(invoiceNumber ?? '').trim())
  return (match?.[1] ?? '').toUpperCase()
}

function bumpSequenceFloor(
  userId: string | undefined,
  kind: PaymentDocumentKind,
  floor: number,
): void {
  if (typeof window === 'undefined' || floor <= 0) return
  const key = sequenceStorageKey(userId, kind === 'factura' ? 'fev' : 'recibo')
  const current = Number.parseInt(localStorage.getItem(key) || '0', 10)
  const safeCurrent = Number.isFinite(current) ? current : 0
  if (floor > safeCurrent) {
    localStorage.setItem(key, String(floor))
  }
}

/**
 * Recibo de caja interno y factura electrónica no comparten consecutivo.
 * El flujo sin factura usa RC; FV queda solo para la FEV.
 * `usedNumbers` evita colisiones con documentos ya persistidos (p. ej. otra clave de secuencia).
 */
export function reserveNextPaymentDocumentNumber(
  userId?: string,
  documentKind: PaymentDocumentKind = 'recibo_interno',
  usedNumbers?: Iterable<string>,
): string {
  const factura = documentKind === 'factura'
  const prefix = factura ? getPaymentInvoicePrefix() : DEFAULT_RECEIPT_PREFIX
  const key = sequenceStorageKey(userId, factura ? 'fev' : 'recibo')

  let floor = 0
  if (typeof window !== 'undefined') {
    const stored = Number.parseInt(localStorage.getItem(key) || '0', 10)
    floor = Number.isFinite(stored) ? stored : 0
  }

  if (usedNumbers) {
    for (const number of usedNumbers) {
      if (paymentDocumentNumberPrefix(number) !== prefix) continue
      floor = Math.max(floor, parsePaymentDocumentSequence(number))
    }
  }

  let next = floor + 1
  const occupied = new Set(
    usedNumbers
      ? [...usedNumbers].map((value) => value.trim().toUpperCase()).filter(Boolean)
      : [],
  )

  if (typeof window === 'undefined') {
    let candidate = formatPaymentDocumentNumber(prefix, next)
    while (occupied.has(candidate.toUpperCase())) {
      next += 1
      candidate = formatPaymentDocumentNumber(prefix, next)
    }
    return candidate
  }

  let candidate = formatPaymentDocumentNumber(prefix, next)
  while (occupied.has(candidate.toUpperCase())) {
    next += 1
    candidate = formatPaymentDocumentNumber(prefix, next)
  }
  localStorage.setItem(key, String(next))
  return candidate
}

/** Reserva el siguiente consecutivo de factura electrónica para Control de Pagos. */
export function reserveNextPaymentInvoiceNumber(userId?: string): string {
  return reserveNextPaymentDocumentNumber(userId, 'factura')
}

export interface CreateAutoPaymentInvoiceInput {
  paymentDate: string
  amount: number
  paymentReason?: string
  userId?: string
  documentKind?: PaymentDocumentKind
  usedNumbers?: Iterable<string>
}

export function createAutoPaymentInvoice(input: CreateAutoPaymentInvoiceInput): PaymentInvoice {
  const kind: PaymentDocumentKind = input.documentKind === 'factura' ? 'factura' : 'recibo_interno'
  const reason = input.paymentReason?.trim()
  return {
    id: generateId(),
    invoiceNumber: reserveNextPaymentDocumentNumber(input.userId, kind, input.usedNumbers),
    invoiceDate: input.paymentDate,
    amount: Math.max(0, input.amount || 0),
    documentKind: kind,
    notes:
      reason ||
      (kind === 'factura'
        ? 'Generada automáticamente — Control de Pagos'
        : 'Recibo de caja interno — sin factura electrónica'),
    autoGenerated: true,
  }
}

type PaymentWithInvoices = {
  paymentDate: string
  amount: number
  paymentReason: string
  documentKind?: PaymentDocumentKind
  invoices: PaymentInvoice[]
}

function collectInvoiceNumbers(payments: PaymentWithInvoices[]): Set<string> {
  const numbers = new Set<string>()
  for (const payment of payments) {
    for (const invoice of payment.invoices ?? []) {
      const number = invoice.invoiceNumber?.trim()
      if (number) numbers.add(number)
    }
  }
  return numbers
}

export function attachAutoInvoiceToPayment<T extends PaymentWithInvoices>(
  payment: T,
  userId?: string,
  usedNumbers?: Iterable<string>,
): T {
  if (payment.invoices.some((invoice) => invoice.autoGenerated)) {
    return syncAutoGeneratedInvoice(payment)
  }

  return {
    ...payment,
    invoices: [
      ...payment.invoices,
      createAutoPaymentInvoice({
        paymentDate: payment.paymentDate,
        amount: payment.amount,
        paymentReason: payment.paymentReason,
        userId,
        documentKind: payment.documentKind,
        usedNumbers,
      }),
    ],
  }
}

export function syncAutoGeneratedInvoice<T extends PaymentWithInvoices>(payment: T): T {
  const autoInvoice = payment.invoices.find((invoice) => invoice.autoGenerated)
  if (!autoInvoice) return payment

  return {
    ...payment,
    invoices: payment.invoices.map((invoice) =>
      invoice.autoGenerated
        ? {
            ...invoice,
            amount: Math.max(0, payment.amount || 0),
            invoiceDate: payment.paymentDate,
          }
        : invoice,
    ),
  }
}

/**
 * Determina si un comprobante ya numerado tiene el prefijo correcto para su tipo.
 * Los recibos internos legados con FV deben migrar a RC.
 */
export function paymentDocumentNeedsRenumber(
  invoiceNumber: string | undefined | null,
  documentKind: PaymentDocumentKind | null | undefined,
): boolean {
  if (!documentKind) return false
  const number = String(invoiceNumber ?? '').trim()
  if (!number) return true
  const prefix = paymentDocumentNumberPrefix(number)
  const expected = prefixForPaymentDocumentKind(documentKind)
  return prefix !== expected
}

type CanonicalizeContext = {
  userId?: string
  usedNumbers: Set<string>
  claimedByKind: Record<PaymentDocumentKind, Set<string>>
}

function resolveKindForCanonical(
  payment: PaymentWithInvoices,
  invoice: PaymentInvoice,
): PaymentDocumentKind {
  const fromPayment = resolvePaymentDocumentKind({
    documentKind: payment.documentKind,
    invoices: [invoice],
  })
  if (fromPayment) return fromPayment
  if (invoice.documentKind === 'factura' || invoice.documentKind === 'recibo_interno') {
    return invoice.documentKind
  }
  const prefix = paymentDocumentNumberPrefix(invoice.invoiceNumber)
  if (prefix === DEFAULT_RECEIPT_PREFIX) return 'recibo_interno'
  // Legado: comprobante automático sin FEV/CUFE se trata como recibo interno.
  if (
    invoice.autoGenerated &&
    !invoice.cufe &&
    invoice.emissionMode !== 'provider' &&
    !/factura electrónica/i.test(invoice.notes ?? '')
  ) {
    return 'recibo_interno'
  }
  return 'factura'
}

function claimUniqueNumber(
  preferred: string | undefined,
  kind: PaymentDocumentKind,
  ctx: CanonicalizeContext,
): string {
  const expectedPrefix = prefixForPaymentDocumentKind(kind)
  const claimed = ctx.claimedByKind[kind]
  const preferredTrimmed = preferred?.trim() ?? ''
  const preferredUpper = preferredTrimmed.toUpperCase()
  const prefixOk =
    preferredTrimmed.length > 0 &&
    paymentDocumentNumberPrefix(preferredTrimmed) === expectedPrefix

  if (prefixOk && preferredUpper && !claimed.has(preferredUpper)) {
    claimed.add(preferredUpper)
    ctx.usedNumbers.add(preferredTrimmed)
    bumpSequenceFloor(ctx.userId, kind, parsePaymentDocumentSequence(preferredTrimmed))
    return preferredTrimmed
  }

  const next = reserveNextPaymentDocumentNumber(ctx.userId, kind, ctx.usedNumbers)
  claimed.add(next.toUpperCase())
  ctx.usedNumbers.add(next)
  return next
}

function canonicalizePaymentDocuments<T extends PaymentWithInvoices>(
  payments: T[],
  ctx: CanonicalizeContext,
): T[] {
  return payments.map((payment) => {
    if (!payment.invoices?.length) {
      return attachAutoInvoiceToPayment(payment, ctx.userId, ctx.usedNumbers)
    }

    let paymentKind = payment.documentKind
    const invoices = payment.invoices.map((invoice) => {
      if (invoice.sharedCopy) {
        const kind = resolveKindForCanonical(payment, invoice)
        paymentKind = paymentKind ?? kind
        return {
          ...invoice,
          documentKind: invoice.documentKind ?? kind,
        }
      }

      const kind = resolveKindForCanonical(payment, invoice)
      paymentKind = paymentKind ?? kind
      const nextNumber = claimUniqueNumber(invoice.invoiceNumber, kind, ctx)
      if (
        nextNumber === invoice.invoiceNumber?.trim() &&
        invoice.documentKind === kind
      ) {
        return invoice
      }
      return {
        ...invoice,
        invoiceNumber: nextNumber,
        documentKind: kind,
      }
    })

    const resolvedKind =
      paymentKind ??
      resolvePaymentDocumentKind({ documentKind: payment.documentKind, invoices }) ??
      undefined

    return {
      ...payment,
      documentKind: resolvedKind,
      invoices,
    }
  })
}

function createCanonicalizeContext(
  userId: string | undefined,
  seedNumbers?: Iterable<string>,
): CanonicalizeContext {
  return {
    userId,
    usedNumbers: new Set(
      [...(seedNumbers ?? [])].map((value) => value.trim()).filter(Boolean),
    ),
    claimedByKind: {
      factura: new Set(),
      recibo_interno: new Set(),
    },
  }
}

export function ensurePaymentsHaveAutoInvoices(
  payments: PaymentRecord[],
  userId?: string,
  usedNumbers?: Iterable<string>,
): PaymentRecord[] {
  const ctx = createCanonicalizeContext(userId, [
    ...(usedNumbers ?? []),
    ...collectInvoiceNumbers(payments),
  ])
  return canonicalizePaymentDocuments(payments, ctx)
}

export function ensureOrthodonticsPaymentsHaveAutoInvoices(
  payments: OrthodonticsPaymentRecord[],
  userId?: string,
  usedNumbers?: Iterable<string>,
): OrthodonticsPaymentRecord[] {
  const ctx = createCanonicalizeContext(userId, [
    ...(usedNumbers ?? []),
    ...collectInvoiceNumbers(payments),
  ])
  return canonicalizePaymentDocuments(payments, ctx)
}

export function paymentNeedsAutoInvoice(payment: {
  amount: number
  invoices: PaymentInvoice[]
  documentKind?: PaymentDocumentKind
}): boolean {
  if (!payment.amount || payment.amount <= 0) return false
  if (!payment.invoices?.length) return true
  if (!payment.invoices.some((invoice) => invoice.autoGenerated)) return true

  for (const invoice of payment.invoices) {
    if (invoice.sharedCopy) continue
    const kind =
      resolvePaymentDocumentKind({ documentKind: payment.documentKind, invoices: [invoice] }) ??
      invoice.documentKind
    if (paymentDocumentNeedsRenumber(invoice.invoiceNumber, kind)) return true
    if (!invoice.documentKind && kind) return true
  }
  return false
}

export function clinicalPaymentsNeedAutoInvoices(data: {
  paymentControl?: PaymentRecord[]
  orthodonticsPaymentControl?: OrthodonticsPaymentRecord[]
}): boolean {
  const general = data.paymentControl ?? []
  const ortho = data.orthodonticsPaymentControl ?? []
  return general.some(paymentNeedsAutoInvoice) || ortho.some(paymentNeedsAutoInvoice)
}

export function normalizeClinicalRecordPayments<
  T extends {
    paymentControl?: PaymentRecord[]
    orthodonticsPaymentControl?: OrthodonticsPaymentRecord[]
  },
>(data: T, userId?: string): T {
  const ctx = createCanonicalizeContext(userId, [
    ...collectInvoiceNumbers(data.paymentControl ?? []),
    ...collectInvoiceNumbers(data.orthodonticsPaymentControl ?? []),
  ])

  return {
    ...data,
    paymentControl: canonicalizePaymentDocuments(data.paymentControl ?? [], ctx),
    orthodonticsPaymentControl: canonicalizePaymentDocuments(
      data.orthodonticsPaymentControl ?? [],
      ctx,
    ),
  }
}
