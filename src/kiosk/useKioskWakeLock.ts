/**
 * Mantener la pantalla encendida en la tableta kiosco (Wake Lock API).
 * Sin Dexie ni Auth.
 */
import { useEffect, useRef } from 'react'

type WakeLockSentinelLike = {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

/**
 * Solicita `navigator.wakeLock.request('screen')` al montar y lo
 * re-adquiere cuando la pestaña vuelve a ser visible.
 */
export function useKioskWakeLock(enabled = true) {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined') return

    const nav = navigator as WakeLockNavigator
    if (!nav.wakeLock?.request) return

    let cancelled = false

    const requestLock = async () => {
      if (cancelled || document.visibilityState !== 'visible') return
      try {
        if (sentinelRef.current && !sentinelRef.current.released) return
        const sentinel = await nav.wakeLock!.request('screen')
        if (cancelled) {
          void sentinel.release()
          return
        }
        sentinelRef.current = sentinel
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null
        })
      } catch {
        /* Wake Lock no disponible o denegado (política del navegador). */
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void requestLock()
      }
    }

    void requestLock()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      const current = sentinelRef.current
      sentinelRef.current = null
      if (current && !current.released) {
        void current.release()
      }
    }
  }, [enabled])
}
