import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { SuperAdminSidebar } from './SuperAdminSidebar'

const TITLES: Record<string, string> = {
  '/superadmin': 'Dashboard',
  '/superadmin/clinicas': 'Clínicas (Inquilinos)',
  '/superadmin/suscripciones': 'Suscripciones',
  '/superadmin/monitoreo': 'Monitoreo DIAN/RIPS',
  '/superadmin/configuracion': 'Configuración del Sistema',
}

export function SuperAdminLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const title = TITLES[location.pathname] ?? 'Panel de Control'

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  const displayName = user ? `${user.firstName} ${user.lastName}`.trim() : 'Superadministrador'

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside className="hidden w-72 shrink-0 md:block">
        <div className="sticky top-0 h-screen">
          <SuperAdminSidebar />
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
          />
          <div className="relative h-full w-72 shadow-xl">
            <SuperAdminSidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 md:hidden"
              aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                Panel de Control mihistoriadental
              </p>
              <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
            </div>
          </div>
          <p className="hidden text-sm text-slate-500 sm:block">{displayName}</p>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
