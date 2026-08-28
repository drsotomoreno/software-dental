import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_DURATION_MS = 4500

export function useToast(durationMs = DEFAULT_DURATION_MS) {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  const clearToast = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setMessage(null)
  }, [])

  const showToast = useCallback(
    (nextMessage: string) => {
      clearToast()
      setMessage(nextMessage)
      timerRef.current = window.setTimeout(() => {
        setMessage(null)
        timerRef.current = null
      }, durationMs)
    },
    [clearToast, durationMs],
  )

  useEffect(() => clearToast, [clearToast])

  return { toastMessage: message, showToast, clearToast }
}
