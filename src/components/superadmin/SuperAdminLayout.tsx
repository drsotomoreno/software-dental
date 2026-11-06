import { Outlet, useLocation } from 'react-router-dom'
import { SuperAdminSidebar } from './SuperAdminSidebar'

const TITLES: Record<string, string> = {
  '/superadmin/clinicas': 'Clínicas (Tenants)',
  '/superadmin/suscripciones': 'Suscripciones',
  '/superadmin/monitoreo': 'Monitoreo DIAN/RIPS',
  '/superadmin/configuracion': 'Configuración',
}

export function SuperAdminLayout() {
  const location = useLocation()
  const title = TITLES[location.pathname]

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <aside className="h-full w-64 shrink-0">
        <SuperAdminSidebar />
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="min-h-full bg-slate-50 px-4 py-6 sm:px-6">
          {title ? <h1 className="mb-6 text-lg font-semibold text-slate-900">{title}</h1> : null}
          <Outlet />
        </div>
      </main>
    </div>
  )
}
