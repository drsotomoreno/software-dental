import { NavLink } from 'react-router-dom'
import {
  Activity,
  Building2,
  CreditCard,
  LayoutDashboard,
  Settings,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react'

type Item = {
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
}

const ITEMS: Item[] = [
  { label: 'Dashboard', to: '/superadmin', icon: LayoutDashboard, end: true },
  { label: 'Clínicas (Inquilinos)', to: '/superadmin/clinicas', icon: Building2 },
  { label: 'Suscripciones', to: '/superadmin/suscripciones', icon: CreditCard },
  { label: 'Monitoreo DIAN/RIPS', to: '/superadmin/monitoreo', icon: Activity },
  { label: 'Configuración del Sistema', to: '/superadmin/configuracion', icon: Settings },
]

export function SuperAdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-300">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500 text-white">
            <Stethoscope className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">mihistoriadental</p>
            <p className="text-xs text-slate-400">Panel de Control</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Secciones del panel">
        {ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-sky-500/15 text-sky-300'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 leading-snug">{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <NavLink
          to="/app"
          onClick={onNavigate}
          className="flex items-center rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
        >
          Volver al consultorio
        </NavLink>
      </div>
    </div>
  )
}
