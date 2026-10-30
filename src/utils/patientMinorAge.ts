import { differenceInYears, isValid } from 'date-fns'

const LEGAL_AGE_YEARS = 18

/**
 * Interpreta YYYY-MM-DD (o ISO) como mediodía local para evitar
 * desfases UTC que resten un año el día del cumpleaños.
 */
function parseBirthDate(fechaNacimiento: string | null | undefined): Date | null {
  const raw = typeof fechaNacimiento === 'string' ? fechaNacimiento.trim() : ''
  if (!raw) return null
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) {
    const fallback = new Date(raw)
    return isValid(fallback) ? fallback : null
  }
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const parsed = new Date(year, month, day, 12, 0, 0, 0)
  return isValid(parsed) ? parsed : null
}

function calendarNoon(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0)
}

/** Edad en años cumplidos a partir de la fecha de nacimiento del paciente. */
export function edadEnAnios(
  fechaNacimiento: string | null | undefined,
  ahora: Date = new Date(),
): number | null {
  const birth = parseBirthDate(fechaNacimiento)
  if (!birth) return null
  return differenceInYears(calendarNoon(ahora), birth)
}

/**
 * Menor de edad (< 18) según fecha de nacimiento.
 * Sin fecha válida no se asume minoría de edad (evita bloquear flujos incompletos).
 */
export function esMenorDeEdad(
  fechaNacimiento: string | null | undefined,
  ahora: Date = new Date(),
): boolean {
  const age = edadEnAnios(fechaNacimiento, ahora)
  return age != null && age < LEGAL_AGE_YEARS
}

export const MINOR_PATIENT_SIGNATURE_WARNING =
  '⚠️ Atención: El paciente es menor de edad. Por ley, este documento DEBE ser firmado por el padre, madre o representante legal.'

export function etiquetaFirmaPacienteOAcudiente(esMenor: boolean): string {
  return esMenor ? 'Firma del Representante Legal' : 'Firma del Paciente'
}

export function guardianAuthorizationComplete(
  esMenor: boolean,
  guardianName?: string | null,
  guardianDocument?: string | null,
): boolean {
  if (!esMenor) return true
  return Boolean(guardianName?.trim() && guardianDocument?.trim())
}
