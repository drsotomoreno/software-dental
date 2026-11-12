import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export const CLINIC_DISPLAY_NAME = 'doctorSEOlabs'

/**
 * Dígitos para wa.me. Si el número ya trae indicativo (E.164 o más de 10 dígitos)
 * se respeta. Un celular local de 10 dígitos se asume Colombia (+57).
 */
export function normalizePhoneForWhatsApp(phone: string): string {
  const trimmed = String(phone ?? '').trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  if (trimmed.startsWith('+') || digits.length > 10) return digits
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

/** Saludo breve para abrir el chat del paciente desde la historia clínica. */
export function buildPatientContactMessage(patientName: string, clinicName?: string): string {
  const firstName = patientName.trim().split(/\s+/)[0] || ''
  const clinic = clinicName?.trim() || 'nuestra clínica'
  const greeting = firstName ? `Hola ${firstName}` : 'Hola'
  return `${greeting}, te escribimos de ${clinic}.`
}

/** Seguimiento de mercadeo para un paciente que solo tiene valoración. */
export function buildValuationFollowUpMessage(clinicName?: string): string {
  const clinic = clinicName?.trim() || 'nuestra clínica'
  return (
    `Hola, te escribimos de ${clinic}, para continuar con tu tratamiento odontológico. ` +
    'Quedamos atentos si deseas agendar el siguiente paso de tu tratamiento.'
  )
}
