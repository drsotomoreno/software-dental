import { useState } from 'react'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { LocalBackupPanel } from '@/components/backup/LocalBackupPanel'
import { ClearTestDatabasePanel } from '@/components/settings/ClearTestDatabasePanel'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import {
  clearScheduledPassphrase,
  createEncryptedBackup,
  downloadBackupFile,
  getBackupSettings,
  getBackupSummary,
  getScheduledPassphrase,
  markBackupCompleted,
  saveBackupSettings,
  setScheduledPassphrase,
} from '@/services/backupService'
import { BACKUP_REMINDER_DAYS, WORKDAY_END_HOUR } from '@/types/backup'
import type { BackupSettings } from '@/types/backup'

export function BackupsPage() {
  const { user } = useAuth()
  const { audit } = useAudit()
  const [settings, setSettings] = useState<BackupSettings>(() => getBackupSettings())
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [scheduledPassphrase, setScheduledPassphraseState] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const summary = getBackupSummary(settings)

  const showMsg = (text: string) => {
    setMessage(text)
    setError('')
  }

  const showErr = (text: string) => {
    setError(text)
    setMessage('')
  }

  const persistSettings = (next: BackupSettings) => {
    saveBackupSettings(next)
    setSettings(next)
  }

  const handleCreateEncryptedBackup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      showErr('La contraseña de respaldo debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      showErr('Las contraseñas no coinciden.')
      return
    }

    setBusy(true)
    try {
      const file = await createEncryptedBackup(password, user?.id ?? null)
      downloadBackupFile(file)
      markBackupCompleted(user?.id ?? null)
      setSettings(getBackupSettings())
      await audit({
        action: 'CREATE_BACKUP',
        resourceType: 'backup',
        details: `Respaldo cifrado — ${file.exportedAt}`,
      })
      showMsg('Respaldo cifrado creado y descargado correctamente.')
      setPassword('')
      setConfirmPassword('')
    } catch {
      showErr('No se pudo crear el respaldo cifrado. Intente nuevamente.')
    } finally {
      setBusy(false)
    }
  }

  const handleSaveSchedule = (e: React.FormEvent) => {
    e.preventDefault()
    const next: BackupSettings = {
      ...settings,
      autoBackupEnabled: (e.target as HTMLFormElement).autoBackupEnabled.checked,
      autoBackupIntervalHours: Number(
        (e.target as HTMLFormElement).autoBackupIntervalHours.value,
      ),
      storeBackupKeyForSchedule: (e.target as HTMLFormElement).storeBackupKey.checked,
    }

    if (next.storeBackupKeyForSchedule) {
      if (scheduledPassphrase.length < 8) {
        showErr('La clave programada debe tener al menos 8 caracteres.')
        return
      }
      setScheduledPassphrase(scheduledPassphrase)
    } else {
      clearScheduledPassphrase()
    }

    persistSettings(next)
    showMsg('Configuración de respaldos guardada.')
  }

  return (
    <RequirePermission permission="backups.manage">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Copias de seguridad</h1>
          <p className="mt-1 text-slate-600">
            Ajustes de respaldo local de IndexedDB. Descargue un JSON fechado al cerrar la jornada
            o al cambiar de computador. Se recuerda automáticamente si pasan {BACKUP_REMINDER_DAYS}{' '}
            días o después de las {WORKDAY_END_HOUR}:00 sin una copia de hoy.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card">
            <p className="text-xs font-medium uppercase text-slate-500">Modo operación</p>
            <p className="mt-1 text-lg font-semibold text-green-700">Offline / local</p>
            <p className="mt-1 text-sm text-slate-600">
              Los datos viven en este equipo (IndexedDB) sin depender de internet.
            </p>
          </div>
          <div className="card">
            <p className="text-xs font-medium uppercase text-slate-500">Último respaldo</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">
              {summary.lastBackupAt
                ? new Date(summary.lastBackupAt).toLocaleString('es-CO')
                : 'Sin respaldos'}
            </p>
            {summary.reminderDue && (
              <p className="mt-1 text-sm text-amber-700">Recordatorio de copia pendiente</p>
            )}
          </div>
          <div className="card">
            <p className="text-xs font-medium uppercase text-slate-500">Formato</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">JSON fechado</p>
            <p className="mt-1 text-sm text-slate-600">
              backup_historias_AAAA-MM-DD.json · opcional AES-GCM
            </p>
          </div>
        </div>

        <LocalBackupPanel onSettingsChange={() => setSettings(getBackupSettings())} />

        <ClearTestDatabasePanel />

        {message && (
          <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleCreateEncryptedBackup} className="card space-y-4">
          <h2 className="text-base font-semibold text-slate-800">Respaldo cifrado (opcional)</h2>
          <p className="text-sm text-slate-600">
            Misma base de datos, protegida con contraseña AES-GCM (.dentalbak.json). Use esta
            opción si el archivo viaja por correo o USB compartido.
          </p>
          <div>
            <label className="label-field">Contraseña de cifrado</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="label-field">Confirmar contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field"
              minLength={8}
              required
            />
          </div>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Generando…' : 'Descargar respaldo cifrado'}
          </button>
        </form>

        <form onSubmit={handleSaveSchedule} className="card space-y-4">
          <h2 className="text-base font-semibold text-slate-800">Programación de respaldos cifrados</h2>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="autoBackupEnabled"
              defaultChecked={settings.autoBackupEnabled}
              className="rounded border-slate-300"
            />
            Activar descarga automática cifrada al abrir la aplicación
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">Intervalo (horas)</label>
              <input
                type="number"
                name="autoBackupIntervalHours"
                min={1}
                max={168}
                defaultValue={settings.autoBackupIntervalHours}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-field">Clave para respaldo programado</label>
              <input
                type="password"
                value={scheduledPassphrase || getScheduledPassphrase() || ''}
                onChange={(e) => setScheduledPassphraseState(e.target.value)}
                placeholder="Solo si activa almacenamiento local"
                className="input-field"
                minLength={8}
              />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              name="storeBackupKey"
              defaultChecked={settings.storeBackupKeyForSchedule}
              className="mt-1 rounded border-slate-300"
            />
            <span>
              Guardar clave en este equipo para descargar respaldos automáticamente al abrir la
              aplicación (solo en consultorios con acceso restringido).
            </span>
          </label>
          <button type="submit" className="btn-secondary">
            Guardar programación
          </button>
        </form>
      </div>
    </RequirePermission>
  )
}
