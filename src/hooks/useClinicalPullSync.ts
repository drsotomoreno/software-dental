import { useEffect } from 'react'
import {
  CLINICAL_SYNC_POLL_MS,
  runClinicalSyncCycle,
} from '@/services/clinicalSyncService'

/**
 * Pull silencioso al recuperar el foco, al volver online y cada 10s.
 * Solo corre con sesión autenticada.
 */
export function useClinicalPullSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    void runClinicalSyncCycle()

    const onFocus = () => {
      void runClinicalSyncCycle()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void runClinicalSyncCycle()
    }
    const onOnline = () => {
      void runClinicalSyncCycle()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    const interval = window.setInterval(() => {
      void runClinicalSyncCycle()
    }, CLINICAL_SYNC_POLL_MS)

    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      window.clearInterval(interval)
    }
  }, [enabled])
}
