import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

const ClinicalApp = lazy(() => import('./ClinicalApp'))
const KioskLayout = lazy(() => import('./kiosk/KioskLayout'))
const KioskApp = lazy(() => import('./kiosk/KioskApp'))

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
      Cargando…
    </div>
  )
}

/**
 * Director de tráfico: el kiosco carga en un chunk aislado.
 * ClinicalApp (Dexie, Auth, sync) solo se descarga en rutas no-kiosco.
 * La tableta esclava (KioskApp) espera eventos Socket.IO del PC clínico.
 */
export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/kiosco/:clinicId/:token" element={<KioskLayout />}>
            <Route index element={<KioskApp />} />
          </Route>
          <Route path="/*" element={<ClinicalApp />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
