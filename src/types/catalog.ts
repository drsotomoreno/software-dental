export type CatalogType = 'cie10' | 'cie11' | 'cups'

export interface CatalogMeta {
  id: CatalogType
  version: string
  source: string
  description: string
  recordCount: number
  updatedAt: string
  updatedBy?: string | null
}

export interface CatalogItem {
  id: string
  catalogType: CatalogType
  code: string
  description: string
  chapter?: string
  specialty?: string
  active: boolean
}

export interface CatalogImportPayload {
  catalogType: CatalogType
  version: string
  source: string
  description?: string
  items: Array<{
    code: string
    description: string
    chapter?: string
    specialty?: string
    active?: boolean
  }>
}

export const CATALOG_TYPE_LABELS: Record<CatalogType, string> = {
  cie10: 'CIE-10 — Clasificación Internacional de Enfermedades',
  cie11: 'CIE-11 — Clasificación Internacional de Enfermedades',
  cups: 'CUPS — Clasificación Única de Procedimientos en Salud',
}

export function catalogItemId(catalogType: CatalogType, code: string): string {
  return `${catalogType}:${code.trim().toUpperCase()}`
}
