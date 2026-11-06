import { db } from '@/db/database'
import { isApplyingRemotePull, isClinicalSyncSuppressed } from '@/services/clinicalSyncState'
import type {
  OfflineClinica,
  OfflineHistoriaClinica,
  OfflineMirrorTable,
  OfflinePaciente,
  OfflineSyncOperacion,
  OfflineSyncQueueItem,
  OfflineUsuario,
} from '@/types/offlineMirror'

const MIRROR_TABLES = new Set<OfflineMirrorTable>([
  'pacientes',
  'historias_clinicas',
  'usuarios',
  'clinicas',
])

function assertMirrorTable(tabla: string): asserts tabla is OfflineMirrorTable {
  if (!MIRROR_TABLES.has(tabla as OfflineMirrorTable)) {
    throw new Error(`Tabla espejo no permitida para sync_queue: ${tabla}`)
  }
}

/**
 * Guarda en el espejo IndexedDB y encola la operación para subir a Postgres
 * cuando vuelva la conexión. No encola durante pull remoto.
 */
export async function guardarLocalYEncolar(
  tabla: OfflineMirrorTable,
  datos: Record<string, unknown> & { id: string },
  operacion: OfflineSyncOperacion = 'INSERT',
): Promise<void> {
  assertMirrorTable(tabla)
  if (!datos?.id) {
    throw new Error('guardarLocalYEncolar requiere datos.id')
  }

  const table = db.table(tabla)
  const skipQueue = isApplyingRemotePull() || isClinicalSyncSuppressed()

  await db.transaction('rw', table, db.sync_queue, async () => {
    if (operacion === 'DELETE') {
      const soft = {
        ...datos,
        deleted_at: datos.deleted_at || new Date().toISOString(),
        updated_at: datos.updated_at || new Date().toISOString(),
      }
      await table.put(soft)
    } else {
      await table.put({
        ...datos,
        updated_at: datos.updated_at || new Date().toISOString(),
      })
    }

    if (skipQueue) return

    const entry: OfflineSyncQueueItem = {
      tabla_afectada: tabla,
      operacion,
      registro_id: String(datos.id),
      payload: datos,
      timestamp: Date.now(),
      status: 'pending',
      attempts: 0,
    }
    await db.sync_queue.add(entry)
  })
}

export async function listPendingSyncQueue(limit = 100): Promise<OfflineSyncQueueItem[]> {
  const rows = await db.sync_queue
    .orderBy('timestamp')
    .filter((row) => row.status !== 'synced')
    .limit(limit)
    .toArray()
  return rows
}

export async function markSyncQueueItem(
  id: number,
  patch: Partial<Pick<OfflineSyncQueueItem, 'status' | 'error' | 'attempts'>>,
): Promise<void> {
  await db.sync_queue.update(id, patch)
}

export type {
  OfflineClinica,
  OfflineHistoriaClinica,
  OfflinePaciente,
  OfflineUsuario,
  OfflineSyncQueueItem,
  OfflineMirrorTable,
  OfflineSyncOperacion,
}
