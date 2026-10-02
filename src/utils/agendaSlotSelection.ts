import {
  minutesToTime,
  SCHEDULER_END_HOUR,
  SCHEDULER_SLOT_MINUTES,
  SCHEDULER_START_HOUR,
  timeToMinutes,
} from '@/constants/procedures'
import type { CreateScheduleBlockInput, ScheduleBlock } from '@/types/scheduleBlock'

/** Casilla del scheduler: silla + día + hora de inicio. */
export interface AgendaSlotRef {
  columnId: string
  date: string
  startTime: string
}

export interface SlotAxis {
  date: string
  columnId: string
}

export interface BlockRewrite {
  deleteIds: Array<number | string>
  create: CreateScheduleBlockInput[]
}

const KEY_SEP = '\u001f'
const GRID_START = SCHEDULER_START_HOUR * 60
const GRID_END = SCHEDULER_END_HOUR * 60

export function slotKey(slot: AgendaSlotRef): string {
  return [slot.date, slot.columnId, slot.startTime].join(KEY_SEP)
}

export function parseSlotKey(key: string): AgendaSlotRef | null {
  const [date, columnId, startTime] = key.split(KEY_SEP)
  if (!date || !columnId || !startTime) return null
  return { date, columnId, startTime }
}

export function rectangleSlots(
  origin: AgendaSlotRef,
  target: AgendaSlotRef,
  timeSlots: string[],
  axes: SlotAxis[],
): AgendaSlotRef[] {
  const axisIndex = (slot: AgendaSlotRef) =>
    axes.findIndex((axis) => axis.date === slot.date && axis.columnId === slot.columnId)
  const originAxis = axisIndex(origin)
  const targetAxis = axisIndex(target)
  const originTime = timeSlots.indexOf(origin.startTime)
  const targetTime = timeSlots.indexOf(target.startTime)

  if (originAxis < 0 || targetAxis < 0 || originTime < 0 || targetTime < 0) {
    return [target]
  }

  const axisStart = Math.min(originAxis, targetAxis)
  const axisEnd = Math.max(originAxis, targetAxis)
  const timeStart = Math.min(originTime, targetTime)
  const timeEnd = Math.max(originTime, targetTime)
  const slots: AgendaSlotRef[] = []

  for (let axis = axisStart; axis <= axisEnd; axis += 1) {
    for (let time = timeStart; time <= timeEnd; time += 1) {
      slots.push({
        date: axes[axis].date,
        columnId: axes[axis].columnId,
        startTime: timeSlots[time],
      })
    }
  }

  return slots
}

/** Un clic tembloroso sigue siendo clic. El arrastre empieza al salir de la casilla. */
export const SLOT_DRAG_THRESHOLD_PX = 10

export interface MouseGestureInput {
  button: 'left' | 'right'
  moved: boolean
  selectionMode: boolean
  origin: AgendaSlotRef
  target: AgendaSlotRef
  selectedKeys: ReadonlySet<string>
  timeSlots: string[]
  axes: SlotAxis[]
}

/**
 * Selección con el mouse, como en una tabla.
 * El botón izquierdo marca una casilla o, si se arrastra, el rectángulo.
 * El botón derecho suma o quita sin borrar el resto.
 * Null conserva la acción normal del clic (cita o bloqueo).
 */
export function selectionFromMouseGesture(input: MouseGestureInput): string[] | null {
  if (input.button === 'right' && !input.selectionMode) return null
  if (input.button === 'left' && !input.moved && !input.selectionMode) return null

  if (!input.moved) {
    const key = slotKey(input.origin)
    if (input.button === 'left') return [key]
    const next = new Set(input.selectedKeys)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return [...next]
  }

  const rectangle = rectangleSlots(input.origin, input.target, input.timeSlots, input.axes).map(slotKey)
  if (input.button === 'left') return rectangle

  const next = new Set(input.selectedKeys)
  for (const key of rectangle) next.add(key)
  return [...next]
}

/** Casilla bajo el cursor, aunque haya una cita o un bloqueo encima. */
export function slotFromClientPoint(x: number, y: number): AgendaSlotRef | null {
  if (typeof document === 'undefined') return null
  const nodes = document.querySelectorAll<HTMLElement>('[data-agenda-slot]')
  for (const node of nodes) {
    const rect = node.getBoundingClientRect()
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) continue
    const parsed = parseSlotKey(node.getAttribute('data-agenda-slot') ?? '')
    if (parsed) return parsed
  }
  return null
}

function groupSlotMinutes(slots: AgendaSlotRef[]): Map<string, Map<string, number[]>> {
  const grouped = new Map<string, Map<string, number[]>>()
  for (const slot of slots) {
    const byColumn = grouped.get(slot.date) ?? new Map<string, number[]>()
    const minutes = byColumn.get(slot.columnId) ?? []
    minutes.push(timeToMinutes(slot.startTime))
    byColumn.set(slot.columnId, minutes)
    grouped.set(slot.date, byColumn)
  }
  return grouped
}

export function selectionToBlockInputs(
  slots: AgendaSlotRef[],
  reason?: string,
): CreateScheduleBlockInput[] {
  const inputs: CreateScheduleBlockInput[] = []

  for (const [date, byColumn] of groupSlotMinutes(slots)) {
    for (const [columnId, minutesList] of byColumn) {
      const unique = [...new Set(minutesList)].sort((a, b) => a - b)
      if (unique.length === 0) continue

      let rangeStart = unique[0]
      let previous = unique[0]

      const flush = (endExclusive: number) => {
        inputs.push({
          date,
          type: 'time_range',
          startTime: minutesToTime(rangeStart),
          endTime: minutesToTime(endExclusive),
          columnId,
          reason,
        })
      }

      for (let index = 1; index < unique.length; index += 1) {
        const current = unique[index]
        if (current === previous + SCHEDULER_SLOT_MINUTES) {
          previous = current
          continue
        }
        flush(previous + SCHEDULER_SLOT_MINUTES)
        rangeStart = current
        previous = current
      }

      flush(previous + SCHEDULER_SLOT_MINUTES)
    }
  }

  return inputs
}

export function singleContiguousRange(slots: AgendaSlotRef[]): {
  date: string
  columnId: string
  startTime: string
  endTime: string
} | null {
  const inputs = selectionToBlockInputs(slots)
  if (inputs.length !== 1) return null
  const [only] = inputs
  if (!only.columnId || !only.startTime || !only.endTime) return null
  return {
    date: only.date,
    columnId: only.columnId,
    startTime: only.startTime,
    endTime: only.endTime,
  }
}

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const [start, end] of sorted) {
    if (end <= start) continue
    const last = merged[merged.length - 1]
    if (!last || start > last[1]) {
      merged.push([start, end])
      continue
    }
    last[1] = Math.max(last[1], end)
  }
  return merged
}

function subtractIntervals(
  base: Array<[number, number]>,
  cuts: Array<[number, number]>,
): Array<[number, number]> {
  let current = mergeIntervals(base)
  for (const [cutStart, cutEnd] of mergeIntervals(cuts)) {
    const next: Array<[number, number]> = []
    for (const [start, end] of current) {
      if (cutEnd <= start || cutStart >= end) {
        next.push([start, end])
        continue
      }
      if (cutStart > start) next.push([start, cutStart])
      if (cutEnd < end) next.push([cutEnd, end])
    }
    current = next
  }
  return current
}

function intervalsOverlap(
  base: Array<[number, number]>,
  cuts: Array<[number, number]>,
): boolean {
  for (const [start, end] of base) {
    for (const [cutStart, cutEnd] of cuts) {
      if (start < cutEnd && cutStart < end) return true
    }
  }
  return false
}

function blockCoverage(block: ScheduleBlock): Array<[number, number]> | null {
  if (block.type === 'full_day') return [[GRID_START, GRID_END]]
  if (!block.startTime || !block.endTime) return null
  const start = timeToMinutes(block.startTime)
  const end = timeToMinutes(block.endTime)
  if (end <= start) return null
  return [[start, end]]
}

function intervalsToInputs(
  date: string,
  columnId: string | undefined,
  intervals: Array<[number, number]>,
  reason?: string,
): CreateScheduleBlockInput[] {
  return mergeIntervals(intervals).map(([start, end]) => {
    if (start <= GRID_START && end >= GRID_END) {
      return {
        date,
        type: 'full_day' as const,
        columnId,
        reason,
      }
    }
    return {
      date,
      type: 'time_range' as const,
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
      columnId,
      reason,
    }
  })
}

/**
 * Quita las casillas seleccionadas de los bloqueos existentes.
 * Un bloqueo de varias sillas se parte por silla cuando la selección no es simétrica.
 */
export function rewriteBlocksForSlotSelection(
  blocks: ScheduleBlock[],
  selected: AgendaSlotRef[],
  columnIds: string[],
): BlockRewrite {
  const cutsBySlot = new Map<string, Array<[number, number]>>()
  for (const slot of selected) {
    const key = `${slot.date}${KEY_SEP}${slot.columnId}`
    const start = timeToMinutes(slot.startTime)
    const cuts = cutsBySlot.get(key) ?? []
    cuts.push([start, start + SCHEDULER_SLOT_MINUTES])
    cutsBySlot.set(key, cuts)
  }

  const deleteIds: Array<number | string> = []
  const create: CreateScheduleBlockInput[] = []

  for (const block of blocks) {
    if (block.id == null) continue
    const coverage = blockCoverage(block)
    if (!coverage) continue

    const columns = block.columnId ? [block.columnId] : columnIds
    if (columns.length === 0) continue

    const remainingByColumn = new Map<string, Array<[number, number]>>()
    let overlaps = false

    for (const columnId of columns) {
      const cuts = mergeIntervals(cutsBySlot.get(`${block.date}${KEY_SEP}${columnId}`) ?? [])
      if (cuts.length > 0 && intervalsOverlap(coverage, cuts)) overlaps = true
      remainingByColumn.set(columnId, subtractIntervals(coverage, cuts))
    }

    if (!overlaps) continue

    deleteIds.push(block.id)

    if (!block.columnId && columns.length > 1) {
      const signatures = columns.map((columnId) =>
        JSON.stringify(remainingByColumn.get(columnId) ?? []),
      )
      const sameForEveryColumn = signatures.every((signature) => signature === signatures[0])
      if (sameForEveryColumn) {
        create.push(
          ...intervalsToInputs(
            block.date,
            undefined,
            remainingByColumn.get(columns[0]) ?? [],
            block.reason,
          ),
        )
        continue
      }
    }

    for (const columnId of columns) {
      create.push(
        ...intervalsToInputs(
          block.date,
          block.columnId ?? columnId,
          remainingByColumn.get(columnId) ?? [],
          block.reason,
        ),
      )
    }
  }

  return { deleteIds, create }
}

export function mergeBlockInputs(inputs: CreateScheduleBlockInput[]): CreateScheduleBlockInput[] {
  const fullDays: CreateScheduleBlockInput[] = []
  const ranges: CreateScheduleBlockInput[] = []

  for (const input of inputs) {
    if (input.type === 'full_day') fullDays.push(input)
    else ranges.push(input)
  }

  const fullDayKeys = new Set(
    fullDays.map((block) => `${block.date}${KEY_SEP}${block.columnId ?? '*'}${KEY_SEP}${block.reason ?? ''}`),
  )
  const groups = new Map<string, CreateScheduleBlockInput[]>()

  for (const input of ranges) {
    const key = `${input.date}${KEY_SEP}${input.columnId ?? '*'}${KEY_SEP}${input.reason ?? ''}`
    if (fullDayKeys.has(key)) continue
    const list = groups.get(key) ?? []
    list.push(input)
    groups.set(key, list)
  }

  const merged = [...fullDays]
  for (const list of groups.values()) {
    const sample = list[0]
    const intervals = list
      .filter((input) => input.startTime && input.endTime)
      .map(
        (input) =>
          [timeToMinutes(input.startTime!), timeToMinutes(input.endTime!)] as [number, number],
      )
    for (const [start, end] of mergeIntervals(intervals)) {
      if (start <= GRID_START && end >= GRID_END) {
        merged.push({
          date: sample.date,
          type: 'full_day',
          columnId: sample.columnId,
          reason: sample.reason,
        })
        continue
      }
      merged.push({
        date: sample.date,
        type: 'time_range',
        startTime: minutesToTime(start),
        endTime: minutesToTime(end),
        columnId: sample.columnId,
        reason: sample.reason,
      })
    }
  }

  return merged
}
