import type { ImplantFdiQuadrant } from '@/constants/implantPlanning'
import type { TreatmentPlanItem } from '@/types/clinicalRecord'
import { isValidFdiToothNumber } from '@/utils/cupsLocationRules'

export const ZONE_GENERAL = 'General'
export const ZONE_UPPER_ARCH = 'Arcada Superior'
export const ZONE_LOWER_ARCH = 'Arcada Inferior'

export const ANATOMICAL_ZONE_PRESETS = [
  ZONE_GENERAL,
  ZONE_UPPER_ARCH,
  ZONE_LOWER_ARCH,
  'Q1',
  'Q2',
  'Q3',
  'Q4',
] as const

const QUADRANT_BY_DIGIT: Record<string, ImplantFdiQuadrant> = {
  '1': 'Q1',
  '2': 'Q2',
  '3': 'Q3',
  '4': 'Q4',
}

export interface ParsedAnatomicalZone {
  anatomicalZone: string
  toothNumber?: number
  fdiQuadrant?: ImplantFdiQuadrant
  arch?: 'superior' | 'inferior'
}

function emptyZone(): ParsedAnatomicalZone {
  return {
    anatomicalZone: '',
    toothNumber: undefined,
    fdiQuadrant: undefined,
    arch: undefined,
  }
}

function quadrantFromPermanentTooth(toothNumber: number): ImplantFdiQuadrant | undefined {
  return QUADRANT_BY_DIGIT[String(Math.floor(toothNumber / 10))]
}

function parseQuadrantToken(value: string): ImplantFdiQuadrant | undefined {
  const compact = value.replace(/\s+/g, ' ').trim().toLowerCase()
  const direct = compact.match(/^q([1-4])$/)
  if (direct) return QUADRANT_BY_DIGIT[direct[1]]
  const labeled = compact.match(/^(?:cuadrante|sector)\s*([1-4])$/)
  if (labeled) return QUADRANT_BY_DIGIT[labeled[1]]
  return undefined
}

/** Interpreta la celda Diente / Zona y la proyecta a los campos que consume RIPS. */
export function parseAnatomicalZone(raw: string): ParsedAnatomicalZone {
  const text = raw.trim()
  if (!text) return emptyZone()

  const normalized = text.replace(/\s+/g, ' ')
  const key = normalized.toLowerCase()

  if (key === 'general' || key === 'gral') {
    return { anatomicalZone: ZONE_GENERAL }
  }

  if (key === 'arcada superior' || key === 'superior' || key === 'maxilar') {
    return { anatomicalZone: ZONE_UPPER_ARCH, arch: 'superior' }
  }

  if (key === 'arcada inferior' || key === 'inferior' || key === 'mandibular') {
    return { anatomicalZone: ZONE_LOWER_ARCH, arch: 'inferior' }
  }

  const quadrant = parseQuadrantToken(normalized)
  if (quadrant) {
    return { anatomicalZone: quadrant, fdiQuadrant: quadrant }
  }

  const range = normalized.match(/^(\d{2})\s*[-–]\s*(\d{2})$/)
  if (range) {
    const start = Number(range[1])
    const end = Number(range[2])
    const label = `${start}-${end}`
    if (isValidFdiToothNumber(start) && isValidFdiToothNumber(end)) {
      const startQuadrant = quadrantFromPermanentTooth(start)
      const endQuadrant = quadrantFromPermanentTooth(end)
      if (startQuadrant && startQuadrant === endQuadrant) {
        return { anatomicalZone: label, fdiQuadrant: startQuadrant }
      }
    }
    return { anatomicalZone: label }
  }

  if (/^\d{2}$/.test(normalized)) {
    const toothNumber = Number(normalized)
    if (isValidFdiToothNumber(toothNumber)) {
      return { anatomicalZone: String(toothNumber), toothNumber }
    }
  }

  return { anatomicalZone: normalized }
}

type AnatomicalSiteCarrier = {
  anatomicalZone?: string
  toothNumber?: number
  fdiQuadrant?: ImplantFdiQuadrant
  arch?: 'superior' | 'inferior'
}

/** Reemplaza la ubicación anatómica y descarta la pieza, cuadrante o arcada anterior. */
export function applyAnatomicalSite<T extends AnatomicalSiteCarrier>(item: T, raw: string): T {
  const parsed = parseAnatomicalZone(raw)
  const next = { ...item }
  delete next.anatomicalZone
  delete next.toothNumber
  delete next.fdiQuadrant
  delete next.arch
  if (parsed.anatomicalZone) next.anatomicalZone = parsed.anatomicalZone
  if (parsed.toothNumber !== undefined) next.toothNumber = parsed.toothNumber
  if (parsed.fdiQuadrant) next.fdiQuadrant = parsed.fdiQuadrant
  if (parsed.arch) next.arch = parsed.arch
  return next
}

/** Texto visible de la zona, incluso en registros guardados antes de `anatomicalZone`. */
export function formatAnatomicalZone(
  item: Pick<TreatmentPlanItem, 'anatomicalZone' | 'toothNumber' | 'fdiQuadrant' | 'arch'>,
): string {
  const stored = item.anatomicalZone?.trim()
  if (stored) return stored
  if (isValidFdiToothNumber(item.toothNumber)) return String(item.toothNumber)
  if (item.fdiQuadrant) return item.fdiQuadrant
  if (item.arch === 'superior') return ZONE_UPPER_ARCH
  if (item.arch === 'inferior') return ZONE_LOWER_ARCH
  return ''
}
