import { useCallback, useMemo, useState } from 'react'
import { normalizeCupsCode } from '@/services/catalogService'
import { useTariffStore } from '@/store/useTariffStore'
import type { BudgetCalculation, BudgetItem } from '@/types/pricing'
import { DEFAULT_IVA_RATE } from '@/types/pricing'
import { generateId } from '@/utils'
import {
  calcBillableLineTotal,
  getDefaultQuantityForCups,
  normalizeQuantityForCups,
} from '@/utils/cupsBillingRules'

export function calcBudgetItemTotal(
  item: Pick<BudgetItem, 'quantity' | 'unitPrice' | 'discount' | 'code'>,
): number {
  const gross = calcBillableLineTotal(item.unitPrice, item.quantity, item.code)
  return Math.max(0, gross - Math.max(0, item.discount))
}

export function recalcBudgetItem(item: BudgetItem): BudgetItem {
  return { ...item, total: calcBudgetItemTotal(item) }
}

export function computeBudgetTotals(
  items: BudgetItem[],
  globalDiscount = 0,
  taxRate = DEFAULT_IVA_RATE,
): BudgetCalculation {
  const subtotal = items.reduce((sum, item) => sum + calcBudgetItemTotal(item), 0)
  const normalizedDiscount = Math.max(0, globalDiscount)
  const taxableBase = Math.max(0, subtotal - normalizedDiscount)
  const taxAmount = Math.round(taxableBase * taxRate)
  const total = taxableBase + taxAmount

  return {
    subtotal,
    taxRate,
    taxAmount,
    globalDiscount: normalizedDiscount,
    total,
    currency: 'COP',
  }
}

export interface AddProcedureOptions {
  toothNumber?: number
  fdiQuadrant?: import('@/constants/implantPlanning').ImplantFdiQuadrant
  arch?: 'superior' | 'inferior'
  quantity?: number
}

/** Consulta O(1) al tariffMap y construye una línea de presupuesto. */
export function addProcedureToBudget(
  code: string,
  options: AddProcedureOptions = {},
): BudgetItem {
  const store = useTariffStore.getState()
  let tariff = store.getTariffByCode(code)

  if (!tariff && /\d/.test(code)) {
    tariff = store.getTariffByCode(normalizeCupsCode(code))
  }
  const quantity = normalizeQuantityForCups(
    /\d/.test(code) ? normalizeCupsCode(code) : code,
    Math.max(1, options.quantity ?? getDefaultQuantityForCups(code)),
  )

  if (tariff) {
    const item: BudgetItem = {
      id: generateId(),
      tariffItemId: tariff.id,
      code: tariff.code,
      description: tariff.name,
      toothNumber: options.toothNumber,
      fdiQuadrant: options.fdiQuadrant,
      arch: options.arch,
      quantity,
      unitPrice: tariff.price,
      discount: 0,
      total: 0,
    }
    return recalcBudgetItem(item)
  }

  const item: BudgetItem = {
    id: generateId(),
    tariffItemId: '',
    code,
    description: code,
      toothNumber: options.toothNumber,
      fdiQuadrant: options.fdiQuadrant,
      arch: options.arch,
      quantity,
    unitPrice: 0,
    discount: 0,
    total: 0,
  }
  return recalcBudgetItem(item)
}

export interface UseBudgetOptions {
  taxRate?: number
  globalDiscount?: number
}

export function useBudget(initialItems: BudgetItem[] = [], options: UseBudgetOptions = {}) {
  const [items, setItems] = useState<BudgetItem[]>(() =>
    initialItems.map((item) => recalcBudgetItem(item)),
  )
  const [globalDiscount, setGlobalDiscount] = useState(options.globalDiscount ?? 0)
  const taxRate = options.taxRate ?? DEFAULT_IVA_RATE

  const totals = useMemo(
    () => computeBudgetTotals(items, globalDiscount, taxRate),
    [items, globalDiscount, taxRate],
  )

  const addProcedure = useCallback((code: string, opts?: AddProcedureOptions) => {
    const line = addProcedureToBudget(code, opts)
    setItems((prev) => [...prev, line])
    return line
  }, [])

  const updateItem = useCallback((id: string, patch: Partial<BudgetItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? recalcBudgetItem({ ...item, ...patch }) : item)),
    )
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const replaceItems = useCallback((next: BudgetItem[]) => {
    setItems(next.map((item) => recalcBudgetItem(item)))
  }, [])

  return {
    items,
    totals,
    globalDiscount,
    taxRate,
    setGlobalDiscount,
    addProcedure,
    addProcedureToBudget: addProcedure,
    updateItem,
    removeItem,
    replaceItems,
    setItems: replaceItems,
  }
}
