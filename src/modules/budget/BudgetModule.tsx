import { useMemo, useState } from 'react'
import { normalizeCupsCode } from '@/services/catalogService'
import { useTariffStore } from '@/store/useTariffStore'
import type { BudgetItem } from '@/types/pricing'
import { DEFAULT_IVA_RATE } from '@/types/pricing'
import {
  addProcedureToBudget,
  calcBudgetItemTotal,
  computeBudgetTotals,
} from '@/hooks/useBudget'
import { formatCurrency, generateId } from '@/utils'
import { CupsQuantityBillingField } from '@/components/billing/CupsQuantityBillingField'
import { CupsAnatomicalLocationField } from '@/components/billing/CupsAnatomicalLocationField'
import { normalizeQuantityForCups } from '@/utils/cupsBillingRules'
import { VoiceDictationButton, FieldVoiceHeader } from '@/components/voice'
import { parseDictatedInteger, parseDictatedNumber } from '@/utils/voiceDictation'

interface BudgetModuleProps {
  items: BudgetItem[]
  globalDiscount: number
  taxRate?: number
  disabled?: boolean
  onItemsChange: (items: BudgetItem[]) => void
  onGlobalDiscountChange: (discount: number) => void
  showToolbar?: boolean
  hideSummary?: boolean
  onImportFromTreatmentPlan?: () => void
  canImportFromTreatmentPlan?: boolean
}

export function BudgetModule({
  items,
  globalDiscount,
  taxRate = DEFAULT_IVA_RATE,
  disabled = false,
  onItemsChange,
  onGlobalDiscountChange,
  showToolbar = true,
  hideSummary = false,
  onImportFromTreatmentPlan,
  canImportFromTreatmentPlan = false,
}: BudgetModuleProps) {
  const tariffMap = useTariffStore((state) => state.tariffMap)
  const [procedureSearch, setProcedureSearch] = useState('')

  const totals = useMemo(
    () => computeBudgetTotals(items, globalDiscount, taxRate),
    [items, globalDiscount, taxRate],
  )

  const searchResults = useMemo(() => {
    const query = procedureSearch.trim().toLowerCase()
    if (!query) return []

    return Object.values(tariffMap)
      .filter(
        (item) =>
          item.isActive &&
          (item.code.toLowerCase().includes(query) ||
            item.name.toLowerCase().includes(query)),
      )
      .slice(0, 15)
  }, [tariffMap, procedureSearch])

  const updateItem = (id: string, patch: Partial<BudgetItem>) => {
    onItemsChange(
      items.map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...patch }
        const cupsCode = patch.code ?? item.code
        if (patch.code !== undefined || patch.quantity !== undefined) {
          next.quantity = normalizeQuantityForCups(
            cupsCode,
            patch.quantity ?? item.quantity,
          )
        }
        return { ...next, total: calcBudgetItemTotal(next) }
      }),
    )
  }

  const removeItem = (id: string) => {
    onItemsChange(items.filter((item) => item.id !== id))
  }

  const addBlankItem = () => {
    onItemsChange([
      ...items,
      {
        id: generateId(),
        tariffItemId: '',
        code: '',
        description: '',
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        total: 0,
      },
    ])
  }

  const addFromTariff = (code: string) => {
    onItemsChange([...items, addProcedureToBudget(code)])
    setProcedureSearch('')
  }

  const handleCodeBlur = (id: string, rawCode: string) => {
    const code = rawCode.trim()
    if (!code) return

    const normalized = /\d/.test(code) ? normalizeCupsCode(code) : code
    const tariff = tariffMap[normalized] ?? tariffMap[code]
    const currentItem = items.find((i) => i.id === id)

    if (tariff) {
      const patch: Partial<BudgetItem> = {
        code: tariff.code,
        tariffItemId: tariff.id,
        description: tariff.name,
        quantity: normalizeQuantityForCups(tariff.code, currentItem?.quantity ?? 1),
      }
      if (!currentItem || currentItem.unitPrice === 0) {
        patch.unitPrice = tariff.price
      }
      updateItem(id, patch)
    } else if (/\d/.test(normalized)) {
      updateItem(id, {
        code: normalized,
        quantity: normalizeQuantityForCups(
          normalized,
          items.find((i) => i.id === id)?.quantity ?? 1,
        ),
      })
    }
  }

  return (
    <div>
      {!disabled && showToolbar && (
        <div className="mb-4 space-y-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/40">
          <div>
            <button type="button" onClick={addBlankItem} className="btn-secondary text-xs">
              + Tratamiento en blanco
            </button>
          </div>

          {onImportFromTreatmentPlan && (
            <div>
              <button
                type="button"
                onClick={onImportFromTreatmentPlan}
                disabled={!canImportFromTreatmentPlan}
                className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  canImportFromTreatmentPlan
                    ? 'Agregar al presupuesto los procedimientos del plan de tratamiento'
                    : 'Registre procedimientos en el plan de tratamiento primero'
                }
              >
                Importar desde plan de tratamiento
              </button>
            </div>
          )}

          <div>
            <FieldVoiceHeader
              label="Autocarga desde tarifario (CUPS / personalizados)"
              targetInputId="budget-tariff-search"
              labelClassName="text-xs font-medium text-slate-600 dark:text-slate-300"
              getValue={() => procedureSearch}
              onValueChange={setProcedureSearch}
            />
            <input
              id="budget-tariff-search"
              type="search"
              value={procedureSearch}
              onChange={(e) => setProcedureSearch(e.target.value)}
              placeholder="Código CUPS o descripción..."
              className="input-field"
            />
            {procedureSearch && (
              <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                {searchResults.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">
                    Sin coincidencias — puede agregar manualmente con precio 0.
                  </li>
                ) : (
                  searchResults.map((tariff) => (
                    <li key={tariff.code}>
                      <button
                        type="button"
                        onClick={() => addFromTariff(tariff.code)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span>
                          {tariff.name}
                          <span className="ml-2 font-mono text-xs text-slate-500">
                            {tariff.code}
                          </span>
                        </span>
                        <span className="text-xs font-medium text-dental-700 dark:text-dental-300">
                          {formatCurrency(tariff.price)}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Agregue tratamientos al presupuesto.
        </p>
      ) : (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full min-w-[920px] table-fixed text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="w-[38%] px-2 py-2 font-medium">Procedimiento</th>
                <th className="w-[12%] px-2 py-2 font-medium">CUPS</th>
                <th className="w-[12%] px-2 py-2 font-medium">Pieza</th>
                <th className="w-[8%] px-2 py-2 font-medium">Cant.</th>
                <th className="w-[12%] px-2 py-2 font-medium">Precio unit.</th>
                <th className="w-[10%] px-2 py-2 font-medium">Desc.</th>
                <th className="w-[8%] px-2 py-2 font-medium">Total</th>
                {!disabled && <th className="w-[4%] px-2 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="px-2 py-2">
                    {disabled ? (
                      <span className="block whitespace-normal break-words leading-snug text-slate-800 dark:text-slate-100">
                        {item.description || '—'}
                      </span>
                    ) : (
                      <div className="flex items-start gap-1">
                        <textarea
                          id={`budget-desc-${item.id}`}
                          value={item.description}
                          onChange={(e) => updateItem(item.id, { description: e.target.value })}
                          placeholder="Procedimiento"
                          rows={2}
                          className="input-field min-h-[2.75rem] min-w-0 flex-1 resize-y whitespace-normal break-words leading-snug"
                        />
                        <VoiceDictationButton
                          targetInputId={`budget-desc-${item.id}`}
                          getValue={() => item.description}
                          onValueChange={(description) =>
                            updateItem(item.id, { description })
                          }
                          className="shrink-0"
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {disabled ? (
                      <span className="font-mono text-xs">{item.code || '—'}</span>
                    ) : (
                      <div className="flex items-start gap-1">
                        <input
                          id={`budget-cups-${item.id}`}
                          value={item.code}
                          onChange={(e) => updateItem(item.id, { code: e.target.value })}
                          onBlur={(e) => handleCodeBlur(item.id, e.target.value)}
                          placeholder="CUPS"
                          className="input-field min-w-0 flex-1 font-mono text-xs"
                        />
                        <VoiceDictationButton
                          targetInputId={`budget-cups-${item.id}`}
                          getValue={() => item.code}
                          onValueChange={(code) => updateItem(item.id, { code })}
                          className="shrink-0"
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {disabled ? (
                      item.toothNumber ?? item.fdiQuadrant ?? item.arch ?? '—'
                    ) : (
                      <CupsAnatomicalLocationField
                        cupsCode={item.code}
                        toothNumber={item.toothNumber}
                        fdiQuadrant={item.fdiQuadrant}
                        arch={item.arch}
                        onToothNumberChange={(toothNumber) => updateItem(item.id, { toothNumber })}
                        onFdiQuadrantChange={(fdiQuadrant) => updateItem(item.id, { fdiQuadrant })}
                        onArchChange={(arch) => updateItem(item.id, { arch })}
                      />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {disabled ? (
                      item.quantity
                    ) : (
                      <CupsQuantityBillingField
                        cupsCode={item.code}
                        quantity={item.quantity}
                        unitPrice={item.unitPrice}
                        inputId={`budget-qty-${item.id}`}
                        onQuantityChange={(quantity) => updateItem(item.id, { quantity })}
                        compact
                      />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {disabled ? (
                      formatCurrency(item.unitPrice)
                    ) : (
                      <div className="flex items-start gap-1">
                        <input
                          id={`budget-price-${item.id}`}
                          type="number"
                          min={0}
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateItem(item.id, { unitPrice: Number(e.target.value) })
                          }
                          className="input-field min-w-0 w-28 flex-1"
                          title="Precio puntual del presupuesto (no altera el tarifario global)"
                        />
                        <VoiceDictationButton
                          targetInputId={`budget-price-${item.id}`}
                          getValue={() => String(item.unitPrice || '')}
                          onValueChange={(text) => {
                            const parsed = parseDictatedNumber(text)
                            if (parsed != null) {
                              updateItem(item.id, { unitPrice: Math.max(0, Math.round(parsed)) })
                            }
                          }}
                          className="shrink-0"
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {disabled ? (
                      formatCurrency(item.discount)
                    ) : (
                      <div className="flex items-start gap-1">
                        <input
                          id={`budget-disc-${item.id}`}
                          type="number"
                          min={0}
                          value={item.discount}
                          onChange={(e) =>
                            updateItem(item.id, { discount: Number(e.target.value) })
                          }
                          className="input-field min-w-0 w-24 flex-1"
                        />
                        <VoiceDictationButton
                          targetInputId={`budget-disc-${item.id}`}
                          getValue={() => String(item.discount || '')}
                          onValueChange={(text) => {
                            const parsed = parseDictatedNumber(text)
                            if (parsed != null) {
                              updateItem(item.id, { discount: Math.max(0, Math.round(parsed)) })
                            }
                          }}
                          className="shrink-0"
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 font-medium">{formatCurrency(item.total)}</td>
                  {!disabled && (
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hideSummary ? null : (
      <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700">
        <div>
          <span className="text-sm text-slate-500 dark:text-slate-400">Subtotal</span>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {formatCurrency(totals.subtotal)}
          </p>
        </div>
        <div>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            IVA excluido (0%)
          </span>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {formatCurrency(0)}
          </p>
        </div>
        <div>
          <FieldVoiceHeader
            label="Descuento global (COP)"
            targetInputId="budget-global-discount"
            disabled={disabled}
            getValue={() => String(globalDiscount || '')}
            onValueChange={(text) => {
              const parsed = parseDictatedInteger(text)
              if (parsed != null) onGlobalDiscountChange(Math.max(0, parsed))
            }}
          />
          <input
            id="budget-global-discount"
            type="number"
            min={0}
            disabled={disabled}
            value={globalDiscount}
            onChange={(e) => onGlobalDiscountChange(Number(e.target.value))}
            className="input-field"
          />
        </div>
        <div>
          <span className="text-sm text-slate-500 dark:text-slate-400">Total general</span>
          <p className="text-xl font-bold text-dental-700 dark:text-dental-400">
            {formatCurrency(totals.total)}
          </p>
        </div>
      </div>
      )}
    </div>
  )
}
