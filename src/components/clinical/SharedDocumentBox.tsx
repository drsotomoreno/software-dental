import { useMemo, useState } from 'react'
import type {
  OrthodonticsBudget,
  OrthodonticsPaymentRecord,
  PaymentControlLine,
  PaymentDocumentKind,
  PaymentRecord,
} from '@/types/clinicalRecord'
import { formatCupsCodeDotted } from '@/services/catalogService'
import { formatCurrency } from '@/utils'
import { getOrthodonticsControlNumbers, getPaidControlNumbers } from '@/utils/orthodonticsPaymentConcepts'
import { lineBillablePrice } from '@/utils/paymentControlLines'
import {
  emptyManualSharedEntry,
  importableSectionProcedures,
  orthodonticsEntryMax,
  orthodonticsSelectionOptions,
  prepareSharedDocument,
  remainingOfPaymentLine,
  sharedEntryFromOrthodontics,
  sharedEntryFromSection,
  sharedOrthodonticsProcedure,
  type OrthodonticsSharedKind,
  type PreparedSharedDocument,
  type SharedDocumentEntry,
} from '@/utils/sharedDocumentBox'
import { PaymentPlanProcedureField } from './PaymentPlanProcedureField'

interface SharedDocumentBoxProps {
  lines: PaymentControlLine[]
  payments: PaymentRecord[]
  orthodonticsBudget?: OrthodonticsBudget
  orthodonticsPayments?: OrthodonticsPaymentRecord[]
  disabled?: boolean
  busy?: boolean
  onRegister: (input: {
    paymentDate: string
    document: PreparedSharedDocument
  }) => Promise<boolean>
}

function todayIso(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function parseAmount(value: string): number {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return 0
  const parsed = Number(digits)
  return Number.isFinite(parsed) ? parsed : 0
}

export function SharedDocumentBox({
  lines,
  payments,
  orthodonticsBudget,
  orthodonticsPayments = [],
  disabled = false,
  busy = false,
  onRegister,
}: SharedDocumentBoxProps) {
  const [documentKind, setDocumentKind] = useState<PaymentDocumentKind>('recibo_interno')
  const [paymentDate, setPaymentDate] = useState(todayIso)
  const [entries, setEntries] = useState<SharedDocumentEntry[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const importedIds = useMemo(
    () => entries.map((entry) => entry.sourceLineId).filter((id): id is string => Boolean(id)),
    [entries],
  )
  const options = useMemo(
    () => importableSectionProcedures(lines, payments, importedIds, lineBillablePrice),
    [lines, payments, importedIds],
  )
  const orthoOptions = useMemo(() => {
    const takenKinds = entries.flatMap((entry) =>
      entry.orthodonticsKind ? [entry.orthodonticsKind] : [],
    )
    const reservedAmount = entries
      .filter((entry) => entry.origin === 'orthodontics')
      .reduce((sum, entry) => sum + Math.max(0, Math.round(entry.amount || 0)), 0)
    return orthodonticsSelectionOptions({
      budget: orthodonticsBudget,
      payments: orthodonticsPayments,
      takenKinds,
      reservedAmount,
    })
  }, [entries, orthodonticsBudget, orthodonticsPayments])
  const controlNumbers = orthodonticsBudget ? getOrthodonticsControlNumbers(orthodonticsBudget) : []
  const paidControls = useMemo(
    () => new Set(getPaidControlNumbers(orthodonticsPayments)),
    [orthodonticsPayments],
  )
  const total = entries.reduce((sum, entry) => sum + Math.max(0, Math.round(entry.amount || 0)), 0)
  const documentLabel = documentKind === 'factura' ? 'FEV' : 'recibo de caja interno'

  const updateEntry = (id: string, patch: Partial<SharedDocumentEntry>) => {
    setError(null)
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
  }

  const removeEntry = (id: string) => {
    setError(null)
    setEntries((current) => current.filter((entry) => entry.id !== id))
  }

  const importOption = (lineId: string) => {
    const option = options.find((item) => item.lineId === lineId)
    if (!option) return
    setError(null)
    setEntries((current) =>
      current.some((entry) => entry.sourceLineId === option.lineId)
        ? current
        : [...current, sharedEntryFromSection(option)],
    )
  }

  const importOrthodontics = (kind: OrthodonticsSharedKind) => {
    const option = orthoOptions.find((item) => item.kind === kind)
    if (!option?.available) return
    setError(null)
    setEntries((current) =>
      current.some((entry) => entry.orthodonticsKind === option.kind)
        ? current
        : [...current, sharedEntryFromOrthodontics(option)],
    )
  }

  const handleRegister = async () => {
    if (disabled || busy) return
    if (!paymentDate) {
      setError('Indique la fecha del comprobante.')
      return
    }
    const prepared = prepareSharedDocument({
      entries,
      documentKind,
      lines,
      payments,
      billable: lineBillablePrice,
      orthodontics: {
        budget: orthodonticsBudget,
        payments: orthodonticsPayments,
      },
    })
    if (!prepared.ok) {
      setError(prepared.message)
      return
    }
    setError(null)
    const saved = await onRegister({ paymentDate, document: prepared.document })
    if (saved) {
      setEntries([])
      setImportOpen(false)
    }
  }

  return (
    <article className="mt-6 rounded-xl border border-dental-200 bg-white p-4 shadow-sm print:hidden">
      <header className="mb-4">
        <h3 className="text-xl font-bold text-dental-800">
          Agrupar Multiples Procedimientos en un Solo Pago
        </h3>
        <h4 className="mt-1 text-sm font-semibold text-slate-900">
          Varios procedimientos en una FEV o en un recibo de caja interno
        </h4>
        <p className="mt-1 text-xs text-slate-500">
          Elija el tipo de comprobante. Todos los procedimientos de esta caja salen con el mismo
          número. Puede importarlos desde esta sección, incluir un cobro de ortodoncia o
          agregarlos manualmente.
        </p>
      </header>

      <fieldset disabled={disabled || busy} className="mb-4">
        <legend className="mb-2 text-sm font-medium text-slate-700">Tipo de comprobante</legend>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tipo de comprobante">
          <button
            type="button"
            role="radio"
            aria-checked={documentKind === 'recibo_interno'}
            onClick={() => setDocumentKind('recibo_interno')}
            className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
              documentKind === 'recibo_interno'
                ? 'border-dental-600 bg-dental-50 ring-2 ring-dental-200'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <span className="block font-semibold text-slate-900">Recibo de caja interno</span>
            <span className="mt-0.5 block text-xs text-slate-500">Un número de caja, sin folio DIAN</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={documentKind === 'factura'}
            onClick={() => setDocumentKind('factura')}
            className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
              documentKind === 'factura'
                ? 'border-dental-600 bg-dental-50 ring-2 ring-dental-200'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <span className="block font-semibold text-slate-900">FEV</span>
            <span className="mt-0.5 block text-xs text-slate-500">Factura electrónica de venta</span>
          </button>
        </div>
      </fieldset>

      <label className="mb-4 block max-w-xs text-sm">
        <span className="mb-1 block font-medium text-slate-700">Fecha</span>
        <input
          type="date"
          disabled={disabled || busy}
          className="input-field"
          value={paymentDate}
          onChange={(event) => setPaymentDate(event.target.value)}
        />
      </label>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => setImportOpen((open) => !open)}
          className="btn-secondary text-xs"
          aria-expanded={importOpen}
        >
          Importar de esta sección
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => {
            setError(null)
            setEntries((current) => [...current, emptyManualSharedEntry()])
          }}
          className="btn-primary text-xs"
        >
          Agregar manualmente
        </button>
      </div>

      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
          Ortodoncia
        </p>
        <ul className="space-y-1">
          {orthoOptions.map((option) => (
            <li key={option.kind}>
              <button
                type="button"
                disabled={disabled || busy || !option.available}
                onClick={() => importOrthodontics(option.kind)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{option.label}</span>
                  {option.available && option.kind === 'control' && option.controlNumber ? (
                    <span className="text-[11px] text-slate-500">Control #{option.controlNumber}</span>
                  ) : null}
                  {option.available && option.cap == null ? (
                    <span className="block text-[11px] text-slate-500">Indique el valor al agregarlo</span>
                  ) : null}
                  {!option.available && option.unavailableReason ? (
                    <span className="block text-[11px] text-slate-500">{option.unavailableReason}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-800">
                  {option.cap == null ? 'Agregar' : option.available ? formatCurrency(option.remaining) : '—'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {importOpen && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Procedimientos de esta sección
          </p>
          {options.length === 0 ? (
            <p className="text-xs text-slate-500">
              No hay procedimientos con saldo pendiente para importar. Puede agregarlos manualmente.
            </p>
          ) : (
            <ul className="space-y-1">
              {options.map((option) => (
                <li key={option.lineId}>
                  <button
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => importOption(option.lineId)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-white"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">{option.procedure}</span>
                      {option.cupsCode ? (
                        <span className="font-mono text-[11px] text-slate-500">
                          {formatCupsCodeDotted(option.cupsCode)}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-dental-800">
                      {formatCurrency(option.remaining)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
          Esta caja está vacía. Importe procedimientos de esta sección o agréguelos manualmente para
          que compartan un mismo número de {documentLabel}.
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry, index) => {
            const source =
              entry.origin === 'section'
                ? lines.find((line) => line.id === entry.sourceLineId)
                : undefined
            const procedureName = source?.procedure.trim() || entry.procedure.trim() || 'Sin nombre'
            const sectionRemaining = source
              ? remainingOfPaymentLine(source, payments, lineBillablePrice)
              : null
            const orthoMax =
              entry.origin === 'orthodontics'
                ? orthodonticsEntryMax(entry, entries, orthodonticsBudget, orthodonticsPayments)
                : null
            return (
              <li key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Procedimiento {index + 1} ·{' '}
                      {entry.origin === 'section'
                        ? 'De esta sección'
                        : entry.origin === 'orthodontics'
                          ? 'Ortodoncia'
                          : 'Manual'}
                    </p>
                    {entry.origin === 'section' && source && (
                      <p className="text-sm font-medium text-slate-900">
                        {procedureName}
                        {source.cupsCode ? (
                          <span className="ml-2 font-mono text-[11px] font-normal text-slate-500">
                            {formatCupsCodeDotted(source.cupsCode)}
                          </span>
                        ) : null}
                      </p>
                    )}
                    {entry.origin === 'section' && !source && (
                      <p className="text-sm text-rose-700">
                        Este procedimiento ya no está en la sección.
                      </p>
                    )}
                    {entry.origin === 'orthodontics' && (
                      <p className="text-sm font-medium text-slate-900">
                        {entry.procedure || 'Ortodoncia'}
                        {entry.cupsCode ? (
                          <span className="ml-2 font-mono text-[11px] font-normal text-slate-500">
                            {formatCupsCodeDotted(entry.cupsCode)}
                          </span>
                        ) : null}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => removeEntry(entry.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Quitar
                  </button>
                </div>

                {entry.origin === 'orthodontics' && entry.orthodonticsKind === 'control' && (
                  <label className="mt-2 block max-w-xs text-sm">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Número de control</span>
                    {controlNumbers.length > 0 ? (
                      <select
                        disabled={disabled || busy}
                        className="input-field bg-white"
                        value={entry.controlNumber ?? controlNumbers[0]}
                        onChange={(event) => {
                          const controlNumber = Math.max(1, Math.round(Number(event.target.value) || 1))
                          updateEntry(entry.id, {
                            controlNumber,
                            procedure: sharedOrthodonticsProcedure('control', controlNumber),
                          })
                        }}
                      >
                        {controlNumbers.map((number) => (
                          <option key={number} value={number}>
                            Control #{number}
                            {paidControls.has(number) ? ' (ya pagado)' : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        disabled={disabled || busy}
                        className="input-field bg-white"
                        value={entry.controlNumber ?? 1}
                        onChange={(event) => {
                          const controlNumber = Math.max(1, Math.round(Number(event.target.value) || 1))
                          updateEntry(entry.id, {
                            controlNumber,
                            procedure: sharedOrthodonticsProcedure('control', controlNumber),
                          })
                        }}
                      />
                    )}
                  </label>
                )}

                {entry.origin === 'manual' && (
                  <PaymentPlanProcedureField
                    procedure={entry.procedure}
                    cupsCode={entry.cupsCode}
                    totalAmount={entry.amount}
                    disabled={disabled || busy}
                    onChange={(patch) =>
                      updateEntry(entry.id, {
                        procedure: patch.procedure,
                        cupsCode: patch.cupsCode,
                        amount:
                          patch.totalAmount != null && patch.totalAmount > 0
                            ? patch.totalAmount
                            : entry.amount,
                      })
                    }
                  />
                )}

                <label className="mt-3 block max-w-xs text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    Valor en este {documentLabel}
                  </span>
                  <input
                    inputMode="numeric"
                    disabled={disabled || busy}
                    aria-label={`Valor de ${procedureName}`}
                    className="input-field bg-white text-right tabular-nums"
                    value={entry.amount ? String(entry.amount) : ''}
                    onChange={(event) => updateEntry(entry.id, { amount: parseAmount(event.target.value) })}
                  />
                  {sectionRemaining != null && (
                    <span className="mt-1 block text-[11px] text-slate-500">
                      Saldo en la sección: {formatCurrency(sectionRemaining)}
                    </span>
                  )}
                  {orthoMax != null && (
                    <span className="mt-1 block text-[11px] text-slate-500">
                      Máximo en este comprobante: {formatCurrency(orthoMax)}
                    </span>
                  )}
                </label>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
        <p className="text-sm text-slate-700">
          {entries.length} procedimiento{entries.length === 1 ? '' : 's'} · Total{' '}
          <span className="font-semibold tabular-nums">{formatCurrency(total)}</span>
          <span className="mt-0.5 block text-[11px] text-slate-500">
            {entries.length === 1
              ? 'Agregue al menos otro procedimiento para compartir el número.'
              : `Un solo número de ${documentLabel} para todas las líneas.`}
          </span>
        </p>
        <button
          type="button"
          disabled={disabled || busy || entries.length < 2}
          onClick={() => {
            void handleRegister()
          }}
          className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Generando…' : documentKind === 'factura' ? 'Generar FEV' : 'Generar recibo de caja'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}
    </article>
  )
}
