/** Toast global vía CustomEvent — usable desde stores sin React. */

export const GLOBAL_TOAST_EVENT = 'mihistoriadental-toast'

export type GlobalToastVariant = 'success' | 'warning' | 'error'

export type GlobalToastActionId = 'reconnect_google_drive'

export type GlobalToastDetail = {
  message: string
  variant?: GlobalToastVariant
  durationMs?: number
  actionLabel?: string
  actionId?: GlobalToastActionId
}

export const GOOGLE_DRIVE_REQUIRED_MESSAGE =
  'Para subir o ver radiografías, el administrador de la clínica debe conectar Google Drive en la Configuración.'

export const GOOGLE_DRIVE_RECONNECT_REQUIRED = 'GOOGLE_DRIVE_RECONNECT_REQUIRED'

export const GOOGLE_DRIVE_RECONNECT_REQUIRED_MESSAGE =
  'Google Drive se desconectó o el permiso expiró. Reconecte la cuenta para subir o ver archivos.'

export function showGlobalToast(
  message: string,
  options: Omit<GlobalToastDetail, 'message'> = {},
): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<GlobalToastDetail>(GLOBAL_TOAST_EVENT, {
      detail: {
        message: String(message || '').trim(),
        variant: options.variant ?? 'success',
        durationMs: options.durationMs,
        actionLabel: options.actionLabel,
        actionId: options.actionId,
      },
    }),
  )
}

export function notifyGoogleDriveRequired(): void {
  showGlobalToast(GOOGLE_DRIVE_REQUIRED_MESSAGE, {
    variant: 'warning',
    durationMs: 9000,
    actionLabel: 'Reconectar Google Drive',
    actionId: 'reconnect_google_drive',
  })
}

export function isGoogleDriveRequiredResponse(
  response: { status?: number } | null | undefined,
  payload: unknown,
): boolean {
  const status = Number(response?.status || 0)
  const body =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  return (
    status === 428 ||
    body.code === 'google_drive_required' ||
    body.requiresGoogleDrive === true
  )
}
