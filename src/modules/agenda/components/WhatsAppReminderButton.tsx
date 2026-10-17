import { format, parseISO } from 'date-fns'
import type { Appointment } from '@/types/appointment'
import { PROCEDURE_TYPE_CONFIG } from '@/constants/procedures'
import { buildAppointmentReminderMessage, buildWhatsAppUrl } from '@/utils/whatsapp'

interface WhatsAppReminderButtonProps {
  appointment: Appointment
  className?: string
  size?: 'sm' | 'md'
}

export function WhatsAppReminderButton({
  appointment,
  className = '',
  size = 'sm',
}: WhatsAppReminderButtonProps) {
  if (!appointment.patientPhone?.trim()) return null

  const procedureLabel = PROCEDURE_TYPE_CONFIG[appointment.procedureType].label
  const message = buildAppointmentReminderMessage(
    appointment.patientName,
    appointment.startTime,
    procedureLabel,
  )
  const url = buildWhatsAppUrl(appointment.patientPhone, message)
  if (!url) return null

  const sizeClasses =
    size === 'md'
      ? 'px-3 py-1.5 text-xs'
      : 'px-1.5 py-0.5 text-[10px]'

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Enviar recordatorio por WhatsApp"
      className={`inline-flex items-center gap-1 rounded-md bg-[#25D366] font-medium text-white shadow-sm transition hover:bg-[#1ebe57] ${sizeClasses} ${className}`}
    >
      <span aria-hidden>💬</span>
      WhatsApp
    </a>
  )
}

export function formatAppointmentPhoneDisplay(phone?: string): string | null {
  if (!phone?.trim()) return null
  return phone.trim()
}

export function formatAppointmentDateTime(startTimeIso: string): string {
  return format(parseISO(startTimeIso), "PPP 'a las' HH:mm")
}
