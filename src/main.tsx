import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRouter } from './AppRouter'
import { redirectApexToCanonicalWww } from './utils/canonicalHost'
import {
  ensureAppBuildVersion,
  installChunkLoadRecovery,
} from './bootstrap/clientRecovery'
import './index.css'

installChunkLoadRecovery()

async function boot(): Promise<void> {
  // Apex → www antes de montar React (misma sesión / localStorage).
  if (redirectApexToCanonicalWww()) return

  // Deploy nuevo: limpia SW/caché/Dexie (conserva token) y recarga 1 vez.
  const reloading = await ensureAppBuildVersion()
  if (reloading) return

  const rootEl = document.getElementById('root')
  if (!rootEl) {
    console.error('[boot] #root no existe en el DOM')
    return
  }

  createRoot(rootEl).render(
    <StrictMode>
      <AppRouter />
    </StrictMode>,
  )
}

void boot().catch((error) => {
  console.error('[boot] Fallo crítico al arrancar:', error)
  // Último recurso: mostrar mensaje nativo si React no llegó a montar.
  const rootEl = document.getElementById('root')
  if (rootEl && !rootEl.hasChildNodes()) {
    rootEl.innerHTML =
      '<div style="font-family:system-ui;padding:2rem;text-align:center">' +
      '<p style="color:#1d4ed8;font-weight:600;font-size:1.25rem">mihistoriadental</p>' +
      '<p style="margin-top:1rem;color:#334155">No se pudo iniciar la aplicación en este equipo.</p>' +
      '<button onclick="location.reload()" style="margin-top:1.5rem;padding:0.6rem 1.2rem;background:#1d4ed8;color:#fff;border:0;border-radius:0.5rem;cursor:pointer">Reintentar</button>' +
      '</div>'
  }
})
