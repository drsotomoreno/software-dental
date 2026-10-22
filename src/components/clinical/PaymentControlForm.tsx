import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import type { UserProfile } from '@/types/user'
import type {
  BudgetLineItem,
  DentalImplantsBudget,
  OrthodonticsBudget,
  OrthodonticsPaymentRecord,
  PaymentControlLine,
  PaymentDocumentKind,
  PaymentInvoice,
  PaymentPlanItem,
  PaymentRecord,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { COMMON_CIE10_CODES } from '@/constants/dental'
import { useAuth } from '@/contexts/AuthContext'
import { useCatalogSearch } from '@/hooks/useCatalogSearch'
import { useTariffSync } from '@/modules/tariff/useTariffSync'
import { useTariffStore } from '@/store/useTariffStore'
import { calcOrthodonticsBudgetTotal, formatCurrency, generateId } from '@/utils'
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
  documentKindFromEmission,
  formatAbonoDate,
  paymentReceiptActionLabel,
  paymentReceiptTypeLabel,
  procedurePaymentStatus,
  remainingAfterAbono,
  resolvePaymentDocumentKind,
} from '@/utils/paymentAbonos'
import {
  ORTHODONTICS_CONCEPT_LABELS,
  ORTHODONTICS_PAYMENT_TYPE_LABELS,
  buildOrthodonticsPaymentReason,
  calcOrthodonticsPaymentsTotal,
  conceptForOrthodonticsProcedure,
  conceptRemaining,
  paidAmountForConcept,
  paymentsForConcept,
  getOrthodonticsControlNumbers,
  getPaidControlNumbers,
  orthodonticsPaymentBalance,
  paymentTypeForConcept,
  suggestControlNumber,
} from '@/utils/orthodonticsPaymentControl'
import { PaymentAgreementFields } from './PaymentAgreementFields'
import { PaymentPlanProcedureField } from './PaymentPlanProcedureField'
import {
  PaymentRegistrationModal,
  type PaymentRegistrationInput,
} from './PaymentRegistrationModal'

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
  const [orthoDraftId, setOrthoDraftId] = useState<string | null>(null)
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
      searchGeneralDentistryCups(
        cupsQuery,
        (prices ?? []).map((price) => ({ procedure: price.procedure, cupsCode: price.cupsCode })),
      ),
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
    ? Math.max(0, lineBillablePrice(draftLine) - paidAmountForLine(draftLine.id, paymentControl))
    : 0
  const canImportFromBudget =
    budgetItems.some((item) => item.procedure.trim()) ||
    Boolean(orthodonticsBudget?.active) ||
    Boolean(dentalImplantsBudget?.active)
  const unlinkedPayments = paymentControl.filter((payment) => !payment.paymentControlLineId)
  const pendingAgreements = supplementalPlanItems(paymentControlLines, paymentPlan)
  const orthoAgreements = orthodonticsPlanItems(paymentPlan)
  const orthoDraft = orthoAgreements.find((item) => item.id === orthoDraftId) ?? null
  const orthoConcept = orthoDraft ? conceptForOrthodonticsProcedure(orthoDraft.procedure) : null
  const orthoDraftRemaining =
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
    onLinesChange(paymentControlLines.filter((item) => item.id !== id))
    if (line) onPaymentPlanChange(removePlanItemsForLine(line, paymentPlan))
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
    const billable = lineBillablePrice(line)
    const paid = paidAmountForLine(line.id, paymentControl)
    const remaining = Math.max(0, billable - paid)
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

  const applyVoidedPaymentInvoice = (
    paymentId: string,
    invoiceId: string,
    voided: PaymentInvoice,
    source: 'control' | 'orthodontics',
  ) => {
    if (source === 'control') {
      onChange(
        paymentControl.map((payment) =>
          payment.id === paymentId
            ? {
                ...payment,
                invoices: payment.invoices.map((invoice) =>
                  invoice.id === invoiceId ? voided : invoice,
                ),
              }
            : payment,
        ),
      )
      return
    }

    onOrthodonticsPaymentControlChange(
      orthodonticsPaymentControl.map((payment) =>
        payment.id === paymentId
          ? {
              ...payment,
              invoices: payment.invoices.map((invoice) =>
                invoice.id === invoiceId ? voided : invoice,
              ),
            }
          : payment,
      ),
    )
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
      applyVoidedPaymentInvoice(
        creditNoteTarget.paymentId,
        creditNoteTarget.invoice.id,
        voided,
        creditNoteTarget.source,
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

  return (
    <section className="card">
      <h3 className={`mb-2 ${CLINICAL_SECTION_TITLE_CLASS}`}>
        {clinicalSectionTitle(CLINICAL_HISTORY_SECTION_NUMBERS.planPagos, 'Plan y Control de Pagos')}
      </h3>
      <p className="mb-4 text-xs text-slate-500">
        Para cada procedimiento defina la forma de pago y registre abonos parciales. Elija recibo
        interno o factura electrónica; el saldo del procedimiento y el del tratamiento se actualizan
        con cada abono.
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
            const remaining = Math.max(0, billable - paid)
            const status = procedurePaymentStatus(remaining, paid)
            const linePayments = paymentControl.filter((payment) => payment.paymentControlLineId === line.id)
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
                              {formatCurrency(entry.payment.amount)}
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

        {unlinkedPayments.length > 0 && (
          <article className="rounded-xl border border-slate-300 bg-slate-50 p-4 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-slate-900">Abonos sin procedimiento</h4>
            <ul className="space-y-2">
              {unlinkedPayments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <span className="text-slate-700">{payment.paymentReason || 'Pago'}</span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {formatCurrency(payment.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </article>
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

      {(orthodonticsBudget?.active || orthoAgreements.length > 0) && orthoAgreements.length > 0 && (
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-semibold text-dental-800">Acuerdo de pago — ortodoncia</h4>
          <p className="text-xs text-slate-500">
            Forma de pago, abonos y saldo de la cuota inicial, los controles y los retenedores. Cada
            abono queda en el concepto de la tarjeta desde la que se registra.
          </p>
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
          {orthoAgreements.map((item) => {
            const concept = conceptForOrthodonticsProcedure(item.procedure)
            const conceptPayments = concept
              ? paymentsForConcept(orthodonticsPaymentControl, concept)
              : []
            const conceptPaid = concept
              ? paidAmountForConcept(orthodonticsPaymentControl, concept)
              : 0
            const conceptBalance = concept
              ? conceptRemaining(item.totalAmount, orthodonticsPaymentControl, concept)
              : 0

            return (
              <article
                key={item.id}
                data-ortho-concept={concept ?? undefined}
                className="rounded-xl border border-slate-300 bg-slate-50 p-4 shadow-sm"
              >
                <header className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-dental-700">
                      Procedimiento de ortodoncia
                    </p>
                    <h4 className="text-sm font-semibold text-slate-900">{item.procedure}</h4>
                    {concept ? (
                      <p className="mt-1 text-xs text-slate-600">
                        Pagado:{' '}
                        <span className="font-semibold text-green-700">{formatCurrency(conceptPaid)}</span>
                        {' / '}
                        Saldo:{' '}
                        <span className="font-semibold text-amber-700">{formatCurrency(conceptBalance)}</span>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm font-semibold text-dental-700">
                      {formatCurrency(item.totalAmount)}
                    </span>
                    {concept && !disabled ? (
                      <button
                        type="button"
                        disabled={paymentBusy || conceptBalance <= 0}
                        onClick={() => {
                          setPaymentNotice(null)
                          setPaymentDraftLineId(null)
                          setOrthoDraftId(item.id)
                        }}
                        className="btn-primary h-8 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        + Registrar Pago
                      </button>
                    ) : null}
                  </div>
                </header>
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
                {concept ? (
                  <OrthodonticsAbonoHistory
                    payments={conceptPayments}
                    disabled={disabled}
                    onOpenInvoice={openOrthodonticsInvoice}
                    onCreditNote={(payment, invoice) =>
                      setCreditNoteTarget({ paymentId: payment.id, invoice, source: 'orthodontics' })
                    }
                    onDelete={removeOrthodonticsPayment}
                  />
                ) : null}
              </article>
            )
          })}
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

      {paymentNotice && <p className="mt-3 text-sm text-dental-800">{paymentNotice}</p>}
      {creditNoteMessage && (
        <p className="mt-3 text-sm text-dental-800">{creditNoteMessage}</p>
      )}
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
