import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Eye } from 'lucide-react'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import type { ClinicalRecordFormData, PaymentInvoice } from '@/types/clinicalRecord'
import type { Patient } from '@/types/patient'
import type { InvoiceReportPreset } from '@/types/invoiceLedger'
import {
  filterLedgerByDateRange,
  getDateRangeForPreset,
  INVOICE_SOURCE_LABELS,
  loadInvoiceLedger,
  summarizeInvoiceLedger,
} from '@/services/invoiceLedgerService'
import { createCreditNoteForPaymentInvoice, createCreditNoteForElectronicInvoice } from '@/services/creditNoteService'
import type { ElectronicInvoice } from '@/types/invoice'
import { CreditNoteModal, paymentInvoiceStatusLabel } from './CreditNoteModal'
import { formatCurrency } from '@/utils'
import { PAYMENT_METHOD_LABELS } from '@/constants/dental'
import { InvoiceViewModal, type InvoiceViewMode } from './InvoiceViewModal'

const PRESET_OPTIONS: Array<{ id: InvoiceReportPreset; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'daily', label: 'Hoy' },
  { id: 'weekly', label: 'Esta semana' },
  { id: 'monthly', label: 'Este mes' },
  { id: 'custom', label: 'Rango personalizado' },
]

interface InvoiceLedgerPanelProps {
  patientId?: string
  patient?: Patient | null
  liveClinicalData?: ClinicalRecordFormData | null
  showPatientColumn?: boolean
  title?: string
  description?: string
}

export function InvoiceLedgerPanel({
  patientId,
  patient = null,
  liveClinicalData = null,
  showPatientColumn = true,
  title = 'Mis Cuentas y Facturas',
  description = 'Facturas registradas en control de pagos y ortodoncia, en orden consecutivo por fecha y número.',
}: InvoiceLedgerPanelProps) {
  const { user } = useAuth()
  const [preset, setPreset] = useState<InvoiceReportPreset>('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [invoiceView, setInvoiceView] = useState<InvoiceViewMode | null>(null)
  const [creditNotePayment, setCreditNotePayment] = useState<{
    invoice: PaymentInvoice
    patientId: string
    recordId?: string | number
    amount: number
  } | null>(null)
  const [creditNoteElectronic, setCreditNoteElectronic] = useState<ElectronicInvoice | null>(null)
  const [creditNoteBusy, setCreditNoteBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const ledger = useLiveQuery(
    () =>
      loadInvoiceLedger({
        patientId,
        liveClinicalData,
        livePatient: patient,
      }),
    [patientId, patient, liveClinicalData],
  )

  const dateRange = useMemo(
    () => getDateRangeForPreset(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  )

  const filteredEntries = useMemo(() => {
    if (!ledger) return []
    return filterLedgerByDateRange(ledger, preset === 'all' ? null : dateRange)
  }, [ledger, dateRange, preset])

  const summary = useMemo(() => summarizeInvoiceLedger(filteredEntries), [filteredEntries])

  const openLedgerInvoice = async (entry: (typeof filteredEntries)[number]) => {
    if (entry.invoiceNumber) {
      const electronic = await db.electronicInvoices
        .where('invoiceNumber')
        .equals(entry.invoiceNumber)
        .first()
      if (electronic) {
        const linkedPatient =
          patient ?? (await db.patients.get(entry.patientRouteId || entry.patientId))
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
      patientName: entry.patientName,
      patientDocument: entry.patientDocument,
      paymentReason: entry.paymentReason,
      paymentMethodLabel: PAYMENT_METHOD_LABELS[entry.paymentMethod],
      treatingDentistName: entry.treatingDentistName,
    })
  }

  const handleCreditNoteSubmit = async (reason: string) => {
    if (!user) return
    setCreditNoteBusy(true)
    setStatusMessage(null)
    try {
      if (creditNoteElectronic) {
        const note = await createCreditNoteForElectronicInvoice(creditNoteElectronic, reason, user)
        setStatusMessage(`Nota Crédito ${note.creditNoteNumber} vinculada a FEV ${creditNoteElectronic.invoiceNumber}.`)
        setCreditNoteElectronic(null)
        return
      }
      if (creditNotePayment) {
        const note = await createCreditNoteForPaymentInvoice({
          paymentInvoice: creditNotePayment.invoice,
          reason,
          professional: user,
          patientId: creditNotePayment.patientId,
          clinicalRecordId: creditNotePayment.recordId,
        })
        setStatusMessage(`Nota Crédito ${note.creditNoteNumber} emitida correctamente.`)
        setCreditNotePayment(null)
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudo generar la Nota Crédito.')
    } finally {
      setCreditNoteBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap gap-2">
          {PRESET_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPreset(option.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                preset === option.id
                  ? 'bg-dental-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Desde</span>
              <input
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
                className="input-field"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Hasta</span>
              <input
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
                className="input-field"
              />
            </label>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Periodo</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {preset === 'all' ? 'Todas las facturas' : dateRange?.label ?? 'Seleccione un rango válido'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Facturas</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{summary.invoiceCount}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Total facturado</p>
            <p className="mt-1 text-2xl font-bold text-emerald-800">
              {formatCurrency(summary.totalAmount)}
            </p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {!ledger ? (
          <p className="p-4 text-sm text-slate-500">Cargando facturas...</p>
        ) : filteredEntries.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">
            No hay facturas registradas para el periodo seleccionado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 font-medium text-slate-600">#</th>
                  <th className="px-3 py-2 font-medium text-slate-600">Nº factura</th>
                  <th className="px-3 py-2 font-medium text-slate-600">Fecha</th>
                  {showPatientColumn && (
                    <th className="px-3 py-2 font-medium text-slate-600">Paciente</th>
                  )}
                  <th className="px-3 py-2 font-medium text-slate-600">Motivo del pago</th>
                  <th className="px-3 py-2 font-medium text-slate-600">Origen</th>
                  <th className="px-3 py-2 font-medium text-slate-600">Estado</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">Monto</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.map((entry, index) => {
                  const voidedLabel = paymentInvoiceStatusLabel(entry.invoice)
                  const canCreditNotePayment =
                    !entry.isDraft &&
                    entry.invoice.invoiceNumber?.trim() &&
                    entry.invoice.status !== 'voided_by_credit_note'

                  return (
                  <tr key={entry.key}>
                    <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{entry.invoiceNumber}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                      {entry.invoiceDate
                        ? new Date(entry.invoiceDate).toLocaleDateString('es-CO')
                        : '—'}
                    </td>
                    {showPatientColumn && (
                      <td className="px-3 py-2">
                        {entry.patientRouteId ? (
                          <Link
                            to={`/pacientes/${entry.patientRouteId}`}
                            className="font-medium text-dental-700 hover:underline"
                          >
                            {entry.patientName}
                          </Link>
                        ) : (
                          entry.patientName
                        )}
                        <p className="text-xs text-slate-500">{entry.patientDocument}</p>
                      </td>
                    )}
                    <td className="px-3 py-2 text-slate-600">{entry.paymentReason || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {INVOICE_SOURCE_LABELS[entry.source]}
                    </td>
                    <td className="px-3 py-2">
                      {voidedLabel ? (
                        <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
                          {voidedLabel}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            entry.isDraft
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {entry.isDraft ? 'Borrador' : 'Registrada'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800">
                      {formatCurrency(entry.amount)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void openLedgerInvoice(entry)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver factura
                        </button>
                        {canCreditNotePayment && user && (
                          <button
                            type="button"
                            onClick={() =>
                              setCreditNotePayment({
                                invoice: entry.invoice,
                                patientId: entry.patientId,
                                recordId: entry.recordId,
                                amount: entry.amount,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100"
                          >
                            Nota Crédito
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {statusMessage && (
        <div className="rounded-xl border border-dental-200 bg-dental-50 px-4 py-3 text-sm text-dental-900">
          {statusMessage}
        </div>
      )}
      <CreditNoteModal
        open={creditNotePayment != null || creditNoteElectronic != null}
        invoiceNumber={
          creditNoteElectronic?.invoiceNumber ??
          creditNotePayment?.invoice.invoiceNumber ??
          ''
        }
        amount={creditNoteElectronic?.netPayable ?? creditNotePayment?.amount}
        busy={creditNoteBusy}
        onClose={() => {
          setCreditNotePayment(null)
          setCreditNoteElectronic(null)
        }}
        onSubmit={handleCreditNoteSubmit}
      />
      <InvoiceViewModal view={invoiceView} onClose={() => setInvoiceView(null)} />
    </div>
  )
}
