import cupsJson from '@/data/cupsOdontology.json'
import type { CatalogImportPayload } from '@/types/catalog'

/** Entrada del catálogo CUPS odontología (Res. 2706/2025 + legacy cap. 99). */
export interface CupsOdontologyEntry {
  codigo: string
  descripcion: string
  categoria: string
}

/**
 * Catálogo completo de procedimientos odontológicos Colombia.
 * Equivalente a la tabla `cups_odontologia` solicitada — persistida en IndexedDB como `catalogItems` (catalogType: cups).
 */
export const CUPS_ODONTOLOGIA: CupsOdontologyEntry[] = cupsJson as CupsOdontologyEntry[]

export const CUPS_ODONTOLOGIA_VERSION = '2026.11-colombia-cups-full-269'

function chapterFromCodigo(codigo: string): string {
  const c = codigo.replace(/\D/g, '').padStart(6, '0')
  if (c.startsWith('89')) return '89'
  if (c.startsWith('99')) return '99'
  if (c.startsWith('87')) return '87'
  if (c.startsWith('39')) return '39'
  if (c.startsWith('76')) return '76'
  if (c.startsWith('24')) return '24'
  if (c.startsWith('23')) return '23'
  return c.slice(0, 2)
}

/** Convierte el arreglo a ítems importables en `catalogItems` (Dexie). */
export function cupsOdontologyToCatalogItems(): CatalogImportPayload['items'] {
  return CUPS_ODONTOLOGIA.map((entry) => ({
    code: entry.codigo,
    description: entry.descripcion,
    chapter: chapterFromCodigo(entry.codigo),
    specialty: 'odontologia',
    active: true,
  }))
}

export function getCupsOdontologyCount(): number {
  return CUPS_ODONTOLOGIA.length
}
