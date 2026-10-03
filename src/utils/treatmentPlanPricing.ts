import type { TreatmentPlanItem } from '@/types/clinicalRecord'
import { calcBillableLineTotal } from '@/utils/cupsBillingRules'

/** Suma el precio facturable de cada fila del plan (valor × cantidad normalizada). */
export function sumTreatmentPlanPrices(items: TreatmentPlanItem[]): number {
  return items.reduce(
    (total, item) =>
      total + calcBillableLineTotal(item.unitPrice ?? 0, item.quantity ?? 1, item.cupsCode),
    0,
  )
}
