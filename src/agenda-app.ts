/**
 * Motor de citas (equivalente a app.js).
 * Gestión en localStorage (citas_dental) sincronizado con IndexedDB.
 */
import {
  setupAgendaAppGlobals,
  syncCitasToLocalStorage,
} from './utils/agendaStorage'
import { setupAgendaClipboardGlobals } from './utils/agendaClipboard'

setupAgendaAppGlobals()
setupAgendaClipboardGlobals()

syncCitasToLocalStorage().catch(() => {
  // IndexedDB puede no estar listo al arranque; React sincronizará después.
})
