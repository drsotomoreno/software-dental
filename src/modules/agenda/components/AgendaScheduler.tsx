import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  type MouseEvent,
  type PointerEvent,
} from 'react'
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
import { AgendaSlotBulkBar } from './AgendaSlotBulkBar'
import { AgendaSlotActionDialog } from './AgendaSlotActionDialog'
import { AppointmentDetailPanel } from './AppointmentDetailPanel'
import { ColumnManager } from './ColumnManager'
import { db } from '@/db/database'
import {
  AGENDA_REASIGNAR_EVENT,
  eliminarCita,
  renderCitas,
} from '../storage/agendaStorage'
import {
  clearAgendaClipboard,
  copiarCitas,
  cortarCitas,
  hasAgendaClipboard,
  pegarCitasEn,
} from '../storage/agendaClipboard'
import { noteTextForSlot, readSlotNotes, writeSlotNotes } from '../storage/agendaSlotNotes'
import { useAgendaClipboard } from '../hooks/useAgendaClipboard'
import { useScheduleColumns } from '../hooks/useScheduleColumns'
import { useAppointmentsRange } from '../hooks/useAppointments'
import { useScheduleBlocks } from '../hooks/useScheduleBlocks'
import type { Appointment } from '@/types/appointment'
import type { ScheduleBlock } from '@/types/scheduleBlock'
import { findBlockAtSlot, isSlotBlocked } from '../storage/scheduleBlocks'
import { generateTimeSlots } from '@/constants/procedures'
import {
  appointmentsCoveringSlots,
  mergeBlockInputs,
  parseSlotKey,
  rewriteBlocksForSlotSelection,
  selectionForRightClick,
  selectionFromMouseGesture,
  selectionToBlockInputs,
  singleContiguousRange,
  SLOT_DRAG_THRESHOLD_PX,
  slotFromClientPoint,
  type AgendaSlotRef,
} from '../storage/agendaSlotSelection'
import { markAppointmentNoShow } from '../clinical/appointmentNoShow'
import { useAuth } from '@/contexts/AuthContext'

export function AgendaScheduler() {
  const { user } = useAuth()
  const [currentDate, setCurrentDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [activeView, setActiveView] = useState<AgendaViewMode>('day')
  const [modalOpen, setModalOpen] = useState(false)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockMode, setBlockMode] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [slotGestureActive, setSlotGestureActive] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [bulkReason, setBulkReason] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkError, setBulkError] = useState('')
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
  const [slotAction, setSlotAction] = useState<
    | { kind: 'block'; slots: AgendaSlotRef[] }
    | { kind: 'note'; slots: AgendaSlotRef[]; initial: string }
    | null
  >(null)

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
    applyBlockRewrite,
  } = useScheduleBlocks(dateRange.start, dateRange.end)

  const timeSlots = useMemo(() => generateTimeSlots(), [])
  const slotAxes = useMemo(() => {
    if (activeView === 'week') {
      return weekDays.flatMap((day) => columns.map((column) => ({ date: day, columnId: column.id })))
    }
    return columns.map((column) => ({ date: currentDate, columnId: column.id }))
  }, [activeView, weekDays, columns, currentDate])

  const selectedKeysRef = useRef(selectedKeys)
  selectedKeysRef.current = selectedKeys
  const selectionModeRef = useRef(selectionMode)
  selectionModeRef.current = selectionMode
  const anchorRef = useRef<AgendaSlotRef | null>(null)
  const timeSlotsRef = useRef(timeSlots)
  timeSlotsRef.current = timeSlots
  const slotAxesRef = useRef(slotAxes)
  slotAxesRef.current = slotAxes
  const gestureCleanupRef = useRef<(() => void) | null>(null)
  const suppressContextMenuRef = useRef(false)
  const menuOpenedRef = useRef(false)
  const appointmentsRef = useRef(appointments)
  appointmentsRef.current = appointments
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const columnsRef = useRef(columns)
  columnsRef.current = columns

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

  const openSelectionMenuRef = useRef<
    (x: number, y: number, clicked: AgendaSlotRef, keys: string[]) => void
  >(() => {})

  openSelectionMenuRef.current = (x, y, clicked, keys) => {
    const slots = keys
      .map((key) => parseSlotKey(key))
      .filter((slot): slot is AgendaSlotRef => slot != null)
    const covered = appointmentsCoveringSlots(appointmentsRef.current, slots)
    const blockedCount = slots.filter((slot) =>
      isSlotBlocked(slot.date, slot.startTime, slot.columnId, blocksRef.current),
    ).length
    const columnIds = columnsRef.current.map((column) => column.id)
    const anchor = { date: clicked.date, startTime: clicked.startTime, columnId: clicked.columnId }
    const range = singleContiguousRange(slots)

    const items: AgendaContextMenuItem[] = [
      {
        id: 'new',
        label: 'Nueva cita',
        icon: '➕',
        onClick: () => {
          setSlotSelection(range ?? clicked)
          setSelectedAppointment(null)
          setEditingAppointment(null)
          setModalOpen(true)
        },
      },
      {
        id: 'cut',
        label: 'Cortar',
        icon: '✂️',
        disabled: covered.length === 0,
        onClick: () => {
          void cortarCitas(covered, anchor).then((ok) => {
            if (ok) setSelectedAppointment(null)
          })
        },
      },
      {
        id: 'copy',
        label: 'Copiar',
        icon: '📋',
        disabled: covered.length === 0,
        onClick: () => copiarCitas(covered, anchor),
      },
      {
        id: 'paste',
        label: 'Pegar',
        icon: '📌',
        disabled: !hasAgendaClipboard(),
        onClick: () => {
          void pegarCitasEn(anchor, columnIds)
        },
      },
      {
        id: 'block',
        label: 'Bloquear hora',
        icon: '🚫',
        disabled: slots.length === 0,
        onClick: () => setSlotAction({ kind: 'block', slots }),
      },
      {
        id: 'unblock',
        label: 'Desbloquear hora',
        icon: '🔓',
        disabled: blockedCount === 0,
        onClick: () => {
          void unblockSlots(slots)
        },
      },
      {
        id: 'note',
        label: 'Insertar nota',
        icon: '📝',
        disabled: slots.length === 0,
        onClick: () => {
          const initial =
            covered.length === 1
              ? covered[0].notes ?? ''
              : noteTextForSlot(readSlotNotes(), clicked)
          setSlotAction({ kind: 'note', slots, initial })
        },
      },
    ]

    if (covered.length > 0) {
      items.push({
        id: 'delete',
        label: covered.length > 1 ? 'Eliminar citas' : 'Eliminar cita',
        icon: '🗑️',
        danger: true,
        onClick: () => {
          for (const appointment of covered) void handleDeleteAppointment(appointment)
        },
      })
    }

    setContextMenu({ x, y, items })
  }

  const presentSelectionMenu = (x: number, y: number, slot: AgendaSlotRef) => {
    const keys = selectionForRightClick(slot, selectedKeysRef.current)
    const next = new Set(keys)
    selectedKeysRef.current = next
    setSelectedKeys(next)
    setSelectionMode(true)
    openSelectionMenuRef.current(x, y, slot, keys)
  }

  const handleAppointmentContextMenu = useCallback((event: MouseEvent, appointment: Appointment) => {
    if (menuOpenedRef.current || suppressContextMenuRef.current) {
      menuOpenedRef.current = false
      suppressContextMenuRef.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    presentSelectionMenu(event.clientX, event.clientY, {
      columnId: appointment.columnId,
      date: appointment.startTime.slice(0, 10),
      startTime: appointment.startTime.slice(11, 16),
    })
  }, [])

  const handleSlotContextMenu = useCallback((event: MouseEvent, selection: SlotSelection) => {
    event.preventDefault()
    event.stopPropagation()
    if (menuOpenedRef.current || suppressContextMenuRef.current) {
      menuOpenedRef.current = false
      suppressContextMenuRef.current = false
      return
    }
    presentSelectionMenu(event.clientX, event.clientY, selection)
  }, [])

  const handleColumnContextMenu = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (menuOpenedRef.current || suppressContextMenuRef.current) {
      menuOpenedRef.current = false
      suppressContextMenuRef.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const slot = slotFromClientPoint(event.clientX, event.clientY)
    if (!slot) return
    event.preventDefault()
    event.stopPropagation()
    presentSelectionMenu(event.clientX, event.clientY, slot)
  }, [])

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

  const handleSlotClick = useCallback((selection: SlotSelection) => {
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
  }, [blocks, blockMode])

  const selectedSlots = useMemo(() => {
    const slots: AgendaSlotRef[] = []
    for (const key of selectedKeys) {
      const slot = parseSlotKey(key)
      if (slot && timeSlots.includes(slot.startTime)) slots.push(slot)
    }
    return slots
  }, [selectedKeys, timeSlots])

  const blockedSelectionCount = useMemo(
    () =>
      selectedSlots.filter((slot) =>
        isSlotBlocked(slot.date, slot.startTime, slot.columnId, blocks),
      ).length,
    [selectedSlots, blocks],
  )

  const contiguousRange = useMemo(
    () => singleContiguousRange(selectedSlots),
    [selectedSlots],
  )

  const selectionSummary = useMemo(() => {
    return selectionToBlockInputs(selectedSlots).map((input) => {
      const columnName = columns.find((column) => column.id === input.columnId)?.name ?? 'Silla'
      const when = format(parseISO(`${input.date}T12:00:00`), "EEE d MMM", { locale: es })
      return `${when} · ${columnName} · ${input.startTime}–${input.endTime}`
    })
  }, [selectedSlots, columns])

  const clearSlotSelection = useCallback(() => {
    setSelectedKeys(new Set())
    anchorRef.current = null
    setBulkError('')
  }, [])

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setBulkReason('')
    clearSlotSelection()
  }, [clearSlotSelection])

  const handleSlotPress = useCallback(
    (_event: MouseEvent<HTMLButtonElement>, slot: AgendaSlotRef) => {
      if (selectionModeRef.current) return
      handleSlotClick(slot)
    },
    [handleSlotClick],
  )

  const handleColumnPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 && event.button !== 2) return

    const origin = slotFromClientPoint(event.clientX, event.clientY)
    if (!origin) return

    gestureCleanupRef.current?.()

    const gesture = {
      pointerId: event.pointerId,
      button: event.button === 2 ? 'right' as const : 'left' as const,
      origin,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      base: new Set(selectedKeysRef.current),
    }
    anchorRef.current = origin

    const paint = (target: AgendaSlotRef, moved: boolean) => {
      const keys = selectionFromMouseGesture({
        button: gesture.button,
        moved,
        selectionMode: selectionModeRef.current || moved,
        origin: gesture.origin,
        target,
        selectedKeys: gesture.base,
        timeSlots: timeSlotsRef.current,
        axes: slotAxesRef.current,
      })
      if (!keys) return false
      setSelectedKeys(new Set(keys))
      return true
    }

    const stopSelecting = () => {
      document.querySelector('.agenda-scheduler-root')?.classList.remove('agenda-selecting')
    }

    const suppressFollowingClick = () => {
      const stop = (clickEvent: Event) => {
        const target = clickEvent.target
        if (!(target instanceof Element)) return
        if (!target.closest('[data-agenda-column]')) return
        clickEvent.preventDefault()
        clickEvent.stopPropagation()
      }
      window.addEventListener('click', stop, true)
      window.addEventListener('auxclick', stop, true)
      window.setTimeout(() => {
        window.removeEventListener('click', stop, true)
        window.removeEventListener('auxclick', stop, true)
      }, 400)
    }

    const move = (pointerEvent: globalThis.PointerEvent) => {
      if (pointerEvent.pointerId !== gesture.pointerId) return
      const distance = Math.hypot(pointerEvent.clientX - gesture.startX, pointerEvent.clientY - gesture.startY)
      if (distance < SLOT_DRAG_THRESHOLD_PX) return
      if (!gesture.moved) setSlotGestureActive(true)
      gesture.moved = true
      if (gesture.button === 'right') suppressContextMenuRef.current = true
      document.querySelector('.agenda-scheduler-root')?.classList.add('agenda-selecting')
      const target = slotFromClientPoint(pointerEvent.clientX, pointerEvent.clientY)
      if (!target) return
      pointerEvent.preventDefault()
      paint(target, true)
    }

    const finish = (pointerEvent: globalThis.PointerEvent) => {
      if (pointerEvent.pointerId !== gesture.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      gestureCleanupRef.current = null
      stopSelecting()
      setSlotGestureActive(false)

      if (gesture.button === 'right' && !gesture.moved) {
        const keys = selectionForRightClick(gesture.origin, selectedKeysRef.current)
        const next = new Set(keys)
        selectedKeysRef.current = next
        setSelectedKeys(next)
        setSelectionMode(true)
        menuOpenedRef.current = true
        openSelectionMenuRef.current(pointerEvent.clientX, pointerEvent.clientY, gesture.origin, keys)
        return
      }

      if (gesture.moved) {
        const target = slotFromClientPoint(pointerEvent.clientX, pointerEvent.clientY) ?? gesture.origin
        paint(target, true)
        setSelectionMode(true)
        suppressFollowingClick()
        return
      }

      const changed = paint(gesture.origin, false)
      if (changed) {
        setSelectionMode(true)
        suppressFollowingClick()
      }
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    gestureCleanupRef.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      stopSelecting()
    }

    if (event.button === 2) event.preventDefault()
  }, [])

  useEffect(() => () => gestureCleanupRef.current?.(), [])

  useEffect(() => {
    setSelectedKeys(new Set())
    anchorRef.current = null
  }, [activeView, currentDate])

  const rewriteSlots = async (slots: AgendaSlotRef[], block: boolean, reason?: string) => {
    const columnIds = columns.map((column) => column.id)
    const rewrite = rewriteBlocksForSlotSelection(blocks, slots, columnIds)
    await applyBlockRewrite(
      block
        ? {
            deleteIds: rewrite.deleteIds,
            create: mergeBlockInputs([
              ...rewrite.create,
              ...selectionToBlockInputs(slots, reason),
            ]),
          }
        : rewrite,
    )
    setSelectedBlock(null)
    clearSlotSelection()
  }

  const blockSlots = async (slots: AgendaSlotRef[], reason?: string) => {
    if (slots.length === 0) return
    setBulkSaving(true)
    setBulkError('')
    try {
      await rewriteSlots(slots, true, reason)
    } catch {
      setBulkError('No se pudo bloquear la selección.')
    } finally {
      setBulkSaving(false)
    }
  }

  const unblockSlots = async (slots: AgendaSlotRef[]) => {
    if (slots.length === 0) return
    setBulkSaving(true)
    setBulkError('')
    try {
      await rewriteSlots(slots, false)
    } catch {
      setBulkError('No se pudo desbloquear la selección.')
    } finally {
      setBulkSaving(false)
    }
  }

  const handleBulkBlock = async () => {
    await blockSlots(selectedSlots, bulkReason.trim() || undefined)
  }

  const handleBulkUnblock = async () => {
    if (blockedSelectionCount === 0) return
    await unblockSlots(selectedSlots)
  }

  const saveSlotNote = async (slots: AgendaSlotRef[], text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const covered = appointmentsCoveringSlots(appointments, slots)
    if (covered.length === 1 && covered[0].id != null) {
      await updateAppointmentNotes(covered[0].id, trimmed)
    } else {
      for (const appointment of covered) {
        if (appointment.id == null) continue
        const previous = appointment.notes?.trim()
        const next = previous ? `${previous}\n${trimmed}` : trimmed
        await updateAppointmentNotes(appointment.id, next)
      }
    }
    writeSlotNotes(slots, trimmed)
    renderCitas()
  }

  const handleBulkCreateAppointment = () => {
    if (!contiguousRange) return
    setSlotSelection(contiguousRange)
    setSelectedAppointment(null)
    setEditingAppointment(null)
    setModalOpen(true)
    clearSlotSelection()
  }

  const handleViewChange = (view: AgendaViewMode) => {
    setActiveView(view)
    if (view === 'month') exitSelectionMode()
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
          <AgendaViewTabs activeView={activeView} onChange={handleViewChange} />

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
            {activeView !== 'month' && (
              <button
                type="button"
                aria-pressed={selectionMode}
                onClick={() => {
                  if (selectionMode) exitSelectionMode()
                  else setSelectionMode(true)
                }}
                className={`text-xs ${
                  selectionMode
                    ? 'rounded-lg bg-dental-600 px-3 py-1.5 font-medium text-white'
                    : 'btn-secondary'
                }`}
              >
                {selectionMode ? 'Selección activa' : 'Seleccionar casillas'}
              </button>
            )}
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
              — clic derecho en una casilla y elija Pegar
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

      {selectionMode && activeView !== 'month' && (
        <AgendaSlotBulkBar
          count={selectedSlots.length}
          summary={slotGestureActive ? [] : selectionSummary}
          blockedCount={slotGestureActive ? 0 : blockedSelectionCount}
          reason={bulkReason}
          saving={bulkSaving}
          error={slotGestureActive ? '' : bulkError}
          canCreateAppointment={!slotGestureActive && contiguousRange != null}
          onReasonChange={setBulkReason}
          onBlock={() => void handleBulkBlock()}
          onUnblock={() => void handleBulkUnblock()}
          onCreateAppointment={handleBulkCreateAppointment}
          onClear={clearSlotSelection}
          onExit={exitSelectionMode}
        />
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
                onAppointmentClick={setSelectedAppointment}
                onAppointmentContextMenu={handleAppointmentContextMenu}
                onSlotContextMenu={handleSlotContextMenu}
                onBlockClick={setSelectedBlock}
                selectionMode={selectionMode}
                selectedKeys={selectedKeys}
                onSlotPress={handleSlotPress}
                onColumnPointerDown={handleColumnPointerDown}
                onColumnContextMenu={handleColumnContextMenu}
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
                  onAppointmentClick={setSelectedAppointment}
                  onAppointmentContextMenu={handleAppointmentContextMenu}
                  onSlotContextMenu={handleSlotContextMenu}
                  onBlockClick={setSelectedBlock}
                  selectionMode={selectionMode}
                  selectedKeys={selectedKeys}
                  onSlotPress={handleSlotPress}
                  onColumnPointerDown={handleColumnPointerDown}
                  onColumnContextMenu={handleColumnContextMenu}
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

      {slotAction?.kind === 'block' && (
        <AgendaSlotActionDialog
          title="Bloquear hora"
          description="Las casillas seleccionadas quedan cerradas en la agenda."
          label="Motivo"
          placeholder="Reunión, mantenimiento, almuerzo..."
          confirmLabel="Bloquear"
          onClose={() => setSlotAction(null)}
          onConfirm={async (reason) => {
            await blockSlots(slotAction.slots, reason || undefined)
          }}
        />
      )}

      {slotAction?.kind === 'note' && (
        <AgendaSlotActionDialog
          title="Insertar nota"
          description="La nota queda en las casillas seleccionadas y en la cita, si ya existe."
          label="Nota"
          initialValue={slotAction.initial}
          placeholder="Indicación para este horario..."
          confirmLabel="Guardar nota"
          required
          onClose={() => setSlotAction(null)}
          onConfirm={async (text) => {
            await saveSlotNote(slotAction.slots, text)
          }}
        />
      )}

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
