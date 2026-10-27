import type {
  PaymentControlLine,
  PaymentDocumentKind,
  PaymentPlanItem,
  PaymentRecord,
} from '../types/clinicalRecord.ts'
import { amountAppliedToLine } from './paymentAbonos.ts'
import { formatCurrency, generateId } from './crypto.ts'

type BillableLine = Pick<PaymentControlLine, 'unitPrice' | 'quantity' | 'cupsCode'>

function defaultBillable(line: BillableLine): number {
  const quantity = line.quantity && line.quantity > 0 ? line.quantity : 1
  return Math.max(0, Math.round((line.unitPrice || 0) * quantity))
}

function manualPlanItem(line: PaymentControlLine): PaymentPlanItem {
  return {
    id: generateId(),
    source: 'custom',
    paymentControlLineId: line.id,
    procedure: line.procedure,
    cupsCode: line.cupsCode,
    totalAmount: Math.max(0, Math.round(line.unitPrice || 0)),
    paymentMethod: 'contado',
    scheduleNotes: '',
  }
}

/** Procedimiento armado en la caja de un mismo número de FEV o recibo. */
export interface SharedDocumentEntry {
  id: string
  origin: 'section' | 'manual'
  /** Fila de la sección 9 cuando el procedimiento se importó de ahí. */
  sourceLineId?: string
  procedure: string
  cupsCode?: string
  amount: number
}

export interface SectionProcedureOption {
  lineId: string
  procedure: string
  cupsCode?: string
  remaining: number
}

export interface PreparedSharedDocumentLine {
  line: PaymentControlLine
  amount: number
  /** True si la fila nace en esta caja y todavía no está en la sección. */
  created: boolean
}

export interface PreparedSharedDocument {
  documentKind: PaymentDocumentKind
  total: number
  rows: PreparedSharedDocumentLine[]
  newLines: PaymentControlLine[]
  newPlanItems: PaymentPlanItem[]
}

export type SharedDocumentPreparation =
  | { ok: true; document: PreparedSharedDocument }
  | { ok: false; message: string }

export function emptyManualSharedEntry(): SharedDocumentEntry {
  return {
    id: generateId(),
    origin: 'manual',
    procedure: '',
    amount: 0,
  }
}

export function sharedEntryFromSection(option: SectionProcedureOption): SharedDocumentEntry {
  return {
    id: generateId(),
    origin: 'section',
    sourceLineId: option.lineId,
    procedure: option.procedure,
    cupsCode: option.cupsCode,
    amount: option.remaining,
  }
}

export function remainingOfPaymentLine(
  line: PaymentControlLine,
  payments: PaymentRecord[],
  billable: (line: BillableLine) => number = defaultBillable,
): number {
  const paid = payments.reduce((sum, payment) => sum + amountAppliedToLine(payment, line.id), 0)
  return Math.max(0, Math.round(billable(line) - paid))
}

/** Procedimientos de la sección 9 que todavía tienen saldo y no están en la caja. */
export function importableSectionProcedures(
  lines: PaymentControlLine[],
  payments: PaymentRecord[],
  importedLineIds: string[],
  billable: (line: BillableLine) => number = defaultBillable,
): SectionProcedureOption[] {
  const taken = new Set(importedLineIds)
  const options: SectionProcedureOption[] = []

  for (const line of lines) {
    const procedure = line.procedure.trim()
    if (!procedure || taken.has(line.id)) continue
    const remaining = remainingOfPaymentLine(line, payments, billable)
    if (remaining <= 0) continue
    options.push({
      lineId: line.id,
      procedure,
      cupsCode: line.cupsCode,
      remaining,
    })
  }

  return options
}

function cupsOf(
  raw: string | undefined,
  procedure: string,
): { ok: true; cupsCode?: string } | { ok: false; message: string } {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return { ok: true }
  if (!/^\d{6}$/.test(digits)) {
    return {
      ok: false,
      message: `El código CUPS de «${procedure}» debe tener 6 dígitos.`,
    }
  }
  return { ok: true, cupsCode: digits }
}

/**
 * Deja listo un solo comprobante: los procedimientos importados conservan su fila
 * y los manuales se crean en la sección con el valor cobrado.
 */
export function prepareSharedDocument(input: {
  entries: SharedDocumentEntry[]
  documentKind: PaymentDocumentKind
  lines: PaymentControlLine[]
  payments: PaymentRecord[]
  billable?: (line: BillableLine) => number
}): SharedDocumentPreparation {
  const billable = input.billable ?? defaultBillable
  const entries = input.entries
  if (entries.length < 2) {
    return {
      ok: false,
      message: 'Agregue al menos dos procedimientos para compartir el mismo número.',
    }
  }

  const seen = new Set<string>()
  const rows: PreparedSharedDocumentLine[] = []
  const newLines: PaymentControlLine[] = []
  const newPlanItems: PaymentPlanItem[] = []

  for (const entry of entries) {
    const amount = Math.round(entry.amount)
    if (entry.origin === 'section') {
      const sourceId = entry.sourceLineId ?? ''
      const line = input.lines.find((item) => item.id === sourceId)
      const procedure = line?.procedure.trim() || entry.procedure.trim() || 'Procedimiento'
      if (!line) {
        return {
          ok: false,
          message: `«${procedure}» ya no está en esta sección. Quítelo de la caja o vuelva a importarlo.`,
        }
      }
      if (seen.has(line.id)) {
        return { ok: false, message: `«${procedure}» está repetido en el comprobante.` }
      }
      seen.add(line.id)
      const remaining = remainingOfPaymentLine(line, input.payments, billable)
      if (amount <= 0) {
        return { ok: false, message: `Indique un valor mayor que cero para «${procedure}».` }
      }
      if (amount > remaining) {
        return {
          ok: false,
          message: `El valor de «${procedure}» supera el saldo de la sección (${formatCurrency(remaining)}).`,
        }
      }
      const cups = cupsOf(line.cupsCode, procedure)
      if (!cups.ok) return cups
      rows.push({
        line: cups.cupsCode ? { ...line, cupsCode: cups.cupsCode } : line,
        amount,
        created: false,
      })
      continue
    }

    const procedure = entry.procedure.trim()
    if (!procedure) {
      return { ok: false, message: 'Escriba el nombre de cada procedimiento agregado manualmente.' }
    }
    if (amount <= 0) {
      return { ok: false, message: `Indique un valor mayor que cero para «${procedure}».` }
    }
    const cups = cupsOf(entry.cupsCode, procedure)
    if (!cups.ok) return cups
    const line: PaymentControlLine = {
      id: generateId(),
      procedure,
      cupsCode: cups.cupsCode,
      quantity: 1,
      unitPrice: amount,
      source: 'manual',
    }
    newLines.push(line)
    newPlanItems.push(manualPlanItem(line))
    rows.push({ line, amount, created: true })
  }

  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  return {
    ok: true,
    document: {
      documentKind: input.documentKind,
      total,
      rows,
      newLines,
      newPlanItems,
    },
  }
}
