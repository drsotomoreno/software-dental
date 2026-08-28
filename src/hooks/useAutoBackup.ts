import { useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import {
  createEncryptedBackup,
  downloadBackupFile,
  getBackupSettings,
  getScheduledPassphrase,
  isBackupOverdue,
  markBackupCompleted,
} from '@/services/backupService'

export function useAutoBackup() {
  const { user, can } = useAuth()
  const { audit } = useAudit()
  const ranRef = useRef(false)

  useEffect(() => {
    if (!user || !can('backups.manage') || ranRef.current) return

    const settings = getBackupSettings()
    if (!settings.autoBackupEnabled || !settings.storeBackupKeyForSchedule) return
    if (!isBackupOverdue(settings)) return

    const passphrase = getScheduledPassphrase()
    if (!passphrase) return

    ranRef.current = true

    ;(async () => {
      try {
        const file = await createEncryptedBackup(passphrase, user.id)
        downloadBackupFile(file)
        markBackupCompleted(user.id)
        await audit({
          action: 'CREATE_BACKUP',
          resourceType: 'backup',
          details: 'Respaldo programado automático (cifrado AES-GCM)',
        })
      } catch {
        // El respaldo programado falló silenciosamente; el usuario verá el recordatorio
      }
    })()
  }, [user, can, audit])
}
