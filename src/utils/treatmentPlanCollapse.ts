import type { TreatmentPlanItem } from '../types/clinicalRecord.ts'

/** FDI permanente (evita importar cupsLocationRules y su cadena `@/`). */
function isValidFdiToothNumber(value: number | undefined): value is number {
  if (!Number.isInteger(value)) return false
  const tooth = value as number
  const quadrant = Math.floor(tooth / 10)
  const index = tooth % 10
  return quadrant >= 1 && quadrant <= 4 && index >= 1 && index <= 8
}

/** Filas legacy del anexo de rehabilitación: «Carilla Dental — pieza 13». */
const PIEZA_SUFFIX_RE = /\s*[—–-]\s*pieza\s+(\d{1,2})\s*$/i
/** Prefijo CUPS en el texto del procedimiento: «99.7.2.07 — …». */
const CUPS_PREFIX_RE = /^[\d.]+?\s*[—–-]\s*/
const COLOR_SUFFIX_RE = /\s*\(color:\s*[^)]+\)\s*$/i

/**
 * Familias de rehabilitación: variantes de nombre se colapsan juntas
 * (p. ej. «Carilla Dental», «Carilla Dental Indirecta», «Carilla estética indirecta»).
 */
const REHAB_FAMILY_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'rehab:carilla', pattern: /^carilla\b/i },
  { key: 'rehab:pilar_ppf', pattern: /^pilar\s+de\s+ppf\b/i },
  {
    key: 'rehab:pontico_ppf',
    pattern: /^p[oó]ntico\s+de\s+(?:ppf|pr[oó]tesis\s+fija)\b/i,
  },
  { key: 'rehab:corona_individual', pattern: /^corona\s+individual\b/i },
  { key: 'rehab:implante', pattern: /^implante\s+dental\b/i },
  { key: 'rehab:incrustacion', pattern: /^incrustaci[oó]n\b/i },
]

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '')
}

/** Nombre base sin sufijo de pieza ni ruido de catálogo. */
export function stripTreatmentProcedureNoise(procedure: string): string {
  let text = procedure.trim()
  text = text.replace(PIEZA_SUFFIX_RE, '')
  text = text.replace(CUPS_PREFIX_RE, '')
  text = text.replace(COLOR_SUFFIX_RE, '')
  return text.trim()
}

export function parsePiezaSuffixTooth(procedure: string): number | undefined {
  const match = procedure.trim().match(PIEZA_SUFFIX_RE)
  if (!match) return undefined
  const tooth = Number(match[1])
  return isValidFdiToothNumber(tooth) ? tooth : undefined
}

export function treatmentProcedureFamilyKey(
  procedure: string,
  /** Si el procedimiento está vacío, conserva la fila (p. ej. «Agregar Nuevo Procedimiento»). */
  uniqueEmptyId?: string,
): string {
  const base = stripTreatmentProcedureNoise(procedure)
  const normalized = stripDiacritics(base).toLowerCase().replace(/\s+/g, ' ').trim()
  if (!normalized) return uniqueEmptyId ? `empty:${uniqueEmptyId}` : 'proc:'

  for (const entry of REHAB_FAMILY_PATTERNS) {
    if (entry.pattern.test(normalized)) return entry.key
  }

  return `proc:${normalized}`
}

/** Expande «11, 12, 14-16, Q1» a piezas FDI cuando hay números o rangos. */
export function extractTeethFromZoneText(raw: string | undefined): number[] {
  if (!raw?.trim()) return []
  const teeth = new Set<number>()
  const parts = raw.split(/[,;]+/).map((part) => part.trim()).filter(Boolean)

  for (const part of parts) {
    const range = part.match(/^(\d{2})\s*[-–]\s*(\d{2})$/)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (isValidFdiToothNumber(start) && isValidFdiToothNumber(end) && start <= end) {
        for (let tooth = start; tooth <= end; tooth += 1) {
          if (isValidFdiToothNumber(tooth)) teeth.add(tooth)
        }
      }
      continue
    }

    if (/^\d{2}$/.test(part)) {
      const tooth = Number(part)
      if (isValidFdiToothNumber(tooth)) teeth.add(tooth)
    }
  }

  return [...teeth].sort((a, b) => a - b)
}

export function collectTreatmentPlanItemTeeth(
  item: Pick<TreatmentPlanItem, 'procedure' | 'toothNumber' | 'anatomicalZone'>,
): number[] {
  const teeth = new Set<number>()
  if (isValidFdiToothNumber(item.toothNumber)) teeth.add(item.toothNumber!)

  const fromLabel = parsePiezaSuffixTooth(item.procedure ?? '')
  if (fromLabel != null) teeth.add(fromLabel)

  for (const tooth of extractTeethFromZoneText(item.anatomicalZone)) {
    teeth.add(tooth)
  }

  return [...teeth].sort((a, b) => a - b)
}

function formatTeethZone(teeth: number[]): string {
  return teeth.join(', ')
}

function preferSurvivor(left: TreatmentPlanItem, right: TreatmentPlanItem): TreatmentPlanItem {
  const leftSummary = left.notes?.includes('importKey:summary:') ? 1 : 0
  const rightSummary = right.notes?.includes('importKey:summary:') ? 1 : 0
  if (rightSummary !== leftSummary) return rightSummary > leftSummary ? right : left

  const leftTeeth = collectTreatmentPlanItemTeeth(left).length
  const rightTeeth = collectTreatmentPlanItemTeeth(right).length
  if (rightTeeth !== leftTeeth) return rightTeeth > leftTeeth ? right : left

  const leftPrice = left.unitPrice ?? 0
  const rightPrice = right.unitPrice ?? 0
  if (rightPrice !== leftPrice) return rightPrice > leftPrice ? right : left

  const leftHasPieza = PIEZA_SUFFIX_RE.test(left.procedure) ? 0 : 1
  const rightHasPieza = PIEZA_SUFFIX_RE.test(right.procedure) ? 0 : 1
  if (rightHasPieza !== leftHasPieza) return rightHasPieza > leftHasPieza ? right : left

  return left
}

function mergeGroup(items: TreatmentPlanItem[]): TreatmentPlanItem {
  const survivor = items.reduce((best, item) => preferSurvivor(best, item))
  const teeth = [...new Set(items.flatMap((item) => collectTreatmentPlanItemTeeth(item)))].sort(
    (a, b) => a - b,
  )
  const procedure = stripTreatmentProcedureNoise(survivor.procedure) || survivor.procedure
  const unitPrice = Math.max(0, ...items.map((item) => item.unitPrice ?? 0))
  const cupsCode =
    survivor.cupsCode ||
    items.find((item) => item.cupsCode?.trim())?.cupsCode

  if (teeth.length === 0) {
    return {
      ...survivor,
      procedure,
      cupsCode,
      unitPrice,
      quantity: Math.max(1, survivor.quantity ?? 1),
    }
  }

  if (teeth.length === 1) {
    const tooth = teeth[0]
    return {
      ...survivor,
      procedure,
      cupsCode,
      toothNumber: tooth,
      anatomicalZone: String(tooth),
      fdiQuadrant: undefined,
      arch: undefined,
      unitPrice,
      quantity: 1,
    }
  }

  const zoneLabel = formatTeethZone(teeth)
  return {
    ...survivor,
    procedure,
    cupsCode,
    toothNumber: undefined,
    fdiQuadrant: undefined,
    arch: undefined,
    anatomicalZone: zoneLabel,
    unitPrice,
    quantity: Math.max(teeth.length, survivor.quantity ?? 1),
  }
}

/**
 * Agrupa el plan por tipo de tratamiento.
 * Varias piezas del mismo tratamiento → una sola fila con la zona concatenada.
 * Una sola pieza → fila individual (sin sufijo «— pieza N»).
 */
export function collapseTreatmentPlanByProcedure(
  items: TreatmentPlanItem[] | undefined | null,
): TreatmentPlanItem[] {
  if (!Array.isArray(items) || items.length === 0) return []

  const groups = new Map<string, { index: number; items: TreatmentPlanItem[] }>()

  items.forEach((item, index) => {
    const key = treatmentProcedureFamilyKey(item.procedure ?? '', item.id)
    const existing = groups.get(key)
    if (existing) {
      existing.items.push(item)
      return
    }
    groups.set(key, { index, items: [item] })
  })

  const collapsed = [...groups.values()]
    .sort((a, b) => a.index - b.index)
    .map((group) => {
      if (group.items.length === 1) {
        const only = group.items[0]
        const teeth = collectTreatmentPlanItemTeeth(only)
        // Limpia «— pieza N» aunque no haya duplicados.
        if (PIEZA_SUFFIX_RE.test(only.procedure) || teeth.length > 1) {
          return mergeGroup(group.items)
        }
        return only
      }
      return mergeGroup(group.items)
    })

  return collapsed
}
