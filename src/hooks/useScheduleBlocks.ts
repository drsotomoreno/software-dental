import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import type { CreateScheduleBlockInput } from '@/types/scheduleBlock'
import { filterBlocksByDateRange } from '@/utils/scheduleBlocks'

export function useScheduleBlocks(startDate: string, endDate: string) {
  const blocks = useLiveQuery(async () => {
    const all = await db.scheduleBlocks.orderBy('date').toArray()
    return filterBlocksByDateRange(all, startDate, endDate)
  }, [startDate, endDate])

  const createBlock = async (input: CreateScheduleBlockInput) => {
    const now = new Date().toISOString()
    await db.scheduleBlocks.add({
      ...input,
      createdAt: now,
      updatedAt: now,
    })
  }

  const deleteBlock = async (id: number | string) => {
    await db.scheduleBlocks.delete(id)
  }

  return {
    blocks: blocks ?? [],
    isLoading: blocks === undefined,
    createBlock,
    deleteBlock,
  }
}
