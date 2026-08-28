import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { generateId } from '@/utils'

export function useScheduleColumns() {
  const columns = useLiveQuery(() =>
    db.scheduleColumns.orderBy('order').toArray(),
  )

  const addColumn = async (name: string) => {
    const all = await db.scheduleColumns.orderBy('order').toArray()
    const now = new Date().toISOString()
    const maxOrder = all.length > 0 ? Math.max(...all.map((c) => c.order)) : -1
    await db.scheduleColumns.add({
      id: generateId(),
      name,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    })
  }

  const renameColumn = async (id: string, name: string) => {
    await db.scheduleColumns.update(id, {
      name,
      updatedAt: new Date().toISOString(),
    })
  }

  const deleteColumn = async (id: string) => {
    const appointmentsInColumn = await db.appointments
      .where('columnId')
      .equals(id)
      .count()
    if (appointmentsInColumn > 0) {
      throw new Error('No se puede eliminar una silla con citas programadas.')
    }
    await db.scheduleColumns.delete(id)
  }

  const reorderColumn = async (id: string, direction: 'up' | 'down') => {
    const all = await db.scheduleColumns.orderBy('order').toArray()
    const idx = all.findIndex((c) => c.id === id)
    if (idx < 0) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= all.length) return

    const current = all[idx]
    const swap = all[swapIdx]
    const now = new Date().toISOString()

    await db.transaction('rw', db.scheduleColumns, async () => {
      await db.scheduleColumns.update(current.id, { order: swap.order, updatedAt: now })
      await db.scheduleColumns.update(swap.id, { order: current.order, updatedAt: now })
    })
  }

  return {
    columns: columns ?? [],
    isLoading: columns === undefined,
    addColumn,
    renameColumn,
    deleteColumn,
    reorderColumn,
  }
}

export async function seedDefaultColumns(): Promise<void> {
  const count = await db.scheduleColumns.count()
  if (count > 0) return

  const now = new Date().toISOString()
  const defaults = [
    { name: 'Silla 1', order: 0 },
    { name: 'Silla 2', order: 1 },
    { name: 'Consultorio 3', order: 2 },
  ]

  for (const col of defaults) {
    await db.scheduleColumns.add({ ...col, id: generateId(), createdAt: now, updatedAt: now })
  }
}
