import { Fragment, useEffect, useMemo, useState } from 'react'
import { Eye } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import type { UserProfile } from '@/types/user'
import type {
  BudgetLineItem,
  DentalImplantsBudget,
  OrthodonticsBudget,
  OrthodonticsPaymentRecord,
  PaymentControlLine,
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
import { formatCurrency, generateId } from '@/utils'
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
  ensurePaymentsHaveAutoInvoices,
} from '@/services/paymentInvoiceService'
import { InvoiceViewModal, type InvoiceViewMode } from '@/components/invoices/InvoiceViewModal'
import { CreditNoteModal, paymentInvoiceStatusLabel } from '@/components/invoices/CreditNoteModal'
import {
  createCreditNoteForPaymentInvoice,
  voidPaymentInvoiceLocally,
} from '@/services/creditNoteService'
import { isPaymentInvoiceImmutable } from '@/services/invoiceImmutabilityService'
import { PAYMENT_METHOD_LABELS } from '@/constants/dental'
import { OrthodonticsPaymentControlForm } from './OrthodonticsPaymentControlForm'
import { PaymentAgreementFields } from './PaymentAgreementFields'
import { PaymentPlanProcedureField } from './PaymentPlanProcedureField'

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
      className="input-field h-8 px-2 text-right text-sm tabular-nums"
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

function PayAmountField({
  remaining,
  paid,
  disabled,
  onPay,
}: {
  remaining: number
  paid: number
  disabled?: boolean
  onPay: (amount: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (remaining <= 0 && paid > 0) {
    return <span className="text-xs font-medium text-green-700">Pagado</span>
  }

  if (remaining <= 0) {
    return <span className="text-xs text-slate-400">Sin saldo</span>
  }

  const amount = () => {
    const source = editing ? draft : String(Math.round(remaining))
    const parsed = Number(source.replace(/[^\d]/g, ''))
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        inputMode="numeric"
        disabled={disabled}
        aria-label="Valor del pago"
        className="input-field h-8 w-28 px-2 text-right text-sm tabular-nums"
        value={editing ? draft : formatCurrency(remaining)}
        onFocus={() => {
          if (disabled) return
          setEditing(true)
          setDraft(String(Math.round(remaining)))
        }}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            const next = amount()
            if (next > 0) {
              onPay(next)
              setEditing(false)
            }
          }
        }}
      />
      <button
        type="button"
        disabled={disabled || amount() <= 0}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const next = amount()
          if (next <= 0) return
          onPay(next)
          setEditing(false)
        }}
        className="btn-primary h-8 shrink-0 px-2 text-xs"
      >
        Registrar
      </button>
    </div>
  )
}

const EMPTY_AGREEMENT: Pick<
  PaymentPlanItem,
  'paymentMethod' | 'dueDate' | 'installments' | 'initialPayment' | 'installmentAmount' | 'scheduleNotes'
> = {
  paymentMethod: 'contado',
  scheduleNotes: '',
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
  const balance = treatmentPaymentBalance(paymentControlLines, paymentControl)
  const canImportFromBudget =
    budgetItems.some((item) => item.procedure.trim()) ||
    Boolean(orthodonticsBudget?.active) ||
    Boolean(dentalImplantsBudget?.active)
  const unlinkedPayments = paymentControl.filter((payment) => !payment.paymentControlLineId)
  const pendingAgreements = supplementalPlanItems(paymentControlLines, paymentPlan)
  const orthoAgreements = orthodonticsPlanItems(paymentPlan)

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

  const registerPayment = (line: PaymentControlLine, amount: number) => {
    if (disabled || amount <= 0) return
    const agreement = planItemForLine(line, paymentPlan)
    const draft: PaymentRecord = {
      id: generateId(),
      paymentControlLineId: line.id,
      paymentPlanItemId: agreement?.id,
      paymentDate: new Date().toISOString().slice(0, 10),
      amount,
      paymentMethod: agreement?.paymentMethod ?? 'contado',
      paymentReason: line.procedure.trim() || agreement?.procedure || 'Procedimiento',
      cupsCode: line.cupsCode,
      treatingDentistUserId: user?.id,
      treatingDentistName: dentistName(user),
      invoices: [],
    }
    const payment = attachAutoInvoiceToPayment(draft, user?.id)
    onChange([...paymentControl, payment])
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
        Para cada procedimiento defina la forma de pago, las cuotas y las fechas acordadas, y registre
        los abonos con su factura y el saldo del tratamiento.
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">Diente / Zona</th>
              <th className="px-2 py-2">Diagnóstico CIE</th>
              <th className="px-2 py-2">Procedimiento</th>
              <th className="w-36 px-2 py-2 text-right">Precio</th>
              <th className="w-56 px-2 py-2 text-right">Registrar Pago</th>
            </tr>
          </thead>
          <tbody>
            {paymentControlLines.length === 0 && unlinkedPayments.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-sm text-slate-500">
                  {canImportFromBudget
                    ? 'Importe el presupuesto o agregue un procedimiento.'
                    : 'Agregue un procedimiento para acordar el pago y registrar abonos.'}
                </td>
              </tr>
            ) : (
              paymentControlLines.map((line) => {
                const cieOpen = openMenu?.id === line.id && openMenu.field === 'cie'
                const cupsOpen = openMenu?.id === line.id && openMenu.field === 'cups'
                const remaining = Math.max(0, lineBillablePrice(line) - paidAmountForLine(line.id, paymentControl))
                const linePayments = paymentControl.filter((payment) => payment.paymentControlLineId === line.id)
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

                return (
                  <Fragment key={line.id}>
                  <tr className="border-b border-slate-100 align-top">
                    <td className="px-2 py-1.5">
                      <input
                        id={`pay-zone-${line.id}`}
                        list="payment-zone-presets"
                        disabled={disabled}
                        value={formatAnatomicalZone(line)}
                        onChange={(event) => updateLine(line.id, parseAnatomicalZone(event.target.value))}
                        placeholder="16, 14-18, General"
                        className="input-field h-8 px-2 text-sm"
                        aria-label="Diente o zona"
                      />
                    </td>
                    <td className="relative px-2 py-1.5">
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
                        className="input-field h-8 px-2 text-sm"
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
                    </td>
                    <td className="relative px-2 py-1.5">
                      {manualProcedure ? (
                        <p className="px-1 py-1 text-sm text-slate-800" title={line.procedure || undefined}>
                          {line.procedure || 'Procedimiento personalizado'}
                          {line.cupsCode ? (
                            <span className="ml-2 font-mono text-[10px] text-slate-400">
                              {formatCupsCodeDotted(line.cupsCode)}
                            </span>
                          ) : null}
                        </p>
                      ) : (
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
                        className="input-field h-8 px-2 pr-24 text-sm"
                        aria-label="Procedimiento"
                        autoComplete="off"
                      />
                      )}
                      {!manualProcedure && line.cupsCode && !cupsOpen && (
                        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[10px] text-slate-400">
                          {formatCupsCodeDotted(line.cupsCode)}
                        </span>
                      )}
                      {!manualProcedure && cupsOpen && (
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
                    </td>
                    <td className="px-2 py-1.5">
                      <PriceCell
                        value={lineBillablePrice(line)}
                        disabled={disabled}
                        onCommit={(unitPrice) => updateLine(line.id, { unitPrice, quantity: 1 })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        <PayAmountField
                          remaining={remaining}
                          paid={lineBillablePrice(line) - remaining}
                          disabled={disabled}
                          onPay={(amount) => registerPayment(line, amount)}
                        />
                        {latestPayment && latestInvoice && (
                          <button
                            type="button"
                            aria-label="Ver factura"
                            onClick={() => openLatestInvoice(latestPayment)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
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
                            className="h-8 rounded-lg border border-rose-200 px-2 text-[11px] font-medium text-rose-800 hover:bg-rose-50"
                          >
                            Anular
                          </button>
                        )}
                        {!disabled && (
                          <button
                            type="button"
                            aria-label="Quitar procedimiento"
                            onClick={() => removeLine(line.id)}
                            className="inline-flex h-8 w-8 items-center justify-center text-slate-400 hover:text-red-600"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      {latestInvoice && paymentInvoiceStatusLabel(latestInvoice) && (
                        <p className="mt-1 text-right text-[10px] text-rose-700">
                          {paymentInvoiceStatusLabel(latestInvoice)}
                        </p>
                      )}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    <td colSpan={5} className="px-3 py-3">
                      {manualProcedure && (
                        <div className="mb-3">
                          <PaymentPlanProcedureField
                            procedure={line.procedure}
                            cupsCode={line.cupsCode}
                            totalAmount={lineBillablePrice(line)}
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
                      <PaymentAgreementFields
                        item={agreement}
                        disabled={disabled}
                        onChange={(patch) => updateAgreement(line, patch)}
                      />
                    </td>
                  </tr>
                  </Fragment>
                )
              })
            )}
            {unlinkedPayments.map((payment) => (
              <tr key={payment.id} className="border-b border-slate-100 text-slate-500">
                <td className="px-2 py-1.5">—</td>
                <td className="px-2 py-1.5">—</td>
                <td className="px-2 py-1.5">{payment.paymentReason || 'Pago'}</td>
                <td className="px-2 py-1.5 text-right">—</td>
                <td className="px-2 py-1.5 text-right text-sm tabular-nums">
                  {formatCurrency(payment.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200">
              <td colSpan={3} className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Valor Total
              </td>
              <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-slate-900">
                {formatCurrency(total)}
              </td>
              <td />
            </tr>
            <tr>
              <td colSpan={3} className="px-2 pb-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Saldo del tratamiento
              </td>
              <td className="px-2 pb-2 text-right text-sm font-semibold tabular-nums text-amber-800">
                {formatCurrency(balance)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {pendingAgreements.length > 0 && (
        <div className="mt-4 space-y-3">
          <h4 className="text-sm font-semibold text-slate-800">Acuerdos pendientes de registro clínico</h4>
          <p className="text-xs text-slate-500">
            Procedimientos acordados que todavía no tienen zona, diagnóstico ni abonos. Llévelos a la
            tabla para registrar el pago y la factura.
          </p>
          {pendingAgreements.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-3">
                <span className="font-medium text-slate-800">{item.procedure || 'Procedimiento sin nombre'}</span>
              </div>
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
                  className="input-field"
                />
              </div>
              <PaymentAgreementFields
                item={item}
                disabled={disabled}
                onChange={(patch) =>
                  onPaymentPlanChange(
                    paymentPlan.map((row) => (row.id === item.id ? { ...row, ...patch } : row)),
                  )
                }
              />
              {!disabled && (
                <div className="mt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => promoteAgreement(item)}
                    className="text-sm font-medium text-dental-700 hover:text-dental-900"
                  >
                    Llevar a la tabla
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
            </div>
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
            Forma de pago acordada para la cuota inicial, los controles y los retenedores. Los abonos
            y sus facturas se registran en el bloque de ortodoncia.
          </p>
          {orthoAgreements.map((item) => (
            <div key={item.id} className="rounded-lg border border-dental-100 bg-white p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-800">{item.procedure}</span>
                <span className="text-sm font-semibold text-dental-700">{formatCurrency(item.totalAmount)}</span>
              </div>
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
          ))}
        </div>
      )}

      {orthodonticsBudget?.active && (
        <OrthodonticsPaymentControlForm
          orthodonticsPaymentControl={orthodonticsPaymentControl}
          orthodonticsBudget={orthodonticsBudget}
          disabled={disabled}
          patientName={patientName}
          patientDocument={patientDocument}
          onViewInvoice={setInvoiceView}
          onRequestCreditNote={(paymentId, invoice) =>
            setCreditNoteTarget({ paymentId, invoice, source: 'orthodontics' })
          }
          onChange={onOrthodonticsPaymentControlChange}
        />
      )}

      {creditNoteMessage && (
        <p className="mt-3 text-sm text-dental-800">{creditNoteMessage}</p>
      )}
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
