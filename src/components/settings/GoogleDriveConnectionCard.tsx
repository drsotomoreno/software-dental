import { useCallback, useEffect, useState } from 'react'
import { Cloud, Link2Off, Loader2 } from 'lucide-react'
import { getStoredApiAuth } from '@/services/apiAuthService'
import {
  driveClinicQuery,
  driveIdentityHeaders,
  resolveActiveDriveClinicId,
} from '@/services/googleDriveClinicContext'
import { showGlobalToast } from '@/services/globalToast'

type DriveStatus = {
  connected: boolean
  googleDriveEmail?: string | null
  oauthConfigured?: boolean
}

const DISCONNECTED_DETAIL = 'La API de Google Drive todavía no está conectada.'

function currentReturnPath() {
  if (typeof window === 'undefined') return '/perfil'
  return `${window.location.pathname}${window.location.search}`
}

/**
 * Tarjeta de conexión OAuth de la clínica en sesión.
 * Desconectada: «Pendiente» + Conectar Google Drive.
 * Activa: correo de Google + Desconectar.
 */
export function GoogleDriveConnectionCard() {
  const [status, setStatus] = useState<DriveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadStatus = useCallback(async () => {
    const auth = getStoredApiAuth()
    if (!auth?.token) {
      setStatus({ connected: false })
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const clinicId = resolveActiveDriveClinicId()
      const response = await fetch(
        `/api/integrations/google-drive/status${driveClinicQuery(clinicId)}`,
        { headers: driveIdentityHeaders(clinicId) },
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(String(payload.error || 'No se pudo consultar Google Drive.'))
        setStatus({ connected: false })
        return
      }
      setStatus({
        connected: Boolean(payload.connected),
        googleDriveEmail: payload.googleDriveEmail ?? null,
        oauthConfigured: payload.oauthConfigured,
      })
    } catch {
      setError('No se pudo consultar Google Drive.')
      setStatus({ connected: false })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

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
      showGlobalToast(
        `No se pudo conectar Google Drive (${params.get('code') || 'error'}).`,
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
      const clinicId = resolveActiveDriveClinicId()
      const query = new URLSearchParams()
      if (clinicId) query.set('clinicId', clinicId)
      query.set('returnPath', currentReturnPath())
      const response = await fetch(
        `/api/integrations/google-drive/auth-url?${query.toString()}`,
        { headers: driveIdentityHeaders(clinicId) },
      )
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
        '¿Desconectar Google Drive de esta clínica? No se podrán subir ni ver archivos en la nube hasta volver a conectar.',
      )
    ) {
      return
    }
    setBusy(true)
    setError('')
    try {
      const clinicId = resolveActiveDriveClinicId()
      const response = await fetch(
        `/api/integrations/google-drive/disconnect${driveClinicQuery(clinicId)}`,
        { method: 'POST', headers: driveIdentityHeaders(clinicId) },
      )
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

  const connected = Boolean(status?.connected)
  const badge = connected ? 'Conectado' : 'Pendiente'
  const badgeClass = connected
    ? 'bg-emerald-50 text-emerald-700'
    : 'bg-slate-100 text-slate-600'

  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <Cloud className="h-5 w-5" aria-hidden />
          </span>
          <h3 className="text-sm font-semibold text-slate-900">Google Drive API</h3>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
          {loading ? '…' : badge}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {connected
          ? `Conectado a: ${status?.googleDriveEmail || 'cuenta de Google'}`
          : DISCONNECTED_DETAIL}
      </p>
      <div className="mt-4">
        {connected ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
            onClick={() => void handleDisconnect()}
            disabled={busy || loading}
          >
            <Link2Off className="h-4 w-4" aria-hidden />
            {busy ? 'Desconectando…' : 'Desconectar'}
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
            onClick={() => void handleConnect()}
            disabled={busy || loading}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Cloud className="h-4 w-4" aria-hidden />}
            Conectar Google Drive
          </button>
        )}
        {status?.oauthConfigured === false ? (
          <p className="mt-2 text-xs text-amber-800">
            El servidor aún no tiene GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET y
            GOOGLE_OAUTH_REDIRECT_URI.
          </p>
        ) : null}
        {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      </div>
    </article>
  )
}
