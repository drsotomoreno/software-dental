import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
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
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[70] w-[min(22rem,calc(100vw-2rem))] print:hidden"
    >
      <div className="pointer-events-auto rounded-2xl border border-amber-200/90 bg-white p-4 shadow-lg shadow-slate-900/10 ring-1 ring-amber-100">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <AlertTriangle className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              Recordatorio de copia de seguridad
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {REMINDER_COPY[reason]}
            </p>
            <p className="mt-1 text-xs text-slate-500">Último respaldo: {lastBackup}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => dismissBackupReminder()}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            Más tarde
          </button>
          <Link
            to="/respaldos"
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700"
          >
            Descargar copia
          </Link>
        </div>
      </div>
    </div>
  )
}
