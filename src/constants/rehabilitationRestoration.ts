import type { RehabTreatmentType } from '@/components/clinical/rehabilitation/rehab-odontogram/types'

export const REHAB_FIXED_RESTORATION_MATERIALS = [
  { id: 'disilicato_litio', label: 'Disilicato de Litio' },
  { id: 'zirconio', label: 'Zirconio' },
] as const

/** Materiales de la tabla de presupuesto de rehabilitación estética. */
export const REHAB_BUDGET_MATERIALS = [
  { id: 'disilicato_litio', label: 'Disilicato de Litio' },
  { id: 'zirconio', label: 'Zirconio' },
  { id: 'otra_ceramica', label: 'Otra Cerámica' },
  { id: 'material_impresion_3d', label: 'Material de Impresión 3D' },
  { id: 'material_polimerico', label: 'Material Polimérico' },
  { id: 'metal_ceramica', label: 'Metal+Cerámica' },
  { id: 'otro', label: 'Otro' },
] as const

export type RehabBudgetMaterialId = (typeof REHAB_BUDGET_MATERIALS)[number]['id']

const BUDGET_MATERIAL_IDS = new Set<string>(REHAB_BUDGET_MATERIALS.map((item) => item.id))

export function isRehabBudgetMaterialId(value: unknown): value is RehabBudgetMaterialId {
  return typeof value === 'string' && BUDGET_MATERIAL_IDS.has(value)
}

export function getRehabBudgetMaterialLabel(material: string | undefined): string {
  if (!material) return ''
  return REHAB_BUDGET_MATERIALS.find((item) => item.id === material)?.label ?? material
}

/** Normaliza materiales legacy o del resumen a la lista unificada del presupuesto. */
export function mapRestorationMaterialToBudgetMaterial(
  material: string | undefined,
): RehabBudgetMaterialId | '' {
  if (!material) return ''
  if (isRehabBudgetMaterialId(material)) return material
  if (material === 'resina_impresa') return 'material_impresion_3d'
  if (material === 'resina_directa') return 'material_polimerico'
  if (material === 'acrilico_rigido' || material === 'acrilico_flexible') return 'material_polimerico'
  if (material === 'aleacion_metalica') return 'metal_ceramica'
  return ''
}

/** Materiales adicionales exclusivos de carillas dentales */
export const REHAB_CARILLA_EXTRA_MATERIALS = [
  { id: 'resina_directa', label: 'Resina Directa' },
  { id: 'resina_impresa', label: 'Resina Impresa' },
] as const

export const REHAB_CARILLA_RESTORATION_MATERIALS = [
  ...REHAB_FIXED_RESTORATION_MATERIALS,
  ...REHAB_CARILLA_EXTRA_MATERIALS,
]

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
export type RehabCarillaExtraMaterialId = (typeof REHAB_CARILLA_EXTRA_MATERIALS)[number]['id']
export type RehabPprMaterialId = (typeof REHAB_PPR_MATERIALS)[number]['id']

/** Material del resumen/presupuesto de rehabilitación (misma lista unificada). */
export type RehabRestorationMaterialId = RehabBudgetMaterialId

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
  return getRehabBudgetMaterialLabel(material)
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
    const material = mapRestorationMaterialToBudgetMaterial(materialRaw)

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
