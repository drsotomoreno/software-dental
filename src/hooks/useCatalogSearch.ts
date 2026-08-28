import { useLiveQuery } from 'dexie-react-hooks'
import { searchCatalog } from '@/services/catalogService'
import type { CatalogType } from '@/types/catalog'

export function useCatalogSearch(catalogType: CatalogType, query: string, limit = 25) {
  return useLiveQuery(
    () => searchCatalog(catalogType, query, limit),
    [catalogType, query, limit],
  )
}

export function useCatalogMeta(catalogType: CatalogType) {
  return useLiveQuery(async () => {
    const { getCatalogMeta } = await import('@/services/catalogService')
    return getCatalogMeta(catalogType)
  }, [catalogType])
}
