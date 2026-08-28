import { create } from 'zustand'
import { generateId } from '@/utils'
import type { TariffItem } from '@/types/pricing'

function buildTariffMap(tariffs: TariffItem[]): Record<string, TariffItem> {
  const map: Record<string, TariffItem> = {}
  for (const item of tariffs) {
    map[item.code] = item
  }
  return map
}

function nextCustomCode(tariffs: TariffItem[]): string {
  const numbers = tariffs
    .filter((t) => t.type === 'CUSTOM')
    .map((t) => {
      const match = t.code.match(/^CUSTOM_(\d+)$/i)
      return match ? Number.parseInt(match[1], 10) : 0
    })

  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
  return `CUSTOM_${String(next).padStart(3, '0')}`
}

interface TariffState {
  tariffs: TariffItem[]
  tariffMap: Record<string, TariffItem>
  isLoaded: boolean
  setTariffs: (tariffs: TariffItem[]) => void
  updatePrice: (code: string, newPrice: number) => void
  addCustomTreatment: (item: Omit<TariffItem, 'id' | 'type'>) => TariffItem
  updateCustomTreatment: (
    code: string,
    updates: { name: string; category: string; price: number },
  ) => void
  getTariffByCode: (code: string) => TariffItem | undefined
  removeTariff: (code: string) => void
}

export const useTariffStore = create<TariffState>((set, get) => ({
  tariffs: [],
  tariffMap: {},
  isLoaded: false,

  setTariffs: (tariffs) => {
    set({
      tariffs,
      tariffMap: buildTariffMap(tariffs),
      isLoaded: true,
    })
  },

  updatePrice: (code, newPrice) => {
    const normalizedPrice = Math.max(0, newPrice)
    const tariffs = get().tariffs.map((item) =>
      item.code === code
        ? { ...item, price: normalizedPrice, updatedAt: new Date().toISOString() }
        : item,
    )
    set({ tariffs, tariffMap: buildTariffMap(tariffs) })
  },

  addCustomTreatment: (item) => {
    const code =
      item.code.trim().startsWith('CUSTOM_') ? item.code.trim() : nextCustomCode(get().tariffs)

    const newItem: TariffItem = {
      ...item,
      id: generateId(),
      code,
      type: 'CUSTOM',
      isActive: item.isActive ?? true,
      updatedAt: new Date().toISOString(),
    }

    const tariffs = [...get().tariffs, newItem]
    set({ tariffs, tariffMap: buildTariffMap(tariffs) })
    return newItem
  },

  updateCustomTreatment: (code, updates) => {
    const name = updates.name.trim()
    const category = updates.category.trim() || 'Personalizado'
    const price = Math.max(0, updates.price)
    const tariffs = get().tariffs.map((item) =>
      item.code === code
        ? {
            ...item,
            name,
            category,
            price,
            updatedAt: new Date().toISOString(),
          }
        : item,
    )
    set({ tariffs, tariffMap: buildTariffMap(tariffs) })
  },

  getTariffByCode: (code) => get().tariffMap[code],

  removeTariff: (code) => {
    const tariffs = get().tariffs.filter((item) => item.code !== code)
    set({ tariffs, tariffMap: buildTariffMap(tariffs) })
  },
}))
