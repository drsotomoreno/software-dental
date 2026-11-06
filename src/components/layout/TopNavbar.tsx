import { useState, useRef, useEffect } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Home } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { RipsStatusWidget } from '@/components/RipsStatusWidget'
import { KioskLanLinkButton } from '@/components/kiosk/KioskLanLinkButton'
import { ROLE_LABELS } from '@/utils/permissions'

const DASHBOARD_PATH = '/app'

function accountInitials(firstName?: string, lastName?: string): string {
  const first = firstName?.trim().charAt(0) ?? ''
  const last = lastName?.trim().charAt(0) ?? ''
  return `${first}${last}`.toUpperCase() || 'U'
}

export function TopNavbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const onDashboard = location.pathname === DASHBOARD_PATH

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const displayName = user ? `Dr(a). ${user.firstName} ${user.lastName}` : 'Usuario'
  const initials = accountInitials(user?.firstName, user?.lastName)

  const handleLogout = async () => {
    setMenuOpen(false)
    await logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-50 bg-white">
      <div className="flex w-full items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <Link to={DASHBOARD_PATH} className="inline-flex items-baseline leading-none">
            <span className="text-xl font-bold text-slate-800">mihistoriadental</span>
            <span className="text-xl font-semibold text-blue-600">.com</span>
          </Link>

          {!onDashboard && (
            <Link
              to={DASHBOARD_PATH}
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Volver al panel principal"
            >
              <Home className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
              Inicio
            </Link>
          )}
        </div>

        <div className="flex items-center gap-4">
          <KioskLanLinkButton />
          <RipsStatusWidget />

          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-slate-200 px-3 hover:bg-slate-50"
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-label="Menú de cuenta"
            >
              <span className="max-w-[12rem] truncate text-sm font-medium text-slate-700">
                {displayName}
              </span>
              <svg
                className={`h-4 w-4 shrink-0 text-slate-500 transition ${menuOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700">
                {initials}
              </span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {user && (
                  <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
                    <p className="font-medium text-slate-700">
                      {user.email ||
                        [user.documentType, user.documentNumber].filter(Boolean).join(' ') ||
                        `${user.firstName} ${user.lastName}`.trim()}
                    </p>
                    <p>{ROLE_LABELS[user.role]}</p>
                  </div>
                )}

                <NavLink
                  to="/perfil"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Editar Perfil
                </NavLink>

                <NavLink
                  to="/suscripcion"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Mi Suscripción
                </NavLink>

                <hr className="my-1 border-slate-200" />

                <button
                  type="button"
                  onClick={handleLogout}
                  className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  Cerrar Sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
