import type { ImplantFdiQuadrant } from '@/constants/implantPlanning'

export type TariffItemType = 'CUPS' | 'CUSTOM'

export interface TariffItem {
  id: string
  code: string
  name: string
  category: string
  price: number
  type: TariffItemType
  isActive: boolean
  updatedAt: string
}

export interface BudgetItem {
  id: string
  tariffItemId: string
  code: string
  description: string
  toothNumber?: number
  fdiQuadrant?: ImplantFdiQuadrant
  arch?: 'superior' | 'inferior'
  quantity: number
  unitPrice: number
  /** Descuento en COP aplicado a la línea (no porcentaje). */
  discount: number
  total: number
}

export type TariffTabFilter = 'all' | 'cups' | 'custom'

/** IVA de servicios odontológicos: excluidos (ET Art. 476) — tarifa 0 %. */
export const DEFAULT_IVA_RATE = 0

export interface BudgetCalculation {
  subtotal: number
  taxRate: number
  taxAmount: number
  globalDiscount: number
  total: number
  currency: 'COP'
}
