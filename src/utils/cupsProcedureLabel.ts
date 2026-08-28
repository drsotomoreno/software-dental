import { formatCupsCodeDotted } from '@/services/catalogService'

export interface CupsProcedureOption {
  cupsCode: string
  procedure: string
}

/** Acorta descripciones largas del catálogo CUPS para listas y campos compactos. */
export function abbreviateProcedureLabel(description: string, maxLength = 42): string {
  const normalized = description.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized

  const slice = normalized.slice(0, maxLength)
  const boundary = slice.lastIndexOf(' ')
  const base = boundary > 24 ? slice.slice(0, boundary) : slice
  return `${base.trim()}…`
}

export function formatCupsProcedureLabel(cupsCode: string, procedure: string): string {
  return `${formatCupsCodeDotted(cupsCode)} — ${abbreviateProcedureLabel(procedure)}`
}

export function buildCupsProcedureOptions(
  shortlist: CupsProcedureOption[],
  prices: Array<{ procedure: string; cupsCode: string }> | undefined,
  catalogItems: Array<{ code: string; description: string }> | undefined,
): CupsProcedureOption[] {
  const map = new Map<string, CupsProcedureOption>()

  for (const item of shortlist) {
    map.set(`${item.procedure}|${item.cupsCode}`, item)
  }

  for (const price of prices ?? []) {
    map.set(`${price.procedure}|${price.cupsCode}`, {
      procedure: price.procedure,
      cupsCode: price.cupsCode,
    })
  }

  for (const item of catalogItems ?? []) {
    map.set(`${item.description}|${item.code}`, {
      procedure: item.description,
      cupsCode: item.code,
    })
  }

  return [...map.values()]
}

export function filterCupsProcedureOptions(
  options: CupsProcedureOption[],
  query: string,
  limit = 12,
): CupsProcedureOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return options.slice(0, limit)

  return options
    .filter((option) => {
      const dotted = formatCupsCodeDotted(option.cupsCode).toLowerCase()
      return (
        option.procedure.toLowerCase().includes(q) ||
        option.cupsCode.toLowerCase().includes(q) ||
        dotted.includes(q)
      )
    })
    .slice(0, limit)
}
