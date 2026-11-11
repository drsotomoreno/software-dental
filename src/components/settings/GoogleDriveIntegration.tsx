import { useCallback, useEffect, useState } from 'react'
import { Cloud, HardDrive, Link2Off, Loader2 } from 'lucide-react'
import { getStoredApiAuth } from '@/services/apiAuthService'
import { showGlobalToast } from '@/services/globalToast'
import { canManageClinicTeam } from '@/utils/permissions'
import { useAuth } from '@/contexts/AuthContext'

type DriveStatus = {
  connected: boolean
  status?: string
  googleDriveEmail?: string | null
  rootFolderId?: string | null
  clinicName?: string | null
  canManage?: boolean
  oauthConfigured?: boolean
}

function authHeaders(): HeadersInit {
  const auth = getStoredApiAuth()
  return {
    Accept: 'application/json',
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
  }
}

/**
 * Panel Owner/Admin: conectar o desconectar el Google Drive de la clínica.
 * El connect obtiene la URL OAuth con Bearer y luego redirige a Google
 * (un href directo a /connect no enviaría el token).
 */
export function GoogleDriveIntegration() {
  const { user } = useAuth()
  const apiUser = getStoredApiAuth()?.user
  const canManage = canManageClinicTeam({
    role: user?.role,
    rol: apiUser?.rol,
    isClinicOwner: apiUser?.isClinicOwner ?? user?.isClinicOwner,
    id: apiUser?.id ?? user?.id,
    clinicId: apiUser?.clinicId ?? user?.clinicId,
  })

  const [status, setStatus] = useState<DriveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadStatus = useCallback(async () => {
    const auth = getStoredApiAuth()
    if (!auth?.token) {
      setStatus(null)
      setLoading(false)
      setError('Inicie sesión para gestionar Google Drive.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/integrations/google-drive/status', {
        headers: authHeaders(),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(String(payload.error || 'No se pudo consultar el estado de Google Drive.'))
        setStatus(null)
        return
      }
      setStatus({
        connected: Boolean(payload.connected),
        status: payload.status,
        googleDriveEmail: payload.googleDriveEmail ?? null,
        rootFolderId: payload.rootFolderId ?? null,
        clinicName: payload.clinicName ?? null,
        canManage: payload.canManage,
        oauthConfigured: payload.oauthConfigured,
      })
    } catch {
      setError('No se pudo conectar con el servidor.')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  /** Callback OAuth: ?googleDrive=connected | error */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const flag = params.get('googleDrive')
    if (!flag) return

    if (flag === 'connected') {
      showGlobalToast('Google Drive conectado correctamente', {
        variant: 'success',
        durationMs: 6000,
      })
      void loadStatus()
    } else if (flag === 'error') {
      const code = params.get('code') || 'error'
      showGlobalToast(
        `No se pudo conectar Google Drive (${code}). Intente de nuevo desde Configuración.`,
        { variant: 'error', durationMs: 8000 },
      )
    }

    params.delete('googleDrive')
    params.delete('code')
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', next)
  }, [loadStatus])

  const handleConnect = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/integrations/google-drive/connect', {
        headers: authHeaders(),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.url) {
        setError(
          String(
            payload.error ||
              'No se pudo iniciar la conexión con Google. Verifique las credenciales OAuth del servidor.',
          ),
        )
        return
      }
      window.location.href = String(payload.url)
    } catch {
      setError('No se pudo iniciar la conexión con Google Drive.')
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    if (
      !window.confirm(
        '¿Desconectar Google Drive? Mientras esté desconectado no se podrán subir ni ver radiografías en la nube.',
      )
    ) {
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/integrations/google-drive/disconnect', {
        method: 'POST',
        headers: authHeaders(),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(String(payload.error || 'No se pudo desconectar Google Drive.'))
        return
      }
      showGlobalToast('Google Drive desconectado.', { variant: 'warning', durationMs: 5000 })
      await loadStatus()
    } catch {
      setError('No se pudo desconectar Google Drive.')
    } finally {
      setBusy(false)
    }
  }

  if (!canManage) return null

  return (
    <section className="card space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
          <HardDrive className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-800">Google Drive</h2>
          <p className="mt-1 text-sm text-slate-600">
            Las radiografías y fotos clínicas se guardan en el Drive del Gmail de la clínica
            (carpeta visible <span className="font-medium">mihistoriadental</span>). Solo el
            dueño o un administrador puede vincular la cuenta.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Consultando estado…
        </p>
      ) : status?.connected ? (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-900">
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs text-white"
              aria-hidden
            >
              ✓
            </span>
            Conectado a: {status.googleDriveEmail || 'cuenta de Google'}
          </div>
          {status.clinicName ? (
            <p className="text-xs text-emerald-800/80">
              Carpeta de la clínica: mihistoriadental - {status.clinicName}
            </p>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            onClick={() => void handleDisconnect()}
            disabled={busy}
          >
            <Link2Off className="h-4 w-4" aria-hidden />
            {busy ? 'Desconectando…' : 'Desconectar'}
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4">
          <div className="flex items-center gap-3">
            <Cloud className="h-8 w-8 text-sky-600" aria-hidden />
            <div>
              <p className="text-sm font-medium text-slate-800">Drive no conectado</p>
              <p className="text-xs text-slate-600">
                Obligatorio para subir o ver adjuntos clínicos en la nube.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
            onClick={() => void handleConnect()}
            disabled={busy || status?.oauthConfigured === false}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Cloud className="h-4 w-4" aria-hidden />
            )}
            Conectar Google Drive
          </button>
          {status?.oauthConfigured === false ? (
            <p className="text-xs text-amber-800">
              El servidor aún no tiene configuradas las credenciales OAuth de Google.
            </p>
          ) : null}
        </div>
      )}

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
    </section>
  )
}
