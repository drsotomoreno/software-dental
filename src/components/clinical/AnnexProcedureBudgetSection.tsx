import { useMemo, useState } from 'react'
import {
  annexProcedureLineSubtotal,
  createBlankAnnexProcedureBudgetLine,
  normalizeAnnexProcedureBudget,
  type AnnexProcedureBudget,
  type AnnexProcedureBudgetLine,
} from '@/types/annexProcedureBudget'
import { formatCurrency, generateId } from '@/utils'
import { VoiceDictationButton } from '@/components/voice'
import { parseDictatedInteger, parseDictatedNumber } from '@/utils/voiceDictation'

export interface AnnexBudgetMaterialOption {
  id: string
  label: string
}

export interface AnnexProcedureBudgetSectionProps {
  title: string
  description?: string
  /** Historias antiguas pueden no tener presupuesto; se normaliza al renderizar. */
  value: AnnexProcedureBudget | null | undefined
  onChange: (value: AnnexProcedureBudget) => void
  disabled?: boolean
  importButtonLabel?: string
  onImport?: () => { added: number; skipped: number }
  canImport?: boolean
  emptyHint?: string
  className?: string
  /** Si se define, muestra la columna Material con estas opciones. */
  materialOptions?: readonly AnnexBudgetMaterialOption[]
}

function parseNonNegative(raw: string): number {
  const parsed = Number(raw.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed)
}

export function AnnexProcedureBudgetSection({
  title,
  description,
  value: valueProp,
  onChange,
  disabled = false,
  importButtonLabel = 'Importar',
  onImport,
  canImport = false,
  emptyHint = 'Importe procedimientos o agregue uno manualmente.',
  className = '',
  materialOptions,
}: AnnexProcedureBudgetSectionProps) {
  const value = useMemo(() => normalizeAnnexProcedureBudget(valueProp), [valueProp])
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const showMaterial = Boolean(materialOptions && materialOptions.length > 0)
  const materialLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const option of materialOptions ?? []) map.set(option.id, option.label)
    return map
  }, [materialOptions])
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
    const id = generateId()
    updateBudget({
      active: true,
      lines: [
        ...value.lines,
        createBlankAnnexProcedureBudgetLine({
          id,
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
    if (result.added > 0 && result.skipped > 0) {
      setImportNotice(
        `Resumen actualizado: ${result.added} nuevo${result.added === 1 ? '' : 's'}, ${result.skipped} actualizado${result.skipped === 1 ? '' : 's'}.`,
      )
    } else if (result.added > 0) {
      setImportNotice(
        `Se agregaron ${result.added} procedimiento${result.added === 1 ? '' : 's'} del Resumen Tratamiento Restaurador.`,
      )
    } else if (result.skipped > 0) {
      setImportNotice('El presupuesto ya refleja el Resumen Tratamiento Restaurador (cantidades y zonas actualizadas).')
    } else {
      setImportNotice('No hay tratamientos en el Resumen Tratamiento Restaurador para importar.')
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
                  ? 'Sincronizar con el Resumen Tratamiento Restaurador'
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
          Active «Incluir en presupuesto» para editar precios.
        </p>
      ) : value.lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-rose-200 bg-white/70 px-4 py-5 text-center text-sm text-slate-500">
          {emptyHint}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-rose-200 bg-white shadow-sm">
          <table className={`w-full text-sm ${showMaterial ? 'min-w-[720px]' : 'min-w-[560px]'}`}>
            <thead>
              <tr className="border-b border-rose-100 bg-rose-50/60 text-left text-[11px] uppercase tracking-wide text-rose-900/80">
                <th className="px-3 py-2.5 font-semibold">Procedimiento</th>
                <th className="px-3 py-2.5 font-semibold">Zona / piezas</th>
                {showMaterial ? (
                  <th className="px-3 py-2.5 font-semibold">Material</th>
                ) : null}
                <th className="px-3 py-2.5 font-semibold">Cant.</th>
                <th className="px-3 py-2.5 font-semibold">Precio unitario</th>
                <th className="px-3 py-2.5 font-semibold">Subtotal</th>
                {!disabled ? <th className="px-3 py-2.5 font-semibold" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-rose-50">
              {value.lines.map((line) => {
                const subtotal = annexProcedureLineSubtotal(line)
                return (
                  <tr key={line.id} className="align-top hover:bg-rose-50/30">
                    <td className="px-3 py-2">
                      {disabled ? (
                        <p className="font-medium text-slate-800">
                          {line.procedure || '—'}
                          {line.cupsCode ? (
                            <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                              CUPS {line.cupsCode}
                            </span>
                          ) : null}
                        </p>
                      ) : (
                        <input
                          type="text"
                          value={line.procedure}
                          onChange={(event) =>
                            updateLine(line.id, { procedure: event.target.value })
                          }
                          placeholder="Nombre del procedimiento"
                          className="input-field min-w-[10rem] text-sm"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {disabled ? (
                        <span className="text-slate-600">
                          {line.anatomicalZone ||
                            (line.toothNumber != null ? String(line.toothNumber) : '—')}
                        </span>
                      ) : (
                        <input
                          type="text"
                          value={line.anatomicalZone ?? ''}
                          onChange={(event) =>
                            updateLine(line.id, {
                              anatomicalZone: event.target.value || undefined,
                            })
                          }
                          placeholder="Ej.: 11, 12, 21"
                          className="input-field min-w-[7rem] text-sm"
                        />
                      )}
                    </td>
                    {showMaterial ? (
                      <td className="px-3 py-2">
                        {disabled ? (
                          <span className="text-slate-700">
                            {materialLabelById.get(line.material ?? '') ||
                              line.material ||
                              '—'}
                          </span>
                        ) : (
                          <select
                            value={line.material ?? ''}
                            onChange={(event) =>
                              updateLine(line.id, { material: event.target.value })
                            }
                            className="input-field min-w-[11rem] text-sm"
                            aria-label={`Material de ${line.procedure || 'procedimiento'}`}
                          >
                            <option value="">Seleccionar…</option>
                            {(materialOptions ?? []).map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    ) : null}
                    <td className="px-3 py-2">
                      {disabled ? (
                        <span className="font-medium text-slate-800">{line.quantity}</span>
                      ) : (
                        <div className="flex items-start gap-1">
                          <input
                            id={`annex-budget-qty-${line.id}`}
                            type="number"
                            min={0}
                            value={line.quantity}
                            onChange={(event) =>
                              updateLine(line.id, {
                                quantity: parseNonNegative(event.target.value),
                              })
                            }
                            className="input-field w-16 text-sm"
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
                    </td>
                    <td className="px-3 py-2">
                      {disabled ? (
                        <span className="font-medium text-slate-800">
                          {formatCurrency(line.unitPrice)}
                        </span>
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
                            className="input-field w-28 text-sm"
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
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-semibold tabular-nums text-slate-800">
                        {formatCurrency(subtotal)}
                      </span>
                    </td>
                    {!disabled ? (
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="text-xs font-medium text-slate-400 hover:text-red-600"
                        >
                          Quitar
                        </button>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
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
