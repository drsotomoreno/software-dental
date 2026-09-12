import type { BudgetLineItem } from '@/types/clinicalRecord'
import type { EvolutionNote } from '@/types/evolutionNote'
import type { CheckoutLineItem } from '@/types/consultationCheckout'
import { generateId } from '@/utils/crypto'
import { getEvolutionCatalogServices } from '@/utils/evolutionCatalogServices'
import { normalizeCupsCode } from '@/services/catalogService'

const CUPS_PATTERN = /^\d{6}$/

function isCupsCode(code: string | null | undefined): boolean {
  const cups = normalizeCupsCode(String(code ?? ''))
  return CUPS_PATTERN.test(cups)
}

export function checkoutLineFromEvolutionService(
  note: EvolutionNote,
  service: {
    id: string
    serviceName?: string
    procedure: string
    cupsCode?: string | null
    requiereCupsRips?: boolean
    cost?: number
  },
): CheckoutLineItem | null {
  const name = (service.serviceName || service.procedure || note.procedure || '').trim()
  if (!name) return null

  const aesthetic = service.requiereCupsRips === false || !isCupsCode(service.cupsCode)
  const unitPrice = Math.max(0, service.cost ?? 0)
  if (unitPrice <= 0 && aesthetic && !name) return null

  return {
    id: `${note.id}:${service.id}`,
    kind: aesthetic ? 'aesthetic' : 'cups',
    name,
    cupsCode: aesthetic ? null : normalizeCupsCode(String(service.cupsCode)),
    quantity: 1,
    unitPrice,
    totalAmount: unitPrice,
    ripsGroup: aesthetic ? 'otrosServicios' : 'procedimientos',
    sourceType: 'evolution',
    sourceId: note.id,
  }
}

export function buildCheckoutCartFromSources(input: {
  evolutionNotes?: EvolutionNote[]
  budgetItems?: BudgetLineItem[]
}): CheckoutLineItem[] {
  const cart: CheckoutLineItem[] = []
  const seen = new Set<string>()

  for (const note of input.evolutionNotes ?? []) {
    const services = getEvolutionCatalogServices(note)
    if (services.length === 0) {
      const fallback = checkoutLineFromEvolutionService(note, {
        id: note.id,
        serviceName: note.serviceName,
        procedure: note.procedure,
        cupsCode: note.cupsCode,
        requiereCupsRips: note.requiereCupsRips,
        cost: note.cost,
      })
      if (fallback && !seen.has(fallback.id)) {
        seen.add(fallback.id)
        cart.push(fallback)
      }
      continue
    }

    for (const service of services) {
      const line = checkoutLineFromEvolutionService(note, service)
      if (!line || seen.has(line.id)) continue
      seen.add(line.id)
      cart.push(line)
    }
  }

  for (const item of input.budgetItems ?? []) {
    const name = item.procedure?.trim()
    if (!name) continue
    const cups = item.cupsCode
    const aesthetic = !isCupsCode(cups) || String(cups).toUpperCase().startsWith('CUSTOM_')
    const quantity = Math.max(1, item.quantity || 1)
    const unitPrice = Math.max(0, item.unitPrice || 0)
    const id = `budget:${item.id}`
    if (seen.has(id)) continue
    seen.add(id)
    cart.push({
      id,
      kind: aesthetic ? 'aesthetic' : 'cups',
      name,
      cupsCode: aesthetic ? null : normalizeCupsCode(String(cups)),
      quantity,
      unitPrice,
      totalAmount: quantity * unitPrice,
      ripsGroup: aesthetic ? 'otrosServicios' : 'procedimientos',
      sourceType: 'budget',
      sourceId: item.id,
    })
  }

  return cart
}

export function createAestheticCheckoutLine(name: string, unitPrice: number): CheckoutLineItem {
  const price = Math.max(0, unitPrice)
  return {
    id: generateId(),
    kind: 'aesthetic',
    name: name.trim(),
    cupsCode: null,
    quantity: 1,
    unitPrice: price,
    totalAmount: price,
    ripsGroup: 'otrosServicios',
    sourceType: 'manual_aesthetic',
  }
}
