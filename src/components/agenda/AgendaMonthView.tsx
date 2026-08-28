import { useMemo } from 'react'
import type { MouseEvent } from 'react'
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import type { Appointment, ScheduleColumn } from '@/types/appointment'
import type { ScheduleBlock } from '@/types/scheduleBlock'
import {
  getAppointmentDisplayClasses,
  PROCEDURE_TYPE_CONFIG,
} from '@/constants/procedures'
import { isDayFullyBlocked, countDayBlocks } from '@/utils/scheduleBlocks'
import {
  buildColumnIndexMap,
  getChairAbbreviation,
  getChairDisplayStyle,
} from '@/utils/scheduleColumnStyles'
import { usePatientPrecautionAlert } from '@/hooks/usePatientPrecautionAlert'

interface MonthAppointmentEntryProps {
  apt: Appointment
  columnName: string
  chairAbbrev: string
  chairStyle: ReturnType<typeof getChairDisplayStyle>
  label: string
  time: string
  isNoShow: boolean
  classes: ReturnType<typeof getAppointmentDisplayClasses>
  onAppointmentClick?: (appointment: Appointment) => void
  onAppointmentContextMenu?: (event: MouseEvent, appointment: Appointment) => void
}

function MonthAppointmentEntry({
  apt,
  columnName,
  chairAbbrev,
  chairStyle,
  label,
  time,
  isNoShow,
  classes,
  onAppointmentClick,
  onAppointmentContextMenu,
}: MonthAppointmentEntryProps) {
  const precautionAlert = usePatientPrecautionAlert(apt.patientId)
  const hasPrecaution = precautionAlert?.active ?? false

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onAppointmentClick?.(apt)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onAppointmentContextMenu?.(e, apt)
      }}
      className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium ring-1 ${chairStyle.ring} ${
        hasPrecaution ? 'ring-red-600' : ''
      } ${
        isNoShow
          ? `${classes.bg100} ${classes.text700} line-through`
          : `${classes.bg100} ${classes.text700}`
      }`}
      title={`${columnName} — ${apt.patientName} — ${label} (${time})${
        hasPrecaution ? ' — Precaución clínica' : ''
      }`}
    >
      <span
        className={`shrink-0 rounded px-1 text-[9px] font-bold uppercase ${chairStyle.bg100} ${chairStyle.text700}`}
      >
        {chairAbbrev}
      </span>
      {hasPrecaution && <span className="shrink-0 text-red-700">!</span>}
      <span className="truncate">
        <span className="font-semibold">{time}</span> {apt.patientName}
      </span>
    </button>
  )
}

interface AgendaMonthViewProps {
  referenceDate: string
  columns: ScheduleColumn[]
  appointments: Appointment[]
  blocks: ScheduleBlock[]
  onDayClick: (date: string) => void
  onAppointmentClick?: (appointment: Appointment) => void
  onAppointmentContextMenu?: (event: MouseEvent, appointment: Appointment) => void
  onDayContextMenu?: (event: MouseEvent, date: string) => void
}

const WEEKDAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MAX_VISIBLE_APPOINTMENTS = 4

function buildMonthGrid(referenceDate: string): { date: string; inMonth: boolean }[] {
  const anchor = parseISO(`${referenceDate}T12:00:00`)
  const monthStart = startOfMonth(anchor)
  const monthEnd = endOfMonth(anchor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const cells: { date: string; inMonth: boolean }[] = []
  let cursor = gridStart
  while (cursor <= gridEnd) {
    cells.push({
      date: format(cursor, 'yyyy-MM-dd'),
      inMonth: isSameMonth(cursor, anchor),
    })
    cursor = addDays(cursor, 1)
  }
  return cells
}

/** Vista mensual — cuadrícula tradicional con citas diferenciadas por silla. */
export function AgendaMonthView({
  referenceDate,
  columns,
  appointments,
  blocks,
  onDayClick,
  onAppointmentClick,
  onAppointmentContextMenu,
  onDayContextMenu,
}: AgendaMonthViewProps) {
  const cells = useMemo(() => buildMonthGrid(referenceDate), [referenceDate])

  const columnIndexMap = useMemo(() => buildColumnIndexMap(columns), [columns])

  const columnNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const column of columns) {
      map.set(column.id, column.name)
    }
    return map
  }, [columns])

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const apt of appointments) {
      const day = apt.startTime.slice(0, 10)
      const list = map.get(day) ?? []
      list.push(apt)
      map.set(day, list)
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        const byTime = a.startTime.localeCompare(b.startTime)
        if (byTime !== 0) return byTime
        const colA = columnIndexMap.get(a.columnId) ?? 999
        const colB = columnIndexMap.get(b.columnId) ?? 999
        return colA - colB
      })
    }
    return map
  }, [appointments, columnIndexMap])

  const today = format(new Date(), 'yyyy-MM-dd')

  return (
    <div
      className="agenda-view agenda-view--month card overflow-hidden p-0 agenda-scheduler-root"
      data-view="month"
      onContextMenu={(e) => e.preventDefault()}
    >
      {columns.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
          {columns.map((column, index) => {
            const style = getChairDisplayStyle(index)
            return (
              <span
                key={column.id}
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg100} ${style.text700}`}
              >
                <span className={`h-2 w-2 rounded-full ${style.dot500}`} />
                {column.name}
              </span>
            )
          })}
        </div>
      )}

      <div className="agenda-month-grid grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAY_HEADERS.map((label) => (
          <div
            key={label}
            className="border-r border-slate-200 px-2 py-2 text-center text-xs font-semibold uppercase text-slate-500 last:border-r-0"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="agenda-month-grid grid grid-cols-7">
        {cells.map(({ date, inMonth }) => {
          const dayAppointments = appointmentsByDay.get(date) ?? []
          const visible = dayAppointments.slice(0, MAX_VISIBLE_APPOINTMENTS)
          const hiddenCount = dayAppointments.length - visible.length
          const parsed = parseISO(`${date}T12:00:00`)
          const isToday = date === today
          const fullyBlocked = isDayFullyBlocked(date, blocks)
          const partialBlocks = countDayBlocks(date, blocks)

          return (
            <button
              key={date}
              type="button"
              onClick={() => onDayClick(date)}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDayContextMenu?.(e, date)
              }}
              className={`agenda-month-cell min-h-[110px] border-b border-r border-slate-200 p-2 text-left transition last:border-r-0 ${
                fullyBlocked
                  ? 'bg-black text-white hover:bg-slate-900'
                  : inMonth
                    ? 'bg-white hover:bg-dental-50/40'
                    : 'bg-slate-50/80 hover:bg-dental-50/40'
              }`}
            >
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                  fullyBlocked
                    ? 'bg-white text-black'
                    : isToday
                      ? 'bg-dental-600 text-white'
                      : inMonth
                        ? 'text-slate-800'
                        : 'text-slate-400'
                }`}
              >
                {format(parsed, 'd')}
              </span>

              {fullyBlocked ? (
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                  Día bloqueado
                </p>
              ) : (
                <>
                  {partialBlocks > 0 && (
                    <p className="mt-1 text-[10px] font-medium text-slate-700">
                      ⬛ {partialBlocks} bloqueo{partialBlocks > 1 ? 's' : ''}
                    </p>
                  )}
                  <div className="mt-1 space-y-0.5">
                    {visible.map((apt) => {
                      const isNoShow = apt.status === 'no_asistio'
                      const classes = getAppointmentDisplayClasses(apt)
                      const label = isNoShow
                        ? 'Inasistencia'
                        : PROCEDURE_TYPE_CONFIG[apt.procedureType].label
                      const time = format(parseISO(apt.startTime), 'HH:mm')
                      const columnName = columnNameMap.get(apt.columnId) ?? 'Silla'
                      const columnIndex = columnIndexMap.get(apt.columnId) ?? 0
                      const chairStyle = getChairDisplayStyle(columnIndex)
                      const chairAbbrev = getChairAbbreviation(columnName)

                      return (
                        <MonthAppointmentEntry
                          key={apt.id}
                          apt={apt}
                          columnName={columnName}
                          chairAbbrev={chairAbbrev}
                          chairStyle={chairStyle}
                          label={label}
                          time={time}
                          isNoShow={isNoShow}
                          classes={classes}
                          onAppointmentClick={onAppointmentClick}
                          onAppointmentContextMenu={onAppointmentContextMenu}
                        />
                      )
                    })}
                    {hiddenCount > 0 && (
                      <p className="text-[10px] font-medium text-dental-600">+{hiddenCount} más</p>
                    )}
                  </div>
                </>
              )}
            </button>
          )
        })}
      </div>

      <p className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        {format(parseISO(`${referenceDate}T12:00:00`), "MMMM yyyy", { locale: es })}
        {' — '}
        Haga clic en un día para ver la agenda diaria.
      </p>
    </div>
  )
}
