import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  dismissBackupReminder,
  getBackupReminderReason,
  getBackupSettings,
} from '@/services/backupService'
import { BACKUP_SETTINGS_CHANGED_EVENT } from '@/types/backup'

const REMINDER_COPY = {
  never:
    'Aún no hay una copia de seguridad exportada. Descargue un JSON para no perder historias clínicas.',
  stale:
    'Han pasado más de 7 días desde la última copia de seguridad exportada.',
  end_of_day:
    'Fin de jornada: recuerde descargar la copia de seguridad de hoy antes de apagar el equipo.',
} as const

export function BackupReminderBanner() {
  const { can } = useAuth()
  const [, setTick] = useState(0)

  useEffect(() => {
    const refresh = () => setTick((n) => n + 1)
    window.addEventListener(BACKUP_SETTINGS_CHANGED_EVENT, refresh)
    const intervalId = window.setInterval(refresh, 60_000)
    return () => {
      window.removeEventListener(BACKUP_SETTINGS_CHANGED_EVENT, refresh)
      window.clearInterval(intervalId)
    }
  }, [])

  if (!can('backups.manage')) return null

  const settings = getBackupSettings()
  const reason = getBackupReminderReason(settings)
  if (!reason) return null

  const lastBackup = settings.lastBackupAt
    ? new Date(settings.lastBackupAt).toLocaleString('es-CO')
    : 'Nunca'

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <p>
          <span className="font-medium">Recordatorio de copia de seguridad.</span>{' '}
          {REMINDER_COPY[reason]} Último respaldo: {lastBackup}.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => dismissBackupReminder()}
            className="rounded-lg px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            Más tarde
          </button>
          <Link
            to="/respaldos"
            className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
          >
            Descargar copia
          </Link>
        </div>
      </div>
    </div>
  )
}
