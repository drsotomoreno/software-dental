import type { RehabTreatmentType } from '@/components/clinical/rehabilitation/rehab-odontogram/types'

export const REHAB_FIXED_RESTORATION_MATERIALS = [
  { id: 'disilicato_litio', label: 'Disilicato de Litio' },
  { id: 'zirconio', label: 'Zirconio' },
] as const

/** Materiales de restauración para el esquema de implantes en arcos dentados */
export const IMPLANT_FIXED_RESTORATION_MATERIALS = [
  { id: 'disilicato_litio', label: 'Disilicato de Litio' },
  { id: 'zirconio', label: 'Zirconia' },
] as const

export const REHAB_PPR_MATERIALS = [
  { id: 'aleacion_metalica', label: 'Aleación Metálica' },
  { id: 'acrilico_rigido', label: 'Acrílico Rígido' },
  { id: 'acrilico_flexible', label: 'Acrílico Flexible' },
] as const

export type RehabFixedRestorationMaterialId = (typeof REHAB_FIXED_RESTORATION_MATERIALS)[number]['id']
export type RehabPprMaterialId = (typeof REHAB_PPR_MATERIALS)[number]['id']

export type RehabRestorationMaterialId = RehabFixedRestorationMaterialId | RehabPprMaterialId

export type RehabRestorationDetailKey = RehabTreatmentType | 'protesis_parcial_removible'

export const REHAB_FIXED_RESTORATION_TREATMENTS: RehabTreatmentType[] = [
  'corona_individual',
  'carilla',
  'implante',
  'pilar_ppf',
  'pontico_ppf',
  'incrustacion',
]

export type RehabRestorationColorValue =
  | `classic:${string}`
  | `3d:${string}`
  | ''

export interface RehabTreatmentRestorationSpec {
  material: RehabRestorationMaterialId | ''
  restorationColor: RehabRestorationColorValue
}

export type RehabRestorationDetails = Partial<
  Record<RehabRestorationDetailKey, RehabTreatmentRestorationSpec>
>

const FIXED_MATERIAL_IDS = new Set<string>(REHAB_FIXED_RESTORATION_MATERIALS.map((item) => item.id))
const PPR_MATERIAL_IDS = new Set<string>(REHAB_PPR_MATERIALS.map((item) => item.id))

export function isRehabRestorationDetailKey(value: unknown): value is RehabRestorationDetailKey {
  return (
    value === 'protesis_parcial_removible' ||
    value === 'corona_individual' ||
    value === 'carilla' ||
    value === 'implante' ||
    value === 'pilar_ppf' ||
    value === 'pontico_ppf' ||
    value === 'incrustacion'
  )
}

export function isRehabRestorationColorValue(value: unknown): value is RehabRestorationColorValue {
  if (value === '') return true
  if (typeof value !== 'string') return false
  if (value.startsWith('classic:')) return value.length > 'classic:'.length
  if (value.startsWith('3d:')) return value.length > '3d:'.length
  return false
}

export function formatRehabRestorationColor(value: RehabRestorationColorValue): string {
  if (!value) return ''
  if (value.startsWith('classic:')) return `VITA ${value.slice('classic:'.length)}`
  if (value.startsWith('3d:')) return `3D Master ${value.slice('3d:'.length)}`
  return value
}

export function getRehabRestorationMaterialLabel(
  material: RehabRestorationMaterialId | '',
): string {
  if (!material) return ''
  const fixed = REHAB_FIXED_RESTORATION_MATERIALS.find((item) => item.id === material)
  if (fixed) return fixed.label
  const ppr = REHAB_PPR_MATERIALS.find((item) => item.id === material)
  return ppr?.label ?? material
}

export function createEmptyRestorationSpec(): RehabTreatmentRestorationSpec {
  return { material: '', restorationColor: '' }
}

export function normalizeRestorationDetails(data?: RehabRestorationDetails): RehabRestorationDetails {
  if (!data || typeof data !== 'object') return {}

  const normalized: RehabRestorationDetails = {}

  for (const [key, spec] of Object.entries(data)) {
    if (!isRehabRestorationDetailKey(key) || !spec || typeof spec !== 'object') continue

    const materialRaw = typeof spec.material === 'string' ? spec.material : ''
    const colorRaw = isRehabRestorationColorValue(spec.restorationColor) ? spec.restorationColor : ''

    let material: RehabRestorationMaterialId | '' = ''
    if (key === 'protesis_parcial_removible' && PPR_MATERIAL_IDS.has(materialRaw)) {
      material = materialRaw as RehabPprMaterialId
    } else if (FIXED_MATERIAL_IDS.has(materialRaw)) {
      material = materialRaw as RehabFixedRestorationMaterialId
    }

    normalized[key] = {
      material,
      restorationColor: key === 'protesis_parcial_removible' ? '' : colorRaw,
    }
  }

  return normalized
}

export function formatRehabRestorationSpecSummary(
  spec: RehabTreatmentRestorationSpec | undefined,
): string {
  if (!spec) return ''
  const parts: string[] = []
  if (spec.material) parts.push(`Material: ${getRehabRestorationMaterialLabel(spec.material)}`)
  if (spec.restorationColor) parts.push(`Color: ${formatRehabRestorationColor(spec.restorationColor)}`)
  return parts.join(', ')
}

export function getImplantRestorationMaterialLabel(
  material: RehabRestorationMaterialId | '',
): string {
  if (!material) return ''
  const implant = IMPLANT_FIXED_RESTORATION_MATERIALS.find((item) => item.id === material)
  if (implant) return implant.label
  return getRehabRestorationMaterialLabel(material)
}

export function formatImplantRestorationSpecSummary(
  spec: RehabTreatmentRestorationSpec | undefined,
): string {
  if (!spec) return ''
  const parts: string[] = []
  if (spec.material) parts.push(`Material: ${getImplantRestorationMaterialLabel(spec.material)}`)
  if (spec.restorationColor) parts.push(`Color: ${formatRehabRestorationColor(spec.restorationColor)}`)
  return parts.join(', ')
}
