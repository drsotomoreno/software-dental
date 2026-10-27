import { ORTHODONTICS_MECHANICAL_CONTROL_CUPS } from '../constants/rips.ts'
import type {
  OrthodonticsBudget,
  OrthodonticsBudgetLine,
  OrthodonticsPaymentRecord,
  OrthodonticsPaymentType,
  PaymentControlLine,
  PaymentDocumentKind,
  PaymentPlanItem,
  PaymentRecord,
} from '../types/clinicalRecord.ts'
import { amountAppliedToLine } from './paymentAbonos.ts'
import { formatCurrency, generateId } from './crypto.ts'
import {
  buildOrthodonticsPaymentReason,
  calcOrthodonticsPaymentsTotal,
  conceptRemaining,
  suggestControlNumber,
  type OrthodonticsPaymentConcept,
} from './orthodonticsPaymentConcepts.ts'

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

/** Cobro de ortodoncia que puede compartir el número con otros procedimientos. */
export type OrthodonticsSharedKind = 'pago_unico' | 'cuota_inicial' | 'control' | 'retenedores'

export const ORTHODONTICS_SHARED_LABELS: Record<OrthodonticsSharedKind, string> = {
  pago_unico: 'Pagar el tratamiento de contado',
  cuota_inicial: 'Pagar la cuota inicial',
  control: 'Pagar un control',
  retenedores: 'Pagar retenedores',
}

const ORTHODONTICS_SHARED_ORDER: OrthodonticsSharedKind[] = [
  'pago_unico',
  'cuota_inicial',
  'control',
  'retenedores',
]

const CONCEPT_OF_KIND: Record<
  Exclude<OrthodonticsSharedKind, 'pago_unico'>,
  OrthodonticsPaymentConcept
> = {
  cuota_inicial: 'cuota_inicial',
  control: 'controles',
  retenedores: 'retenedores',
}

/** Procedimiento armado en la caja de un mismo número de FEV o recibo. */
export interface SharedDocumentEntry {
  id: string
  origin: 'section' | 'manual' | 'orthodontics'
  /** Fila de la sección 9 cuando el procedimiento se importó de ahí. */
  sourceLineId?: string
  orthodonticsKind?: OrthodonticsSharedKind
  controlNumber?: number
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

/** Abono de ortodoncia que sale en el mismo número, sin fila clínica nueva. */
export interface PreparedOrthodonticsCharge {
  kind: OrthodonticsSharedKind
  paymentType: OrthodonticsPaymentType
  procedure: string
  paymentReason: string
  cupsCode?: string
  amount: number
  controlNumber?: number
}

export interface PreparedSharedDocumentLine {
  line: PaymentControlLine
  amount: number
  /** True si la fila nace en esta caja y todavía no está en la sección. */
  created: boolean
  /** Presente cuando la línea es un cobro de ortodoncia, no un procedimiento clínico. */
  orthodontics?: PreparedOrthodonticsCharge
}

export interface PreparedSharedDocument {
  documentKind: PaymentDocumentKind
  total: number
  rows: PreparedSharedDocumentLine[]
  newLines: PaymentControlLine[]
  newPlanItems: PaymentPlanItem[]
  orthodonticsCharges: PreparedOrthodonticsCharge[]
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

export interface OrthodonticsSharedOption {
  kind: OrthodonticsSharedKind
  label: string
  cupsCode?: string
  /** Valor con el que entra a la caja. */
  remaining: number
  /** Tope del concepto. Null cuando el presupuesto de ortodoncia no está activo. */
  cap: number | null
  available: boolean
  unavailableReason?: string
  controlNumber?: number
}

function orthoLineSubtotal(line: OrthodonticsBudgetLine | undefined): number {
  if (!line) return 0
  return Math.max(0, line.quantity) * Math.max(0, line.unitPrice)
}

function budgetIsActive(budget?: OrthodonticsBudget | null): budget is OrthodonticsBudget {
  return Boolean(budget?.active)
}

export function orthodonticsTreatmentBalance(
  budget: OrthodonticsBudget | null | undefined,
  payments: OrthodonticsPaymentRecord[] = [],
): number | null {
  if (!budgetIsActive(budget)) return null
  const total =
    orthoLineSubtotal(budget.initialInstallment) +
    orthoLineSubtotal(budget.controls) +
    orthoLineSubtotal(budget.retainers)
  return Math.max(0, Math.round(total - calcOrthodonticsPaymentsTotal(payments)))
}

function conceptBudgetTotal(
  budget: OrthodonticsBudget,
  kind: Exclude<OrthodonticsSharedKind, 'pago_unico'>,
): number {
  if (kind === 'cuota_inicial') return orthoLineSubtotal(budget.initialInstallment)
  if (kind === 'retenedores') return orthoLineSubtotal(budget.retainers)
  return orthoLineSubtotal(budget.controls)
}

export function paymentTypeForSharedKind(kind: OrthodonticsSharedKind): OrthodonticsPaymentType {
  if (kind === 'control') return 'control'
  if (kind === 'pago_unico') return 'pago_unico'
  return kind
}

export function sharedOrthodonticsProcedure(
  kind: OrthodonticsSharedKind,
  controlNumber?: number,
): string {
  if (kind === 'control' && controlNumber) {
    return `${ORTHODONTICS_SHARED_LABELS.control} #${controlNumber}`
  }
  return ORTHODONTICS_SHARED_LABELS[kind]
}

/** Tope de un ítem antes de restar otros cobros de ortodoncia ya puestos en la caja. */
export function orthodonticsKindCap(
  kind: OrthodonticsSharedKind,
  budget: OrthodonticsBudget | null | undefined,
  payments: OrthodonticsPaymentRecord[] = [],
): number | null {
  const global = orthodonticsTreatmentBalance(budget, payments)
  if (global == null || !budgetIsActive(budget)) return null
  if (kind === 'pago_unico') return global
  const remaining = conceptRemaining(conceptBudgetTotal(budget, kind), payments, CONCEPT_OF_KIND[kind])
  if (kind === 'control') {
    const one = Math.max(0, Math.round(budget.controls.unitPrice || 0))
    const visit = one > 0 ? Math.min(one, remaining) : remaining
    return Math.min(visit, global)
  }
  return Math.min(remaining, global)
}

const CONTADO_BLOCKED =
  'Quite la cuota, el control o los retenedores para pagar el tratamiento de contado.'
const CONCEPT_BLOCKED = 'El pago de contado ya cubre el tratamiento.'

/** Los cuatro cobros de ortodoncia, con saldo cuando el presupuesto está activo. */
export function orthodonticsSelectionOptions(input: {
  budget?: OrthodonticsBudget | null
  payments?: OrthodonticsPaymentRecord[]
  takenKinds?: OrthodonticsSharedKind[]
  reservedAmount?: number
}): OrthodonticsSharedOption[] {
  const payments = input.payments ?? []
  const taken = new Set(input.takenKinds ?? [])
  const budget = input.budget
  const reserved = Math.max(0, Math.round(input.reservedAmount ?? 0))
  const global = orthodonticsTreatmentBalance(budget, payments)
  const room = global == null ? null : Math.max(0, global - reserved)
  const blocksConcepts = taken.has('pago_unico')
  const blocksContado = taken.has('cuota_inicial') || taken.has('control') || taken.has('retenedores')

  return ORTHODONTICS_SHARED_ORDER.filter((kind) => !taken.has(kind)).map((kind) => {
    const cupsCode = kind === 'control' ? ORTHODONTICS_MECHANICAL_CONTROL_CUPS : undefined
    const controlNumber =
      kind === 'control' ? (budgetIsActive(budget) ? suggestControlNumber(budget, payments) : 1) : undefined
    const cap = orthodonticsKindCap(kind, budget, payments)
    const exclusiveBlock = kind === 'pago_unico' ? blocksContado : blocksConcepts
    const exclusiveReason = kind === 'pago_unico' ? CONTADO_BLOCKED : CONCEPT_BLOCKED

    if (cap == null) {
      return {
        kind,
        label: ORTHODONTICS_SHARED_LABELS[kind],
        cupsCode,
        remaining: 0,
        cap: null,
        available: !exclusiveBlock,
        unavailableReason: exclusiveBlock ? exclusiveReason : undefined,
        controlNumber,
      }
    }

    const suggested = kind === 'pago_unico' ? cap : Math.min(cap, room ?? cap)
    const available = suggested > 0 && !exclusiveBlock
    return {
      kind,
      label: ORTHODONTICS_SHARED_LABELS[kind],
      cupsCode,
      remaining: Math.max(0, suggested),
      cap,
      available,
      unavailableReason: exclusiveBlock ? exclusiveReason : available ? undefined : 'Sin saldo',
      controlNumber,
    }
  })
}

export function sharedEntryFromOrthodontics(option: OrthodonticsSharedOption): SharedDocumentEntry {
  return {
    id: generateId(),
    origin: 'orthodontics',
    orthodonticsKind: option.kind,
    controlNumber: option.controlNumber,
    procedure: sharedOrthodonticsProcedure(option.kind, option.controlNumber),
    cupsCode: option.cupsCode,
    amount: option.remaining,
  }
}

/** Máximo que puede llevar este ítem dentro de la caja, descontando los otros cobros de ortodoncia. */
export function orthodonticsEntryMax(
  entry: SharedDocumentEntry,
  entries: SharedDocumentEntry[],
  budget: OrthodonticsBudget | null | undefined,
  payments: OrthodonticsPaymentRecord[] = [],
): number | null {
  if (entry.origin !== 'orthodontics' || !entry.orthodonticsKind) return null
  const cap = orthodonticsKindCap(entry.orthodonticsKind, budget, payments)
  if (cap == null) return null
  if (entry.orthodonticsKind === 'pago_unico') return cap
  const siblings = entries
    .filter((item) => item.origin === 'orthodontics' && item.id !== entry.id)
    .reduce((sum, item) => sum + Math.max(0, Math.round(item.amount || 0)), 0)
  const global = orthodonticsTreatmentBalance(budget, payments) ?? cap
  return Math.min(cap, Math.max(0, global - siblings))
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
  orthodontics?: {
    budget?: OrthodonticsBudget | null
    payments?: OrthodonticsPaymentRecord[]
  }
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
  const seenOrtho = new Set<OrthodonticsSharedKind>()
  const rows: PreparedSharedDocumentLine[] = []
  const newLines: PaymentControlLine[] = []
  const newPlanItems: PaymentPlanItem[] = []
  const orthodonticsCharges: PreparedOrthodonticsCharge[] = []
  const orthoBudget = input.orthodontics?.budget
  const orthoPayments = input.orthodontics?.payments ?? []

  for (const entry of entries) {
    const amount = Math.round(entry.amount)
    if (entry.origin === 'orthodontics') {
      const kind = entry.orthodonticsKind
      const label = kind ? ORTHODONTICS_SHARED_LABELS[kind] : 'Ortodoncia'
      if (!kind) {
        return { ok: false, message: 'Hay un cobro de ortodoncia incompleto. Quítelo y vuelva a elegirlo.' }
      }
      if (seenOrtho.has(kind)) {
        return { ok: false, message: `«${label}» está repetido en el comprobante.` }
      }
      seenOrtho.add(kind)
      if (amount <= 0) {
        return { ok: false, message: `Indique un valor mayor que cero para «${label}».` }
      }
      const cap = orthodonticsKindCap(kind, orthoBudget, orthoPayments)
      if (cap != null && amount > cap) {
        return {
          ok: false,
          message: `El valor de «${label}» supera el saldo de ortodoncia (${formatCurrency(cap)}).`,
        }
      }
      const controlNumber =
        kind === 'control' ? Math.max(1, Math.round(entry.controlNumber || 1)) : undefined
      const procedure = sharedOrthodonticsProcedure(kind, controlNumber)
      const cups = cupsOf(kind === 'control' ? entry.cupsCode || ORTHODONTICS_MECHANICAL_CONTROL_CUPS : entry.cupsCode, procedure)
      if (!cups.ok) return cups
      const charge: PreparedOrthodonticsCharge = {
        kind,
        paymentType: paymentTypeForSharedKind(kind),
        procedure,
        paymentReason: buildOrthodonticsPaymentReason(paymentTypeForSharedKind(kind), controlNumber),
        cupsCode: cups.cupsCode,
        amount,
        controlNumber,
      }
      const line: PaymentControlLine = {
        id: generateId(),
        procedure,
        cupsCode: cups.cupsCode,
        quantity: 1,
        unitPrice: amount,
        source: 'manual',
      }
      orthodonticsCharges.push(charge)
      rows.push({ line, amount, created: false, orthodontics: charge })
      continue
    }

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

  if (seenOrtho.has('pago_unico') && seenOrtho.size > 1) {
    return {
      ok: false,
      message:
        'El pago de contado no se combina con la cuota inicial, un control o los retenedores.',
    }
  }

  const orthoTotal = orthodonticsCharges.reduce((sum, charge) => sum + charge.amount, 0)
  const global = orthodonticsTreatmentBalance(orthoBudget, orthoPayments)
  if (global != null && orthoTotal > global) {
    return {
      ok: false,
      message: `La suma de ortodoncia supera el saldo del tratamiento (${formatCurrency(global)}).`,
    }
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
      orthodonticsCharges,
    },
  }
}
