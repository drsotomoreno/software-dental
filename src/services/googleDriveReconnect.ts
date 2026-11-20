import {
  driveClinicQuery,
  driveIdentityHeaders,
  resolveActiveDriveClinicId,
} from '@/services/googleDriveClinicContext'
import {
  GOOGLE_DRIVE_RECONNECT_REQUIRED,
  GOOGLE_DRIVE_RECONNECT_REQUIRED_MESSAGE,
  showGlobalToast,
} from '@/services/globalToast'

export { GOOGLE_DRIVE_RECONNECT_REQUIRED }

export function isGoogleDriveReconnectRequiredResponse(
  response: { status?: number } | null | undefined,
  payload: unknown,
): boolean {
  const body =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  if (body.code === GOOGLE_DRIVE_RECONNECT_REQUIRED) return true
  const status = Number(response?.status || 0)
  return status === 401 && body.code === GOOGLE_DRIVE_RECONNECT_REQUIRED
}

function currentReturnPath(): string {
  if (typeof window === 'undefined') return '/perfil'
  return `${window.location.pathname}${window.location.search}`
}

/** Inicia OAuth (offline + consent) y redirige a Google. */
export async function startGoogleDriveOAuthReconnect(
  returnPath = currentReturnPath(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const clinicId = resolveActiveDriveClinicId()
    const query = new URLSearchParams()
    if (clinicId) query.set('clinicId', clinicId)
    query.set('returnPath', returnPath || '/perfil')
    const response = await fetch(
      `/api/integrations/google-drive/auth-url?${query.toString()}`,
      { headers: driveIdentityHeaders(clinicId) },
    )
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.url) {
      return {
        ok: false,
        error: String(
          payload?.error ||
            'No se pudo iniciar la reconexión con Google Drive. Vaya a Perfil → Google Drive.',
        ),
      }
    }
    window.location.href = String(payload.url)
    return { ok: true }
  } catch {
    return {
      ok: false,
      error: 'No se pudo iniciar la reconexión con Google Drive.',
    }
  }
}

/** Toast con botón «Reconectar Google Drive». */
export function notifyGoogleDriveReconnectRequired(message?: string): void {
  showGlobalToast(message?.trim() || GOOGLE_DRIVE_RECONNECT_REQUIRED_MESSAGE, {
    variant: 'warning',
    durationMs: 16_000,
    actionLabel: 'Reconectar Google Drive',
    actionId: 'reconnect_google_drive',
  })
}

/** Alias usado si solo se conoce el clinicId (p. ej. tras 428). */
export function googleDriveStatusUrl(clinicId = resolveActiveDriveClinicId()): string {
  return `/api/integrations/google-drive/status${driveClinicQuery(clinicId)}`
}
