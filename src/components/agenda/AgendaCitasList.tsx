import type { MouseEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Appointment } from '@/types/appointment'
import { PROCEDURE_TYPE_CONFIG, getAppointmentDisplayClasses } from '@/constants/procedures'
import { ClinicalPrecautionAlertBanner } from '@/components/clinical/ClinicalPrecautionAlertBanner'
import { usePatientPrecautionAlert } from '@/hooks/usePatientPrecautionAlert'
import { WhatsAppReminderButton } from './WhatsAppReminderButton'

interface AgendaCitaListItemProps {
  apt: Appointment
  index: number
  onDelete: (appointment: Appointment) => void
  onReschedule: (appointment: Appointment) => void
  onContextMenu?: (event: MouseEvent, appointment: Appointment) => void
  onAppointmentClick?: (appointment: Appointment) => void
}

function AgendaCitaListItem({
  apt,
  index,
  onDelete,
  onReschedule,
  onContextMenu,
  onAppointmentClick,
}: AgendaCitaListItemProps) {
  const procedure = PROCEDURE_TYPE_CONFIG[apt.procedureType].label
  const start = parseISO(apt.startTime)
  const end = parseISO(apt.endTime)
  const isNoShow = apt.status === 'no_asistio'
  const noShowClasses = isNoShow ? getAppointmentDisplayClasses(apt) : null
  const precautionAlert = usePatientPrecautionAlert(apt.patientId)
  const hasPrecaution = precautionAlert?.active ?? false

  return (
    <li
      data-cita-id={apt.id}
      data-cita-index={index}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
        isNoShow
          ? `${noShowClasses!.bg100} ${noShowClasses!.border500} border-l-4 text-white`
          : hasPrecaution
            ? 'border-red-300 bg-red-50/80 ring-1 ring-red-500'
            : 'border-slate-200 bg-slate-50/80'
      } ${
        onAppointmentClick
          ? `cursor-pointer transition ${
              isNoShow ? 'hover:brightness-110' : 'hover:border-dental-200 hover:bg-dental-50/50'
            }`
          : ''
      }`}
      onClick={() => onAppointmentClick?.(apt)}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu?.(e, apt)
      }}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <p className={`font-medium ${isNoShow ? 'text-white line-through' : 'text-slate-800'}`}>
          {apt.patientName}
        </p>
        <p className={`text-sm ${isNoShow ? 'text-red-100' : 'text-slate-600'}`}>
          {format(start, "EEE d MMM yyyy · HH:mm", { locale: es })} – {format(end, 'HH:mm')}
        </p>
        <p className={`text-xs ${isNoShow ? 'text-red-100' : 'text-slate-500'}`}>
          {isNoShow ? 'Inasistencia' : procedure}
        </p>
        {apt.patientPhone && (
          <p className={`text-xs ${isNoShow ? 'text-red-100' : 'text-slate-600'}`}>
            📞 {apt.patientPhone}
          </p>
        )}
        {hasPrecaution && precautionAlert && (
          <ClinicalPrecautionAlertBanner alert={precautionAlert} compact />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {apt.patientPhone && <WhatsAppReminderButton appointment={apt} size="md" />}
        <button
          type="button"
          onClick={() => onReschedule(apt)}
          className="agenda-btn-reasignar rounded-md px-2.5 py-1 text-xs font-medium"
        >
          Reasignar
        </button>
        <button
          type="button"
          onClick={() => onDelete(apt)}
          className="agenda-btn-eliminar rounded-md px-2.5 py-1 text-xs font-medium"
        >
          Eliminar
        </button>
      </div>
    </li>
  )
}

interface AgendaCitasListProps {
  appointments: Appointment[]
  onDelete: (appointment: Appointment) => void
  onReschedule: (appointment: Appointment) => void
  onContextMenu?: (event: MouseEvent, appointment: Appointment) => void
  onAppointmentClick?: (appointment: Appointment) => void
}

/** Lista de citas — equivalente a renderCitas() en app.js */
export function AgendaCitasList({
  appointments,
  onDelete,
  onReschedule,
  onContextMenu,
  onAppointmentClick,
}: AgendaCitasListProps) {
  const sorted = [...appointments].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  )

  if (sorted.length === 0) {
    return (
      <div
        id="lista-citas"
        className="card agenda-scheduler-root text-center text-sm text-slate-500"
        onContextMenu={(e) => e.preventDefault()}
      >
        No hay citas programadas en este período.
      </div>
    )
  }

  return (
    <section
      id="lista-citas"
      className="card agenda-scheduler-root"
      onContextMenu={(e) => e.preventDefault()}
    >
      <h3 className="mb-3 text-base font-semibold text-slate-800">
        Citas programadas ({sorted.length})
      </h3>
      <ul className="space-y-2">
        {sorted.map((apt, index) => (
          <AgendaCitaListItem
            key={apt.id ?? `${apt.startTime}-${index}`}
            apt={apt}
            index={index}
            onDelete={onDelete}
            onReschedule={onReschedule}
            onContextMenu={onContextMenu}
            onAppointmentClick={onAppointmentClick}
          />
        ))}
      </ul>
    </section>
  )
}

