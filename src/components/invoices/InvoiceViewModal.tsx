import { useMemo, useState } from 'react'

import { Download, Printer, X } from 'lucide-react'

import type { PaymentInvoice } from '@/types/clinicalRecord'

import type { ElectronicInvoice } from '@/types/invoice'

import type { Patient } from '@/types/patient'

import type { UserProfile } from '@/types/user'

import {

  buildHealthElectronicInvoiceDocument,

  serializeHealthElectronicInvoiceDocument,

} from '@/utils/buildHealthElectronicInvoiceDocument'

import {

  buildThermalDataFromElectronic,

  buildThermalDataFromPayment,

  printThermalReceipt,

} from '@/utils/thermalInvoicePrint'

import { ThermalInvoiceReceipt } from '@/components/invoices/ThermalInvoiceReceipt'

import { formatCurrency } from '@/utils'
import { formatRepsCodeDisplay } from '@/utils/repsCode'
import { isInvoiceDeliverableToClient } from '@/utils/fevRipsEmissionPipeline'



export type InvoiceViewMode =

  | { kind: 'electronic'; invoice: ElectronicInvoice; patient?: Patient | null; professional?: UserProfile | null }

  | {

      kind: 'payment'

      invoice: PaymentInvoice

      patientName?: string

      patientDocument?: string

      paymentReason?: string

      paymentMethodLabel?: string

      treatingDentistName?: string

      provider?: {

        businessName: string

        nitWithDv: string

        repsCode: string

        address?: string

        phone?: string

        city?: string

      }

    }



interface InvoiceViewModalProps {

  view: InvoiceViewMode | null

  onClose: () => void

}



type PreviewTab = 'detail' | 'thermal'



function downloadTextFile(filename: string, content: string, mime = 'application/json') {

  const blob = new Blob([content], { type: mime })

  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')

  anchor.href = url

  anchor.download = filename

  anchor.click()

  URL.revokeObjectURL(url)

}



export function InvoiceViewModal({ view, onClose }: InvoiceViewModalProps) {

  const [previewTab, setPreviewTab] = useState<PreviewTab>('thermal')

  const [printing, setPrinting] = useState(false)

  const [printError, setPrintError] = useState<string | null>(null)



  const electronicDocument = useMemo(() => {

    if (!view || view.kind !== 'electronic') return null

    return buildHealthElectronicInvoiceDocument({

      invoice: view.invoice,

      patient: view.patient,

      professional: view.professional,

    })

  }, [view])



  const thermalData = useMemo(() => {

    if (!view) return null

    if (view.kind === 'electronic') {

      return buildThermalDataFromElectronic(view.invoice, {

        patient: view.patient,

        professional: view.professional,

      })

    }

    return buildThermalDataFromPayment(view)

  }, [view])



  if (!view) return null



  const handlePrintThermal = async () => {

    if (!thermalData) return

    setPrinting(true)

    setPrintError(null)

    try {

      await printThermalReceipt(thermalData)

    } catch (error) {

      setPrintError(error instanceof Error ? error.message : 'No se pudo imprimir la factura.')

    } finally {

      setPrinting(false)

    }

  }



  return (

    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">

      <div

        role="dialog"

        aria-modal="true"

        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"

      >

        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">

          <div>

            <h3 className="text-lg font-bold text-slate-900">Visualizar factura</h3>

            <p className="text-sm text-slate-500">

              {view.kind === 'electronic'

                ? `FEV-Salud ${view.invoice.invoiceNumber}`

                : `Factura ${view.invoice.invoiceNumber || 'sin número'}`}

            </p>

          </div>

          <button

            type="button"

            onClick={onClose}

            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"

            aria-label="Cerrar"

          >

            <X className="h-5 w-5" />

          </button>

        </div>

        {view.kind === 'electronic' && !isInvoiceDeliverableToClient(view.invoice, true) && (
          <div className="mx-5 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Esta FEV-Salud aún no tiene CUV del Ministerio de Salud. No la entregue al paciente
            hasta radicar RIPS y enlazar el CUV en la factura.
          </div>
        )}

        <div className="border-b border-slate-200 px-5 pt-3">

          <div className="flex gap-2" role="tablist" aria-label="Formato de vista previa">

            <PreviewTabButton

              active={previewTab === 'thermal'}

              onClick={() => setPreviewTab('thermal')}

              label="Ticket 80 mm"

            />

            <PreviewTabButton

              active={previewTab === 'detail'}

              onClick={() => setPreviewTab('detail')}

              label="Detalle completo"

            />

          </div>

        </div>



        <div className="flex-1 overflow-y-auto px-5 py-4">

          {previewTab === 'thermal' && thermalData ? (

            <ThermalInvoiceReceipt data={thermalData} />

          ) : view.kind === 'electronic' ? (

            <ElectronicInvoicePreview

              invoice={view.invoice}

              document={electronicDocument}

              patient={view.patient}

            />

          ) : (

            <PaymentInvoicePreview view={view} />

          )}

        </div>



        {printError ? (

          <p className="border-t border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">{printError}</p>

        ) : null}



        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">

          <button

            type="button"

            className="btn-primary inline-flex items-center gap-2"

            onClick={() => void handlePrintThermal()}

            disabled={printing || !thermalData}

          >

            <Printer className="h-4 w-4" />

            {printing ? 'Imprimiendo…' : 'Imprimir ticket 80 mm'}

          </button>

          {view.kind === 'electronic' && electronicDocument && (

            <button

              type="button"

              className="btn-secondary inline-flex items-center gap-2"

              onClick={() =>

                downloadTextFile(

                  `FEV-${view.invoice.invoiceNumber}.json`,

                  serializeHealthElectronicInvoiceDocument(electronicDocument),

                )

              }

            >

              <Download className="h-4 w-4" />

              Descargar JSON FEV-Salud

            </button>

          )}

          {view.kind === 'payment' && view.invoice.ripsJsonSnapshot ? (
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-2"
              onClick={() =>
                downloadTextFile(
                  `RIPS-${view.invoice.invoiceNumber || 'recibo'}.json`,
                  view.invoice.ripsJsonSnapshot ?? '{}',
                )
              }
            >
              <Download className="h-4 w-4" />
              Descargar RIPS JSON
            </button>
          ) : null}

          <button type="button" onClick={onClose} className="btn-secondary">

            Cerrar

          </button>

        </div>

      </div>

    </div>

  )

}



function PreviewTabButton({

  active,

  onClick,

  label,

}: {

  active: boolean

  onClick: () => void

  label: string

}) {

  return (

    <button

      type="button"

      role="tab"

      aria-selected={active}

      onClick={onClick}

      className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${

        active

          ? 'border border-b-0 border-slate-200 bg-white text-teal-700'

          : 'text-slate-600 hover:bg-slate-50'

      }`}

    >

      {label}

    </button>

  )

}



function ElectronicInvoicePreview({

  invoice,

  document,

  patient,

}: {

  invoice: ElectronicInvoice

  document: ReturnType<typeof buildHealthElectronicInvoiceDocument> | null

  patient?: Patient | null

}) {

  if (!document) return null



  return (

    <div className="space-y-5">

      <div className="grid gap-3 sm:grid-cols-3">

        <SummaryCard label="Total factura" value={formatCurrency(invoice.netPayable)} />

        <SummaryCard label="Estado" value={invoice.status} />

        <SummaryCard label="CUV MinSalud" value={invoice.cuv || 'Pendiente'} />

      </div>



      <section className="rounded-xl border border-slate-200 p-4">

        <h4 className="mb-3 font-semibold text-slate-800">Emisor (prestador)</h4>

        <dl className="grid gap-2 text-sm sm:grid-cols-2">

          <Field label="Razón social" value={document.dian.issuer.businessName} />

          <Field label="NIT" value={`${document.dian.issuer.nit}${document.dian.issuer.nitVerificationDigit ? `-${document.dian.issuer.nitVerificationDigit}` : ''}`} />

          <Field label="Código REPS" value={formatRepsCodeDisplay(document.salud.codPrestadorReps)} />

          <Field label="Resolución DIAN" value={document.dian.issuer.billingResolution?.resolutionNumber || '—'} />

        </dl>

      </section>



      <section className="rounded-xl border border-slate-200 p-4">

        <h4 className="mb-3 font-semibold text-slate-800">Adquirente (paciente)</h4>

        <dl className="grid gap-2 text-sm sm:grid-cols-2">

          <Field label="Nombre" value={document.dian.buyer.fullName} />

          <Field label="Documento" value={`${document.dian.buyer.documentType} ${document.dian.buyer.documentNumber}`} />

          <Field label="Dirección" value={document.dian.buyer.address || patient?.address || '—'} />

          <Field label="Teléfono / correo" value={[document.dian.buyer.phone, document.dian.buyer.email].filter(Boolean).join(' · ') || '—'} />

        </dl>

      </section>



      <section className="rounded-xl border border-slate-200 p-4">

        <h4 className="mb-3 font-semibold text-slate-800">Detalle de servicios (CUPS / CIE-10)</h4>

        <div className="overflow-x-auto">

          <table className="w-full text-left text-sm">

            <thead className="border-b border-slate-200 bg-slate-50">

              <tr>

                <th className="px-2 py-2">#</th>

                <th className="px-2 py-2">Descripción</th>

                <th className="px-2 py-2">CUPS</th>

                <th className="px-2 py-2">CIE-10</th>

                <th className="px-2 py-2 text-right">Total</th>

              </tr>

            </thead>

            <tbody className="divide-y divide-slate-100">

              {document.salud.procedures.map((line) => (

                <tr key={line.lineNumber}>

                  <td className="px-2 py-2">{line.lineNumber}</td>

                  <td className="px-2 py-2">{line.description}</td>

                  <td className="px-2 py-2 font-mono text-xs">{line.cupsCode || '—'}</td>

                  <td className="px-2 py-2 font-mono text-xs">{line.cie10Code || '—'}</td>

                  <td className="px-2 py-2 text-right">{formatCurrency(line.totalAmount)}</td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </section>



      <section className="rounded-xl border border-slate-200 p-4">

        <h4 className="mb-3 font-semibold text-slate-800">Sector salud y trazabilidad</h4>

        <dl className="grid gap-2 text-sm sm:grid-cols-2">

          <Field label="Tipo usuario" value={document.salud.tipoUsuario} />

          <Field label="Modalidad de pago" value={document.salud.modalidadPago} />

          <Field label="Forma de pago DIAN" value={document.dian.paymentForm} />

          <Field label="Medio de pago" value={document.dian.paymentMeans} />

          <Field label="Subtotal" value={formatCurrency(document.economicDetail.subtotal)} />

          <Field label="Descuentos" value={formatCurrency(document.economicDetail.discountTotal)} />

          <Field
            label={`IVA excluido (${document.economicDetail.iva.tarifaPercent})`}
            value={formatCurrency(document.economicDetail.iva.valorImpuesto)}
          />

          <Field label="Copagos" value={formatCurrency(document.economicDetail.copayTotal)} />

          <Field label="Total neto" value={formatCurrency(document.economicDetail.netPayable)} />

          <Field label="HC vinculadas" value={document.clinicalTraceability.clinicalRecordIds.join(', ') || '—'} />

          <Field label="Evoluciones vinculadas" value={String(document.clinicalTraceability.evolutionNoteIds.length)} />

        </dl>

      </section>

    </div>

  )

}



function PaymentInvoicePreview({

  view,

}: {

  view: Extract<InvoiceViewMode, { kind: 'payment' }>

}) {

  const { invoice, patientName, patientDocument, paymentReason, paymentMethodLabel, treatingDentistName } =

    view



  return (

    <div className="space-y-4">

      <div className="grid gap-3 sm:grid-cols-2">

        <SummaryCard label="Número" value={invoice.invoiceNumber || '—'} />

        <SummaryCard label="Valor" value={formatCurrency(invoice.amount)} />

      </div>

      <section className="rounded-xl border border-slate-200 p-4 text-sm">

        <dl className="grid gap-2 sm:grid-cols-2">

          <Field label="Fecha" value={invoice.invoiceDate || '—'} />

          <Field label="Paciente" value={patientName || '—'} />

          <Field label="Documento" value={patientDocument || '—'} />

          <Field label="Odontólogo tratante" value={treatingDentistName || '—'} />

          <Field label="Forma de pago" value={paymentMethodLabel || '—'} />

          <Field label="Motivo del pago" value={paymentReason || '—'} />

          <Field label="IVA excluido" value={formatCurrency(0)} />

          <Field label="Observaciones" value={invoice.notes || '—'} />

        </dl>

      </section>

      <p className="text-xs text-slate-500">

        Comprobante de control de pagos. Recibo de Caja interno: emita la FEV en el portal gratuito de la DIAN si la necesita.

      </p>

    </div>

  )

}



function SummaryCard({ label, value }: { label: string; value: string }) {

  return (

    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>

      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>

    </div>

  )

}



function Field({ label, value }: { label: string; value: string }) {

  return (

    <div>

      <dt className="text-xs text-slate-500">{label}</dt>

      <dd className="font-medium text-slate-800">{value}</dd>

    </div>

  )

}


