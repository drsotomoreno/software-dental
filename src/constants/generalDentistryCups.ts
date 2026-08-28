import { normalizeCupsCode } from '@/services/catalogService'
import {
  DEFAULT_ODONTOLOGY_CONSULTATION_CUPS,
  ODONTOLOGY_EMERGENCY_CONSULTATION_CUPS,
  ODONTOLOGY_FOLLOWUP_CONSULTATION_CUPS,
  ODONTOLOGY_SPECIALTY_FIRST_VISIT_CUPS,
  ODONTOLOGY_SPECIALTY_FOLLOWUP_CUPS,
} from '@/constants/rips'
import {
  ODONTOLOGY_THS_SPECIALTIES,
  type OdontologyThsSpecialtyId,
} from '@/constants/ripsThsSpecialty'

const GENERAL_DENTISTRY_CONSULTATION_CUPS = new Set([
  DEFAULT_ODONTOLOGY_CONSULTATION_CUPS,
  ODONTOLOGY_FOLLOWUP_CONSULTATION_CUPS,
  ODONTOLOGY_EMERGENCY_CONSULTATION_CUPS,
  ODONTOLOGY_SPECIALTY_FIRST_VISIT_CUPS,
  ODONTOLOGY_SPECIALTY_FOLLOWUP_CUPS,
])

/** Capítulos CUPS considerados odontología general (operatoria, exodoncia, preventivo básico). */
const GENERAL_DENTISTRY_PROCEDURE_PREFIXES = ['230', '231', '232', '240', '241'] as const

const GENERAL_DENTISTRY_LEGACY_EXTRACTION_CUPS = new Set(['997501', '997502', '997503'])

const SPECIALIST_CUPS_TO_REHUS = buildSpecialistCupsMap()

function buildSpecialistCupsMap(): Map<string, OdontologyThsSpecialtyId> {
  const map = new Map<string, OdontologyThsSpecialtyId>()
  for (const specialty of ODONTOLOGY_THS_SPECIALTIES) {
    for (const cups of [
      specialty.primeraVezCups,
      specialty.controlCups,
      specialty.urgenciasCups,
    ]) {
      if (cups) {
        map.set(normalizeCupsCode(cups), specialty.id)
      }
    }
  }
  return map
}

export function isGeneralDentistryCupsCode(cupsCode: string | null | undefined): boolean {
  const cups = normalizeCupsCode(String(cupsCode ?? ''))
  if (!cups || cups === '000000') return false
  if (GENERAL_DENTISTRY_CONSULTATION_CUPS.has(cups)) return true
  if (GENERAL_DENTISTRY_LEGACY_EXTRACTION_CUPS.has(cups)) return true
  return GENERAL_DENTISTRY_PROCEDURE_PREFIXES.some((prefix) => cups.startsWith(prefix))
}

export function resolveRehusSpecialtyForCupsCode(
  cupsCode: string | null | undefined,
): OdontologyThsSpecialtyId | null {
  const cups = normalizeCupsCode(String(cupsCode ?? ''))
  if (!cups || cups === '000000') return null
  return SPECIALIST_CUPS_TO_REHUS.get(cups) ?? null
}
