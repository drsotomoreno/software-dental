import { normalizeCupsCode } from '@/services/catalogService'
import { useTariffStore } from '@/store/useTariffStore'
import type { TariffItem } from '@/types/pricing'

/** Busca un ítem del tarifario por código CUPS o CUSTOM_ (O(1) vía store). */
export function resolveTariffByCode(code?: string | null): TariffItem | undefined {
  if (!code?.trim()) return undefined

  const store = useTariffStore.getState()
  const trimmed = code.trim()
  let tariff = store.getTariffByCode(trimmed)

  if (!tariff && /\d/.test(trimmed)) {
    tariff = store.getTariffByCode(normalizeCupsCode(trimmed))
  }

  if (!tariff && trimmed.toUpperCase().startsWith('CUSTOM_')) {
    tariff = store.getTariffByCode(trimmed.toUpperCase())
  }

  return tariff
}

/** Precio unitario del tarifario global (Mis Precios y Procedimientos). */
export function resolveTariffUnitPrice(code?: string | null): number {
  return resolveTariffByCode(code)?.price ?? 0
}
