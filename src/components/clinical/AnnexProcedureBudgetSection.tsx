import { useMemo, useState } from 'react'
import { PaymentAgreementFields } from '@/components/clinical/PaymentAgreementFields'
import { PaymentPlanProcedureField } from '@/components/clinical/PaymentPlanProcedureField'
import {
  annexProcedureLineSubtotal,
  createBlankAnnexProcedureBudgetLine,
  type AnnexProcedureBudget,
  type AnnexProcedureBudgetLine,
} from '@/types/annexProcedureBudget'
import { formatCurrency, generateId } from '@/utils'
import { VoiceDictationButton } from '@/components/voice'
import { parseDictatedInteger, parseDictatedNumber } from '@/utils/voiceDictation'

export interface AnnexProcedureBudgetSectionProps {
  title: string
  description?: string
  value: AnnexProcedureBudget
  onChange: (value: AnnexProcedureBudget) => void
  disabled?: boolean
  importButtonLabel?: string
  onImport?: () => { added: number; skipped: number }
  canImport?: boolean
  emptyHint?: string
  className?: string
}

function parseNonNegative(raw: string): number {
  const parsed = Number(raw.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed)
}

export function AnnexProcedureBudgetSection({
  title,
  description,
  value,
  onChange,
  disabled = false,
  importButtonLabel = 'Importar',
  onImport,
  canImport = false,
  emptyHint = 'Importe procedimientos o agregue uno manualmente.',
  className = '',
}: AnnexProcedureBudgetSectionProps) {
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const total = useMemo(
    () =>
      value.active
        ? value.lines.reduce((sum, line) => sum + annexProcedureLineSubtotal(line), 0)
        : 0,
    [value],
  )

  const updateBudget = (patch: Partial<AnnexProcedureBudget>) => {
    onChange({ ...value, ...patch })
  }

  const updateLine = (id: string, patch: Partial<AnnexProcedureBudgetLine>) => {
    updateBudget({
      lines: value.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    })
  }

  const removeLine = (id: string) => {
    updateBudget({ lines: value.lines.filter((line) => line.id !== id) })
  }

  const addProcedure = () => {
    updateBudget({
      active: true,
      lines: [
        ...value.lines,
        createBlankAnnexProcedureBudgetLine({
          id: generateId(),
          procedure: '',
          source: 'manual',
        }),
      ],
    })
    setImportNotice(null)
  }

  const handleImport = () => {
    if (!onImport) return
    const result = onImport()
    if (result.added > 0) {
      setImportNotice(
        `Se agregaron ${result.added} procedimiento${result.added === 1 ? '' : 's'} del esquema de planificación.`,
      )
    } else if (result.skipped > 0) {
      setImportNotice('Los procedimientos del esquema ya están en el presupuesto.')
    } else {
      setImportNotice('No hay procedimientos planificados para importar.')
    }
  }

  return (
    <section
      className={`rounded-2xl border border-rose-200 bg-rose-50/30 p-4 shadow-sm ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-rose-100 pb-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-rose-950">{title}</h4>
          {description ? <p className="mt-1 text-xs text-rose-800/80">{description}</p> : null}
        </div>
        <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-slate-700">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.active}
            onChange={(event) => updateBudget({ active: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
          />
          Incluir en presupuesto
        </label>
      </div>

      {!disabled && (
        <div className="mb-3 flex flex-wrap gap-2">
          {onImport ? (
            <button
              type="button"
              onClick={handleImport}
              disabled={!canImport}
              className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
              title={
                canImport
                  ? 'Agregar al presupuesto los procedimientos del esquema de planificación'
                  : 'Registre primero tratamientos en el esquema de planificación'
              }
            >
              {importButtonLabel}
            </button>
          ) : null}
          <button type="button" onClick={addProcedure} className="btn-primary text-xs">
            Agregar Procedimiento
          </button>
        </div>
      )}

      {importNotice ? (
        <p className="mb-3 text-xs text-rose-800" role="status">
          {importNotice}
        </p>
      ) : null}

      {!value.active ? (
        <p className="rounded-xl border border-dashed border-rose-200 bg-white/70 px-4 py-5 text-center text-sm text-slate-500">
          Active «Incluir en presupuesto» para editar precios y el plan de pagos.
        </p>
      ) : value.lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-rose-200 bg-white/70 px-4 py-5 text-center text-sm text-slate-500">
          {emptyHint}
        </p>
      ) : (
        <div className="space-y-4">
          {value.lines.map((line, index) => {
            const subtotal = annexProcedureLineSubtotal(line)
            return (
              <article
                key={line.id}
                className="rounded-xl border border-rose-200 bg-white p-4 shadow-sm"
              >
                <header className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                      Procedimiento {index + 1}
                    </p>
                    {line.anatomicalZone || line.toothNumber ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Zona: {line.anatomicalZone || String(line.toothNumber)}
                      </p>
                    ) : null}
                  </div>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="text-xs font-medium text-slate-400 hover:text-red-600"
                    >
                      Quitar
                    </button>
                  )}
                </header>

                <div className="space-y-3">
                  <PaymentPlanProcedureField
                    procedure={line.procedure}
                    cupsCode={line.cupsCode}
                    totalAmount={line.unitPrice}
                    disabled={disabled}
                    onChange={(patch) =>
                      updateLine(line.id, {
                        procedure: patch.procedure,
                        cupsCode: patch.cupsCode,
                        ...(patch.totalAmount != null ? { unitPrice: patch.totalAmount } : {}),
                      })
                    }
                  />

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-0.5 block text-[10px] text-slate-500">Cantidad</label>
                      {disabled ? (
                        <p className="text-sm font-medium text-slate-800">{line.quantity}</p>
                      ) : (
                        <div className="flex items-start gap-1">
                          <input
                            id={`annex-budget-qty-${line.id}`}
                            type="number"
                            min={0}
                            value={line.quantity}
                            onChange={(event) =>
                              updateLine(line.id, { quantity: parseNonNegative(event.target.value) })
                            }
                            className="input-field"
                          />
                          <VoiceDictationButton
                            targetInputId={`annex-budget-qty-${line.id}`}
                            getValue={() => String(line.quantity || '')}
                            onValueChange={(text) => {
                              const parsed = parseDictatedInteger(text)
                              if (parsed != null) {
                                updateLine(line.id, { quantity: Math.max(0, parsed) })
                              }
                            }}
                            className="shrink-0"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-slate-500">
                        Precio unitario
                      </label>
                      {disabled ? (
                        <p className="text-sm font-medium text-slate-800">
                          {formatCurrency(line.unitPrice)}
                        </p>
                      ) : (
                        <div className="flex items-start gap-1">
                          <input
                            id={`annex-budget-price-${line.id}`}
                            type="number"
                            min={0}
                            value={line.unitPrice || ''}
                            onChange={(event) =>
                              updateLine(line.id, {
                                unitPrice: parseNonNegative(event.target.value),
                              })
                            }
                            className="input-field"
                          />
                          <VoiceDictationButton
                            targetInputId={`annex-budget-price-${line.id}`}
                            getValue={() => String(line.unitPrice || '')}
                            onValueChange={(text) => {
                              const parsed = parseDictatedNumber(text)
                              if (parsed != null) {
                                updateLine(line.id, {
                                  unitPrice: Math.max(0, Math.round(parsed)),
                                })
                              }
                            }}
                            className="shrink-0"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-slate-500">Subtotal</label>
                      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
                        {formatCurrency(subtotal)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Plan de pagos
                    </p>
                    <PaymentAgreementFields
                      item={line}
                      disabled={disabled}
                      onChange={(patch) => updateLine(line.id, patch)}
                    />
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {value.active && value.lines.length > 0 ? (
        <div className="mt-4 flex justify-end border-t border-rose-100 pt-3">
          <p className="text-sm text-rose-900">
            Total procedimientos:{' '}
            <strong className="text-base tabular-nums">{formatCurrency(total)}</strong>
          </p>
        </div>
      ) : null}
    </section>
  )
}
