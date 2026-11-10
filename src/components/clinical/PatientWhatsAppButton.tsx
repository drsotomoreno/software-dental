import { MessageCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { buildPatientContactMessage, buildWhatsAppUrl } from '@/utils/whatsapp'
import { resolveAccountHolderTitle } from '@/utils/quickBudgetPrint'

interface PatientWhatsAppButtonProps {
  phone: string
  patientName: string
  className?: string
}

export function PatientWhatsAppButton({
  phone,
  patientName,
  className = '',
}: PatientWhatsAppButtonProps) {
  const { user } = useAuth()
  const clinicName = resolveAccountHolderTitle(user)
  const url = buildWhatsAppUrl(phone, buildPatientContactMessage(patientName, clinicName))
  const label = 'Enviar WhatsApp'
  const classes = `mt-2 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition print:hidden focus:outline-none focus:ring-2 focus:ring-offset-2 ${className}`

  if (!url) {
    return (
      <button
        type="button"
        disabled
        title="Registre un celular válido en el teléfono del paciente para enviar WhatsApp"
        className={`${classes} cursor-not-allowed bg-slate-200 text-slate-500 focus:ring-slate-300`}
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        {label}
      </button>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Abrir WhatsApp con ${phone.trim()}`}
      className={`${classes} bg-[#25D366] text-white hover:bg-[#1ebe57] focus:ring-[#25D366]`}
    >
      <MessageCircle className="h-4 w-4" aria-hidden />
      {label}
    </a>
  )
}
