import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import type { ElectronicInvoice } from '@/types/invoice'
import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { Patient } from '@/types/patient'
import type { InvoiceValidationIssue } from '@/types/invoice'
import {
  buildInvoiceDraftFromClinicalRecord,
  compileInvoiceRipsPackage,
  listElectronicInvoices,
  saveElectronicInvoice,
  submitInvoiceToMinistry,
  validateInvoiceDraft,
} from '@/services/invoiceService'
import { createCatalogLookupFromServices } from '@/utils/ripsCompiler'
import { downloadRipsJson } from '@/utils/rips'
import { downloadDianXml as downloadDianXmlApi } from '@/services/ripsApiService'
import { formatCurrency } from '@/utils'
import { isInvoiceItemRipsEligible } from '@/utils/buildRipsJson'
import { hasBlockingInvoiceIssues } from '@/utils/invoiceValidation'
import {
  hasBlockingEmissionGateIssues,
  validateInvoiceEmissionGate,
} from '@/utils/invoiceEmissionGate'
import { InvoiceViewModal, type InvoiceViewMode } from './InvoiceViewModal'
import { FolioRechargeModal } from './FolioRechargeModal'
import { FOLIO_DEPLETED_MESSAGE } from '@/types/billingModality'
import {
  BILLING_SETTINGS_CHANGED_EVENT,
  getFolioBalanceLabel,
  getFoliosAvailable,
  usesManualCashReceipt,
  usesProviderEmission,
} from '@/services/billingModalityService'
import {
  buildThermalDataFromElectronic,
  printThermalReceipt,
} from '@/utils/thermalInvoicePrint'
import { CreditNoteModal, electronicInvoiceStatusLabel } from './CreditNoteModal'
import { createCreditNoteForElectronicInvoice } from '@/services/creditNoteService'

interface ElectronicInvoicePanelProps {
  patientId?: string
  patient?: Patient | null
  clinicalRecord?: ClinicalRecord | null
}

export function ElectronicInvoicePanel({
  patientId,
  patient = null,
  clinicalRecord = null,
}: ElectronicInvoicePanelProps) {
  const { user } = useAuth()
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [draft, setDraft] = useState<ElectronicInvoice | null>(null)
  const [validationIssues, setValidationIssues] = useState<InvoiceValidationIssue[]>([])
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [invoiceView, setInvoiceView] = useState<InvoiceViewMode | null>(null)
  const [creditNoteInvoice, setCreditNoteInvoice] = useState<ElectronicInvoice | null>(null)
  const [creditNoteBusy, setCreditNoteBusy] = useState(false)
  const [rechargeOpen, setRechargeOpen] = useState(false)
  const [folioLabel, setFolioLabel] = useState(() => getFolioBalanceLabel())
  const [electronicEnabled, setElectronicEnabled] = useState(() => usesProviderEmission())
  const [foliosDepleted, setFoliosDepleted] = useState(() => getFoliosAvailable() <= 0)

  const dentalServices = useLiveQuery(() => db.dentalServices.toArray(), [])
  const storedInvoices = useLiveQuery(() => {
    if (patientId) {
      return db.electronicInvoices.where('patientId').equals(patientId).sortBy('issueDate')
    }
    return listElectronicInvoices()
  }, [patientId])

  useEffect(() => {
    const refresh = () => {
      setFolioLabel(getFolioBalanceLabel())
      setElectronicEnabled(usesProviderEmission())
      setFoliosDepleted(getFoliosAvailable() <= 0)
    }
    window.addEventListener(BILLING_SETTINGS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(BILLING_SETTINGS_CHANGED_EVENT, refresh)
  }, [])

  const catalogLookup = useMemo(
    () => (dentalServices ? createCatalogLookupFromServices(dentalServices) : undefined),
    [dentalServices],
  )

  const canGenerate = Boolean(user && patient && clinicalRecord && invoiceNumber.trim())

  const handleBuildDraft = async () => {
    if (!user || !patient || !clinicalRecord || !patientId) return
    setBusy(true)
    setStatusMessage(null)
    try {
      const invoice = buildInvoiceDraftFromClinicalRecord({
        patientId,
        clinicalRecordId: clinicalRecord.id ?? '',
        patient,
        record: clinicalRecord,
        professional: user,
        invoiceNumber: invoiceNumber.trim(),
        catalogLookup,
        includeConsultation: true,
        consultationUnitPrice: 0,
      })
      const validation = await validateInvoiceDraft(invoice, user)
      const emissionIssues = validateInvoiceEmissionGate(
        invoice,
        [{ record: clinicalRecord, patient }],
        {
          requireCuv: false,
          requireSignedEvolutions: true,
          requireSignedClinicalRecord: true,
        },
      )
      setDraft(invoice)
      setValidationIssues([...validation, ...emissionIssues])
      await saveElectronicInvoice(invoice)
      setStatusMessage('Borrador de factura generado y guardado localmente.')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudo generar el borrador.')
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = async (forceCashReceipt = false) => {
    if (!user || !draft || !patient) return
    setBusy(true)
    setStatusMessage(null)
    try {
      if (forceCashReceipt || usesManualCashReceipt()) {
        const result = await submitInvoiceToMinistry(
          draft,
          [{ record: clinicalRecord ?? ({} as ClinicalRecord), patient }],
          user,
          catalogLookup,
          { forceCashReceipt: true },
        )
        setDraft(result.invoice)
        setValidationIssues(result.validationIssues)
        await printThermalReceipt(
          buildThermalDataFromElectronic(result.invoice, { patient, professional: user }),
        )
        setStatusMessage(
          foliosDepleted && !forceCashReceipt
            ? FOLIO_DEPLETED_MESSAGE
            : 'Recibo de Caja interno de 80 mm listo. No se descontó ningún folio.',
        )
        return
      }

      const result = await submitInvoiceToMinistry(
        draft,
        [{ record: clinicalRecord ?? ({} as ClinicalRecord), patient }],
        user,
        catalogLookup,
      )
      setDraft(result.invoice)
      setValidationIssues(result.validationIssues)
      setFolioLabel(getFolioBalanceLabel())
      setElectronicEnabled(usesProviderEmission())
      setFoliosDepleted(getFoliosAvailable() <= 0)
      if (result.invoice.cufe) {
        await printThermalReceipt(
          buildThermalDataFromElectronic(result.invoice, { patient, professional: user }),
        )
      }
      if (result.ministryResponse.success && result.ministryResponse.approved) {
        const folioNote = result.folioConsumed ? ' · Se descontó 1 folio.' : ''
        const cufeNote = result.invoice.cufe ? ` · CUFE ${result.invoice.cufe.slice(0, 12)}…` : ''
        setStatusMessage(`CUV aprobado: ${result.ministryResponse.cuv}${cufeNote}${folioNote}`)
        if (result.ministryResponse.dianXml) {
          downloadDianXmlApi(result.ministryResponse.dianXml, draft.invoiceNumber)
        }
      } else if (result.invoice.cufe) {
        setStatusMessage(
          `Factura firmada con CUFE y QR DIAN.${result.folioConsumed ? ' Se descontó 1 folio.' : ''} ${result.ministryResponse.error ?? ''}`.trim(),
        )
      } else {
        setStatusMessage(result.ministryResponse.error ?? 'El envío a MUV fue rechazado.')
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Error al emitir.')
    } finally {
      setBusy(false)
    }
  }

  const handleDownloadRips = () => {
    if (!user || !draft || !patient || !clinicalRecord) return
    const compiled = compileInvoiceRipsPackage(
      draft,
      [{ record: clinicalRecord, patient }],
      user,
      catalogLookup,
    )
    downloadRipsJson(compiled.rips, draft.invoiceNumber)
  }

  const ripsLines = draft?.items.filter(isInvoiceItemRipsEligible) ?? []
  const dianOnlyLines = draft?.items.filter((item) => !isInvoiceItemRipsEligible(item)) ?? []

  const handleCreditNoteSubmit = async (reason: string) => {
    if (!user || !creditNoteInvoice) return
    setCreditNoteBusy(true)
    setStatusMessage(null)
    try {
      const note = await createCreditNoteForElectronicInvoice(creditNoteInvoice, reason, user)
      if (draft?.id === creditNoteInvoice.id) {
        setDraft({
          ...creditNoteInvoice,
          status: 'voided_by_credit_note',
          creditNoteId: note.id,
          creditNoteNumber: note.creditNoteNumber,
          voidReason: reason.trim(),
          updatedAt: new Date().toISOString(),
        })
      }
      setStatusMessage(
        `Nota Crédito ${note.creditNoteNumber} emitida. Factura ${creditNoteInvoice.invoiceNumber} anulada formalmente.`,
      )
      setCreditNoteInvoice(null)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudo generar la Nota Crédito.')
    } finally {
      setCreditNoteBusy(false)
    }
  }

  const canCreditNote = (invoice: ElectronicInvoice) =>
    invoice.status !== 'draft' &&
    invoice.status !== 'rejected' &&
    invoice.status !== 'voided_by_credit_note'

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Facturación electrónica FEV-Salud</h2>
        <p className="mt-1 text-sm text-slate-600">
          Genera la FEV DIAN con soporte RIPS JSON. Cada factura electrónica consume 1 folio. El
          Recibo de Caja interno de 80 mm no tiene costo de folios.
        </p>
        <p className="mt-2 text-sm font-medium text-slate-700">{folioLabel}</p>
        {foliosDepleted && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p>{FOLIO_DEPLETED_MESSAGE}</p>
            <button
              type="button"
              className="mt-2 font-semibold text-dental-800 underline"
              onClick={() => setRechargeOpen(true)}
            >
              Recargar Paquete de Facturas
            </button>
          </div>
        )}
      </div>

      <div className="card space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Número FEV (consecutivo autorizado)</span>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              placeholder="Ej: FV00012345"
              className="input-field"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={!canGenerate || busy}
              onClick={handleBuildDraft}
              className="btn-primary w-full sm:w-auto"
            >
              Compilar borrador
            </button>
          </div>
        </div>

        {!clinicalRecord && patientId && (
          <p className="text-sm text-amber-700">
            Seleccione o abra una historia clínica firmada para compilar la factura desde evoluciones y
            presupuesto.
          </p>
        )}
      </div>

      {draft && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase text-slate-500">Total DIAN</p>
              <p className="text-xl font-bold text-slate-900">{formatCurrency(draft.netPayable)}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs uppercase text-emerald-700">Total RIPS (CUPS)</p>
              <p className="text-xl font-bold text-emerald-800">
                {formatCurrency(draft.ripsReportableTotal)}
              </p>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
              <p className="text-xs uppercase text-violet-700">Líneas RIPS</p>
              <p className="text-xl font-bold text-violet-800">{ripsLines.length}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs uppercase text-amber-700">Solo DIAN</p>
              <p className="text-xl font-bold text-amber-800">{dianOnlyLines.length}</p>
            </div>
          </div>

          <div className="card overflow-hidden p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Descripción</th>
                  <th className="px-3 py-2">CUPS</th>
                  <th className="px-3 py-2">CIE-10</th>
                  <th className="px-3 py-2">RIPS</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {draft.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">{item.lineNumber}</td>
                    <td className="px-3 py-2">{item.description}</td>
                    <td className="px-3 py-2 font-mono text-xs">{item.cupsCode || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{item.cie10Code || '—'}</td>
                    <td className="px-3 py-2">
                      {isInvoiceItemRipsEligible(item) ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                          Sí
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          Solo DIAN
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatCurrency(item.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {validationIssues.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="mb-2 font-semibold text-slate-800">Validaciones</p>
              <ul className="space-y-1">
                {validationIssues.map((issue, index) => (
                  <li key={`${issue.field ?? 'issue'}-${index}`} className="text-slate-700">
                    {issue.level === 'error' ? '✕' : '⚠'} {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-2"
              onClick={() =>
                setInvoiceView({
                  kind: 'electronic',
                  invoice: draft,
                  patient,
                  professional: user,
                })
              }
            >
              <Eye className="h-4 w-4" />
              Visualizar factura
            </button>
            <button type="button" className="btn-secondary" onClick={handleDownloadRips} disabled={busy}>
              Descargar RIPS JSON
            </button>
            {draft && canCreditNote(draft) && (
              <button
                type="button"
                className="btn-secondary border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                onClick={() => setCreditNoteInvoice(draft)}
                disabled={busy}
              >
                Anular con Nota Crédito
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleSubmit(false)}
              disabled={
                busy ||
                hasBlockingInvoiceIssues(validationIssues) ||
                hasBlockingEmissionGateIssues(validationIssues)
              }
            >
              {electronicEnabled
                ? 'Emitir factura electrónica'
                : 'Imprimir Recibo de Caja 80 mm'}
            </button>
            {electronicEnabled && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void handleSubmit(true)}
                disabled={
                  busy ||
                  hasBlockingInvoiceIssues(validationIssues) ||
                  hasBlockingEmissionGateIssues(validationIssues)
                }
              >
                Recibo de Caja interno 80 mm ($0)
              </button>
            )}
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="rounded-xl border border-dental-200 bg-dental-50 px-4 py-3 text-sm text-dental-900">
          {statusMessage}
        </div>
      )}

      {storedInvoices && storedInvoices.length > 0 && (
        <div className="card">
          <h3 className="mb-3 font-semibold text-slate-800">Facturas electrónicas guardadas</h3>
          <div className="space-y-2 text-sm">
            {storedInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
              >
                <div>
                  <p className="font-medium text-slate-800">{invoice.invoiceNumber}</p>
                  <p className="text-xs text-slate-500">
                    {invoice.issueDate} · {electronicInvoiceStatusLabel(invoice)}
                    {invoice.cuv ? ` · CUV ${invoice.cuv}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() =>
                      setInvoiceView({
                        kind: 'electronic',
                        invoice,
                        patient: patient ?? null,
                        professional: user,
                      })
                    }
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Ver
                  </button>
                  {canCreditNote(invoice) && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100"
                      onClick={() => setCreditNoteInvoice(invoice)}
                    >
                      Nota Crédito
                    </button>
                  )}
                  <div className="text-right">
                    <p className="font-semibold text-slate-800">{formatCurrency(invoice.netPayable)}</p>
                    {!patientId && (
                      <Link
                        to={`/pacientes/${invoice.patientId}`}
                        className="text-xs text-dental-700 hover:underline"
                      >
                        Ver paciente
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <CreditNoteModal
        open={creditNoteInvoice != null}
        invoiceNumber={creditNoteInvoice?.invoiceNumber ?? ''}
        amount={creditNoteInvoice?.netPayable}
        busy={creditNoteBusy}
        onClose={() => setCreditNoteInvoice(null)}
        onSubmit={handleCreditNoteSubmit}
      />
      <InvoiceViewModal view={invoiceView} onClose={() => setInvoiceView(null)} />
      <FolioRechargeModal
        open={rechargeOpen}
        onClose={() => setRechargeOpen(false)}
        onPurchased={() => {
          setFolioLabel(getFolioBalanceLabel())
          setElectronicEnabled(usesProviderEmission())
          setFoliosDepleted(getFoliosAvailable() <= 0)
        }}
      />
    </div>
  )
}
