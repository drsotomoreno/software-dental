import { NavLink } from 'react-router-dom'
import {
  Activity,
  Building2,
  CreditCard,
  LayoutDashboard,
  Settings,
  Stethoscope,
  UserPlus,
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
  { label: 'Registros / Ventas', to: '/superadmin/registros', icon: UserPlus },
  { label: 'Clínicas (Tenants)', to: '/superadmin/clinicas', icon: Building2 },
  { label: 'Suscripciones', to: '/superadmin/suscripciones', icon: CreditCard },
  { label: 'Monitoreo DIAN/RIPS', to: '/superadmin/monitoreo', icon: Activity },
  { label: 'Configuración', to: '/superadmin/configuracion', icon: Settings },
]

export function SuperAdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-slate-900 text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white">
            <Stethoscope className="h-5 w-5" aria-hidden />
          </span>
          <p className="text-sm font-semibold leading-snug text-white">mihistoriadental Admin</p>
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
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white transition ${
                  isActive ? 'bg-white/10' : 'hover:bg-white/5'
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
          className="flex items-center rounded-xl px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white"
        >
          Volver al consultorio
        </NavLink>
      </div>
    </div>
  )
}
