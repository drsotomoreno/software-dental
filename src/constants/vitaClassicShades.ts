/** Guía VITA clásica — nomenclatura estándar para selección de color dental */

export type VitaClassicShade =
  | 'A1'
  | 'A2'
  | 'A3'
  | 'A3.5'
  | 'A4'
  | 'B1'
  | 'B2'
  | 'B3'
  | 'B4'
  | 'C1'
  | 'C2'
  | 'C3'
  | 'C4'
  | 'D2'
  | 'D3'
  | 'D4'

export interface VitaClassicShadeOption {
  id: VitaClassicShade
  group: 'A' | 'B' | 'C' | 'D'
}

export const VITA_CLASSIC_SHADE_GROUPS: { id: 'A' | 'B' | 'C' | 'D'; label: string }[] = [
  { id: 'A', label: 'Grupo A (rojizo-marrón)' },
  { id: 'B', label: 'Grupo B (rojizo-amarillo)' },
  { id: 'C', label: 'Grupo C (gris)' },
  { id: 'D', label: 'Grupo D (rojizo-gris)' },
]

export const VITA_CLASSIC_SHADES: VitaClassicShadeOption[] = [
  { id: 'A1', group: 'A' },
  { id: 'A2', group: 'A' },
  { id: 'A3', group: 'A' },
  { id: 'A3.5', group: 'A' },
  { id: 'A4', group: 'A' },
  { id: 'B1', group: 'B' },
  { id: 'B2', group: 'B' },
  { id: 'B3', group: 'B' },
  { id: 'B4', group: 'B' },
  { id: 'C1', group: 'C' },
  { id: 'C2', group: 'C' },
  { id: 'C3', group: 'C' },
  { id: 'C4', group: 'C' },
  { id: 'D2', group: 'D' },
  { id: 'D3', group: 'D' },
  { id: 'D4', group: 'D' },
]

const SHADE_SET = new Set<string>(VITA_CLASSIC_SHADES.map((shade) => shade.id))

export const VITA_MULTIPLE_COLORS_VALUE = 'multiples_colores' as const

export const VITA_MULTIPLE_COLORS_LABEL = 'Dentición con múltiples colores'

export type RehabArchToothColorSelection = VitaClassicShade | typeof VITA_MULTIPLE_COLORS_VALUE | ''

export function isVitaClassicShade(value: unknown): value is VitaClassicShade {
  return typeof value === 'string' && SHADE_SET.has(value)
}

export function isRehabArchToothColorSelection(value: unknown): value is Exclude<RehabArchToothColorSelection, ''> {
  return value === VITA_MULTIPLE_COLORS_VALUE || isVitaClassicShade(value)
}

export function formatRehabArchToothColor(value: RehabArchToothColorSelection): string {
  if (!value) return ''
  if (value === VITA_MULTIPLE_COLORS_VALUE) return VITA_MULTIPLE_COLORS_LABEL
  return `VITA ${value}`
}
