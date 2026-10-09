import type { ImplantFdiQuadrant } from '@/constants/implantPlanning'
import { isValidFdiToothNumber } from '@/utils/cupsLocationRules'

/** Datos mínimos para saber si dos filas son el mismo tratamiento clínico. */
export interface TreatmentIdentity {
  procedure?: string
  cupsCode?: string
  toothNumber?: number
  fdiQuadrant?: ImplantFdiQuadrant
  arch?: 'superior' | 'inferior'
  anatomicalZone?: string
}

function procedureKey(value?: string): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** CUPS comparable. Un código a medio escribir no participa en la identidad. */
export function canonicalCupsCode(code?: string): string {
  const raw = (code ?? '').trim()
  if (!raw) return ''
  if (/^custom_/i.test(raw)) return raw.toUpperCase()
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 6) return ''
  return digits.padStart(6, '0').slice(0, 6)
}

function locationKey(item: TreatmentIdentity): string {
  if (isValidFdiToothNumber(item.toothNumber)) return `tooth:${item.toothNumber}`

  const zone = (item.anatomicalZone ?? '').trim().toLowerCase()
  if (/^\d{2}$/.test(zone)) {
    const toothNumber = Number(zone)
    if (isValidFdiToothNumber(toothNumber)) return `tooth:${toothNumber}`
  }

  if (item.fdiQuadrant) return `q:${item.fdiQuadrant}`
  if (/^q[1-4]$/.test(zone)) return `q:${zone.toUpperCase()}`

  if (item.arch === 'superior' || item.arch === 'inferior') return `arch:${item.arch}`
  if (zone === 'arcada superior' || zone === 'superior' || zone === 'maxilar') return 'arch:superior'
  if (zone === 'arcada inferior' || zone === 'inferior' || zone === 'mandibular') return 'arch:inferior'

  if (!zone || zone === 'general' || zone === 'gral') return 'none'
  return `zone:${zone}`
}

function hasClinicalIdentity(item: TreatmentIdentity): boolean {
  return Boolean(procedureKey(item.procedure) || canonicalCupsCode(item.cupsCode))
}

/**
 * Mismo tratamiento: misma zona y mismo CUPS, o el mismo nombre si a uno le falta el código.
 * Piezas distintas no se consideran duplicado.
 */
export function isSameTreatment(left: TreatmentIdentity, right: TreatmentIdentity): boolean {
  if (!hasClinicalIdentity(left) || !hasClinicalIdentity(right)) return false
  if (locationKey(left) !== locationKey(right)) return false

  const cupsLeft = canonicalCupsCode(left.cupsCode)
  const cupsRight = canonicalCupsCode(right.cupsCode)
  if (cupsLeft && cupsRight) return cupsLeft === cupsRight

  const nameLeft = procedureKey(left.procedure)
  const nameRight = procedureKey(right.procedure)
  return Boolean(nameLeft) && nameLeft === nameRight
}

export function findDuplicateTreatment<T extends TreatmentIdentity>(
  items: T[],
  candidate: TreatmentIdentity,
  ignoreId?: string,
): T | undefined {
  return items.find((item) => {
    const id = (item as T & { id?: string }).id
    if (ignoreId && id === ignoreId) return false
    return isSameTreatment(item, candidate)
  })
}

export function duplicateTreatmentIdSet(
  items: Array<TreatmentIdentity & { id?: string }>,
): Set<string> {
  const ids = new Set<string>()
  for (let index = 0; index < items.length; index += 1) {
    for (let other = index + 1; other < items.length; other += 1) {
      if (!isSameTreatment(items[index], items[other])) continue
      const leftId = items[index]?.id
      const rightId = items[other]?.id
      if (leftId) ids.add(leftId)
      if (rightId) ids.add(rightId)
    }
  }
  return ids
}

export function treatmentLocationLabel(item: TreatmentIdentity): string {
  if (isValidFdiToothNumber(item.toothNumber)) return String(item.toothNumber)
  const zone = item.anatomicalZone?.trim()
  if (zone) return zone
  if (item.fdiQuadrant) return item.fdiQuadrant
  if (item.arch === 'superior') return 'Arcada Superior'
  if (item.arch === 'inferior') return 'Arcada Inferior'
  return ''
}

export function duplicateTreatmentNotice(item: TreatmentIdentity): string {
  const name = item.procedure?.trim() || item.cupsCode?.trim() || 'Este tratamiento'
  const zone = treatmentLocationLabel(item)
  const where = zone ? ` en ${zone}` : ''
  return `${name}${where} ya está registrado y no se agregó otra vez.`
}

export function skippedTreatmentsMessage(skipped: number, sectionLabel: string): string | null {
  if (skipped <= 0) return null
  if (skipped === 1) {
    return `1 tratamiento ya estaba en ${sectionLabel} y no se agregó otra vez.`
  }
  return `${skipped} tratamientos ya estaban en ${sectionLabel} y no se agregaron otra vez.`
}
