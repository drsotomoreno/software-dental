import { CUPS_ODONTOLOGIA } from '@/constants/cupsOdontologyData'
import { formatCupsCodeDotted, normalizeCupsCode } from '@/services/catalogService'

export interface CupsProcedureOption {
  procedure: string
  cupsCode: string
}

/**
 * Subcategoría .03 de odontología general en el formato jerárquico MinSalud
 * (89.0.2.03 → los dos últimos dígitos son 03).
 */
export function isGeneralDentistryCups03(code: string | null | undefined): boolean {
  const digits = String(code ?? '').replace(/\D/g, '')
  return digits.length === 6 && digits.endsWith('03')
}

function matchScore(option: CupsProcedureOption, query: string): number {
  const q = query.trim().toLowerCase()
  const code = normalizeCupsCode(option.cupsCode)
  const dotted = formatCupsCodeDotted(code).toLowerCase()
  const name = option.procedure.toLowerCase()
  const qDigits = q.replace(/\D/g, '')
  const generalBoost = isGeneralDentistryCups03(code) ? 25 : 0

  if (!q) {
    if (!isGeneralDentistryCups03(code)) return -1
    if (code.startsWith('890')) return 80
    if (code.startsWith('89')) return 60
    return generalBoost
  }

  let score = generalBoost
  if (code === qDigits || dotted === q) score += 100
  else if (qDigits.length >= 3 && (code.startsWith(qDigits) || dotted.includes(q))) score += 70
  else if (qDigits.length >= 2 && code.includes(qDigits)) score += 45
  else if (name.startsWith(q)) score += 40
  else if (name.includes(q) || dotted.includes(q)) score += 30
  else return -1

  return score
}

/** Autocompletado CUPS del plan: prioriza la subcategoría .03 y conserva el resto del catálogo odontológico. */
export function searchGeneralDentistryCups(
  query: string,
  extra: CupsProcedureOption[] = [],
  limit = 12,
): CupsProcedureOption[] {
  const map = new Map<string, CupsProcedureOption>()

  for (const entry of CUPS_ODONTOLOGIA) {
    map.set(entry.codigo, { procedure: entry.descripcion, cupsCode: entry.codigo })
  }
  for (const option of extra) {
    const code = normalizeCupsCode(option.cupsCode)
    if (!/^\d{6}$/.test(code)) continue
    map.set(code, { procedure: option.procedure, cupsCode: code })
  }

  return [...map.values()]
    .map((option) => ({ option, score: matchScore(option, query) }))
    .filter((entry) => entry.score >= 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.option.cupsCode.localeCompare(b.option.cupsCode) ||
        a.option.procedure.localeCompare(b.option.procedure, 'es'),
    )
    .slice(0, limit)
    .map((entry) => entry.option)
}
