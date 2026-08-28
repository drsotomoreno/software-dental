/** Guía VITA 3D-Master — nomenclatura estándar para selección de color dental */

export type Vita3dMasterShade =
  | '0M1'
  | '0M2'
  | '0M3'
  | '0R1.5'
  | '0R2.5'
  | '1M1'
  | '1M2'
  | '1M3'
  | '1R1.5'
  | '1R2.5'
  | '2L1.5'
  | '2L2.5'
  | '2M1'
  | '2M2'
  | '2M3'
  | '2R1.5'
  | '2R2.5'
  | '3L1.5'
  | '3L2.5'
  | '3M1'
  | '3M2'
  | '3M3'
  | '3R1.5'
  | '3R2.5'
  | '4L1.5'
  | '4L2.5'
  | '4M1'
  | '4M2'
  | '4M3'
  | '4R1.5'
  | '4R2.5'
  | '5M1'
  | '5M2'
  | '5M3'

export const VITA_3D_MASTER_SHADE_GROUPS: { id: string; label: string; shades: Vita3dMasterShade[] }[] = [
  {
    id: '0',
    label: 'Valor 0',
    shades: ['0M1', '0M2', '0M3', '0R1.5', '0R2.5'],
  },
  {
    id: '1',
    label: 'Valor 1',
    shades: ['1M1', '1M2', '1M3', '1R1.5', '1R2.5'],
  },
  {
    id: '2',
    label: 'Valor 2',
    shades: ['2L1.5', '2L2.5', '2M1', '2M2', '2M3', '2R1.5', '2R2.5'],
  },
  {
    id: '3',
    label: 'Valor 3',
    shades: ['3L1.5', '3L2.5', '3M1', '3M2', '3M3', '3R1.5', '3R2.5'],
  },
  {
    id: '4',
    label: 'Valor 4',
    shades: ['4L1.5', '4L2.5', '4M1', '4M2', '4M3', '4R1.5', '4R2.5'],
  },
  {
    id: '5',
    label: 'Valor 5',
    shades: ['5M1', '5M2', '5M3'],
  },
]

export const VITA_3D_MASTER_SHADES: Vita3dMasterShade[] = VITA_3D_MASTER_SHADE_GROUPS.flatMap(
  (group) => group.shades,
)

const SHADE_SET = new Set<string>(VITA_3D_MASTER_SHADES)

export function isVita3dMasterShade(value: unknown): value is Vita3dMasterShade {
  return typeof value === 'string' && SHADE_SET.has(value)
}

export function formatVita3dMasterShade(shade: Vita3dMasterShade): string {
  return `3D Master ${shade}`
}
