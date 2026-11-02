import { IMPLANT_FIXTURE_SIZE_OPTIONS } from '@/constants/implantPlanning'

/** Medidas genéricas de implante (select quirúrgico). */
export const UNIFIED_IMPLANT_MEASURE_OPTIONS = IMPLANT_FIXTURE_SIZE_OPTIONS.map((option) => ({
  id: option.id,
  label: option.label,
}))

/** Marcas frecuentes para autocompletado (datalist) — entrada libre permitida. */
export const UNIFIED_IMPLANT_BRAND_SUGGESTIONS = [
  'Neodent',
  'Straumann',
  'Nobel Biocare',
  'BioHorizons',
  'MIS',
  'Zimmer Biomet',
  'Osstem',
  'MegaGen',
  'Dentium',
  'Bego',
] as const

export const UNIFIED_ABUTMENT_TYPE_OPTIONS = [
  { id: 'tibase', label: 'TiBase' },
  { id: 'multi_unit', label: 'Multi-unit' },
  { id: 'straight', label: 'Pilar recto' },
  { id: 'angled_15', label: 'Pilar angulado 15°' },
  { id: 'angled_30', label: 'Pilar angulado 30°' },
  { id: 'custom_cadcam', label: 'Pilar personalizado CAD/CAM' },
  { id: 'locator', label: 'Locator / Attachment' },
] as const

export type UnifiedAbutmentTypeId = (typeof UNIFIED_ABUTMENT_TYPE_OPTIONS)[number]['id']

export const UNIFIED_RESTORATION_MATERIAL_OPTIONS = [
  { id: 'zirconio', label: 'Zirconio' },
  { id: 'disilicato_litio', label: 'Disilicato de Litio' },
  { id: 'metal_ceramica', label: 'Metal-Cerámica' },
  { id: 'pmma', label: 'PMMA provisional' },
  { id: 'acrilico', label: 'Acrílico' },
] as const

export type UnifiedRestorationMaterialId =
  (typeof UNIFIED_RESTORATION_MATERIAL_OPTIONS)[number]['id']

/** Precios base de referencia (COP) para el resumen financiero offline. */
export const DEFAULT_UNIFIED_IMPLANT_UNIT_PRICES = {
  implante: 1_800_000,
  pilar: 650_000,
  corona: 1_200_000,
} as const

export const UPPER_FDI_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28] as const
export const LOWER_FDI_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38] as const

export const UPPER_RIGHT_FDI = [18, 17, 16, 15, 14, 13, 12, 11] as const
export const UPPER_LEFT_FDI = [21, 22, 23, 24, 25, 26, 27, 28] as const
export const LOWER_LEFT_FDI = [31, 32, 33, 34, 35, 36, 37, 38] as const
export const LOWER_RIGHT_FDI = [48, 47, 46, 45, 44, 43, 42, 41] as const

export const EDENTULOUS_RIDGE_SLOT_COUNT = 6

export function abutmentTypeLabel(id: string): string {
  return UNIFIED_ABUTMENT_TYPE_OPTIONS.find((item) => item.id === id)?.label ?? id
}

export function restorationMaterialLabel(id: string): string {
  return UNIFIED_RESTORATION_MATERIAL_OPTIONS.find((item) => item.id === id)?.label ?? id
}

export function implantMeasureLabel(id: string): string {
  return UNIFIED_IMPLANT_MEASURE_OPTIONS.find((item) => item.id === id)?.label ?? id
}
