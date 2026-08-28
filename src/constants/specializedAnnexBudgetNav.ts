import type { SpecializedAnnexKey } from '@/types/specializedAnnexes'

export function specializedAnnexDomId(key: SpecializedAnnexKey): string {
  return `specialized-annex-${key}`
}
