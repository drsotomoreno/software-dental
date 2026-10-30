import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import type { UserProfile } from '@/types/user'
import type { CheckoutLineItem } from '@/types/consultationCheckout'
import type {
  BudgetLineItem,
  DentalImplantsBudget,
  OrthodonticsBudget,
  OrthodonticsPaymentRecord,
  PaymentControlLine,
  PaymentDocumentKind,
  PaymentInvoice,
  PaymentLineAllocation,
  PaymentPlanItem,
  PaymentRecord,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { COMMON_CIE10_CODES, COMMON_DENTAL_PROCEDURES } from '@/constants/dental'
import { useAuth } from '@/contexts/AuthContext'
import { useCatalogSearch } from '@/hooks/useCatalogSearch'
import { useTariffSync } from '@/modules/tariff/useTariffSync'
import { useTariffStore } from '@/store/useTariffStore'
import {
  calcOrthodonticsBudgetTotal,
  formatCurrency,
  generateId,
  lineSubtotal,
  orthodonticsPaymentPlanItems,
} from '@/utils'
import { ORTHODONTICS_BUDGET_PROCEDURES, type OrthodonticsBudgetRowKey } from '@/utils/budget'
import { formatCupsCodeDotted } from '@/services/catalogService'
import { getDefaultQuantityForCups } from '@/utils/cupsBillingRules'
import { searchGeneralDentistryCups } from '@/utils/cupsGeneralDentistry'
import { resolveTariffUnitPrice } from '@/utils/tariffLookup'
import {
  ANATOMICAL_ZONE_PRESETS,
  formatAnatomicalZone,
  parseAnatomicalZone,
} from '@/utils/treatmentPlanZone'
import {
  emptyPaymentControlLine,
  lineBillablePrice,
  lineRemainingBalance,
  paidAmountForLine,
  sumPaymentControlPrices,
  treatmentPaymentBalance,
} from '@/utils/paymentControlLines'
import {
  controlLineFromPlanItem,
  createLinkedPlanItem,
  importBudgetIntoPaymentSection,
  mirrorLineOntoPlan,
  orthodonticsPlanItems,
  planItemForLine,
  removePlanItemsForLine,
  supplementalPlanItems,
  upsertAgreement,
} from '@/utils/paymentSectionMerge'
import {
  attachAutoInvoiceToPayment,
  clinicalPaymentsNeedAutoInvoices,
  ensureOrthodonticsPaymentsHaveAutoInvoices,
  ensurePaymentsHaveAutoInvoices,
} from '@/services/paymentInvoiceService'
import { emitChargeReceipt } from '@/services/chargeEmissionService'
import { InvoiceViewModal, type InvoiceViewMode } from '@/components/invoices/InvoiceViewModal'
import { CreditNoteModal, paymentInvoiceStatusLabel } from '@/components/invoices/CreditNoteModal'
import {
  createCreditNoteForPaymentInvoice,
  voidPaymentInvoiceLocally,
} from '@/services/creditNoteService'
import { isPaymentInvoiceImmutable } from '@/services/invoiceImmutabilityService'
import { PAYMENT_METHOD_LABELS } from '@/constants/dental'
import { calcTotalPaid } from '@/utils/paymentControl'
import {
  abonoHistoryForLine,
  amountAppliedToLine,
  documentKindFromEmission,
  formatAbonoDate,
  paymentHasProcedureLink,
  paymentReceiptActionLabel,
  paymentReceiptTypeLabel,
  procedurePaymentStatus,
  remainingAfterAbono,
  resolvePaymentDocumentKind,
} from '@/utils/paymentAbonos'
import { clasificarGrupoRips } from '@/utils/paqueteDocumentoCobro'
import {
  ORTHODONTICS_CONCEPT_LABELS,
  ORTHODONTICS_PAYMENT_TYPE_LABELS,
  buildOrthodonticsPaymentReason,
  calcOrthodonticsPaymentsTotal,
  conceptForOrthodonticsProcedure,
  conceptRemaining,
  getOrthodonticsControlNumbers,
  getPaidControlNumbers,
  orthodonticsPaymentBalance,
  paymentTypeForConcept,
  suggestControlNumber,
} from '@/utils/orthodonticsPaymentControl'
import type { PreparedSharedDocument } from '@/utils/sharedDocumentBox'
import { OrthodonticsBudgetSection } from './OrthodonticsBudgetSection'
import { PaymentAgreementFields } from './PaymentAgreementFields'
import { PaymentPlanProcedureField } from './PaymentPlanProcedureField'
import {
  PaymentRegistrationModal,
  type PaymentRegistrationInput,
} from './PaymentRegistrationModal'
import {
  PatientPaymentDocumentsBox,
  type PatientPaymentDocumentEntry,
} from './PatientPaymentDocumentsBox'
import { SharedDocumentBox } from './SharedDocumentBox'

interface PaymentControlFormProps {
  paymentControlLines: PaymentControlLine[]
  paymentPlan: PaymentPlanItem[]
  paymentControl: PaymentRecord[]
  orthodonticsPaymentControl: OrthodonticsPaymentRecord[]
  orthodonticsBudget?: OrthodonticsBudget
  dentalImplantsBudget?: DentalImplantsBudget
  budgetItems?: BudgetLineItem[]
  treatmentPlan?: TreatmentPlanItem[]
  disabled?: boolean
  patientId?: string
  clinicalRecordId?: string | number
  patientName?: string
  patientDocument?: string
  onLinesChange: (lines: PaymentControlLine[]) => void
  onPaymentPlanChange: (paymentPlan: PaymentPlanItem[]) => void
  onChange: (paymentControl: PaymentRecord[]) => void
  onOrthodonticsPaymentControlChange: (payments: OrthodonticsPaymentRecord[]) => void
}

interface CieOption {
  code: string
  description: string
}

function formatCieLabel(item: Pick<PaymentControlLine, 'diagnosisCode' | 'diagnosisDescription'>): string {
  return [item.diagnosisCode, item.diagnosisDescription].filter(Boolean).join(' ')
}

function parseCieLabel(value: string): { diagnosisCode?: string; diagnosisDescription?: string } {
  const text = value.trim()
  if (!text) return { diagnosisCode: undefined, diagnosisDescription: undefined }
  const match = text.match(/^([A-Z]\d{2}(?:\.\d{1,2})?)\b\s*[-—:]?\s*(.*)$/i)
  if (!match) return { diagnosisCode: undefined, diagnosisDescription: text }
  return {
    diagnosisCode: match[1].toUpperCase(),
    diagnosisDescription: match[2]?.trim() || undefined,
  }
}

function dentistName(user?: UserProfile | null): string {
  if (!user) return ''
  return `${user.firstName} ${user.lastName}`.trim()
}

/** Anula el mismo número en el pago clínico y en las copias de ortodoncia. */
function stampVoidedInvoice<T extends { invoices: PaymentInvoice[] }>(
  payment: T,
  voided: PaymentInvoice,
): T {
  const invoiceNumber = voided.invoiceNumber?.trim()
  if (!invoiceNumber) return payment
  let changed = false
  const invoices = payment.invoices.map((invoice) => {
    if (invoice.invoiceNumber?.trim() !== invoiceNumber) return invoice
    changed = true
    return {
      ...invoice,
      status: voided.status,
      creditNoteId: voided.creditNoteId,
      creditNoteNumber: voided.creditNoteNumber,
      voidReason: voided.voidReason,
    }
  })
  return changed ? { ...payment, invoices } : payment
}

function PriceCell({
  value,
  disabled,
  onCommit,
}: {
  value: number
  disabled?: boolean
  onCommit: (amount: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  return (
    <input
      inputMode="numeric"
      disabled={disabled}
      aria-label="Precio"
      className="input-field h-8 bg-white px-2 text-right text-sm tabular-nums"
      value={editing ? draft : formatCurrency(value || 0)}
      onFocus={() => {
        if (disabled) return
        setEditing(true)
        setDraft(value ? String(Math.round(value)) : '')
      }}
      onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => {
        const parsed = Number(draft.replace(/[^\d]/g, ''))
        onCommit(Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0)
        setEditing(false)
      }}
    />
  )
}

const EMPTY_AGREEMENT: Pick<
  PaymentPlanItem,
  'paymentMethod' | 'dueDate' | 'installments' | 'initialPayment' | 'installmentAmount' | 'scheduleNotes'
> = {
  paymentMethod: 'contado',
  scheduleNotes: '',
}

function FieldCaption({ children }: { children: string }) {
  return (
    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </span>
  )
}

function OrthodonticsAbonoHistory({
  payments,
  disabled,
  onOpenInvoice,
  onCreditNote,
  onDelete,
}: {
  payments: OrthodonticsPaymentRecord[]
  disabled?: boolean
  onOpenInvoice: (payment: OrthodonticsPaymentRecord) => void
  onCreditNote: (payment: OrthodonticsPaymentRecord, invoice: PaymentInvoice) => void
  onDelete: (paymentId: string) => void
}) {
  if (payments.length === 0) return null

  return (
    <details open className="mt-3 rounded-lg border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 [&::-webkit-details-marker]:hidden">
        Historial de abonos ({payments.length})
      </summary>
      <ul className="space-y-2 border-t border-slate-100 px-3 py-3">
        {payments.map((payment) => {
          const invoice = [...payment.invoices]
            .reverse()
            .find((item) => item.invoiceNumber || item.amount > 0)
          const documentKind = resolvePaymentDocumentKind(payment)
          const locked = payment.invoices.some((item) => isPaymentInvoiceImmutable(item))
          const canCreditNote = Boolean(
            invoice &&
              !invoice.sharedCopy &&
              isPaymentInvoiceImmutable(invoice) &&
              invoice.status !== 'voided_by_credit_note',
          )
          const conceptLabel =
            payment.paymentType === 'control' && payment.controlNumber
              ? `Control #${payment.controlNumber}`
              : ORTHODONTICS_PAYMENT_TYPE_LABELS[payment.paymentType]

          return (
            <li
              key={payment.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{formatAbonoDate(payment.paymentDate)}</p>
                <p className="text-slate-500">
                  {conceptLabel} · {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                </p>
                {invoice && paymentInvoiceStatusLabel(invoice) ? (
                  <p className="text-rose-700">{paymentInvoiceStatusLabel(invoice)}</p>
                ) : null}
              </div>
              <p className="font-semibold tabular-nums text-slate-900">{formatCurrency(payment.amount)}</p>
              <div className="flex flex-wrap items-center gap-2">
                {invoice ? (
                  <button
                    type="button"
                    onClick={() => onOpenInvoice(payment)}
                    className="inline-flex h-8 items-center rounded-lg border border-dental-200 bg-white px-2.5 text-[11px] font-semibold text-dental-800 hover:bg-dental-50"
                  >
                    {paymentReceiptActionLabel(documentKind)}
                  </button>
                ) : null}
                {canCreditNote && invoice ? (
                  <button
                    type="button"
                    onClick={() => onCreditNote(payment, invoice)}
                    className="h-8 rounded-lg border border-rose-200 bg-white px-2 text-[11px] font-medium text-rose-800 hover:bg-rose-50"
                  >
                    Anular
                  </button>
                ) : null}
                {!disabled && !locked ? (
                  <button
                    type="button"
                    onClick={() => onDelete(payment.id)}
                    className="text-[11px] text-red-500 hover:text-red-700"
                  >
                    Eliminar
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

export function PaymentControlForm({
  paymentControlLines,
  paymentPlan = [],
  paymentControl,
  orthodonticsPaymentControl,
  orthodonticsBudget,
  dentalImplantsBudget,
  budgetItems = [],
  treatmentPlan = [],
  disabled = false,
  patientId = '',
  clinicalRecordId,
  patientName = '',
  patientDocument = '',
  onLinesChange,
  onPaymentPlanChange,
  onChange,
  onOrthodonticsPaymentControlChange,
}: PaymentControlFormProps) {
  const { user } = useAuth()
  useTariffSync(user?.id)
  const tariffMap = useTariffStore((state) => state.tariffMap)
  const prices = useLiveQuery(
    () => (user?.id ? db.prices.where('userId').equals(user.id).toArray() : []),
    [user?.id],
  )
  const [openMenu, setOpenMenu] = useState<{ id: string; field: 'cie' | 'cups'; query: string } | null>(
    null,
  )
  const cieQuery = openMenu?.field === 'cie' ? openMenu.query : ''
  const cupsQuery = openMenu?.field === 'cups' ? openMenu.query : ''
  const cieCatalog = useCatalogSearch('cie10', cieQuery, 20)
  const [invoiceView, setInvoiceView] = useState<InvoiceViewMode | null>(null)
  const [paymentDraftLineId, setPaymentDraftLineId] = useState<string | null>(null)
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([])
  const [bundleOpen, setBundleOpen] = useState(false)
  const [orthoDraftId, setOrthoDraftId] = useState<string | null>(null)
  const [orthoContadoOpen, setOrthoContadoOpen] = useState(false)
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null)
  const [creditNoteTarget, setCreditNoteTarget] = useState<{
    paymentId: string
    invoice: PaymentInvoice
    source: 'control' | 'orthodontics'
  } | null>(null)
  const [creditNoteBusy, setCreditNoteBusy] = useState(false)
  const [creditNoteMessage, setCreditNoteMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!clinicalPaymentsNeedAutoInvoices({ paymentControl })) return
    onChange(ensurePaymentsHaveAutoInvoices(paymentControl, user?.id))
  }, [paymentControl, user?.id, onChange])

  useEffect(() => {
    if (!clinicalPaymentsNeedAutoInvoices({ orthodonticsPaymentControl })) return
    onOrthodonticsPaymentControlChange(
      ensureOrthodonticsPaymentsHaveAutoInvoices(orthodonticsPaymentControl, user?.id),
    )
  }, [orthodonticsPaymentControl, user?.id, onOrthodonticsPaymentControlChange])

  const cieOptions = useMemo(() => {
    const map = new Map<string, CieOption>()
    const query = cieQuery.trim().toLowerCase()
    const pool = query.length >= 2 ? [...(cieCatalog ?? []), ...COMMON_CIE10_CODES] : COMMON_CIE10_CODES
    for (const item of pool) {
      const code = item.code.trim().toUpperCase()
      if (!code) continue
      if (
        query &&
        !code.toLowerCase().includes(query) &&
        !item.description.toLowerCase().includes(query)
      ) {
        continue
      }
      map.set(code, { code, description: item.description })
    }
    return [...map.values()].slice(0, 8)
  }, [cieCatalog, cieQuery])

  const cupsOptions = useMemo(
    () =>
      searchGeneralDentistryCups(cupsQuery, [
        ...COMMON_DENTAL_PROCEDURES.map((item) => ({
          procedure: item.procedure,
          cupsCode: item.cupsCode,
        })),
        ...(prices ?? []).map((price) => ({ procedure: price.procedure, cupsCode: price.cupsCode })),
      ]),
    [cupsQuery, prices],
  )

  const catalogUnitPrice = (cupsCode?: string) =>
    tariffMap[cupsCode ?? '']?.price ??
    tariffMap[cupsCode?.trim().toUpperCase() ?? '']?.price ??
    resolveTariffUnitPrice(cupsCode)

  const total = sumPaymentControlPrices(paymentControlLines)
  const totalPaid = calcTotalPaid(paymentControl)
  const balance = treatmentPaymentBalance(paymentControlLines, paymentControl)
  const draftLine = paymentControlLines.find((line) => line.id === paymentDraftLineId) ?? null
  const draftRemaining = draftLine
    ? lineRemainingBalance(draftLine, paymentControlLines, paymentControl)
    : 0
  const selectedBundle = paymentControlLines
    .filter((line) => selectedLineIds.includes(line.id))
    .map((line) => ({
      line,
      remaining: lineRemainingBalance(line, paymentControlLines, paymentControl),
    }))
    .filter((item) => item.remaining > 0 && item.line.procedure.trim())
  const selectedBundleTotal = selectedBundle.reduce((sum, item) => sum + item.remaining, 0)
  const canImportFromBudget =
    budgetItems.some((item) => item.procedure.trim()) ||
    Boolean(orthodonticsBudget?.active) ||
    Boolean(dentalImplantsBudget?.active)
  const knownLineIds = new Set(paymentControlLines.map((line) => line.id))
  const unlinkedPayments = paymentControl.filter(
    (payment) => !paymentHasProcedureLink(payment, knownLineIds),
  )
  const pendingAgreements = supplementalPlanItems(paymentControlLines, paymentPlan)
  const orthoAgreements = orthodonticsPlanItems(paymentPlan)
  const orthoDraft = orthoAgreements.find((item) => item.id === orthoDraftId) ?? null
  const orthoConcept = orthoDraft ? conceptForOrthodonticsProcedure(orthoDraft.procedure) : null
  const orthoConceptRemaining =
    orthoDraft && orthoConcept
      ? conceptRemaining(orthoDraft.totalAmount, orthodonticsPaymentControl, orthoConcept)
      : 0
  const orthoBudgetTotal = orthodonticsBudget?.active
    ? calcOrthodonticsBudgetTotal(orthodonticsBudget)
    : orthoAgreements.reduce((sum, item) => sum + (item.totalAmount || 0), 0)
  const orthoPaidTotal = calcOrthodonticsPaymentsTotal(orthodonticsPaymentControl)
  const orthoGlobalBalance = orthodonticsBudget?.active
    ? orthodonticsPaymentBalance(orthodonticsBudget, orthodonticsPaymentControl)
    : Math.max(0, orthoBudgetTotal - orthoPaidTotal)
  const orthoDraftRemaining = Math.min(orthoConceptRemaining, orthoGlobalBalance)
  const orthoControlNumbers = orthodonticsBudget
    ? getOrthodonticsControlNumbers(orthodonticsBudget)
    : []
  const orthoPaidControls = getPaidControlNumbers(orthodonticsPaymentControl)
  const orthoControlOptions = orthoControlNumbers.map((num) => ({
    value: num,
    label: `Control #${num}${orthoPaidControls.includes(num) ? ' (ya pagado)' : ''}`,
  }))
  const orthoDefaultControl = orthodonticsBudget
    ? suggestControlNumber(orthodonticsBudget, orthodonticsPaymentControl)
    : orthoControlOptions[0]?.value
  const adicionalPayments = orthodonticsPaymentControl.filter(
    (payment) => payment.paymentType === 'adicional',
  )

  const updateLine = (id: string, patch: Partial<PaymentControlLine>) => {
    const nextLines = paymentControlLines.map((line) => (line.id === id ? { ...line, ...patch } : line))
    onLinesChange(nextLines)
    const line = nextLines.find((item) => item.id === id)
    if (!line) return
    const nextPlan = mirrorLineOntoPlan(line, paymentPlan)
    if (nextPlan !== paymentPlan) onPaymentPlanChange(nextPlan)
  }

  const updateAgreement = (line: PaymentControlLine, patch: Partial<PaymentPlanItem>) => {
    onPaymentPlanChange(upsertAgreement(line, paymentPlan, patch))
  }

  const importFromBudget = () => {
    const next = importBudgetIntoPaymentSection({
      budgetItems,
      treatmentPlan,
      lines: paymentControlLines,
      plan: paymentPlan,
      orthodonticsBudget,
      dentalImplantsBudget,
    })
    onLinesChange(next.lines)
    onPaymentPlanChange(next.plan)
  }

  const addProcedure = () => {
    const line = emptyPaymentControlLine()
    onLinesChange([...paymentControlLines, line])
    onPaymentPlanChange([...paymentPlan, createLinkedPlanItem(line)])
  }

  const removeLine = (id: string) => {
    const line = paymentControlLines.find((item) => item.id === id)
    if (!line) return
    if (paidAmountForLine(id, paymentControl) > 0) {
      setPaymentNotice(
        'No se puede eliminar un procedimiento con abonos registrados. Es un registro legal; reasigne o conserve la fila.',
      )
      return
    }
    onLinesChange(paymentControlLines.filter((item) => item.id !== id))
    onPaymentPlanChange(removePlanItemsForLine(line, paymentPlan))
  }

  const promoteAgreement = (item: PaymentPlanItem) => {
    const line = controlLineFromPlanItem(item)
    onLinesChange([...paymentControlLines, line])
    onPaymentPlanChange(
      paymentPlan.map((row) => (row.id === item.id ? { ...row, paymentControlLineId: line.id } : row)),
    )
  }

  const closeMenuSoon = (id: string, field: 'cie' | 'cups') => {
    window.setTimeout(() => {
      setOpenMenu((current) => (current?.id === id && current.field === field ? null : current))
    }, 120)
  }

  const registerPayment = async (line: PaymentControlLine, input: PaymentRegistrationInput) => {
    if (disabled || paymentBusy) return
    const remaining = lineRemainingBalance(line, paymentControlLines, paymentControl)
    const amount = Math.round(input.amount)
    if (amount <= 0 || amount > remaining) return

    setPaymentBusy(true)
    setPaymentNotice(null)
    try {
      const agreement = planItemForLine(line, paymentPlan)
      const remainingBalance = remainingAfterAbono(remaining, amount)
      const requestedKind: PaymentDocumentKind = input.documentKind
      const draft: PaymentRecord = {
        id: generateId(),
        paymentControlLineId: line.id,
        paymentPlanItemId: agreement?.id,
        paymentDate: input.paymentDate,
        amount,
        paymentMethod: agreement?.paymentMethod ?? 'contado',
        paymentReason: line.procedure.trim() || agreement?.procedure || 'Procedimiento',
        cupsCode: line.cupsCode,
        treatingDentistUserId: user?.id,
        treatingDentistName: dentistName(user),
        documentKind: requestedKind,
        remainingBalance,
        invoices: [],
      }
      const withInvoice = attachAutoInvoiceToPayment(draft, user?.id)
      const invoice = withInvoice.invoices[withInvoice.invoices.length - 1]
      if (!invoice) {
        setPaymentNotice('No se pudo preparar el comprobante.')
        return
      }
      const result = await emitChargeReceipt({
        invoice,
        patientName,
        patientDocument,
        paymentReason: draft.paymentReason,
        cupsCode: line.cupsCode,
        amount,
        forceCashReceipt: requestedKind === 'recibo_interno',
      })
      if (requestedKind === 'factura' && result.invoice.emissionMode !== 'provider') {
        setPaymentNotice(
          result.depleted
            ? `${result.message} El abono no se registró.`
            : 'No se pudo emitir la factura electrónica (DIAN). Elija Recibo Interno o revise la modalidad de facturación. El abono no se registró.',
        )
        return
      }
      const documentKind = documentKindFromEmission(requestedKind, result.invoice.emissionMode)
      const payment: PaymentRecord = {
        ...withInvoice,
        documentKind,
        remainingBalance,
        invoices: withInvoice.invoices.map((item) =>
          item.id === invoice.id ? { ...result.invoice, autoGenerated: true } : item,
        ),
      }
      onChange([...paymentControl, payment])
      setPaymentDraftLineId(null)
      setPaymentNotice(
        remainingBalance === 0
          ? `Abono de ${formatCurrency(amount)} registrado. El procedimiento quedó en Pagado.`
          : `Abono de ${formatCurrency(amount)} registrado. Saldo del procedimiento: ${formatCurrency(remainingBalance)}.`,
      )
    } catch (error) {
      setPaymentNotice(error instanceof Error ? error.message : 'No se pudo registrar el pago.')
    } finally {
      setPaymentBusy(false)
    }
  }

  const emitSharedCharge = async (input: {
    rows: Array<{ line: PaymentControlLine; amount: number; orthodontics?: boolean }>
    documentKind: PaymentDocumentKind
    paymentDate: string
    balanceBefore: number
  }): Promise<{ payment: PaymentRecord | null; invoice: PaymentInvoice } | null> => {
    const fullAmount = input.rows.reduce((sum, row) => sum + Math.round(row.amount), 0)
    const clinicalRows = input.rows.filter((row) => !row.orthodontics)
    const clinicalAmount = clinicalRows.reduce((sum, row) => sum + Math.round(row.amount), 0)
    const persistedAmount = clinicalRows.length > 0 ? clinicalAmount : fullAmount
    const allocations: PaymentLineAllocation[] = clinicalRows.map(({ line, amount: lineAmount }) => ({
      lineId: line.id,
      amount: Math.round(lineAmount),
      cupsCode: line.cupsCode,
      description: line.procedure.trim(),
    }))
    const paymentReason = input.rows
      .map((row) => row.line.procedure.trim())
      .filter(Boolean)
      .join(' · ')
    const cart: CheckoutLineItem[] = input.rows.map(({ line, amount: lineAmount }) => {
      const grupo = clasificarGrupoRips({
        cupsCode: line.cupsCode,
        esPersonalizado: !line.cupsCode,
      })
      const lineAmountRounded = Math.round(lineAmount)
      return {
        id: line.id,
        kind: grupo === 'otrosServicios' ? 'aesthetic' : 'cups',
        name: line.procedure.trim(),
        cupsCode: grupo === 'otrosServicios' ? null : line.cupsCode,
        quantity: 1,
        unitPrice: lineAmountRounded,
        totalAmount: lineAmountRounded,
        ripsGroup: grupo,
        sourceType: 'budget',
        sourceId: line.id,
      }
    })
    const draft: PaymentRecord = {
      id: generateId(),
      paymentDate: input.paymentDate,
      amount: persistedAmount,
      paymentMethod: 'contado',
      paymentReason,
      treatingDentistUserId: user?.id,
      treatingDentistName: dentistName(user),
      documentKind: input.documentKind,
      lineAllocations: allocations.length > 0 ? allocations : undefined,
      remainingBalance: remainingAfterAbono(input.balanceBefore, persistedAmount),
      invoices: [],
    }
    const withInvoice = attachAutoInvoiceToPayment(draft, user?.id)
    const invoice = withInvoice.invoices[withInvoice.invoices.length - 1]
    if (!invoice) {
      setPaymentNotice('No se pudo preparar el comprobante.')
      return null
    }
    const invoiceToEmit: PaymentInvoice = { ...invoice, amount: fullAmount }
    const result = await emitChargeReceipt({
      invoice: invoiceToEmit,
      patientName,
      patientDocument,
      paymentReason,
      amount: fullAmount,
      forceCashReceipt: input.documentKind === 'recibo_interno',
      cart,
    })
    if (input.documentKind === 'factura' && result.invoice.emissionMode !== 'provider') {
      setPaymentNotice(
        result.depleted
          ? `${result.message} El cobro no se registró.`
          : 'No se pudo emitir la factura electrónica (DIAN). Elija Recibo de caja interno o revise la modalidad de facturación. El cobro no se registró.',
      )
      return null
    }
    const documentKind = documentKindFromEmission(input.documentKind, result.invoice.emissionMode)
    const emitted: PaymentInvoice = { ...result.invoice, autoGenerated: true }
    if (clinicalRows.length === 0) {
      return { payment: null, invoice: emitted }
    }
    return {
      payment: {
        ...withInvoice,
        documentKind,
        invoices: withInvoice.invoices.map((item) => (item.id === invoice.id ? emitted : item)),
      },
      invoice: emitted,
    }
  }

  const registerBundlePayment = async (input: PaymentRegistrationInput) => {
    if (disabled || paymentBusy || selectedBundle.length < 2) return
    const amount = Math.round(input.amount)
    if (amount !== selectedBundleTotal) {
      setPaymentNotice('El comprobante debe cobrar la suma exacta de los procedimientos seleccionados.')
      return
    }

    setPaymentBusy(true)
    setPaymentNotice(null)
    try {
      const emitted = await emitSharedCharge({
        rows: selectedBundle.map(({ line, remaining }) => ({ line, amount: remaining })),
        documentKind: input.documentKind,
        paymentDate: input.paymentDate,
        balanceBefore: balance,
      })
      const payment = emitted?.payment
      if (!payment) return
      onChange([...paymentControl, payment])
      setSelectedLineIds([])
      setBundleOpen(false)
      const numero = [...payment.invoices].reverse()[0]?.invoiceNumber ?? ''
      setPaymentNotice(
        `${payment.documentKind === 'factura' ? 'Factura' : 'Recibo'} ${numero} por ${formatCurrency(amount)} cubre ${selectedBundle.length} procedimientos.`,
      )
    } catch (error) {
      setPaymentNotice(error instanceof Error ? error.message : 'No se pudo registrar el pago.')
    } finally {
      setPaymentBusy(false)
    }
  }

  const registerSharedDocument = async (input: {
    paymentDate: string
    document: PreparedSharedDocument
  }): Promise<boolean> => {
    if (disabled || paymentBusy || input.document.rows.length < 2) return false
    setPaymentBusy(true)
    setPaymentNotice(null)
    try {
      const addedPrices = input.document.newLines.reduce((sum, line) => sum + lineBillablePrice(line), 0)
      const emitted = await emitSharedCharge({
        rows: input.document.rows.map((row) => ({
          line: row.line,
          amount: row.amount,
          orthodontics: Boolean(row.orthodontics),
        })),
        documentKind: input.document.documentKind,
        paymentDate: input.paymentDate,
        balanceBefore: balance + addedPrices,
      })
      if (!emitted) return false
      if (input.document.newLines.length > 0) {
        onLinesChange([...paymentControlLines, ...input.document.newLines])
        onPaymentPlanChange([...paymentPlan, ...input.document.newPlanItems])
      }
      if (emitted.payment) {
        onChange([...paymentControl, emitted.payment])
      }
      if (input.document.orthodonticsCharges.length > 0) {
        const canonical = emitted.invoice
        const orthoRecords: OrthodonticsPaymentRecord[] = input.document.orthodonticsCharges.map(
          (charge, index) => {
            const sharedCopy = Boolean(emitted.payment) || index > 0
            const invoice: PaymentInvoice = sharedCopy
              ? { ...canonical, id: generateId(), sharedCopy: true }
              : canonical
            return {
              id: generateId(),
              paymentDate: input.paymentDate,
              amount: charge.amount,
              paymentMethod: 'contado',
              paymentType: charge.paymentType,
              controlNumber: charge.controlNumber,
              paymentReason: charge.paymentReason,
              invoices: [invoice],
            }
          },
        )
        onOrthodonticsPaymentControlChange([...orthodonticsPaymentControl, ...orthoRecords])
      }
      const numero = emitted.invoice.invoiceNumber ?? ''
      const tipo =
        (emitted.payment?.documentKind ?? input.document.documentKind) === 'factura'
          ? 'FEV'
          : 'Recibo de caja interno'
      setPaymentNotice(
        `${tipo} ${numero} por ${formatCurrency(input.document.total)} cubre ${input.document.rows.length} procedimientos con el mismo número.`,
      )
      return true
    } catch (error) {
      setPaymentNotice(error instanceof Error ? error.message : 'No se pudo registrar el pago.')
      return false
    } finally {
      setPaymentBusy(false)
    }
  }

  const registerOrthodonticsPayment = async (
    item: PaymentPlanItem,
    input: PaymentRegistrationInput,
  ) => {
    const concept = conceptForOrthodonticsProcedure(item.procedure)
    if (!concept || disabled || paymentBusy) return
    const paymentType = paymentTypeForConcept(concept)
    const remaining = conceptRemaining(item.totalAmount, orthodonticsPaymentControl, concept)
    const amount = Math.round(input.amount)
    if (amount <= 0 || amount > remaining) return

    setPaymentBusy(true)
    setPaymentNotice(null)
    try {
      const controlNumber =
        paymentType === 'control'
          ? input.controlNumber ??
            (orthodonticsBudget
              ? suggestControlNumber(orthodonticsBudget, orthodonticsPaymentControl)
              : 1)
          : undefined
      const paymentReason = buildOrthodonticsPaymentReason(paymentType, controlNumber)
      const conceptBalance = remainingAfterAbono(remaining, amount)
      const requestedKind: PaymentDocumentKind = input.documentKind
      const draft: OrthodonticsPaymentRecord = {
        id: generateId(),
        paymentDate: input.paymentDate,
        amount,
        paymentMethod: item.paymentMethod ?? 'contado',
        paymentType,
        controlNumber,
        paymentReason,
        invoices: [],
      }
      const withInvoice = attachAutoInvoiceToPayment(draft, user?.id)
      const invoice = withInvoice.invoices[withInvoice.invoices.length - 1]
      if (!invoice) {
        setPaymentNotice('No se pudo preparar el comprobante.')
        return
      }
      const result = await emitChargeReceipt({
        invoice,
        patientName,
        patientDocument,
        paymentReason,
        amount,
        forceCashReceipt: requestedKind === 'recibo_interno',
      })
      if (requestedKind === 'factura' && result.invoice.emissionMode !== 'provider') {
        setPaymentNotice(
          result.depleted
            ? `${result.message} El abono no se registró.`
            : 'No se pudo emitir la factura electrónica (DIAN). Elija Recibo Interno o revise la modalidad de facturación. El abono no se registró.',
        )
        return
      }
      const payment: OrthodonticsPaymentRecord = {
        ...withInvoice,
        invoices: withInvoice.invoices.map((entry) =>
          entry.id === invoice.id ? { ...result.invoice, autoGenerated: true } : entry,
        ),
      }
      onOrthodonticsPaymentControlChange([...orthodonticsPaymentControl, payment])
      setOrthoDraftId(null)
      setOrthoContadoOpen(false)
      const conceptLabel = ORTHODONTICS_CONCEPT_LABELS[concept]
      setPaymentNotice(
        conceptBalance === 0
          ? `Abono de ${formatCurrency(amount)} registrado en ${conceptLabel}. El concepto quedó en Pagado.`
          : `Abono de ${formatCurrency(amount)} registrado en ${conceptLabel}. Saldo: ${formatCurrency(conceptBalance)}.`,
      )
    } catch (error) {
      setPaymentNotice(error instanceof Error ? error.message : 'No se pudo registrar el pago.')
    } finally {
      setPaymentBusy(false)
    }
  }

  const registerOrthodonticsFullPayment = async (input: PaymentRegistrationInput) => {
    if (disabled || paymentBusy || !orthodonticsBudget?.active) return
    const remaining = Math.round(orthoGlobalBalance)
    const amount = Math.round(input.amount)
    if (amount <= 0 || amount > remaining) return

    setPaymentBusy(true)
    setPaymentNotice(null)
    try {
      const paymentReason = buildOrthodonticsPaymentReason('pago_unico')
      const balanceAfter = remainingAfterAbono(remaining, amount)
      const requestedKind: PaymentDocumentKind = input.documentKind
      const draft: OrthodonticsPaymentRecord = {
        id: generateId(),
        paymentDate: input.paymentDate,
        amount,
        paymentMethod: 'contado',
        paymentType: 'pago_unico',
        paymentReason,
        invoices: [],
      }
      const withInvoice = attachAutoInvoiceToPayment(draft, user?.id)
      const invoice = withInvoice.invoices[withInvoice.invoices.length - 1]
      if (!invoice) {
        setPaymentNotice('No se pudo preparar el comprobante.')
        return
      }
      const result = await emitChargeReceipt({
        invoice,
        patientName,
        patientDocument,
        paymentReason,
        amount,
        forceCashReceipt: requestedKind === 'recibo_interno',
      })
      if (requestedKind === 'factura' && result.invoice.emissionMode !== 'provider') {
        setPaymentNotice(
          result.depleted
            ? `${result.message} El abono no se registró.`
            : 'No se pudo emitir la factura electrónica (DIAN). Elija Recibo Interno o revise la modalidad de facturación. El abono no se registró.',
        )
        return
      }
      const payment: OrthodonticsPaymentRecord = {
        ...withInvoice,
        invoices: withInvoice.invoices.map((entry) =>
          entry.id === invoice.id ? { ...result.invoice, autoGenerated: true } : entry,
        ),
      }
      onOrthodonticsPaymentControlChange([...orthodonticsPaymentControl, payment])
      setOrthoContadoOpen(false)
      setOrthoDraftId(null)
      setPaymentNotice(
        balanceAfter === 0
          ? `Pago único de ${formatCurrency(amount)} registrado. El tratamiento de ortodoncia quedó en Pagado.`
          : `Pago único de ${formatCurrency(amount)} registrado. Saldo del tratamiento: ${formatCurrency(balanceAfter)}.`,
      )
    } catch (error) {
      setPaymentNotice(error instanceof Error ? error.message : 'No se pudo registrar el pago.')
    } finally {
      setPaymentBusy(false)
    }
  }

  const openOrthodonticsPayment = (key: OrthodonticsBudgetRowKey) => {
    if (disabled || paymentBusy || !orthodonticsBudget?.active || orthoGlobalBalance <= 0) return
    const procedure = ORTHODONTICS_BUDGET_PROCEDURES[key]
    let agreement = orthoAgreements.find((item) => item.procedure === procedure) ?? null
    if (!agreement) {
      const generated = orthodonticsPaymentPlanItems(orthodonticsBudget).find(
        (row) => row.procedure === procedure,
      )
      if (!generated) return
      agreement = generated
      onPaymentPlanChange([...paymentPlan, generated])
    }
    const concept = conceptForOrthodonticsProcedure(agreement.procedure)
    if (!concept) return
    const remaining = conceptRemaining(
      agreement.totalAmount,
      orthodonticsPaymentControl,
      concept,
    )
    if (Math.min(remaining, orthoGlobalBalance) <= 0) return
    setPaymentNotice(null)
    setPaymentDraftLineId(null)
    setOrthoContadoOpen(false)
    setOrthoDraftId(agreement.id)
  }

  const openOrthodonticsFullPayment = () => {
    if (disabled || paymentBusy || !orthodonticsBudget?.active || orthoGlobalBalance <= 0) return
    setPaymentNotice(null)
    setPaymentDraftLineId(null)
    setOrthoDraftId(null)
    setOrthoContadoOpen(true)
  }

  const isOrthoRegisterDisabled = (key: OrthodonticsBudgetRowKey) => {
    if (disabled || paymentBusy || !orthodonticsBudget?.active || orthoGlobalBalance <= 0) return true
    const total = lineSubtotal(orthodonticsBudget[key])
    if (total <= 0) return true
    const procedure = ORTHODONTICS_BUDGET_PROCEDURES[key]
    const agreement = orthoAgreements.find((item) => item.procedure === procedure)
    if (!agreement) return false
    const concept = conceptForOrthodonticsProcedure(procedure)
    if (!concept) return true
    return conceptRemaining(agreement.totalAmount, orthodonticsPaymentControl, concept) <= 0
  }

  const removeOrthodonticsPayment = (paymentId: string) => {
    onOrthodonticsPaymentControlChange(
      orthodonticsPaymentControl.filter((payment) => payment.id !== paymentId),
    )
  }

  const openOrthodonticsInvoice = (payment: OrthodonticsPaymentRecord) => {
    const invoice = [...payment.invoices].reverse().find((item) => item.invoiceNumber || item.amount > 0)
    if (!invoice) return
    setInvoiceView({
      kind: 'payment',
      invoice,
      patientName,
      patientDocument,
      paymentReason: payment.paymentReason,
      paymentMethodLabel: PAYMENT_METHOD_LABELS[payment.paymentMethod],
    })
  }

  const handleCreditNoteSubmit = async (reason: string) => {
    if (!creditNoteTarget || !user || !patientId) return
    setCreditNoteBusy(true)
    setCreditNoteMessage(null)
    try {
      const creditNote = await createCreditNoteForPaymentInvoice({
        paymentInvoice: creditNoteTarget.invoice,
        reason,
        professional: user,
        patientId,
        clinicalRecordId,
      })
      const voided = voidPaymentInvoiceLocally(creditNoteTarget.invoice, creditNote)
      onChange(paymentControl.map((payment) => stampVoidedInvoice(payment, voided)))
      onOrthodonticsPaymentControlChange(
        orthodonticsPaymentControl.map((payment) => stampVoidedInvoice(payment, voided)),
      )
      setCreditNoteMessage(`Nota Crédito ${creditNote.creditNoteNumber} emitida.`)
      setCreditNoteTarget(null)
    } catch (error) {
      setCreditNoteMessage(error instanceof Error ? error.message : 'No se pudo generar la Nota Crédito.')
    } finally {
      setCreditNoteBusy(false)
    }
  }

  const openLatestInvoice = (payment: PaymentRecord) => {
    const invoice = [...payment.invoices].reverse().find((item) => item.invoiceNumber || item.amount > 0)
    if (!invoice) return
    setInvoiceView({
      kind: 'payment',
      invoice,
      patientName,
      patientDocument,
      paymentReason: payment.paymentReason,
      paymentMethodLabel: PAYMENT_METHOD_LABELS[payment.paymentMethod],
      treatingDentistName: payment.treatingDentistName,
    })
  }

  const openPatientPaymentDocument = async (entry: PatientPaymentDocumentEntry) => {
    const invoiceNumber = entry.invoice.invoiceNumber?.trim()
    if (invoiceNumber) {
      const electronic = await db.electronicInvoices.where('invoiceNumber').equals(invoiceNumber).first()
      if (electronic) {
        const linkedPatient = patientId
          ? (await db.patients.get(patientId)) ||
            (/^\d+$/.test(patientId) ? await db.patients.get(Number(patientId)) : undefined)
          : undefined
        setInvoiceView({
          kind: 'electronic',
          invoice: electronic,
          patient: linkedPatient ?? null,
          professional: user,
        })
        return
      }
    }

    setInvoiceView({
      kind: 'payment',
      invoice: entry.invoice,
      patientName,
      patientDocument,
      paymentReason: entry.paymentReason,
      paymentMethodLabel: PAYMENT_METHOD_LABELS[entry.paymentMethod],
      treatingDentistName: entry.treatingDentistName,
    })
  }

  return (
    <section className="card">
      <h3 className={`mb-2 ${CLINICAL_SECTION_TITLE_CLASS}`}>
        {clinicalSectionTitle(CLINICAL_HISTORY_SECTION_NUMBERS.planPagos, 'Plan y Control de Pagos')}
      </h3>
      <p className="mb-4 text-xs text-slate-500">
        Para cada procedimiento defina la forma de pago y registre abonos parciales. Al final de
        esta sección puede reunir varios procedimientos en un mismo número de FEV o de recibo de
        caja interno, importándolos de aquí, incluyendo ortodoncia o agregándolos manualmente.
      </p>

      {!disabled && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={importFromBudget}
            disabled={!canImportFromBudget}
            className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Importar desde presupuesto
          </button>
          <button type="button" onClick={addProcedure} className="btn-primary text-xs">
            Agregar procedimiento
          </button>
          {selectedBundle.length >= 2 && (
            <button
              type="button"
              disabled={paymentBusy}
              onClick={() => {
                setPaymentNotice(null)
                setPaymentDraftLineId(null)
                setBundleOpen(true)
              }}
              className="btn-primary text-xs"
            >
              Cobrar {selectedBundle.length} en un solo recibo o FEV ({formatCurrency(selectedBundleTotal)})
            </button>
          )}
        </div>
      )}

      <div className="space-y-4">
        {paymentControlLines.length === 0 && unlinkedPayments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {canImportFromBudget
              ? 'Importe el presupuesto o agregue un procedimiento.'
              : 'Agregue un procedimiento para acordar el pago y registrar abonos.'}
          </p>
        ) : (
          paymentControlLines.map((line, index) => {
            const cieOpen = openMenu?.id === line.id && openMenu.field === 'cie'
            const cupsOpen = openMenu?.id === line.id && openMenu.field === 'cups'
            const billable = lineBillablePrice(line)
            const paid = paidAmountForLine(line.id, paymentControl)
            const remaining = lineRemainingBalance(line, paymentControlLines, paymentControl)
            const status = procedurePaymentStatus(remaining, Math.max(paid, billable - remaining))
            const linePayments = paymentControl.filter((payment) => amountAppliedToLine(payment, line.id) > 0)
            const abonoHistory = abonoHistoryForLine(line.id, billable, paymentControl)
            const latestPayment = [...linePayments].reverse().find((payment) => payment.invoices.length > 0)
            const latestInvoice = latestPayment
              ? [...latestPayment.invoices].reverse()[0]
              : undefined
            const canCreditNote = Boolean(
              latestPayment &&
                latestInvoice &&
                isPaymentInvoiceImmutable(latestInvoice) &&
                latestInvoice.status !== 'voided_by_credit_note',
            )
            const agreement = planItemForLine(line, paymentPlan) ?? EMPTY_AGREEMENT
            const manualProcedure = !line.budgetItemId
            const procedureTitle = line.procedure.trim() || 'Sin nombre'

            return (
              <article
                key={line.id}
                className={`rounded-xl border border-slate-300 bg-slate-50 p-4 shadow-sm ${
                  cieOpen || cupsOpen ? 'relative z-30' : 'relative'
                }`}
              >
                <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-dental-700">
                      Procedimiento {index + 1}
                    </p>
                    {remaining > 0 && line.procedure.trim() && !disabled && (
                      <label className="mt-1 flex items-center gap-2 text-[11px] text-slate-600">
                        <input
                          type="checkbox"
                          checked={selectedLineIds.includes(line.id)}
                          onChange={() => {
                            setBundleOpen(false)
                            setSelectedLineIds((current) =>
                              current.includes(line.id)
                                ? current.filter((id) => id !== line.id)
                                : [...current, line.id],
                            )
                          }}
                        />
                        Incluir en un mismo recibo o FEV
                      </label>
                    )}
                    <h4 className="text-sm font-semibold text-slate-900" title={procedureTitle}>
                      {procedureTitle}
                      {line.cupsCode ? (
                        <span className="ml-2 font-mono text-[11px] font-normal text-slate-500">
                          {formatCupsCodeDotted(line.cupsCode)}
                        </span>
                      ) : null}
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>
                      {status.label}
                    </span>
                    {latestPayment && latestInvoice && (
                      <button
                        type="button"
                        onClick={() => openLatestInvoice(latestPayment)}
                        className="inline-flex h-8 items-center rounded-lg border border-dental-200 bg-white px-2.5 text-[11px] font-semibold text-dental-800 hover:bg-dental-50"
                      >
                        {paymentReceiptActionLabel(resolvePaymentDocumentKind(latestPayment))}
                      </button>
                    )}
                    {canCreditNote && latestPayment && latestInvoice && (
                      <button
                        type="button"
                        onClick={() =>
                          setCreditNoteTarget({
                            paymentId: latestPayment.id,
                            invoice: latestInvoice,
                            source: 'control',
                          })
                        }
                        className="h-8 rounded-lg border border-rose-200 bg-white px-2 text-[11px] font-medium text-rose-800 hover:bg-rose-50"
                      >
                        Anular
                      </button>
                    )}
                    {!disabled && (
                      <button
                        type="button"
                        aria-label="Quitar procedimiento"
                        onClick={() => removeLine(line.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {latestInvoice && paymentInvoiceStatusLabel(latestInvoice) && (
                    <p className="basis-full text-right text-[10px] text-rose-700">
                      {paymentInvoiceStatusLabel(latestInvoice)}
                    </p>
                  )}
                </header>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <FieldCaption>Diente / Zona</FieldCaption>
                    <input
                      id={`pay-zone-${line.id}`}
                      list="payment-zone-presets"
                      disabled={disabled}
                      value={formatAnatomicalZone(line)}
                      onChange={(event) => updateLine(line.id, parseAnatomicalZone(event.target.value))}
                      placeholder="16, 14-18, General"
                      className="input-field h-8 bg-white px-2 text-sm"
                      aria-label="Diente o zona"
                    />
                  </div>
                  <div className="relative">
                    <FieldCaption>Diagnóstico CIE</FieldCaption>
                    <input
                      disabled={disabled}
                      value={cieOpen ? openMenu.query : formatCieLabel(line)}
                      onFocus={() => {
                        if (disabled) return
                        setOpenMenu({ id: line.id, field: 'cie', query: formatCieLabel(line) })
                      }}
                      onBlur={() => closeMenuSoon(line.id, 'cie')}
                      onChange={(event) => {
                        const query = event.target.value
                        setOpenMenu({ id: line.id, field: 'cie', query })
                        updateLine(line.id, parseCieLabel(query))
                      }}
                      placeholder="CIE-10"
                      className="input-field h-8 bg-white px-2 text-sm"
                      aria-label="Diagnóstico CIE"
                      autoComplete="off"
                    />
                    {cieOpen && (
                      <ul className="absolute z-20 mt-1 max-h-40 w-[min(20rem,70vw)] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md">
                        {cieOptions.length === 0 ? (
                          <li className="px-2 py-1.5 text-xs text-slate-400">—</li>
                        ) : (
                          cieOptions.map((option) => (
                            <li key={`${line.id}-${option.code}`}>
                              <button
                                type="button"
                                className="flex w-full gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  updateLine(line.id, {
                                    diagnosisCode: option.code,
                                    diagnosisDescription: option.description,
                                  })
                                  setOpenMenu(null)
                                }}
                              >
                                <span className="font-mono text-dental-700">{option.code}</span>
                                <span className="truncate text-slate-600">{option.description}</span>
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </div>
                  {!manualProcedure && (
                    <div className="relative sm:col-span-2 xl:col-span-2">
                      <FieldCaption>Procedimiento</FieldCaption>
                      <input
                        disabled={disabled}
                        value={cupsOpen ? openMenu.query : line.procedure}
                        onFocus={() => {
                          if (disabled) return
                          setOpenMenu({ id: line.id, field: 'cups', query: line.procedure })
                        }}
                        onBlur={() => closeMenuSoon(line.id, 'cups')}
                        onChange={(event) => {
                          const query = event.target.value
                          setOpenMenu({ id: line.id, field: 'cups', query })
                          updateLine(line.id, { procedure: query, source: line.budgetItemId ? line.source : 'manual' })
                        }}
                        placeholder="CUPS .03"
                        title={line.procedure || undefined}
                        className="input-field h-8 bg-white px-2 pr-24 text-sm"
                        aria-label="Procedimiento"
                        autoComplete="off"
                      />
                      {line.cupsCode && !cupsOpen && (
                        <span className="pointer-events-none absolute bottom-2 right-3 font-mono text-[10px] text-slate-400">
                          {formatCupsCodeDotted(line.cupsCode)}
                        </span>
                      )}
                      {cupsOpen && (
                        <ul className="absolute z-20 mt-1 max-h-44 w-[min(24rem,80vw)] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md">
                          {cupsOptions.length === 0 ? (
                            <li className="px-2 py-1.5 text-xs text-slate-400">—</li>
                          ) : (
                            cupsOptions.map((option) => (
                              <li key={`${line.id}-${option.cupsCode}-${option.procedure}`}>
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    const price = catalogUnitPrice(option.cupsCode)
                                    updateLine(line.id, {
                                      procedure: option.procedure,
                                      cupsCode: option.cupsCode,
                                      quantity: getDefaultQuantityForCups(option.cupsCode),
                                      unitPrice: price > 0 ? price : line.unitPrice,
                                    })
                                    setOpenMenu(null)
                                  }}
                                >
                                  <span className="truncate">
                                    {option.procedure}
                                    <span className="ml-2 font-mono text-slate-400">
                                      {formatCupsCodeDotted(option.cupsCode)}
                                    </span>
                                  </span>
                                  {catalogUnitPrice(option.cupsCode) > 0 && (
                                    <span className="shrink-0 text-dental-700">
                                      {formatCurrency(catalogUnitPrice(option.cupsCode))}
                                    </span>
                                  )}
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                  <div>
                    <FieldCaption>Precio</FieldCaption>
                    <PriceCell
                      value={billable}
                      disabled={disabled}
                      onCommit={(unitPrice) => updateLine(line.id, { unitPrice, quantity: 1 })}
                    />
                  </div>
                  <div>
                    <FieldCaption>Registrar pago</FieldCaption>
                    {remaining <= 0 && paid > 0 ? (
                      <span className="text-xs font-medium text-green-700">Pagado</span>
                    ) : remaining <= 0 ? (
                      <span className="text-xs text-slate-400">Sin saldo</span>
                    ) : (
                      <button
                        type="button"
                        disabled={disabled || paymentBusy}
                        onClick={() => {
                          setPaymentNotice(null)
                          setOrthoDraftId(null)
                          setPaymentDraftLineId(line.id)
                        }}
                        className="btn-primary h-8 px-3 text-xs"
                      >
                        Registrar Pago
                      </button>
                    )}
                    {paid > 0 && remaining > 0 && (
                      <p className="mt-1 text-[11px] text-slate-500">Abonado {formatCurrency(paid)}</p>
                    )}
                  </div>
                </div>

                {manualProcedure && (
                  <div className="mt-4">
                    <PaymentPlanProcedureField
                      procedure={line.procedure}
                      cupsCode={line.cupsCode}
                      totalAmount={billable}
                      disabled={disabled}
                      onChange={(patch) =>
                        updateLine(line.id, {
                          procedure: patch.procedure,
                          cupsCode: patch.cupsCode,
                          unitPrice: patch.totalAmount ?? line.unitPrice,
                          quantity: 1,
                          source: 'manual',
                        })
                      }
                    />
                  </div>
                )}

                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Acuerdo de pago
                  </p>
                  <PaymentAgreementFields
                    item={agreement}
                    disabled={disabled}
                    onChange={(patch) => updateAgreement(line, patch)}
                  />
                </div>

                {abonoHistory.length > 0 && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Historial de abonos
                    </p>
                    <ul className="space-y-2">
                      {abonoHistory.map((entry) => (
                        <li
                          key={entry.payment.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800">
                              {formatAbonoDate(entry.payment.paymentDate)}
                            </p>
                            <p className="text-slate-500">{paymentReceiptTypeLabel(entry.documentKind)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold tabular-nums text-slate-900">
                              {formatCurrency(entry.appliedAmount)}
                            </p>
                            <p className="text-slate-500">
                              Saldo restante {formatCurrency(entry.remainingBalance)}
                            </p>
                          </div>
                          {entry.payment.invoices.length > 0 && (
                            <button
                              type="button"
                              onClick={() => openLatestInvoice(entry.payment)}
                              className="inline-flex h-8 items-center rounded-lg border border-dental-200 bg-white px-2.5 text-[11px] font-semibold text-dental-800 hover:bg-dental-50"
                            >
                              {paymentReceiptActionLabel(entry.documentKind)}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            )
          })
        )}

        <div className="flex flex-wrap justify-end gap-6 rounded-xl border border-slate-300 bg-white px-4 py-3">
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Valor total</p>
            <p className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total abonado</p>
            <p className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(totalPaid)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Saldo del tratamiento
            </p>
            <p className="text-sm font-semibold tabular-nums text-amber-800">{formatCurrency(balance)}</p>
          </div>
        </div>
      </div>
      {pendingAgreements.length > 0 && (
        <div className="mt-4 space-y-3">
          <h4 className="text-sm font-semibold text-slate-800">Acuerdos pendientes de registro clínico</h4>
          <p className="text-xs text-slate-500">
            Procedimientos acordados que todavía no tienen zona, diagnóstico ni abonos. Páselos a su
            propia ficha para registrar el pago y la factura.
          </p>
          {pendingAgreements.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-300 bg-slate-50 p-4 shadow-sm">
              <header className="mb-3 border-b border-slate-200 pb-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-dental-700">
                  Procedimiento pendiente
                </p>
                <h4 className="text-sm font-semibold text-slate-900">
                  {item.procedure || 'Procedimiento sin nombre'}
                </h4>
              </header>
              {(item.source === 'custom' || !item.budgetItemId) && (
                <div className="mb-3">
                  <PaymentPlanProcedureField
                    procedure={item.procedure}
                    cupsCode={item.cupsCode}
                    totalAmount={item.totalAmount}
                    disabled={disabled}
                    onChange={(patch) =>
                      onPaymentPlanChange(
                        paymentPlan.map((row) =>
                          row.id === item.id
                            ? {
                                ...row,
                                procedure: patch.procedure,
                                cupsCode: patch.cupsCode,
                                totalAmount: patch.totalAmount ?? row.totalAmount,
                              }
                            : row,
                        ),
                      )
                    }
                  />
                </div>
              )}
              <div className="mb-3 max-w-xs">
                <label className="mb-0.5 block text-[10px] text-slate-500">Valor total</label>
                <input
                  type="number"
                  min={0}
                  disabled={disabled}
                  value={item.totalAmount}
                  onChange={(event) =>
                    onPaymentPlanChange(
                      paymentPlan.map((row) =>
                        row.id === item.id ? { ...row, totalAmount: Number(event.target.value) } : row,
                      ),
                    )
                  }
                  className="input-field bg-white"
                />
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Acuerdo de pago
                </p>
                <PaymentAgreementFields
                  item={item}
                  disabled={disabled}
                  onChange={(patch) =>
                    onPaymentPlanChange(
                      paymentPlan.map((row) => (row.id === item.id ? { ...row, ...patch } : row)),
                    )
                  }
                />
              </div>
              {!disabled && (
                <div className="mt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => promoteAgreement(item)}
                    className="text-sm font-medium text-dental-700 hover:text-dental-900"
                  >
                    Crear ficha
                  </button>
                  <button
                    type="button"
                    onClick={() => onPaymentPlanChange(paymentPlan.filter((row) => row.id !== item.id))}
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <datalist id="payment-zone-presets">
        {ANATOMICAL_ZONE_PRESETS.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>

      {orthodonticsBudget?.active && (
        <OrthodonticsBudgetSection
          orthodonticsBudget={orthodonticsBudget}
          isPaymentMode
          disabled={disabled || paymentBusy}
          onRegisterPayment={openOrthodonticsPayment}
          isRegisterPaymentDisabled={isOrthoRegisterDisabled}
          onRegisterFullPayment={openOrthodonticsFullPayment}
          isFullPaymentDisabled={disabled || paymentBusy || orthoGlobalBalance <= 0}
          fullPaymentAmount={orthoGlobalBalance}
        />
      )}

      {(orthodonticsBudget?.active || orthodonticsPaymentControl.length > 0) && (
        <div className="mt-6 space-y-3">
          {orthodonticsBudget?.active && (
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-3">
              <div>
                <span className="text-xs text-slate-500">Presupuesto ortodoncia</span>
                <p className="font-semibold text-slate-800">{formatCurrency(orthoBudgetTotal)}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500">Pagado ortodoncia</span>
                <p className="font-semibold text-green-700">{formatCurrency(orthoPaidTotal)}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500">Saldo ortodoncia</span>
                <p className="font-semibold text-amber-700">{formatCurrency(orthoGlobalBalance)}</p>
              </div>
            </div>
          )}
          <OrthodonticsAbonoHistory
            payments={orthodonticsPaymentControl.filter((payment) => payment.paymentType !== 'adicional')}
            disabled={disabled}
            onOpenInvoice={openOrthodonticsInvoice}
            onCreditNote={(payment, invoice) =>
              setCreditNoteTarget({ paymentId: payment.id, invoice, source: 'orthodontics' })
            }
            onDelete={removeOrthodonticsPayment}
          />
          {adicionalPayments.length > 0 && (
            <article className="rounded-xl border border-slate-300 bg-slate-50 p-4 shadow-sm">
              <h4 className="text-sm font-semibold text-slate-900">Pagos adicionales ya registrados</h4>
              <p className="mt-1 text-xs text-slate-500">
                Estos abonos siguen descontando el saldo global de ortodoncia.
              </p>
              <OrthodonticsAbonoHistory
                payments={adicionalPayments}
                disabled={disabled}
                onOpenInvoice={openOrthodonticsInvoice}
                onCreditNote={(payment, invoice) =>
                  setCreditNoteTarget({ paymentId: payment.id, invoice, source: 'orthodontics' })
                }
                onDelete={removeOrthodonticsPayment}
              />
            </article>
          )}
        </div>
      )}

      {!disabled && (
        <SharedDocumentBox
          lines={paymentControlLines}
          payments={paymentControl}
          orthodonticsBudget={orthodonticsBudget}
          orthodonticsPayments={orthodonticsPaymentControl}
          busy={paymentBusy}
          onRegister={registerSharedDocument}
        />
      )}

      <PatientPaymentDocumentsBox
        payments={paymentControl}
        orthodonticsPayments={orthodonticsPaymentControl}
        paymentControlLines={paymentControlLines}
        disabled={disabled}
        onOpenDocument={(entry) => {
          void openPatientPaymentDocument(entry)
        }}
        onAssociatePayment={(paymentId, lineId) => {
          const line = paymentControlLines.find((item) => item.id === lineId)
          const payment = paymentControl.find((item) => item.id === paymentId)
          if (!line || !payment) return
          const remainingBefore = lineRemainingBalance(line, paymentControlLines, paymentControl)
          const amount = Math.max(0, Math.round(payment.amount || 0))
          const remainingBalance = remainingAfterAbono(remainingBefore, amount)
          const agreement = planItemForLine(line, paymentPlan)
          onChange(
            paymentControl.map((item) =>
              item.id === paymentId
                ? {
                    ...item,
                    paymentControlLineId: line.id,
                    paymentPlanItemId: agreement?.id ?? item.paymentPlanItemId,
                    cupsCode: line.cupsCode ?? item.cupsCode,
                    paymentReason:
                      line.procedure.trim() || agreement?.procedure || item.paymentReason || 'Procedimiento',
                    remainingBalance,
                    lineAllocations: undefined,
                  }
                : item,
            ),
          )
          setPaymentNotice(
            `Pago de ${formatCurrency(amount)} asociado a «${line.procedure.trim() || 'Procedimiento'}».`,
          )
        }}
        onSavePaymentNote={(paymentId, note) => {
          const trimmed = note.trim()
          if (!trimmed) return
          onChange(
            paymentControl.map((item) => {
              if (item.id !== paymentId) return item
              const currentReason = item.paymentReason?.trim() ?? ''
              const genericReason =
                !currentReason ||
                currentReason.toLowerCase() === 'abono' ||
                currentReason.toLowerCase() === 'pago'
              return {
                ...item,
                notes: trimmed,
                paymentReason: genericReason ? trimmed : currentReason,
              }
            }),
          )
          setPaymentNotice('Descripción del comprobante guardada.')
        }}
      />

      {paymentNotice && <p className="mt-3 text-sm text-dental-800">{paymentNotice}</p>}
      {creditNoteMessage && (
        <p className="mt-3 text-sm text-dental-800">{creditNoteMessage}</p>
      )}
      <PaymentRegistrationModal
        open={bundleOpen && selectedBundle.length >= 2}
        sessionKey={selectedBundle.map((item) => item.line.id).join(',')}
        procedureTitle={`${selectedBundle.length} procedimientos en un solo comprobante`}
        balanceCaption="Saldo de los procedimientos seleccionados"
        amountHint="Un solo número de recibo o FEV para todas las líneas. El total es la suma exacta que debe reportar el RIPS."
        remaining={selectedBundleTotal}
        treatmentBalance={balance}
        fixedAmount={selectedBundleTotal}
        busy={paymentBusy}
        notice={paymentNotice}
        onClose={() => {
          if (!paymentBusy) setBundleOpen(false)
        }}
        onSubmit={(input) => {
          void registerBundlePayment(input)
        }}
      />
      <PaymentRegistrationModal
        open={draftLine != null && draftRemaining > 0}
        sessionKey={draftLine?.id ?? ''}
        procedureTitle={draftLine?.procedure.trim() || 'Procedimiento'}
        remaining={draftRemaining}
        treatmentBalance={balance}
        busy={paymentBusy}
        notice={paymentNotice}
        onClose={() => {
          if (!paymentBusy) setPaymentDraftLineId(null)
        }}
        onSubmit={(input) => {
          if (!draftLine) return
          void registerPayment(draftLine, input)
        }}
      />
      <PaymentRegistrationModal
        open={orthoDraft != null && orthoConcept != null && orthoDraftRemaining > 0}
        sessionKey={orthoDraft ? `${orthoDraft.id}:${orthoConcept}` : ''}
        procedureTitle={orthoDraft?.procedure ?? 'Ortodoncia'}
        conceptLabel={orthoConcept ? ORTHODONTICS_CONCEPT_LABELS[orthoConcept] : undefined}
        controlOptions={orthoConcept === 'controles' ? orthoControlOptions : undefined}
        defaultControlNumber={orthoConcept === 'controles' ? orthoDefaultControl : undefined}
        remaining={orthoDraftRemaining}
        treatmentBalance={orthoGlobalBalance}
        busy={paymentBusy}
        notice={paymentNotice}
        onClose={() => {
          if (!paymentBusy) setOrthoDraftId(null)
        }}
        onSubmit={(input) => {
          if (!orthoDraft) return
          void registerOrthodonticsPayment(orthoDraft, input)
        }}
      />
      <PaymentRegistrationModal
        open={orthoContadoOpen && orthoGlobalBalance > 0}
        sessionKey={`ortho-pago-unico:${orthoGlobalBalance}`}
        procedureTitle="Tratamiento de ortodoncia"
        conceptLabel="Pago único de contado"
        remaining={orthoGlobalBalance}
        treatmentBalance={orthoGlobalBalance}
        fixedAmount={orthoGlobalBalance}
        busy={paymentBusy}
        notice={paymentNotice}
        onClose={() => {
          if (!paymentBusy) setOrthoContadoOpen(false)
        }}
        onSubmit={(input) => {
          void registerOrthodonticsFullPayment(input)
        }}
      />
      <CreditNoteModal
        open={creditNoteTarget != null}
        invoiceNumber={creditNoteTarget?.invoice.invoiceNumber ?? ''}
        amount={creditNoteTarget?.invoice.amount}
        busy={creditNoteBusy}
        onClose={() => setCreditNoteTarget(null)}
        onSubmit={handleCreditNoteSubmit}
      />
      <InvoiceViewModal view={invoiceView} onClose={() => setInvoiceView(null)} />
    </section>
  )
}
