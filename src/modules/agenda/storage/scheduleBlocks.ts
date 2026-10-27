import { getAppointmentPosition, timeToMinutes } from '@/constants/procedures'
import type { ScheduleBlock } from '@/types/scheduleBlock'

export interface BlockSegment {
  block: ScheduleBlock
  top: string
  height: string
}

export function filterBlocksByDateRange(
  blocks: ScheduleBlock[],
  startDate: string,
  endDate: string,
): ScheduleBlock[] {
  return blocks.filter((block) => block.date >= startDate && block.date <= endDate)
}

function appliesToColumn(block: ScheduleBlock, columnId: string): boolean {
  return !block.columnId || block.columnId === columnId
}

export function isDayFullyBlocked(
  date: string,
  blocks: ScheduleBlock[],
  columnId?: string,
): boolean {
  return blocks.some(
    (block) =>
      block.date === date &&
      block.type === 'full_day' &&
      (columnId ? appliesToColumn(block, columnId) : true),
  )
}

export function findBlockAtSlot(
  date: string,
  slotTime: string,
  columnId: string,
  blocks: ScheduleBlock[],
): ScheduleBlock | null {
  const slotStart = timeToMinutes(slotTime)
  const slotEnd = slotStart + 30

  for (const block of blocks) {
    if (block.date !== date) continue
    if (!appliesToColumn(block, columnId)) continue

    if (block.type === 'full_day') return block

    if (!block.startTime || !block.endTime) continue
    const blockStart = timeToMinutes(block.startTime)
    const blockEnd = timeToMinutes(block.endTime)
    if (slotStart < blockEnd && slotEnd > blockStart) return block
  }

  return null
}

export function isSlotBlocked(
  date: string,
  slotTime: string,
  columnId: string,
  blocks: ScheduleBlock[],
): boolean {
  return findBlockAtSlot(date, slotTime, columnId, blocks) !== null
}

export function getBlockSegmentsForColumn(
  date: string,
  columnId: string,
  blocks: ScheduleBlock[],
): BlockSegment[] {
  return blocks
    .filter((block) => block.date === date && appliesToColumn(block, columnId))
    .map((block) => {
      if (block.type === 'full_day') {
        return { block, top: '0%', height: '100%' }
      }

      const startIso = `${date}T${block.startTime ?? '00:00'}:00`
      const endIso = `${date}T${block.endTime ?? '23:59'}:00`
      const pos = getAppointmentPosition(startIso, endIso)
      return { block, top: pos.top, height: pos.height }
    })
}

export function countDayBlocks(date: string, blocks: ScheduleBlock[]): number {
  return blocks.filter((block) => block.date === date).length
}
