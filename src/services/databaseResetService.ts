import { db, withBackupRestoreUnlock } from '@/db/database'
import { markTestDataCleared } from '@/db/autoSeedPreference'
import { CITAS_STORAGE_KEY } from '@/utils/agendaStorage'
import { useTariffStore } from '@/store/useTariffStore'

function clearRelatedLocalState(): void {
  localStorage.removeItem(CITAS_STORAGE_KEY)

  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key) continue
    if (
      key.startsWith('dental_emr_payment_invoice_seq') ||
      key.startsWith('dental_emr_credit_note_seq')
    ) {
      keysToRemove.push(key)
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key)
  }

  useTariffStore.setState({ tariffs: [], tariffMap: {}, isLoaded: false })
}

/**
 * Vacía todas las tablas de IndexedDB y desactiva el seed automático de prueba.
 * Conserva usuarios, credenciales y la sesión activa para redirigir al inicio ya autenticado.
 */
export async function purgeTestIndexedDb(): Promise<void> {
  markTestDataCleared()
  clearRelatedLocalState()

  const [users, credentials, sessions] = await Promise.all([
    db.users.toArray(),
    db.userCredentials.toArray(),
    db.sessions.toArray(),
  ])

  await withBackupRestoreUnlock(async () => {
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((table) => table.clear()))
      if (users.length) await db.users.bulkPut(users)
      if (credentials.length) await db.userCredentials.bulkPut(credentials)
      if (sessions.length) await db.sessions.bulkPut(sessions)
    })
  })
}
