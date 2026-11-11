import { useEffect, useState } from 'react'
import { Toast } from '@/components/ui/Toast'
import {
  GLOBAL_TOAST_EVENT,
  type GlobalToastDetail,
  type GlobalToastVariant,
} from '@/services/globalToast'

const DEFAULT_MS = 4500

export function GlobalToastHost() {
  const [message, setMessage] = useState<string | null>(null)
  const [variant, setVariant] = useState<GlobalToastVariant>('success')

  useEffect(() => {
    let timer: number | null = null

    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<GlobalToastDetail>).detail
      const next = String(detail?.message || '').trim()
      if (!next) return
      if (timer != null) window.clearTimeout(timer)
      setMessage(next)
      setVariant(detail?.variant ?? 'success')
      const duration = Number(detail?.durationMs) > 0 ? Number(detail.durationMs) : DEFAULT_MS
      timer = window.setTimeout(() => {
        setMessage(null)
        timer = null
      }, duration)
    }

    window.addEventListener(GLOBAL_TOAST_EVENT, onToast)
    return () => {
      window.removeEventListener(GLOBAL_TOAST_EVENT, onToast)
      if (timer != null) window.clearTimeout(timer)
    }
  }, [])

  return (
    <Toast
      message={message}
      variant={variant}
      onDismiss={() => setMessage(null)}
    />
  )
}
