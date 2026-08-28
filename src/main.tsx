import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRouter } from './App'
import { seedDemoData } from '@/db/database'
import { hydrateBillingSettingsFromIndexedDb } from '@/services/billingModalityService'
import { installInvoiceImmutabilityFetchGuard } from '@/bootstrap/invoiceImmutabilityGuard'
import './dictation-app'
import './agenda-app'
import './index.css'

installInvoiceImmutabilityFetchGuard()

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppRouter />
    </StrictMode>,
  )
}

renderApp()

seedDemoData()
  .then(() => hydrateBillingSettingsFromIndexedDb())
  .catch((error) => {
    console.error('No se pudo inicializar datos demo:', error)
  })
