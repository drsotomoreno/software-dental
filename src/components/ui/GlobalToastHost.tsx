import { useEffect, useState } from 'react'
import { Toast } from '@/components/ui/Toast'
import {
  GLOBAL_TOAST_EVENT,
  type GlobalToastActionId,
  type GlobalToastDetail,
  type GlobalToastVariant,
  showGlobalToast,
} from '@/services/globalToast'
import { startGoogleDriveOAuthReconnect } from '@/services/googleDriveReconnect'

const DEFAULT_MS = 4500

export function GlobalToastHost() {
  const [message, setMessage] = useState<string | null>(null)
  const [variant, setVariant] = useState<GlobalToastVariant>('success')
  const [actionLabel, setActionLabel] = useState<string | null>(null)
  const [actionId, setActionId] = useState<GlobalToastActionId | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  useEffect(() => {
    let timer: number | null = null

    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<GlobalToastDetail>).detail
      const next = String(detail?.message || '').trim()
      if (!next) return
      if (timer != null) window.clearTimeout(timer)
      setMessage(next)
      setVariant(detail?.variant ?? 'success')
      setActionLabel(detail?.actionLabel ? String(detail.actionLabel) : null)
      setActionId(detail?.actionId ?? null)
      setActionBusy(false)
      const duration = Number(detail?.durationMs) > 0 ? Number(detail.durationMs) : DEFAULT_MS
      timer = window.setTimeout(() => {
        setMessage(null)
        setActionLabel(null)
        setActionId(null)
        timer = null
      }, duration)
    }

    window.addEventListener(GLOBAL_TOAST_EVENT, onToast)
    return () => {
      window.removeEventListener(GLOBAL_TOAST_EVENT, onToast)
      if (timer != null) window.clearTimeout(timer)
    }
  }, [])

  const handleAction = async () => {
    if (actionId !== 'reconnect_google_drive' || actionBusy) return
    setActionBusy(true)
    const result = await startGoogleDriveOAuthReconnect()
    if (!result.ok) {
      setActionBusy(false)
      showGlobalToast(result.error, { variant: 'error', durationMs: 8000 })
    }
  }

  return (
    <Toast
      message={message}
      variant={variant}
      actionLabel={actionLabel}
      actionBusy={actionBusy}
      onAction={actionLabel && actionId ? () => void handleAction() : undefined}
      onDismiss={() => {
        setMessage(null)
        setActionLabel(null)
        setActionId(null)
      }}
    />
  )
}
