import type { PaymentMethod } from '@/types/clinicalRecord'

/** Línea de presupuesto por procedimiento (anexos especializados). */
export interface AnnexProcedureBudgetLine {
  id: string
  procedure: string
  cupsCode?: string
  toothNumber?: number
  anatomicalZone?: string
  /** Material restaurador (p. ej. Disilicato de Litio, Zirconio). */
  material?: string
  quantity: number
  unitPrice: number
  /** Origen: manual o importado del esquema / plan visual */
  source?: 'manual' | 'import'
  /** Clave estable para no duplicar al reimportar */
  importKey?: string
  paymentMethod: PaymentMethod
  installments?: number
  initialPayment?: number
  installmentAmount?: number
  dueDate?: string
  scheduleNotes?: string
}

/** Presupuesto de procedimientos reutilizable en anexos. */
export interface AnnexProcedureBudget {
  active: boolean
  lines: AnnexProcedureBudgetLine[]
}

export function createEmptyAnnexProcedureBudget(): AnnexProcedureBudget {
  return {
    active: true,
    lines: [],
  }
}

export function createBlankAnnexProcedureBudgetLine(
  patch: Partial<AnnexProcedureBudgetLine> & Pick<AnnexProcedureBudgetLine, 'id'>,
): AnnexProcedureBudgetLine {
  return {
    procedure: '',
    material: '',
    quantity: 1,
    unitPrice: 0,
    source: 'manual',
    paymentMethod: 'contado',
    scheduleNotes: '',
    ...patch,
  }
}

export function annexProcedureLineSubtotal(line: AnnexProcedureBudgetLine): number {
  const quantity = Number.isFinite(line.quantity) ? Math.max(0, line.quantity) : 0
  const unitPrice = Number.isFinite(line.unitPrice) ? Math.max(0, line.unitPrice) : 0
  return Math.round(quantity * unitPrice)
}

export function calcAnnexProcedureBudgetTotal(budget: AnnexProcedureBudget | null | undefined): number {
  if (!budget?.active) return 0
  return budget.lines.reduce((sum, line) => sum + annexProcedureLineSubtotal(line), 0)
}

function normalizePaymentMethod(value: unknown): PaymentMethod {
  const allowed: PaymentMethod[] = [
    'contado',
    'cuotas',
    'abono_inicial',
    'eps',
    'transferencia',
    'tarjeta',
    'mixto',
    'otro',
  ]
  return allowed.includes(value as PaymentMethod) ? (value as PaymentMethod) : 'contado'
}

function normalizeNonNegative(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

export function normalizeAnnexProcedureBudgetLine(
  data: Partial<AnnexProcedureBudgetLine> | undefined,
  fallbackId: string,
): AnnexProcedureBudgetLine | null {
  if (!data || typeof data !== 'object') return null
  const id = typeof data.id === 'string' && data.id.trim() ? data.id : fallbackId
  const procedure = typeof data.procedure === 'string' ? data.procedure : ''
  const cupsCode =
    typeof data.cupsCode === 'string' && data.cupsCode.trim() ? data.cupsCode.trim() : undefined
  const toothNumber =
    typeof data.toothNumber === 'number' && Number.isFinite(data.toothNumber)
      ? data.toothNumber
      : undefined
  const anatomicalZone =
    typeof data.anatomicalZone === 'string' && data.anatomicalZone.trim()
      ? data.anatomicalZone.trim()
      : undefined
  const material =
    typeof data.material === 'string' && data.material.trim() ? data.material.trim() : ''
  const source = data.source === 'import' ? 'import' : data.source === 'manual' ? 'manual' : undefined
  const importKey =
    typeof data.importKey === 'string' && data.importKey.trim() ? data.importKey.trim() : undefined

  return {
    id,
    procedure,
    cupsCode,
    toothNumber,
    anatomicalZone,
    material,
    quantity: Math.max(0, Math.round(normalizeNonNegative(data.quantity, 1))),
    unitPrice: Math.max(0, Math.round(normalizeNonNegative(data.unitPrice, 0))),
    source,
    importKey,
    paymentMethod: normalizePaymentMethod(data.paymentMethod),
    installments:
      data.installments != null ? Math.max(1, Math.round(normalizeNonNegative(data.installments, 1))) : undefined,
    initialPayment:
      data.initialPayment != null ? Math.round(normalizeNonNegative(data.initialPayment, 0)) : undefined,
    installmentAmount:
      data.installmentAmount != null
        ? Math.round(normalizeNonNegative(data.installmentAmount, 0))
        : undefined,
    dueDate: typeof data.dueDate === 'string' && data.dueDate ? data.dueDate : undefined,
    scheduleNotes: typeof data.scheduleNotes === 'string' ? data.scheduleNotes : '',
  }
}

export function normalizeAnnexProcedureBudget(
  data?: Partial<AnnexProcedureBudget> | null,
): AnnexProcedureBudget {
  const lines = Array.isArray(data?.lines)
    ? data.lines
        .map((line, index) =>
          normalizeAnnexProcedureBudgetLine(line, `annex-budget-line-${index}`),
        )
        .filter((line): line is AnnexProcedureBudgetLine => line !== null)
    : []

  return {
    active: data?.active !== false,
    lines,
  }
}
