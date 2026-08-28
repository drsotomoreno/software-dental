import type { MouseEvent } from 'react'
import type { Appointment } from '@/types/appointment'
import {
  getAppointmentDisplayClasses,
  PROCEDURE_TYPE_CONFIG,
} from '@/constants/procedures'
import { usePatientPrecautionAlert } from '@/hooks/usePatientPrecautionAlert'
import { getChairAbbreviation, getChairDisplayStyle } from '@/utils/scheduleColumnStyles'
import { format, parseISO } from 'date-fns'

interface SchedulerAppointmentCardProps {
  appointment: Appointment
  columnName?: string
  chairStyle?: ReturnType<typeof getChairDisplayStyle>
  compact?: boolean
  onClick?: (appointment: Appointment) => void
  onContextMenu?: (event: MouseEvent, appointment: Appointment) => void
}

export function SchedulerAppointmentCard({
  appointment,
  columnName,
  chairStyle,
  compact = false,
  onClick,
  onContextMenu,
}: SchedulerAppointmentCardProps) {
  const isNoShow = appointment.status === 'no_asistio'
  const classes = getAppointmentDisplayClasses(appointment)
  const label = isNoShow
      ? 'Inasistencia'
      : PROCEDURE_TYPE_CONFIG[appointment.procedureType].label
  const start = format(parseISO(appointment.startTime), 'HH:mm')
  const end = format(parseISO(appointment.endTime), 'HH:mm')
  const chairAbbrev = columnName ? getChairAbbreviation(columnName) : null
  const precautionAlert = usePatientPrecautionAlert(appointment.patientId)
  const hasPrecaution = precautionAlert?.active ?? false

  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-md border-l-4 shadow-sm ${classes.bg100} ${classes.border500} ${
        isNoShow ? 'ring-1 ring-red-800' : chairStyle ? `ring-1 ${chairStyle.ring}` : ''
      } ${hasPrecaution ? 'ring-2 ring-red-600' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu?.(e, appointment)
      }}
    >
      {hasPrecaution && (
        <div
          className="absolute right-1 top-1 z-10 rounded bg-red-600 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white"
          title="Precaución clínica"
        >
          !
        </div>
      )}
      {chairStyle && columnName && (
        <div
          className={`flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${chairStyle.bg100} ${chairStyle.text700}`}
          title={columnName}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${chairStyle.dot500}`} />
          <span className="truncate">{compact ? chairAbbrev : columnName}</span>
        </div>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClick?.(appointment)
        }}
        className="min-h-0 flex-1 px-2 py-1 pr-2 text-left transition hover:brightness-95"
      >
        <p className={`truncate text-xs font-semibold ${classes.text700} ${
          isNoShow ? 'line-through opacity-95' : ''
        }`}>
          {appointment.patientName}
        </p>
        {!compact && (
          <p className={`truncate text-[10px] ${isNoShow ? 'text-red-100' : `${classes.text700} opacity-80`}`}>
            {label}
          </p>
        )}
        <p className={`text-[10px] ${isNoShow ? 'text-red-100' : 'text-slate-500'}`}>
          {start} – {end}
        </p>
        {!compact && hasPrecaution && (
          <p className="truncate text-[10px] font-semibold text-red-700">Precaución clínica</p>
        )}
        {!compact && appointment.patientPhone && (
          <p className={`truncate text-[10px] ${isNoShow ? 'text-red-100' : 'text-slate-600'}`}>
            📞 {appointment.patientPhone}
          </p>
        )}
      </button>
    </div>
  )
}
