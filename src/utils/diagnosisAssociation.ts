import { ALL_TEETH_NUMBERS, DIAGNOSIS_ANATOMICAL_SCOPE_LABELS } from '../constants/dental.ts'
import type { Cie10Diagnosis, DiagnosisAnatomicalScope } from '@/types/clinicalRecord'

const PERMANENT_TEETH = new Set<number>(ALL_TEETH_NUMBERS)

const SCOPE_PHRASE =
  /\b(toda la denticion|denticion completa|toda la boca|maxilar superior|arcada superior|maxilar inferior|arcada inferior|mandibula|mandibular)\b/g

export type DiagnosisAssociation =
  | { kind: 'tooth'; toothNumber: number }
  | { kind: 'scope'; scope: DiagnosisAnatomicalScope }

export function parseDiagnosisAssociation(value: string): DiagnosisAssociation | null {
  const trimmed = value.trim()
  if (
    trimmed === 'denticion' ||
    trimmed === 'maxilar_superior' ||
    trimmed === 'maxilar_inferior'
  ) {
    return { kind: 'scope', scope: trimmed }
  }

  const match = /^tooth:(\d{2})$/.exec(trimmed)
  if (!match) return null
  const toothNumber = Number(match[1])
  if (!PERMANENT_TEETH.has(toothNumber)) return null
  return { kind: 'tooth', toothNumber }
}

/** Texto ya normalizado (minúsculas, sin tildes) o texto clínico libre. */
export function detectDiagnosisAnatomicalScope(text: string): DiagnosisAnatomicalScope | null {
  const normalized = text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  if (/\b(toda la denticion|denticion completa|toda la boca)\b/.test(normalized)) {
    return 'denticion'
  }
  if (/\b(maxilar superior|arcada superior)\b/.test(normalized)) {
    return 'maxilar_superior'
  }
  if (/\b(maxilar inferior|arcada inferior|mandibula|mandibular)\b/.test(normalized)) {
    return 'maxilar_inferior'
  }
  return null
}

export function stripDiagnosisScopePhrases(text: string): string {
  return text.replace(SCOPE_PHRASE, ' ').replace(/\s+/g, ' ').trim()
}

export function diagnosisLocationLabel(
  diagnosis: Pick<Cie10Diagnosis, 'affectedTeeth' | 'anatomicalScope'>,
): string | null {
  const teeth = [...new Set(diagnosis.affectedTeeth ?? [])]
    .filter((tooth) => Number.isFinite(tooth))
    .sort((left, right) => left - right)

  if (teeth.length === 1) return `Pieza ${teeth[0]}`
  if (teeth.length > 1) return `Piezas ${teeth.join(', ')}`

  const scope = diagnosis.anatomicalScope
  if (scope && Object.hasOwn(DIAGNOSIS_ANATOMICAL_SCOPE_LABELS, scope)) {
    return DIAGNOSIS_ANATOMICAL_SCOPE_LABELS[scope]
  }
  return null
}

export function diagnosisHasAnatomicalAssociation(
  diagnosis: Pick<Cie10Diagnosis, 'code' | 'affectedTeeth' | 'anatomicalScope'>,
  chartEntries: Array<{ diagnosisCode?: string; dienteId?: string }> = [],
): boolean {
  if (diagnosisLocationLabel(diagnosis)) return true
  const code = diagnosis.code.trim()
  return chartEntries.some(
    (entry) => entry.diagnosisCode?.trim() === code && String(entry.dienteId ?? '').trim() !== '',
  )
}

/**
 * Zona del plan de tratamiento.
 * Maxilar superior/inferior corresponden a las arcadas ya usadas en el plan.
 */
export function zoneFieldsForDiagnosisScope(scope: DiagnosisAnatomicalScope): {
  anatomicalZone: string
  arch?: 'superior' | 'inferior'
} {
  if (scope === 'maxilar_superior') {
    return { anatomicalZone: 'Arcada Superior', arch: 'superior' }
  }
  if (scope === 'maxilar_inferior') {
    return { anatomicalZone: 'Arcada Inferior', arch: 'inferior' }
  }
  return { anatomicalZone: 'General' }
}
