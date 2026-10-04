import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRouter } from './App'
import { seedDemoData } from '@/db/database'
import { hydrateBillingSettingsFromIndexedDb } from '@/services/billingModalityService'
import { installInvoiceImmutabilityFetchGuard } from '@/bootstrap/invoiceImmutabilityGuard'
import { applyVisualTheme, loadUiConfig } from '@/services/uiConfigService'
import './dictation-app'
import './agenda-app'
import './index.css'

installInvoiceImmutabilityFetchGuard()
applyVisualTheme()

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppRouter />
    </StrictMode>,
  )
}

void loadUiConfig()
  .catch((error) => {
    console.warn('No se pudo aplicar la configuración visual:', error)
  })
  .finally(() => {
    renderApp()
  })

seedDemoData()
  .then(() => hydrateBillingSettingsFromIndexedDb())
  .catch((error) => {
    console.error('No se pudo inicializar datos demo:', error)
  })
