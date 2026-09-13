import { useCallback, useEffect, useRef, useState } from 'react'
import type { ToastVariant } from '@/components/ui/Toast'

const DEFAULT_DURATION_MS = 4500

export function useToast(durationMs = DEFAULT_DURATION_MS) {
  const [message, setMessage] = useState<string | null>(null)
  const [variant, setVariant] = useState<ToastVariant>('success')
  const timerRef = useRef<number | null>(null)

  const clearToast = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setMessage(null)
    setVariant('success')
  }, [])

  const showToast = useCallback(
    (nextMessage: string, nextVariant: ToastVariant = 'success') => {
      clearToast()
      setVariant(nextVariant)
      setMessage(nextMessage)
      timerRef.current = window.setTimeout(() => {
        setMessage(null)
        setVariant('success')
        timerRef.current = null
      }, durationMs)
    },
    [clearToast, durationMs],
  )

  useEffect(() => clearToast, [clearToast])

  return { toastMessage: message, toastVariant: variant, showToast, clearToast }
}
