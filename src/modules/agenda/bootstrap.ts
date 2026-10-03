/**
 * Arranque de la agenda: espejo localStorage (citas_dental) y globals de voz.
 * La fuente offline sigue siendo IndexedDB.
 */
import { forzarSincronizacionLocal, runClinicalSyncCycle } from '@/services/clinicalSyncService'
import { setupAgendaClipboardGlobals } from './storage/agendaClipboard'
import { setupAgendaAppGlobals, syncCitasToLocalStorage } from './storage/agendaStorage'

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
