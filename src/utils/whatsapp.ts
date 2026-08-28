import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export const CLINIC_DISPLAY_NAME = 'doctorSEOlabs'

/** Normaliza teléfono colombiano para wa.me (solo dígitos, prefijo 57). */
export function normalizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('57') && digits.length >= 12) return digits
  if (digits.length === 10) return `57${digits}`
  return digits
}

export function buildAppointmentReminderMessage(
  patientName: string,
  startTimeIso: string,
  procedureLabel?: string,
): string {
  const parsed = parseISO(startTimeIso)
  const dateLabel = format(parsed, "EEEE d 'de' MMMM yyyy", { locale: es })
  const timeLabel = format(parsed, 'HH:mm')
  const firstName = patientName.trim().split(/\s+/)[0] || patientName

  let message =
    `Hola ${firstName}, te recordamos tu cita odontológica en ${CLINIC_DISPLAY_NAME} ` +
    `programada para el día ${dateLabel} a las ${timeLabel}.`

  if (procedureLabel) {
    message += ` Procedimiento: ${procedureLabel}.`
  }

  message +=
    ' Por favor confirma tu asistencia o contáctanos si necesitas reprogramar. ¡Gracias!'

  return message
}

export function buildWhatsAppUrl(phone: string, message: string): string | null {
  const normalized = normalizePhoneForWhatsApp(phone)
  if (!normalized || normalized.length < 10) return null
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
}
