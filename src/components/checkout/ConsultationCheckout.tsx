import { useState } from 'react'
import { FileText, Wallet } from 'lucide-react'
import type { PaymentMethod, PaymentRecord } from '@/types/clinicalRecord'
import { PAYMENT_METHOD_LABELS } from '@/constants/dental'
import { DOCUMENT_TYPES } from '@/constants/dental'
import {
  DIAN_CONSUMIDOR_FINAL,
  DIAN_FISCAL_RESPONSIBILITY_OPTIONS,
} from '@/constants/dianFiscalResponsibility'
import { LegalTooltip } from '@/components/ui/LegalTooltip'
import { FolioRechargeModal } from '@/components/invoices/FolioRechargeModal'
import { RipsShieldModal } from '@/components/rips/RipsShieldModal'
import { useConsultationCheckout } from '@/hooks/useConsultationCheckout'
import { emitChargeReceipt } from '@/services/chargeEmissionService'
import { attachAutoInvoiceToPayment } from '@/services/paymentInvoiceService'
import { printThermalReceipt, buildThermalDataFromPayment } from '@/utils/thermalInvoicePrint'
import { formatCurrency, generateId } from '@/utils'
import { useAuth } from '@/contexts/AuthContext'
import type { EvolutionNote } from '@/types/evolutionNote'
import type { BudgetLineItem } from '@/types/clinicalRecord'
import { CheckoutCart } from './CheckoutCart'
import { AestheticServiceModal } from './AestheticServiceModal'
import { FolioDepletedModal } from './FolioDepletedModal'
import type { UserProfile } from '@/types/user'

const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]

function formatDentistName(user?: UserProfile | null): string {
  if (!user) return ''
  return `${user.firstName} ${user.lastName}`.trim()
}

interface ConsultationCheckoutProps {
  disabled?: boolean
  patientId?: string
  clinicalRecordId?: string | number
  patientName?: string
  patientDocument?: string
  patientDocumentType?: string
  patientDocumentNumber?: string
  patientEmail?: string
  evolutionNotes?: EvolutionNote[]
  budgetItems?: BudgetLineItem[]
  paymentControl: PaymentRecord[]
  onPaymentRegistered: (payments: PaymentRecord[]) => void
}

export function ConsultationCheckout({
  disabled = false,
  patientId = '',
  clinicalRecordId,
  patientName = '',
  patientDocument = '',
  patientDocumentType,
  patientDocumentNumber,
  patientEmail,
  evolutionNotes,
  budgetItems,
  paymentControl,
  onPaymentRegistered,
}: ConsultationCheckoutProps) {
  const { user } = useAuth()
  const checkout = useConsultationCheckout({
    sessionId: clinicalRecordId != null ? String(clinicalRecordId) : patientId,
    patientId,
    patientDocumentType,
    patientDocumentNumber,
    patientEmail,
    evolutionNotes,
    budgetItems,
    professional: user,
  })
  const [aestheticOpen, setAestheticOpen] = useState(false)
  const [rechargeOpen, setRechargeOpen] = useState(false)
  const { state } = checkout

  const handleRegister = async () => {
    const payload = checkout.prepareRegisterPayment()
    if (!payload) return

    try {
      const reason = payload.cart.map((item) => item.name).join(' · ')
      const cupsCode = payload.cart.find((item) => item.kind === 'cups')?.cupsCode
      const draftPayment = attachAutoInvoiceToPayment(
        {
          id: generateId(),
          paymentDate: new Date().toISOString().slice(0, 10),
          amount: payload.amount,
          paymentMethod: payload.paymentMethod,
          paymentReason: reason,
          cupsCode: cupsCode ?? undefined,
          treatingDentistUserId: user?.id,
          treatingDentistName: formatDentistName(user),
          invoices: [],
        },
        user?.id,
      )
      const invoice = draftPayment.invoices[0]
      const result = await emitChargeReceipt({
        invoice,
        patientName,
        patientDocument: `${payload.buyer.documentType} ${payload.buyer.documentNumber}`.trim() || patientDocument,
        paymentReason: reason,
        cupsCode: cupsCode ?? undefined,
        amount: payload.amount,
        forceCashReceipt: payload.documentKind === 'internal_receipt',
        buyer: payload.buyer,
        cart: payload.cart,
      })
      const nextPayment: PaymentRecord = {
        ...draftPayment,
        invoices: [result.invoice],
      }
      onPaymentRegistered([...paymentControl, nextPayment])
      const thermal = buildThermalDataFromPayment({
        invoice: result.invoice,
        patientName,
        patientDocument: `${payload.buyer.documentType} ${payload.buyer.documentNumber}`.trim() || patientDocument,
        paymentReason: reason,
        paymentMethodLabel: PAYMENT_METHOD_LABELS[payload.paymentMethod],
        treatingDentistName: nextPayment.treatingDentistName,
      })
      await printThermalReceipt(thermal)
      checkout.markSuccess(result.message)
    } catch (error) {
      checkout.markError(error instanceof Error ? error.message : 'No se pudo registrar el pago.')
    }
  }

  return (
    <div className="mb-6 space-y-4 rounded-2xl border border-dental-200 bg-gradient-to-br from-white to-dental-50 p-4">
      <div>
        <h4 className="flex items-center gap-1.5 text-base font-bold text-slate-900">
          Cobro rápido al finalizar la consulta
          <LegalTooltip topic="fev" />
          <LegalTooltip topic="rips" />
        </h4>
        <p className="mt-1 text-xs text-slate-600">
          El Recibo de Control no consume folios. La Factura Electrónica DIAN consume 1 folio y
          debe coincidir peso a peso con el JSON RIPS.
        </p>
        <p className="mt-1 text-xs font-medium text-slate-600">
          Saldo de folios: {state.foliosAvailable}
        </p>
      </div>

      <CheckoutCart
        cart={state.cart}
        disabled={disabled}
        onRemove={checkout.removeLine}
        onAddAesthetic={() => setAestheticOpen(true)}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <button
          type="button"
          disabled={disabled}
          onClick={checkout.chooseInternalReceipt}
          className={`rounded-2xl border p-4 text-left transition ${
            !state.patientRequestsFev
              ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200'
              : 'border-slate-200 bg-white hover:border-amber-200'
          }`}
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileText className="h-4 w-4" aria-hidden />
            📄 Generar Recibo de Control (Uso Interno)
          </p>
          <p className="mt-1 text-xs text-slate-600">Sin API DIAN. 0 folios.</p>
        </button>

        <label
          className={`flex cursor-pointer flex-col gap-3 rounded-2xl border p-4 ${
            state.patientRequestsFev
              ? 'border-dental-500 bg-dental-50 ring-2 ring-dental-200'
              : 'border-slate-200 bg-white'
          } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-dental-700"
              disabled={disabled}
              checked={state.patientRequestsFev}
              onChange={(event) => checkout.setFevRequested(event.target.checked)}
            />
            El paciente solicita Factura Electrónica (DIAN)
            <LegalTooltip topic="dian" />
          </span>
          {state.patientRequestsFev && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs sm:col-span-1">
                <span className="label-field text-xs">Tipo de documento</span>
                <select
                  className="input-field text-sm"
                  disabled={disabled}
                  value={state.buyer.documentType}
                  onChange={(event) =>
                    checkout.setBuyer({ ...state.buyer, documentType: event.target.value })
                  }
                >
                  {DOCUMENT_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                <span className="label-field text-xs">Número de documento</span>
                <input
                  className="input-field text-sm"
                  disabled={disabled}
                  value={state.buyer.documentNumber}
                  onChange={(event) =>
                    checkout.setBuyer({ ...state.buyer, documentNumber: event.target.value })
                  }
                />
              </label>
              <label className="block text-xs sm:col-span-2">
                <span className="label-field text-xs">Correo electrónico</span>
                <input
                  className="input-field text-sm"
                  type="email"
                  disabled={disabled}
                  value={state.buyer.email}
                  onChange={(event) =>
                    checkout.setBuyer({ ...state.buyer, email: event.target.value })
                  }
                />
              </label>
              <label className="block text-xs sm:col-span-2">
                <span className="label-field text-xs">Responsabilidad fiscal</span>
                <select
                  className="input-field text-sm"
                  disabled={disabled}
                  value={state.buyer.fiscalResponsibility}
                  onChange={(event) =>
                    checkout.setBuyer({
                      ...state.buyer,
                      fiscalResponsibility: event.target.value || DIAN_CONSUMIDOR_FINAL,
                    })
                  }
                >
                  {DIAN_FISCAL_RESPONSIBILITY_OPTIONS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </label>
      </div>

      <label className="block max-w-xs text-sm">
        <span className="label-field">Forma de pago</span>
        <select
          className="input-field"
          disabled={disabled}
          value={state.paymentMethod}
          onChange={(event) => checkout.setPaymentMethod(event.target.value as PaymentMethod)}
        >
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {PAYMENT_METHOD_LABELS[method]}
            </option>
          ))}
        </select>
      </label>

      {state.lastError && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {state.lastError}
        </p>
      )}

      <button
        type="button"
        className="btn-primary w-full gap-2 py-3 text-base"
        disabled={disabled || state.status === 'submitting'}
        onClick={() => void handleRegister()}
      >
        <Wallet className="h-4 w-4" aria-hidden />
        {state.status === 'submitting'
          ? 'Registrando…'
          : `💰 Registrar Pago · ${formatCurrency(state.amountToCollect)}`}
      </button>

      <RipsShieldModal
        open={state.status === 'blocked_rips'}
        mismatches={state.shield?.mismatches ?? []}
        onChangeProcedure={checkout.closeShield}
      />
      <FolioDepletedModal
        open={Boolean(state.folioGate?.open)}
        onClose={() => {
          checkout.closeFolioGate()
          checkout.chooseInternalReceipt()
        }}
        onRecharge={() => {
          checkout.closeFolioGate()
          setRechargeOpen(true)
        }}
      />
      <FolioRechargeModal open={rechargeOpen} onClose={() => setRechargeOpen(false)} />
      <AestheticServiceModal
        open={aestheticOpen}
        onClose={() => setAestheticOpen(false)}
        onSubmit={(values) => checkout.addAestheticLine(values.name, values.unitPrice)}
      />
    </div>
  )
}
