import type { ToothAnatomyType } from './types'

/** Vista sagital / lateral (perfil vestibular): corona hacia la línea oclusal, raíz hacia el hueso */
export interface ToothShapePaths {
  crown: string
  root: string
  neck?: string
  buccalHighlight?: string
}

export interface ToothShapeSpec extends ToothShapePaths {
  width: number
  height: number
}

const UPPER_LATERAL_SHAPES: Record<ToothAnatomyType, ToothShapeSpec> = {
  incisor: {
    width: 30,
    height: 84,
    crown:
      'M11 38 C7 38 5 42 5 48 L5 58 C5 62 7 64 11 64 L11 64 C15 64 17 62 17 58 L17 48 C17 42 15 38 11 38 Z',
    neck: 'M7 36 L15 36',
    root: 'M10 4 C8 4 7 8 7 14 L8 30 C8 34 9 36 11 36 C13 36 14 34 14 30 L15 14 C15 8 14 4 12 4 Z',
    buccalHighlight: 'M12 44 L12 58',
  },
  canine: {
    width: 32,
    height: 88,
    crown:
      'M12 36 C7 36 4 41 4 48 L6 60 C6 64 8 66 12 66 C16 66 18 64 18 60 L20 48 C20 41 17 36 12 36 Z M12 36 L12 50',
    neck: 'M7 34 L17 34',
    root: 'M11 3 C8 3 6 9 6 16 L7 30 C7 34 9 36 12 36 C15 36 17 34 17 30 L18 16 C18 9 16 3 13 3 Z',
    buccalHighlight: 'M13 42 L13 58',
  },
  premolar: {
    width: 36,
    height: 86,
    crown:
      'M14 37 C8 37 4 42 4 49 L5 58 C5 63 8 65 14 65 C20 65 23 63 23 58 L24 49 C24 42 20 37 14 37 Z M8 48 C10 44 12 43 14 44 C16 43 18 44 20 48',
    neck: 'M8 35 L20 35',
    root: 'M10 4 C8 4 7 10 7 16 L8 28 C8 33 10 35 12 35 L16 35 C18 35 20 33 20 28 L21 16 C21 10 20 4 18 4 Z',
    buccalHighlight: 'M15 44 L15 58',
  },
  molar: {
    width: 42,
    height: 90,
    crown:
      'M17 38 C9 38 3 44 3 52 L4 60 C4 66 9 68 17 68 C25 68 30 66 30 60 L31 52 C31 44 25 38 17 38 Z M9 50 C11 46 14 45 17 46 C20 45 23 46 25 50 M11 56 L23 56',
    neck: 'M9 36 L25 36',
    root:
      'M9 4 C7 4 6 10 6 16 L7 26 C7 31 8 34 10 34 L11 34 M23 34 L24 34 C26 34 27 31 27 26 L28 16 C28 10 27 4 25 4 Z M12 34 L12 20 M22 34 L22 20',
    buccalHighlight: 'M18 46 L18 62',
  },
}

export function getToothAnatomyType(fdi: number): ToothAnatomyType {
  const position = fdi % 10
  if (position <= 2) return 'incisor'
  if (position === 3) return 'canine'
  if (position <= 5) return 'premolar'
  return 'molar'
}

export function getToothShape(fdi: number): ToothShapeSpec {
  return UPPER_LATERAL_SHAPES[getToothAnatomyType(fdi)]
}

export interface ImplantScrewSpec {
  body: string
  threads: string[]
  collar: string
}

/** Tornillo de implante — reemplaza la raíz en vista sagital */
const IMPLANT_SCREWS: Record<ToothAnatomyType, ImplantScrewSpec> = {
  incisor: {
    body: 'M10 6 L14 10 L14 32 C14 35 16 36 18 36 C20 36 22 35 22 32 L22 10 L26 6 L24 4 L20 4 L18 5 L16 4 L12 4 Z',
    collar: 'M14 34 L22 34',
    threads: [
      'M12 12 L24 13',
      'M12 16 L24 17',
      'M12 20 L24 21',
      'M12 24 L24 25',
      'M12 28 L24 29',
    ],
  },
  canine: {
    body: 'M9 5 L13 10 L13 33 C13 36 15 37 18 37 C21 37 23 36 23 33 L23 10 L27 5 L25 3 L20 3 L18 4 L16 3 L11 3 Z',
    collar: 'M13 35 L23 35',
    threads: [
      'M11 13 L25 14',
      'M11 17 L25 18',
      'M11 21 L25 22',
      'M11 25 L25 26',
      'M11 29 L25 30',
    ],
  },
  premolar: {
    body: 'M8 5 L12 10 L12 32 C12 35 14 36 18 36 C22 36 24 35 24 32 L24 10 L28 5 L26 3 L20 3 L18 4 L16 3 L10 3 Z',
    collar: 'M12 34 L24 34',
    threads: [
      'M10 12 L26 13',
      'M10 16 L26 17',
      'M10 20 L26 21',
      'M10 24 L26 25',
      'M10 28 L26 29',
    ],
  },
  molar: {
    body: 'M6 5 L10 10 L10 31 C10 35 12 36 18 36 C24 36 26 35 26 31 L26 10 L30 5 L28 3 L22 3 L18 4 L14 3 L8 3 Z',
    collar: 'M10 34 L26 34',
    threads: [
      'M8 12 L28 13',
      'M8 16 L28 17',
      'M8 20 L28 21',
      'M8 24 L28 25',
      'M8 28 L28 29',
    ],
  },
}

export function getImplantScrew(fdi: number): ImplantScrewSpec {
  return IMPLANT_SCREWS[getToothAnatomyType(fdi)]
}
