/**
 * Reloj de la consulta. Colombia no observa horario de verano: America/Bogota es UTC−5.
 * La fecha y hora de la sesión es un dato legal (Res. 1995/1999). Se guarda como
 * hora de pared de la clínica, en el formato de `<input type="datetime-local">`,
 * sin zona. RIPS la transmite tal cual, sin convertirla otra vez desde UTC.
 *
 * No usar `toISOString().slice(0, 16)` para ese campo: eso es el reloj UTC.
 * A las 21:55 en Bogotá graba 02:55 del día siguiente.
 */

export const ZONA_CLINICA = 'America/Bogota'

export interface RelojClinica {
  year: string
  month: string
  day: string
  hour: string
  minute: string
}

export function relojClinica(instant: Date): RelojClinica {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('Instante de la sesión clínica inválido.')
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_CLINICA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00'
  let hour = pick('hour')
  if (hour === '24') hour = '00'
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour,
    minute: pick('minute'),
  }
}

/** `YYYY-MM-DDTHH:mm` en America/Bogota. */
export function fechaHoraSesionClinica(instant: Date = new Date()): string {
  const clock = relojClinica(instant)
  return `${clock.year}-${clock.month}-${clock.day}T${clock.hour}:${clock.minute}`
}

const SESION_NAIVE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/

function tieneZona(value: string): boolean {
  return /[zZ]$/.test(value) || /[+-]\d{2}:?\d{2}$/.test(value)
}

/**
 * Minuto UTC de un instante ISO. El sello viejo de la nota era exactamente esto,
 * guardado como si fuera la hora de la consulta.
 */
export function minutoUtc(instant: Date): string {
  if (Number.isNaN(instant.getTime())) return ''
  return instant.toISOString().slice(0, 16)
}

/**
 * Si `date` sigue siendo el reloj UTC de `createdAt`, devuelve la hora de Bogotá
 * de ese mismo instante. Si el profesional ya editó la hora, o el texto no es
 * el sello automático, devuelve null.
 */
export function fechaSesionClinicaSiEraUtc(
  date: string | null | undefined,
  createdAt: string | null | undefined,
): string | null {
  const session = String(date ?? '').trim()
  const created = String(createdAt ?? '').trim()
  const match = session.match(SESION_NAIVE)
  if (!match || tieneZona(session) || !created || !tieneZona(created)) return null
  const parsed = new Date(created)
  if (Number.isNaN(parsed.getTime())) return null
  const stamped = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`
  if (stamped !== minutoUtc(parsed)) return null
  const clinic = fechaHoraSesionClinica(parsed)
  return clinic === stamped ? null : clinic
}

function partesDeTextoClinico(value: string): RelojClinica | null {
  const text = value.trim()
  if (!text) return null
  if (!tieneZona(text)) {
    const match = text.match(SESION_NAIVE)
    if (!match) return null
    return {
      year: match[1],
      month: match[2],
      day: match[3],
      hour: match[4],
      minute: match[5],
    }
  }
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return relojClinica(parsed)
}

/**
 * Etiqueta legal de la sesión. La hora sin zona se muestra tal como quedó
 * escrita en la nota; un instante con zona se convierte a America/Bogota.
 */
export function etiquetaFechaHoraSesion(value: string | null | undefined): string {
  const clock = partesDeTextoClinico(String(value ?? ''))
  if (!clock) return String(value ?? '').trim()
  const utc = new Date(
    Date.UTC(
      Number(clock.year),
      Number(clock.month) - 1,
      Number(clock.day),
      Number(clock.hour),
      Number(clock.minute),
    ),
  )
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(utc)
}
