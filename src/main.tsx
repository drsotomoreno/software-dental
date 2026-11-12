import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRouter } from './AppRouter'
import { redirectApexToCanonicalWww } from './utils/canonicalHost'
import './index.css'

// Apex → www antes de montar React (misma sesión / localStorage).
if (!redirectApexToCanonicalWww()) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppRouter />
    </StrictMode>,
  )
}
