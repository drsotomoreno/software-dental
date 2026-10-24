import { useEffect, useSyncExternalStore } from 'react'
import { getRipsSyncSnapshot, processDailyRipsBatch, subscribeRipsSync } from '@/services/ripsSyncEngine'

const IDLE_MS = 3 * 60 * 1000

let lastActivity = Date.now()
let users = 0
let stopTriggers: (() => void) | null = null

function bindTriggers(): () => void {
  const onActivity = () => {
    lastActivity = Date.now()
  }
  const onOnline = () => {
    void processDailyRipsBatch({ reason: 'online' })
  }
  const tick = () => {
    const idle = document.hidden || Date.now() - lastActivity >= IDLE_MS
    if (idle) void processDailyRipsBatch({ reason: 'idle' })
  }

  window.addEventListener('pointerdown', onActivity, { passive: true })
  window.addEventListener('keydown', onActivity)
  window.addEventListener('online', onOnline)

  let worker: Worker | null = null
  let timer = 0
  try {
    worker = new Worker(new URL('../workers/ripsDailySync.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = tick
  } catch (error) {
    console.warn('[rips-sync] el worker no arrancó; se usa un intervalo', error)
    timer = window.setInterval(tick, 60_000)
  }

  return () => {
    window.removeEventListener('pointerdown', onActivity)
    window.removeEventListener('keydown', onActivity)
    window.removeEventListener('online', onOnline)
    worker?.terminate()
    if (timer) window.clearInterval(timer)
  }
}

/** Arranca una sola vez los disparos online e inactividad, aunque el panel se monte dos veces. */
export function useRipsDailySync() {
  const snapshot = useSyncExternalStore(subscribeRipsSync, getRipsSyncSnapshot, getRipsSyncSnapshot)

  useEffect(() => {
    users += 1
    if (!stopTriggers) stopTriggers = bindTriggers()
    return () => {
      users -= 1
      if (users === 0 && stopTriggers) {
        stopTriggers()
        stopTriggers = null
      }
    }
  }, [])

  return snapshot
}
