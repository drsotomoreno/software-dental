import { useMemo, useState, useEffect, useCallback, type MouseEvent } from 'react'
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { AgendaDayView } from './AgendaDayView'
import { AgendaWeekView } from './AgendaWeekView'
import { AgendaMonthView } from './AgendaMonthView'
import { AgendaViewTabs, type AgendaViewMode } from './AgendaViewTabs'
import { AgendaPeriodNavigationFrame } from './AgendaPeriodNavigation'
import { CreateAppointmentModal, type SlotSelection } from './CreateAppointmentModal'
import { BlockSlotModal } from './BlockSlotModal'
import { AgendaCitasList } from './AgendaCitasList'
import { AgendaContextMenu, type AgendaContextMenuItem } from './AgendaContextMenu'
import { AppointmentDetailPanel } from './AppointmentDetailPanel'
import { ColumnManager } from './ColumnManager'
import { db } from '@/db/database'
import {
  AGENDA_REASIGNAR_EVENT,
  eliminarCita,
  renderCitas,
} from '@/utils/agendaStorage'
import {
  clearAgendaClipboard,
  copiarCita,
  cortarCita,
  pegarCita,
} from '@/utils/agendaClipboard'
import { useAgendaClipboard } from '@/hooks/useAgendaClipboard'
import { useScheduleColumns } from '@/hooks/useScheduleColumns'
import { useAppointmentsRange } from '@/hooks/useAppointments'
import { useScheduleBlocks } from '@/hooks/useScheduleBlocks'
import type { Appointment } from '@/types/appointment'
import type { ScheduleBlock } from '@/types/scheduleBlock'
import { findBlockAtSlot } from '@/utils/scheduleBlocks'
import { markAppointmentNoShow } from '@/utils/appointmentNoShow'
import { useAuth } from '@/contexts/AuthContext'

export function AgendaScheduler() {
  const { user } = useAuth()
  const [currentDate, setCurrentDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [activeView, setActiveView] = useState<AgendaViewMode>('day')
  const [modalOpen, setModalOpen] = useState(false)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockMode, setBlockMode] = useState(false)
  const [slotSelection, setSlotSelection] = useState<SlotSelection | null>(null)
  const [blockSelection, setBlockSelection] = useState<SlotSelection | null>(null)
  const [blockModalType, setBlockModalType] = useState<'full_day' | 'time_range'>('time_range')
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [selectedBlock, setSelectedBlock] = useState<ScheduleBlock | null>(null)
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
  const [renderKey, setRenderKey] = useState(0)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: AgendaContextMenuItem[]
  } | null>(null)

  const { clipboard, hasClipboard } = useAgendaClipboard()

  const {
    columns,
    isLoading: columnsLoading,
    addColumn,
    renameColumn,
    deleteColumn,
    reorderColumn,
  } = useScheduleColumns()

  const parsedDate = parseISO(`${currentDate}T12:00:00`)

  const dateRange = useMemo(() => {
    if (activeView === 'day') {
      return { start: currentDate, end: currentDate }
    }
    if (activeView === 'week') {
      const start = startOfWeek(parsedDate, { weekStartsOn: 1 })
      const end = endOfWeek(parsedDate, { weekStartsOn: 1 })
      return {
        start: format(start, 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd'),
      }
    }
    const start = startOfMonth(parsedDate)
    const end = endOfMonth(parsedDate)
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    }
  }, [activeView, currentDate, parsedDate])

  const weekDays = useMemo(() => {
    const start = startOfWeek(parsedDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, index) =>
      format(addDays(start, index), 'yyyy-MM-dd'),
    )
  }, [parsedDate])

  const defaultColumnId = columns[0]?.id ?? ''

  const {
    appointments,
    isLoading: appointmentsLoading,
    createAppointment,
    updateAppointment,
    updateAppointmentStatus,
    updateAppointmentNotes,
    updateAppointmentPatientPhone,
  } = useAppointmentsRange(dateRange.start, dateRange.end)

  const {
    blocks,
    isLoading: blocksLoading,
    createBlock,
    deleteBlock,
  } = useScheduleBlocks(dateRange.start, dateRange.end)

  const openRescheduleModal = useCallback((appointment: Appointment) => {
    setEditingAppointment(appointment)
    setSelectedAppointment(null)
    setSlotSelection(null)
    setModalOpen(true)
  }, [])

  const handleDeleteAppointment = useCallback(
    async (appointment: Appointment) => {
      if (appointment.id == null) return
      const removed = await eliminarCita(appointment.id)
      if (removed) {
        if (selectedAppointment?.id === appointment.id) setSelectedAppointment(null)
        if (editingAppointment?.id === appointment.id) {
          setEditingAppointment(null)
          setModalOpen(false)
        }
        setRenderKey((key) => key + 1)
      }
    },
    [selectedAppointment?.id, editingAppointment?.id],
  )

  const handleRescheduleAppointment = useCallback(
    (appointment: Appointment) => {
      openRescheduleModal(appointment)
    },
    [openRescheduleModal],
  )

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const openContextMenu = useCallback(
    (event: MouseEvent, items: AgendaContextMenuItem[]) => {
      event.preventDefault()
      event.stopPropagation()
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        items: items.map((item) => ({
          ...item,
          onClick: () => {
            item.onClick()
            closeContextMenu()
          },
        })),
      })
    },
    [closeContextMenu],
  )

  const handleAppointmentContextMenu = useCallback(
    (event: MouseEvent, appointment: Appointment) => {
      openContextMenu(event, [
        {
          id: 'cut',
          label: 'Cortar cita',
          icon: '✂️',
          onClick: () => {
            void cortarCita(appointment).then((ok) => {
              if (ok && selectedAppointment?.id === appointment.id) {
                setSelectedAppointment(null)
              }
            })
          },
        },
        {
          id: 'copy',
          label: 'Copiar cita',
          icon: '📋',
          onClick: () => copiarCita(appointment),
        },
        {
          id: 'delete',
          label: 'Eliminar cita',
          icon: '🗑️',
          danger: true,
          onClick: () => void handleDeleteAppointment(appointment),
        },
      ])
    },
    [openContextMenu, handleDeleteAppointment, selectedAppointment?.id],
  )

  const handleSlotContextMenu = useCallback(
    (event: MouseEvent, selection: SlotSelection) => {
      const items: AgendaContextMenuItem[] = []

      if (hasClipboard) {
        const modeLabel = clipboard?.mode === 'cut' ? 'cortada' : 'copiada'
        items.push({
          id: 'paste',
          label: `Pegar cita ${modeLabel}`,
          icon: '📌',
          onClick: () => {
            void pegarCita({
              date: selection.date,
              startTime: selection.startTime,
              columnId: selection.columnId,
            })
          },
        })
      }

      items.push({
        id: 'new',
        label: 'Nueva cita',
        icon: '➕',
        onClick: () => {
          setSlotSelection(selection)
          setSelectedAppointment(null)
          setEditingAppointment(null)
          setModalOpen(true)
        },
      })

      openContextMenu(event, items)
    },
    [clipboard?.mode, hasClipboard, openContextMenu],
  )

  const handleMonthDayContextMenu = useCallback(
    (event: MouseEvent, date: string) => {
      handleSlotContextMenu(event, {
        columnId: defaultColumnId,
        date,
        startTime: '09:00',
      })
    },
    [defaultColumnId, handleSlotContextMenu],
  )

  useEffect(() => {
    const onReasignar = async (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail?.id
      if (!id) return
      const record =
        (await db.appointments.get(id)) ?? (await db.appointments.get(Number(id)))
      if (record) openRescheduleModal(record)
    }

    const onRender = () => setRenderKey((k) => k + 1)

    window.addEventListener(AGENDA_REASIGNAR_EVENT, onReasignar)
    window.addEventListener('agenda:render-citas', onRender)
    return () => {
      window.removeEventListener(AGENDA_REASIGNAR_EVENT, onReasignar)
      window.removeEventListener('agenda:render-citas', onRender)
    }
  }, [openRescheduleModal])

  const handleModalClose = () => {
    setModalOpen(false)
    setEditingAppointment(null)
    setSlotSelection(null)
  }

  const handleAppointmentSubmit = async (data: Parameters<typeof createAppointment>[0]) => {
    if (editingAppointment?.id != null) {
      await updateAppointment(editingAppointment.id, data)
      setEditingAppointment(null)
      if (selectedAppointment?.id === editingAppointment.id) {
        setSelectedAppointment({ ...selectedAppointment, ...data })
      }
    } else {
      await createAppointment(data)
    }
    renderCitas()
  }

  const handleSlotClick = (selection: SlotSelection) => {
    const existingBlock = findBlockAtSlot(
      selection.date,
      selection.startTime,
      selection.columnId,
      blocks,
    )

    if (existingBlock) {
      setSelectedBlock(existingBlock)
      setSelectedAppointment(null)
      return
    }

    if (blockMode) {
      setBlockSelection(selection)
      setBlockModalType('time_range')
      setBlockModalOpen(true)
      return
    }

    setSlotSelection(selection)
    setSelectedAppointment(null)
    setEditingAppointment(null)
    setModalOpen(true)
  }

  const openBlockDayModal = () => {
    setBlockSelection({
      columnId: columns[0]?.id ?? '',
      date: currentDate,
      startTime: '09:00',
    })
    setBlockModalType('full_day')
    setBlockModalOpen(true)
  }

  const goPrevious = () => {
    if (activeView === 'day') {
      setCurrentDate(format(subDays(parsedDate, 1), 'yyyy-MM-dd'))
      return
    }
    if (activeView === 'week') {
      setCurrentDate(format(subWeeks(parsedDate, 1), 'yyyy-MM-dd'))
      return
    }
    setCurrentDate(format(subMonths(parsedDate, 1), 'yyyy-MM-dd'))
  }

  const goNext = () => {
    if (activeView === 'day') {
      setCurrentDate(format(addDays(parsedDate, 1), 'yyyy-MM-dd'))
      return
    }
    if (activeView === 'week') {
      setCurrentDate(format(addWeeks(parsedDate, 1), 'yyyy-MM-dd'))
      return
    }
    setCurrentDate(format(addMonths(parsedDate, 1), 'yyyy-MM-dd'))
  }

  const goToday = () => setCurrentDate(format(new Date(), 'yyyy-MM-dd'))

  const handleDayFromMonth = (date: string) => {
    setCurrentDate(date)
    setActiveView('day')
  }

  const periodLabel = useMemo(() => {
    if (activeView === 'day') {
      return format(parsedDate, "EEEE, d 'de' MMMM yyyy", { locale: es })
    }
    if (activeView === 'week') {
      const start = parseISO(`${weekDays[0]}T12:00:00`)
      const end = parseISO(`${weekDays[6]}T12:00:00`)
      return `${format(start, "d MMM", { locale: es })} – ${format(end, "d MMM yyyy", { locale: es })}`
    }
    return format(parsedDate, "MMMM yyyy", { locale: es })
  }, [activeView, parsedDate, weekDays])

  const isLoading = columnsLoading || appointmentsLoading || blocksLoading

  return (
    <div
      className="agenda-module space-y-4"
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('.agenda-scheduler-root, #lista-citas')) return
        e.preventDefault()
      }}
    >
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <AgendaViewTabs activeView={activeView} onChange={setActiveView} />

          <div className="flex flex-wrap items-center gap-2">
            {activeView === 'day' && (
              <input
                type="date"
                value={currentDate}
                onChange={(e) => setCurrentDate(e.target.value)}
                className="input-field w-auto text-sm font-medium"
              />
            )}
            <button type="button" onClick={goToday} className="btn-secondary text-xs">
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setBlockMode((prev) => !prev)}
              className={`text-xs ${
                blockMode
                  ? 'rounded-lg bg-black px-3 py-1.5 font-medium text-white'
                  : 'btn-secondary'
              }`}
            >
              {blockMode ? 'Modo bloqueo ON' : 'Bloquear horas'}
            </button>
            <button
              type="button"
              onClick={openBlockDayModal}
              className="btn-secondary text-xs"
            >
              Bloquear día
            </button>
          </div>

          {activeView === 'day' && (
            <ColumnManager
              columns={columns}
              onAdd={addColumn}
              onRename={renameColumn}
              onDelete={deleteColumn}
              onReorder={reorderColumn}
            />
          )}
        </div>
      </div>

      {hasClipboard && clipboard && (
        <div className="agenda-clipboard-banner card flex flex-wrap items-center justify-between gap-3 border-dental-200 bg-dental-50/80 py-2">
          <p className="text-sm text-dental-900">
            <span className="font-medium">
              {clipboard.mode === 'cut' ? '✂️ Cita cortada' : '📋 Cita copiada'}:
            </span>{' '}
            {clipboard.appointment.patientName}
            <span className="text-dental-700">
              {' '}
              — clic derecho en un horario vacío para pegar
            </span>
          </p>
          <button
            type="button"
            onClick={() => clearAgendaClipboard()}
            className="btn-secondary text-xs"
          >
            Cancelar
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="card text-center text-slate-500">Cargando agenda...</div>
      ) : (
        <AgendaPeriodNavigationFrame
          activeView={activeView}
          periodLabel={periodLabel}
          onPrevious={goPrevious}
          onNext={goNext}
        >
          <div key={renderKey} className="space-y-4">
            {activeView === 'day' && (
              <AgendaDayView
                date={currentDate}
                columns={columns}
                appointments={appointments}
                blocks={blocks}
                blockMode={blockMode}
                onSlotClick={handleSlotClick}
                onAppointmentClick={setSelectedAppointment}
                onAppointmentContextMenu={handleAppointmentContextMenu}
                onSlotContextMenu={handleSlotContextMenu}
                onBlockClick={setSelectedBlock}
              />
            )}

            {activeView === 'week' &&
              (columns.length === 0 ? (
                <div className="card text-center text-sm text-slate-500">
                  Configure al menos una silla en la vista diaria para crear citas desde la semana.
                </div>
              ) : (
                <AgendaWeekView
                  weekDays={weekDays}
                  columns={columns}
                  appointments={appointments}
                  blocks={blocks}
                  blockMode={blockMode}
                  onSlotClick={handleSlotClick}
                  onAppointmentClick={setSelectedAppointment}
                  onAppointmentContextMenu={handleAppointmentContextMenu}
                  onSlotContextMenu={handleSlotContextMenu}
                  onBlockClick={setSelectedBlock}
                />
              ))}

            {activeView === 'month' && (
              <AgendaMonthView
                referenceDate={currentDate}
                columns={columns}
                appointments={appointments}
                blocks={blocks}
                onDayClick={handleDayFromMonth}
                onAppointmentClick={setSelectedAppointment}
                onAppointmentContextMenu={handleAppointmentContextMenu}
                onDayContextMenu={handleMonthDayContextMenu}
              />
            )}

            <AgendaCitasList
              appointments={appointments}
              onDelete={handleDeleteAppointment}
              onReschedule={handleRescheduleAppointment}
              onContextMenu={handleAppointmentContextMenu}
              onAppointmentClick={setSelectedAppointment}
            />
          </div>
        </AgendaPeriodNavigationFrame>
      )}

      {selectedBlock && (
        <div className="card border border-slate-900 bg-slate-50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-slate-900">Horario bloqueado</h3>
              <p className="text-sm text-slate-600">
                {selectedBlock.type === 'full_day'
                  ? `Día completo — ${selectedBlock.date}`
                  : `${selectedBlock.date} · ${selectedBlock.startTime} – ${selectedBlock.endTime}`}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {selectedBlock.columnId
                  ? `Silla específica`
                  : 'Todas las sillas / consultorios'}
              </p>
              {selectedBlock.reason && (
                <p className="mt-1 text-sm italic text-slate-600">{selectedBlock.reason}</p>
              )}
            </div>
            <div className="flex gap-2">
              {selectedBlock.id != null && (
                <button
                  type="button"
                  onClick={() =>
                    deleteBlock(selectedBlock.id!).then(() => setSelectedBlock(null))
                  }
                  className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                >
                  Desbloquear
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedBlock(null)}
                className="btn-secondary text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedAppointment && (
        <AppointmentDetailPanel
          appointment={selectedAppointment}
          columns={columns}
          onClose={() => setSelectedAppointment(null)}
          onSaveNotes={async (notes) => {
            if (selectedAppointment.id == null) return
            await updateAppointmentNotes(selectedAppointment.id, notes)
            setSelectedAppointment({
              ...selectedAppointment,
              notes: notes.trim() || undefined,
            })
          }}
          onSavePhone={async (phone) => {
            if (selectedAppointment.id == null) {
              throw new Error('Cita sin identificador')
            }
            const result = await updateAppointmentPatientPhone(selectedAppointment, phone)
            setSelectedAppointment({
              ...selectedAppointment,
              patientPhone: phone.trim(),
            })
            setRenderKey((key) => key + 1)
            return result
          }}
          onMarkNoShow={async (additionalNote) => {
            if (!user || selectedAppointment.id == null) {
              throw new Error('Usuario no autenticado')
            }

            const result = await markAppointmentNoShow(selectedAppointment, {
              professionalName: `${user.firstName} ${user.lastName}`,
              professionalLicense: user.documentNumber ?? '',
              authorUserId: user.id,
              authorEmail: user.email,
              additionalNote,
            })

            if (!result.ok) {
              throw new Error(result.error ?? 'No se pudo marcar la inasistencia')
            }

            setSelectedAppointment({
              ...selectedAppointment,
              status: 'no_asistio',
            })
            setRenderKey((key) => key + 1)

            return {
              evolutionRecorded: result.evolutionRecorded,
              patientRouteId: result.patientRouteId,
            }
          }}
          onConfirm={
            selectedAppointment.status === 'programada' && selectedAppointment.id != null
              ? () =>
                  updateAppointmentStatus(selectedAppointment.id!, 'confirmada').then(() =>
                    setSelectedAppointment({ ...selectedAppointment, status: 'confirmada' }),
                  )
              : undefined
          }
        />
      )}

      <CreateAppointmentModal
        isOpen={modalOpen}
        selection={slotSelection}
        editingAppointment={editingAppointment}
        columns={columns}
        onClose={handleModalClose}
        onSubmit={handleAppointmentSubmit}
      />

      <BlockSlotModal
        isOpen={blockModalOpen}
        selection={blockSelection}
        columns={columns}
        defaultDate={currentDate}
        defaultType={blockModalType}
        onClose={() => setBlockModalOpen(false)}
        onSubmit={createBlock}
      />

      {contextMenu && (
        <AgendaContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={closeContextMenu}
        />
      )}
    </div>
  )
}
