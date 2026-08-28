import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import {
  exportAndDownloadPlainBackup,
  parseBackupInput,
  restoreFromBackupFile,
} from '@/services/backupService'

interface LocalBackupPanelProps {
  onSettingsChange?: () => void
  compact?: boolean
}

export function LocalBackupPanel({ onSettingsChange, compact = false }: LocalBackupPanelProps) {
  const { user } = useAuth()
  const { audit } = useAudit()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [restorePassword, setRestorePassword] = useState('')

  const showMsg = (text: string) => {
    setMessage(text)
    setError('')
  }

  const showErr = (text: string) => {
    setError(text)
    setMessage('')
  }

  const handleDownload = async () => {
    setBusy(true)
    try {
      const payload = await exportAndDownloadPlainBackup(user?.id ?? null)
      await audit({
        action: 'CREATE_BACKUP',
        resourceType: 'backup',
        details: `Copia JSON — ${payload.exportedAt} (${payload.data.patients.length} pacientes, ${payload.data.clinicalRecords.length} evoluciones, ${payload.data.electronicInvoices?.length ?? 0} facturas)`,
      })
      onSettingsChange?.()
      showMsg('Copia de seguridad descargada. Guárdela en un USB o carpeta externa.')
    } catch {
      showErr('No se pudo generar la copia de seguridad. Intente de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const handleFilePicked = async (file: File | undefined) => {
    if (!file) return
    setError('')
    setMessage('')
    try {
      const parsed = await parseBackupInput(file)
      setNeedsPassword(parsed.kind === 'encrypted')
      if (parsed.kind !== 'encrypted') {
        setRestorePassword('')
      }
      if (parsed.kind === 'encrypted') {
        showMsg('El archivo está cifrado. Ingrese la contraseña y confirme la restauración.')
        return
      }
      await confirmAndRestore(file)
    } catch (err) {
      setNeedsPassword(false)
      showErr(err instanceof Error ? err.message : 'No se pudo leer el archivo de copia.')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const confirmAndRestore = async (file: File, password?: string, encrypted = false) => {
    if (
      !window.confirm(
        'Restaurar reemplazará todos los datos locales (pacientes, evoluciones, facturas y RIPS) con el contenido del archivo. ¿Desea continuar?',
      )
    ) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      setNeedsPassword(false)
      setRestorePassword('')
      return
    }

    setBusy(true)
    try {
      await restoreFromBackupFile(file, password)
      await audit({
        action: 'RESTORE_BACKUP',
        resourceType: 'backup',
        details: `Restaurado desde ${file.name}`,
      })
      showMsg('Copia restaurada. La aplicación recargará los datos.')
      setTimeout(() => window.location.reload(), 1500)
    } catch {
      showErr(
        encrypted || Boolean(password)
          ? 'No se pudo restaurar. Verifique el archivo y la contraseña.'
          : 'No se pudo restaurar. Verifique que el archivo sea una copia válida.',
      )
    } finally {
      setBusy(false)
    }
  }

  const handleRestoreClick = () => {
    fileInputRef.current?.click()
  }

  const handleEncryptedRestore = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      showErr('Seleccione primero el archivo de copia de seguridad.')
      return
    }
    if (!restorePassword) {
      showErr('Ingrese la contraseña del respaldo cifrado.')
      return
    }
    await confirmAndRestore(file, restorePassword, true)
  }

  return (
    <div className={compact ? 'space-y-3' : 'card space-y-4'}>
      {!compact && (
        <div>
          <h2 className="text-base font-semibold text-slate-800">Copia de seguridad local</h2>
          <p className="mt-1 text-sm text-slate-600">
            Exporta e importa IndexedDB (pacientes, evoluciones, facturas electrónicas y RIPS
            embebido) en un archivo JSON fechado. Úselo al cambiar de computador o al cerrar la
            jornada.
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          void handleFilePicked(event.target.files?.[0])
        }}
      />

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleDownload()}
          className="btn-primary gap-2"
        >
          <Download className="h-4 w-4" aria-hidden />
          {busy ? 'Preparando…' : 'Descargar Copia de Seguridad'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleRestoreClick}
          className="btn-secondary gap-2"
        >
          <Upload className="h-4 w-4" aria-hidden />
          Restaurar Copia de Seguridad
        </button>
      </div>

      {needsPassword && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <label className="label-field">Contraseña del respaldo cifrado</label>
          <input
            type="password"
            value={restorePassword}
            onChange={(event) => setRestorePassword(event.target.value)}
            className="input-field"
            autoComplete="off"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleEncryptedRestore()}
            className="btn-secondary"
          >
            Confirmar restauración cifrada
          </button>
        </div>
      )}

      {message && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  )
}
