import { findDaneMunicipalityByCode } from '@/utils/daneMunicipality'
import {
  extractRepsDigits,
  formatRepsCodeDisplay,
  normalizeRepsCode,
  parseRepsCode,
  validateRepsCodeStructure,
  VERIFIED_REPS_EXAMPLE_DIGITS,
  VERIFIED_REPS_EXAMPLE_DISPLAY,
} from '../../shared/repsCode.js'

export {
  extractRepsDigits,
  formatRepsCodeDisplay,
  normalizeRepsCode,
  parseRepsCode,
  validateRepsCodeStructure,
  VERIFIED_REPS_EXAMPLE_DIGITS,
  VERIFIED_REPS_EXAMPLE_DISPLAY,
}

export type RepsHabilitationStatus = 'activo' | 'inactivo'

export interface ParsedRepsCode {
  valid: boolean
  digits: string
  display?: string
  departmentCode?: string
  municipalitySuffix?: string
  daneMunicipality?: string
  consecutive?: string
  sedeCode?: string
  isMainSede?: boolean
  departmentName?: string
  municipalityName?: string
  message?: string
}

export function parseRepsCodeWithDane(value: string | null | undefined): ParsedRepsCode {
  const parsed = parseRepsCode(value) as ParsedRepsCode
  if (!parsed.valid || !parsed.daneMunicipality) return parsed

  const municipality = findDaneMunicipalityByCode(parsed.daneMunicipality)
  if (!municipality) {
    return {
      ...parsed,
      valid: false,
      message:
        `El código DANE ${parsed.daneMunicipality} del REPS no corresponde a un municipio vigente. ` +
        `Verifique departamento y municipio (ej. ${VERIFIED_REPS_EXAMPLE_DISPLAY} = Santander / Bucaramanga).`,
    }
  }

  return {
    ...parsed,
    departmentName: municipality.departmentName,
    municipalityName: municipality.name,
  }
}

export function validateActiveRepsSede(
  repsCode: string | null | undefined,
  status?: RepsHabilitationStatus | null,
): { valid: boolean; parsed: ParsedRepsCode; message?: string } {
  const parsed = parseRepsCodeWithDane(repsCode)
  if (!parsed.valid) {
    return { valid: false, parsed, message: parsed.message }
  }
  if (status === 'inactivo') {
    return {
      valid: false,
      parsed,
      message:
        `El código REPS ${parsed.display} no está activo. No se puede facturar ni generar RIPS ` +
        'hasta habilitar la sede ante la Secretaría de Salud.',
    }
  }
  return { valid: true, parsed }
}
