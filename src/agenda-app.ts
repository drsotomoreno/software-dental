/**
 * Motor de citas (equivalente a app.js).
 * Gestión en localStorage (citas_dental) sincronizado con IndexedDB.
 */
import {
  setupAgendaAppGlobals,
  syncCitasToLocalStorage,
} from './utils/agendaStorage'
import { setupAgendaClipboardGlobals } from './utils/agendaClipboard'
import { forzarSincronizacionLocal, runClinicalSyncCycle } from './services/clinicalSyncService'

setupAgendaAppGlobals()
setupAgendaClipboardGlobals()

syncCitasToLocalStorage().catch(() => {
  // IndexedDB puede no estar listo al arranque; React sincronizará después.
})

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    void runClinicalSyncCycle()
  })

  const win = window as Window & {
    forzarSincronizacionLocal?: typeof forzarSincronizacionLocal
  }
  win.forzarSincronizacionLocal = forzarSincronizacionLocal
}
