import { useState, useRef, useEffect } from 'react'

import { NavLink, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'

import { APP_INITIALS, APP_SHORT_NAME } from '@/constants/branding'

import { ROLE_LABELS, type Permission } from '@/utils/permissions'

function navPillClassName(isActive: boolean): string {
  return `nav-pill-top ${isActive ? 'nav-pill-active' : 'nav-pill-inactive'}`
}

function isPatientsListActive(pathname: string): boolean {
  return (
    pathname === '/pacientes' ||
    (pathname.startsWith('/pacientes/') && !pathname.startsWith('/pacientes/nuevo'))
  )
}

function isValuatedPatientsActive(pathname: string): boolean {
  return pathname === '/pacientes-valorados'
}

function isCompletedPatientsActive(pathname: string): boolean {
  return pathname === '/pacientes-terminados'
}

type NavRow = 1 | 2

interface TopNavItem {
  label: string
  to: string
  permission: Permission
  row: NavRow
  isActive?: (pathname: string) => boolean
}

const TOP_NAV_ITEMS: TopNavItem[] = [
  {
    label: 'Nuevo Paciente',
    to: '/pacientes/nuevo',
    permission: 'patients.write',
    row: 1,
  },
  {
    label: 'Pacientes Activos',
    to: '/pacientes',
    permission: 'patients.read',
    row: 1,
    isActive: isPatientsListActive,
  },
  {
    label: 'Pacientes Valorados',
    to: '/pacientes-valorados',
    permission: 'patients.read',
    row: 1,
    isActive: isValuatedPatientsActive,
  },
  {
    label: 'Pacientes Terminados',
    to: '/pacientes-terminados',
    permission: 'patients.read',
    row: 1,
    isActive: isCompletedPatientsActive,
  },
  {
    label: 'Agenda',
    to: '/agenda',
    permission: 'agenda.read',
    row: 1,
  },
  {
    label: 'Historia Clínica',
    to: '/portabilidad',
    permission: 'export.portability',
    row: 1,
  },
  {
    label: 'Mis Precios y Procedimientos',
    to: '/precios',
    permission: 'prices.manage',
    row: 1,
  },
  {
    label: 'Mis Cuentas y Facturas',
    to: '/cuentas-facturas',
    permission: 'invoices.read',
    row: 2,
  },
  {
    label: 'RIPS',
    to: '/rips',
    permission: 'export.rips',
    row: 2,
  },
  {
    label: 'FHIR',
    to: '/fhir',
    permission: 'export.fhir',
    row: 2,
  },
  {
    label: 'Catálogos',
    to: '/catalogos',
    permission: 'catalogs.manage',
    row: 2,
  },
  {
    label: 'Copias',
    to: '/respaldos',
    permission: 'backups.manage',
    row: 2,
  },
  {
    label: 'Usuarios',
    to: '/usuarios',
    permission: 'users.manage',
    row: 2,
  },
  {
    label: 'Auditoría',
    to: '/auditoria',
    permission: 'audit.read',
    row: 2,
  },
]

function TopNavPill({
  item,
  pathname,
}: {
  item: TopNavItem
  pathname: string
}) {
  const active = item.isActive ? item.isActive(pathname) : pathname === item.to

  return (
    <NavLink to={item.to} className={navPillClassName(active)}>
      {item.label}
    </NavLink>
  )
}

export function TopNavbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  const menuRef = useRef<HTMLDivElement>(null)

  const navigate = useNavigate()

  const { user, logout, can } = useAuth()

  const location = useLocation()

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

  const handleLogout = async () => {
    setMenuOpen(false)

    await logout()

    navigate('/login')
  }

  const visibleItems = TOP_NAV_ITEMS.filter((item) => can(item.permission))
  const primaryRow = visibleItems.filter((item) => item.row === 1)
  const secondaryRow = visibleItems.filter((item) => item.row === 2)

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto max-w-[100rem] px-2 py-2 sm:px-3 sm:py-2.5">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
            <NavLink
              to="/app"
              end
              className={({ isActive }) =>
                `top-nav-brand flex shrink-0 items-center gap-2 rounded-full border px-2 py-1.5 pr-3 transition sm:pr-3.5 ${
                  isActive
                    ? 'border-dental-600 bg-dental-600 text-white'
                    : 'border-orange-200 bg-orange-50 text-orange-900 hover:bg-orange-100'
                }`
              }
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold sm:h-9 sm:w-9">
                {APP_INITIALS}
              </div>

              <span className="hidden text-sm font-semibold leading-tight lg:inline">
                {APP_SHORT_NAME}
              </span>
            </NavLink>

            <nav className="top-nav-menu min-w-0 flex-1 space-y-1.5 sm:space-y-2" aria-label="Menú principal">
              {primaryRow.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  {primaryRow.map((item) => (
                    <TopNavPill key={item.to} item={item} pathname={location.pathname} />
                  ))}
                </div>
              )}

              {secondaryRow.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  {secondaryRow.map((item) => (
                    <TopNavPill key={item.to} item={item} pathname={location.pathname} />
                  ))}
                </div>
              )}
            </nav>
          </div>

          <div className="relative shrink-0 self-start pl-1" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:gap-2 sm:px-3 sm:py-2"
              aria-expanded={menuOpen}
              aria-haspopup="true"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-900">
                {user?.firstName?.[0] ?? 'U'}
              </span>

              <span className="hidden lg:inline">{displayName}</span>

              <svg
                className={`h-4 w-4 transition ${menuOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {user && (
                  <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
                    <p className="font-medium text-slate-700">{user.email}</p>
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

                {can('prices.manage') && (
                  <NavLink
                    to="/precios"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Mis precios
                  </NavLink>
                )}

                <NavLink
                  to="/suscripcion"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Mi Suscripción
                </NavLink>

                {can('users.manage') && (
                  <NavLink
                    to="/usuarios"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Gestión de Usuarios
                  </NavLink>
                )}

                {can('audit.read') && (
                  <NavLink
                    to="/auditoria"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Bitácora de auditoría
                  </NavLink>
                )}

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
