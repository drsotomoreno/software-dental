import { db } from '@/db/database'
import {
  DEFAULT_CATALOG_SEEDS,
  OBSOLETE_ODONTOLOGY_CONSULTATION_CUPS,
  OBSOLETE_ORTHODONTICS_CUPS,
  OBSOLETE_OPERATORIA_CUPS,
  OBSOLETE_PROSTHETIC_CUPS,
  ODONTOLOGY_CONSULTATION_CUPS_ITEMS,
  ODONTOLOGY_ENDODONTICS_CUPS_ITEMS,
  ODONTOLOGY_EXTRACTION_CUPS_ITEMS,
  ODONTOLOGY_LEGACY_EXTRACTION_CUPS_ITEMS,
  ODONTOLOGY_INLAY_RESTORATION_CUPS_ITEMS,
  ODONTOLOGY_OPERATIVE_RESTORATION_CUPS_ITEMS,
  ODONTOLOGY_ORAL_SURGERY_BIOPSY_CUPS_ITEMS,
  ODONTOLOGY_ORTHODONTICS_PROCEDURE_CUPS_ITEMS,
  ODONTOLOGY_PROSTHETIC_RESTORATION_CUPS_ITEMS,
  ODONTOLOGY_PREVENTIVE_PERIODONTAL_CUPS_ITEMS,
  ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS_ITEMS,
  ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS_ITEMS,
} from '@/constants/catalogSeed'
import {
  CUPS_DESCRIPTION_CORRECTIONS,
  CUPS_WRONG_PROCEDURE_LABELS,
} from '@/constants/cupsCatalogCorrections'
import {
  CUPS_ODONTOLOGIA_VERSION,
  cupsOdontologyToCatalogItems,
  getCupsOdontologyCount,
} from '@/constants/cupsOdontologyData'
import type {
  CatalogImportPayload,
  CatalogItem,
  CatalogMeta,
  CatalogType,
} from '@/types/catalog'
import { catalogItemId } from '@/types/catalog'

export function normalizeCupsCode(code: string): string {
  return code.replace(/\D/g, '').padStart(6, '0').slice(0, 6)
}

/** Formato jerárquico MinSalud: 890203 → 89.0.2.03 */
export function formatCupsCodeDotted(code: string): string {
  const normalized = normalizeCupsCode(code)
  if (!/^\d{6}$/.test(normalized)) return code.trim()
  return `${normalized.slice(0, 2)}.${normalized.slice(2, 3)}.${normalized.slice(3, 4)}.${normalized.slice(4, 6)}`
}

export function isValidCupsFormat(code: string): boolean {
  return /^\d{6}$/.test(normalizeCupsCode(code))
}

export function isValidCie10Format(code: string): boolean {
  return /^[A-Z]\d{2}(\.\d{1,2})?$/i.test(code.trim())
}

export function normalizeCie10Code(code: string): string {
  return code.trim().toUpperCase()
}

function toCatalogItem(
  catalogType: CatalogType,
  item: CatalogImportPayload['items'][number],
): CatalogItem {
  const code =
    catalogType === 'cups' ? normalizeCupsCode(item.code) : normalizeCie10Code(item.code)
  return {
    id: catalogItemId(catalogType, code),
    catalogType,
    code,
    description: item.description.trim(),
    chapter: item.chapter,
    specialty: item.specialty,
    active: item.active ?? true,
  }
}

export async function getCatalogMeta(catalogType: CatalogType): Promise<CatalogMeta | undefined> {
  return db.catalogMeta.get(catalogType)
}

export async function searchCatalog(
  catalogType: CatalogType,
  query: string,
  limit = 25,
): Promise<CatalogItem[]> {
  const items = await db.catalogItems
    .where('catalogType')
    .equals(catalogType)
    .filter((item) => item.active)
    .toArray()

  const q = query.trim().toLowerCase()
  if (!q) return items.slice(0, limit)

  const qDigits = q.replace(/\D/g, '')

  const scored = items
    .map((item) => {
      const code = item.code.toLowerCase()
      const dotted =
        catalogType === 'cups' ? formatCupsCodeDotted(item.code).toLowerCase() : ''
      const description = item.description.toLowerCase()

      let score = 0
      if (code === qDigits || code === q) score = 100
      else if (dotted === q) score = 95
      else if (code.startsWith(qDigits) && qDigits.length >= 3) score = 80
      else if (code.includes(qDigits) && qDigits.length >= 2) score = 60
      else if (dotted.includes(q)) score = 55
      else if (description.startsWith(q)) score = 50
      else if (description.includes(q)) score = 30
      else return null

      return { item, score }
    })
    .filter((entry): entry is { item: CatalogItem; score: number } => entry !== null)

  scored.sort((a, b) => b.score - a.score || a.item.code.localeCompare(b.item.code))

  return scored.slice(0, limit).map((entry) => entry.item)
}

export async function getCatalogItem(
  catalogType: CatalogType,
  code: string,
): Promise<CatalogItem | undefined> {
  const normalized =
    catalogType === 'cups' ? normalizeCupsCode(code) : normalizeCie10Code(code)
  return db.catalogItems.get(catalogItemId(catalogType, normalized))
}

export async function importCatalog(
  payload: CatalogImportPayload,
  updatedBy: string | null = null,
): Promise<{ imported: number }> {
  const now = new Date().toISOString()
  const items = payload.items.map((item) => toCatalogItem(payload.catalogType, item))

  await db.transaction('rw', db.catalogMeta, db.catalogItems, async () => {
    await db.catalogItems.where('catalogType').equals(payload.catalogType).delete()

    if (items.length > 0) {
      await db.catalogItems.bulkPut(items)
    }

    const meta: CatalogMeta = {
      id: payload.catalogType,
      version: payload.version,
      source: payload.source,
      description: payload.description ?? CATALOG_TYPE_DESCRIPTION(payload.catalogType),
      recordCount: items.length,
      updatedAt: now,
      updatedBy,
    }
    await db.catalogMeta.put(meta)
  })

  return { imported: items.length }
}

function CATALOG_TYPE_DESCRIPTION(catalogType: CatalogType): string {
  switch (catalogType) {
    case 'cie10':
      return 'Catálogo CIE-10'
    case 'cie11':
      return 'Catálogo CIE-11'
    case 'cups':
      return 'Catálogo CUPS'
  }
}

export async function exportCatalog(catalogType: CatalogType): Promise<CatalogImportPayload | null> {
  const meta = await getCatalogMeta(catalogType)
  if (!meta) return null

  const items = await db.catalogItems.where('catalogType').equals(catalogType).toArray()
  return {
    catalogType,
    version: meta.version,
    source: meta.source,
    description: meta.description,
    items: items.map((item) => ({
      code: item.code,
      description: item.description,
      chapter: item.chapter,
      specialty: item.specialty,
      active: item.active,
    })),
  }
}

export async function restoreCatalogDefaults(
  catalogType: CatalogType,
  updatedBy: string | null = null,
): Promise<{ imported: number }> {
  const seed = DEFAULT_CATALOG_SEEDS.find((s) => s.catalogType === catalogType)
  if (!seed) throw new Error(`No hay datos semilla para ${catalogType}`)
  return importCatalog(seed, updatedBy)
}

export async function seedCatalogsIfEmpty(): Promise<void> {
  for (const seed of DEFAULT_CATALOG_SEEDS) {
    const existing = await db.catalogMeta.get(seed.catalogType)
    if (!existing) {
      await importCatalog(seed, 'system')
    }
  }

  await syncOdontologyCupsPatches()
  await ensureFullOdontologyCupsCatalog()
}

/**
 * Carga el catálogo CUPS odontología completo (269+ códigos) en IndexedDB (`catalogItems`).
 * Equivalente a `cups_odontologia` — se ejecuta si la tabla está vacía o desactualizada.
 */
export async function ensureFullOdontologyCupsCatalog(): Promise<{ updated: number }> {
  const meta = await getCatalogMeta('cups')
  const expectedCount = getCupsOdontologyCount()
  const needsRefresh =
    !meta ||
    meta.version !== CUPS_ODONTOLOGIA_VERSION ||
    meta.recordCount < expectedCount - 5

  if (!needsRefresh) {
    return { updated: 0 }
  }

  const items = cupsOdontologyToCatalogItems().map((item) => toCatalogItem('cups', item))
  const now = new Date().toISOString()

  await db.transaction('rw', db.catalogMeta, db.catalogItems, async () => {
    if (items.length > 0) {
      await db.catalogItems.bulkPut(items)
    }

    await db.catalogMeta.put({
      id: 'cups',
      version: CUPS_ODONTOLOGIA_VERSION,
      source: 'MinSalud Colombia — Res. 2706/2025 + legacy odontología',
      description: `Catálogo CUPS odontología (${items.length} códigos)`,
      recordCount: items.length,
      updatedAt: now,
      updatedBy: 'system',
    })
  })

  await applyCupsDescriptionCorrections()

  return { updated: items.length }
}

export async function applyCupsDescriptionCorrections(): Promise<number> {
  let updated = 0
  await db.transaction('rw', db.catalogItems, db.prices, db.dentalServices, async () => {
    for (const [code, description] of Object.entries(CUPS_DESCRIPTION_CORRECTIONS)) {
      const id = catalogItemId('cups', code)
      const existing = await db.catalogItems.get(id)
      if (existing && existing.description !== description) {
        await db.catalogItems.update(id, { description, active: true })
        updated += 1
      } else if (!existing) {
        await db.catalogItems.put({
          id,
          catalogType: 'cups',
          code,
          description,
          chapter: code.startsWith('23') ? '23' : '99',
          specialty: 'odontologia',
          active: true,
        })
        updated += 1
      } else if (!existing.active) {
        await db.catalogItems.update(id, { active: true, description })
        updated += 1
      }
    }

    for (const [code, wrongLabels] of Object.entries(CUPS_WRONG_PROCEDURE_LABELS)) {
      const canonical = CUPS_DESCRIPTION_CORRECTIONS[code]
      if (!canonical) continue
      const normalizedCode = normalizeCupsCode(code)
      const wrongSet = new Set(wrongLabels.map((label) => label.trim().toLowerCase()))

      const prices = await db.prices
        .filter((price) => normalizeCupsCode(price.cupsCode) === normalizedCode)
        .toArray()
      for (const price of prices) {
        if (wrongSet.has(price.procedure.trim().toLowerCase())) {
          await db.prices.update(price.id, { procedure: canonical })
          updated += 1
        }
      }

      const services = await db.dentalServices
        .filter(
          (service) =>
            service.internalCode.toUpperCase() === normalizedCode ||
            normalizeCupsCode(service.cupsCode ?? '') === normalizedCode,
        )
        .toArray()
      for (const service of services) {
        if (wrongSet.has(service.name.trim().toLowerCase())) {
          await db.dentalServices.update(service.id, { name: canonical })
          updated += 1
        }
      }
    }
  })
  return updated
}

export async function syncOdontologyCupsPatches(): Promise<void> {
  await db.transaction('rw', db.catalogItems, async () => {
    for (const code of [
      ...OBSOLETE_ODONTOLOGY_CONSULTATION_CUPS,
      ...OBSOLETE_ORTHODONTICS_CUPS,
      ...OBSOLETE_OPERATORIA_CUPS,
      ...OBSOLETE_PROSTHETIC_CUPS,
    ]) {
      const id = catalogItemId('cups', code)
      const existing = await db.catalogItems.get(id)
      if (existing?.active) {
        await db.catalogItems.update(id, { active: false })
      }
    }

    for (const item of [
      ...ODONTOLOGY_CONSULTATION_CUPS_ITEMS,
      ...ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS_ITEMS,
      ...ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS_ITEMS,
      ...ODONTOLOGY_ORTHODONTICS_PROCEDURE_CUPS_ITEMS,
      ...ODONTOLOGY_OPERATIVE_RESTORATION_CUPS_ITEMS,
      ...ODONTOLOGY_INLAY_RESTORATION_CUPS_ITEMS,
      ...ODONTOLOGY_PROSTHETIC_RESTORATION_CUPS_ITEMS,
      ...ODONTOLOGY_ORAL_SURGERY_BIOPSY_CUPS_ITEMS,
      ...ODONTOLOGY_EXTRACTION_CUPS_ITEMS,
      ...ODONTOLOGY_LEGACY_EXTRACTION_CUPS_ITEMS,
      ...ODONTOLOGY_ENDODONTICS_CUPS_ITEMS,
      ...ODONTOLOGY_PREVENTIVE_PERIODONTAL_CUPS_ITEMS,
    ]) {
      await db.catalogItems.put(toCatalogItem('cups', item))
    }
  })

  await applyCupsDescriptionCorrections()
}

/** @deprecated Use syncOdontologyCupsPatches */
export async function syncOdontologyConsultationCups(): Promise<void> {
  await syncOdontologyCupsPatches()
}

export async function validateDiagnosisCode(code: string): Promise<{
  valid: boolean
  normalized: string
  description?: string
}> {
  const normalized = normalizeCie10Code(code)
  if (!isValidCie10Format(normalized)) {
    return { valid: false, normalized }
  }
  const item = await getCatalogItem('cie10', normalized)
  return {
    valid: Boolean(item?.active),
    normalized,
    description: item?.description,
  }
}

export async function validateProcedureCups(code: string): Promise<{
  valid: boolean
  normalized: string
  description?: string
}> {
  const normalized = normalizeCupsCode(code)
  if (!isValidCupsFormat(normalized)) {
    return { valid: false, normalized }
  }
  const item = await getCatalogItem('cups', normalized)
  return {
    valid: Boolean(item?.active),
    normalized,
    description: item?.description,
  }
}
