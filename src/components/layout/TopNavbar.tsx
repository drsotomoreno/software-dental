import { useState, useRef, useEffect } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Home } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { RipsStatusWidget } from '@/components/RipsStatusWidget'
import { APP_SHORT_NAME } from '@/constants/branding'
import {
  getHomeDisplayTitle,
  HOME_DISPLAY_TITLE_CHANGED_EVENT,
} from '@/services/homeDisplayTitleService'
import { ROLE_LABELS } from '@/utils/permissions'

const DASHBOARD_PATH = '/app'

export function TopNavbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountTitle, setAccountTitle] = useState('')
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

  useEffect(() => {
    const refresh = () => setAccountTitle(getHomeDisplayTitle(user?.id))
    refresh()
    window.addEventListener(HOME_DISPLAY_TITLE_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(HOME_DISPLAY_TITLE_CHANGED_EVENT, refresh)
  }, [user?.id])

  const brandLabel =
    accountTitle ||
    (user ? `Dr(a). ${user.firstName} ${user.lastName}`.trim() : '') ||
    APP_SHORT_NAME

  const displayName = user ? `Dr(a). ${user.firstName} ${user.lastName}` : 'Usuario'

  const handleLogout = async () => {
    setMenuOpen(false)
    await logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto max-w-[100rem] px-2 py-2 sm:px-3 sm:py-2.5">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <NavLink
              to={DASHBOARD_PATH}
              end
              className={({ isActive }) =>
                `top-nav-brand flex min-w-0 max-w-[14rem] shrink items-center rounded-md border px-2.5 py-1.5 transition sm:max-w-[18rem] sm:px-3 ${
                  isActive
                    ? 'border-blue-700 bg-blue-700 text-white'
                    : 'border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`
              }
              title={brandLabel}
            >
              <span className="truncate text-sm font-black tracking-tight sm:text-base">
                {brandLabel}
              </span>
            </NavLink>

            {!onDashboard && (
              <Link
                to={DASHBOARD_PATH}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-base font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Volver al panel principal"
              >
                <Home className="h-7 w-7 shrink-0" strokeWidth={2.25} aria-hidden />
                <span>Inicio</span>
              </Link>
            )}
          </div>

          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <RipsStatusWidget />

            <div className="relative shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:gap-2 sm:px-3 sm:py-2"
                aria-expanded={menuOpen}
                aria-haspopup="true"
                aria-label="Menú de cuenta"
              >
                <span className="max-w-[9rem] truncate sm:max-w-[12rem]">{displayName}</span>
                <svg
                  className={`h-4 w-4 shrink-0 transition ${menuOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
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
      </div>
    </header>
  )
}
