import { Link, Outlet, useLocation } from 'react-router-dom'
import { Home } from 'lucide-react'
import { SuperAdminSidebar } from './SuperAdminSidebar'

const TITLES: Record<string, string> = {
  '/superadmin/registros': 'Registros / Ventas',
  '/superadmin/clinicas': 'Suscripciones',
  '/superadmin/suscripciones': 'Ingresos',
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
          <div className="mb-6 flex items-center justify-between gap-3">
            {title ? <h1 className="text-lg font-semibold text-slate-900">{title}</h1> : <span />}
            <Link
              to="/app"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
            >
              <Home className="h-4 w-4" aria-hidden />
              Inicio
            </Link>
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
