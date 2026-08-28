import type { ImplantFdiQuadrant } from '@/constants/implantPlanning'
import { FDI_QUADRANT_ORDER } from '@/constants/implantPlanning'

export type LekholmZarbBoneType = 'I' | 'II' | 'III' | 'IV'

export type AlveolarRidgeClass = 'A' | 'B' | 'C' | 'D' | 'E'

export interface QuadrantBoneAssessment {
  lekholmZarb: LekholmZarbBoneType | ''
  ridgeClass: AlveolarRidgeClass | ''
}

export type QuadrantBoneClassification = Record<ImplantFdiQuadrant, QuadrantBoneAssessment>

export const LEKHOLM_ZARB_OPTIONS: {
  id: LekholmZarbBoneType
  label: string
  description: string
}[] = [
  {
    id: 'I',
    label: 'Tipo I',
    description: 'Hueso cortical homogéneo.',
  },
  {
    id: 'II',
    label: 'Tipo II',
    description: 'Capa gruesa de cortical con núcleo trabecular denso.',
  },
  {
    id: 'III',
    label: 'Tipo III',
    description: 'Capa delgada de cortical con hueso trabecular favorable.',
  },
  {
    id: 'IV',
    label: 'Tipo IV',
    description: 'Hueso trabecular escaso con cortical muy delgada.',
  },
]

export const ALVEOLAR_RIDGE_CLASS_OPTIONS: {
  id: AlveolarRidgeClass
  label: string
  description: string
}[] = [
  {
    id: 'A',
    label: 'Clase A',
    description: 'Reborde alveolar con altura y anchura adecuadas.',
  },
  {
    id: 'B',
    label: 'Clase B',
    description: 'Ligera reducción de la altura del reborde.',
  },
  {
    id: 'C',
    label: 'Clase C',
    description: 'Reducción marcada de la altura del reborde.',
  },
  {
    id: 'D',
    label: 'Clase D',
    description: 'Reborde alveolar plano.',
  },
  {
    id: 'E',
    label: 'Clase E',
    description: 'Reborde alveolar deprimido, sin continuidad ósea basal.',
  },
]

export function createEmptyQuadrantBoneAssessment(): QuadrantBoneAssessment {
  return { lekholmZarb: '', ridgeClass: '' }
}

export function createEmptyQuadrantBoneClassification(): QuadrantBoneClassification {
  return FDI_QUADRANT_ORDER.reduce<QuadrantBoneClassification>((acc, quadrant) => {
    acc[quadrant] = createEmptyQuadrantBoneAssessment()
    return acc
  }, {} as QuadrantBoneClassification)
}

export function lekholmZarbLabel(type: LekholmZarbBoneType | ''): string {
  if (!type) return ''
  return LEKHOLM_ZARB_OPTIONS.find((item) => item.id === type)?.label ?? `Tipo ${type}`
}

export function lekholmZarbDescription(type: LekholmZarbBoneType | ''): string {
  if (!type) return ''
  return LEKHOLM_ZARB_OPTIONS.find((item) => item.id === type)?.description ?? ''
}

export function alveolarRidgeClassLabel(ridgeClass: AlveolarRidgeClass | ''): string {
  if (!ridgeClass) return ''
  return ALVEOLAR_RIDGE_CLASS_OPTIONS.find((item) => item.id === ridgeClass)?.label ?? `Clase ${ridgeClass}`
}

export function alveolarRidgeClassDescription(ridgeClass: AlveolarRidgeClass | ''): string {
  if (!ridgeClass) return ''
  return ALVEOLAR_RIDGE_CLASS_OPTIONS.find((item) => item.id === ridgeClass)?.description ?? ''
}

function isLekholmZarbBoneType(value: unknown): value is LekholmZarbBoneType {
  return LEKHOLM_ZARB_OPTIONS.some((item) => item.id === value)
}

function isAlveolarRidgeClass(value: unknown): value is AlveolarRidgeClass {
  return ALVEOLAR_RIDGE_CLASS_OPTIONS.some((item) => item.id === value)
}

export function normalizeQuadrantBoneAssessment(
  data?: Partial<QuadrantBoneAssessment>,
): QuadrantBoneAssessment {
  return {
    lekholmZarb:
      data?.lekholmZarb === '' || isLekholmZarbBoneType(data?.lekholmZarb) ? (data?.lekholmZarb ?? '') : '',
    ridgeClass:
      data?.ridgeClass === '' || isAlveolarRidgeClass(data?.ridgeClass) ? (data?.ridgeClass ?? '') : '',
  }
}

export function normalizeQuadrantBoneClassification(
  data?: Partial<QuadrantBoneClassification>,
): QuadrantBoneClassification {
  const empty = createEmptyQuadrantBoneClassification()
  return FDI_QUADRANT_ORDER.reduce<QuadrantBoneClassification>((acc, quadrant) => {
    acc[quadrant] = normalizeQuadrantBoneAssessment(data?.[quadrant])
    return acc
  }, empty)
}
