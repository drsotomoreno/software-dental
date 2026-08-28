import { db } from '@/db/database'
import { normalizeCupsCode } from '@/services/catalogService'
import type { TariffItem } from '@/types/pricing'
import type { PriceItem } from '@/types/user'
import { generateId } from '@/utils'
import { normalizeOrganizationId } from '@/utils/organizationId'

function isCustomCode(code: string): boolean {
  return code.trim().toUpperCase().startsWith('CUSTOM_')
}

function priceToCustomTariff(price: PriceItem): TariffItem {
  return {
    id: price.id,
    code: price.cupsCode,
    name: price.procedure,
    category: price.category?.trim() || 'Personalizado',
    price: price.price,
    type: 'CUSTOM',
    isActive: true,
    updatedAt: new Date().toISOString(),
  }
}

/** Carga catálogo CUPS + tarifas del usuario en memoria para el store. */
export async function loadAllTariffs(userId: string): Promise<TariffItem[]> {
  const [catalogItems, userPrices] = await Promise.all([
    db.catalogItems.where('catalogType').equals('cups').filter((item) => item.active).toArray(),
    db.prices.where('userId').equals(userId).toArray(),
  ])

  const priceByCode = new Map<string, PriceItem>()
  for (const price of userPrices) {
    const key = isCustomCode(price.cupsCode)
      ? price.cupsCode.trim().toUpperCase()
      : normalizeCupsCode(price.cupsCode)
    priceByCode.set(key, price)
  }

  const catalogCodes = new Set(catalogItems.map((item) => item.code))

  const cupsTariffs: TariffItem[] = catalogItems.map((catalog) => {
    const priceRecord = priceByCode.get(catalog.code)
    return {
      id: priceRecord?.id ?? catalog.id,
      code: catalog.code,
      name: catalog.description,
      category: catalog.chapter ?? catalog.specialty ?? 'CUPS',
      price: priceRecord?.price ?? 0,
      type: 'CUPS',
      isActive: catalog.active,
      updatedAt: new Date().toISOString(),
    }
  })

  const customTariffs = userPrices
    .filter((price) => isCustomCode(price.cupsCode))
    .map(priceToCustomTariff)

  const orphanPrices: TariffItem[] = userPrices
    .filter(
      (price) =>
        !isCustomCode(price.cupsCode) &&
        !catalogCodes.has(normalizeCupsCode(price.cupsCode)),
    )
    .map((price) => ({
      id: price.id,
      code: normalizeCupsCode(price.cupsCode),
      name: price.procedure,
      category: 'CUPS',
      price: price.price,
      type: 'CUPS' as const,
      isActive: true,
      updatedAt: new Date().toISOString(),
    }))

  return [...cupsTariffs, ...orphanPrices, ...customTariffs]
}

export async function persistTariffPrice(
  userId: string,
  code: string,
  price: number,
  meta?: { name?: string; category?: string },
): Promise<void> {
  const normalizedPrice = Math.max(0, price)
  const custom = isCustomCode(code)
  const normalizedCode = custom ? code.trim().toUpperCase() : normalizeCupsCode(code)

  const existing = await db.prices
    .where('userId')
    .equals(userId)
    .filter((price) => {
      const priceCode = isCustomCode(price.cupsCode)
        ? price.cupsCode.trim().toUpperCase()
        : normalizeCupsCode(price.cupsCode)
      return priceCode === normalizedCode
    })
    .first()

  if (existing) {
    await db.prices.update(existing.id, { price: normalizedPrice })
    return
  }

  const catalog = custom
    ? undefined
    : await db.catalogItems.get(`cups:${normalizedCode}`)

  await db.prices.add({
    id: generateId(),
    userId,
    procedure: meta?.name ?? catalog?.description ?? normalizedCode,
    cupsCode: normalizedCode,
    price: normalizedPrice,
    currency: 'COP',
  })
}

export async function persistCustomTreatment(
  userId: string,
  item: TariffItem,
): Promise<void> {
  await db.prices.add({
    id: item.id,
    userId,
    procedure: item.name,
    cupsCode: item.code,
    price: item.price,
    currency: 'COP',
    category: item.category?.trim() || 'Personalizado',
  })
}

export async function updateCustomTreatment(
  userId: string,
  code: string,
  updates: { name: string; category: string; price: number },
): Promise<void> {
  const normalizedCode = code.trim().toUpperCase()
  const record = await db.prices
    .where('userId')
    .equals(userId)
    .filter((price) => price.cupsCode.trim().toUpperCase() === normalizedCode)
    .first()

  if (!record) {
    throw new Error('Tratamiento personalizado no encontrado.')
  }

  const name = updates.name.trim()
  const category = updates.category.trim() || 'Personalizado'
  const price = Math.max(0, updates.price)

  await db.prices.update(record.id, {
    procedure: name,
    category,
    price,
  })

  const user = await db.users.get(userId)
  if (!user) return

  const organizationId = normalizeOrganizationId(user.providerNit, user.id)
  const serviceId = `svc:${organizationId}:${normalizedCode}`
  const now = new Date().toISOString()

  const existingService = await db.dentalServices.get(serviceId)
  if (existingService) {
    await db.dentalServices.update(serviceId, {
      name,
      category,
      defaultPrice: price,
      updatedAt: now,
    })
  }

  const priceId = `dsp:${serviceId}:${userId}`
  const existingPrice = await db.dentalServicePrices.get(priceId)
  if (existingPrice) {
    await db.dentalServicePrices.update(priceId, {
      price,
      updatedAt: now,
    })
  }
}

export async function deleteCustomTreatment(userId: string, code: string): Promise<void> {
  const normalizedCode = code.trim().toUpperCase()
  const record = await db.prices
    .where('userId')
    .equals(userId)
    .filter((price) => price.cupsCode.trim().toUpperCase() === normalizedCode)
    .first()

  if (record) {
    await db.prices.delete(record.id)
  }
}
