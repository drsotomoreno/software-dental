import { Fragment, useMemo } from 'react'
import { Link, useLocation, matchPath } from 'react-router-dom'
import { Home } from 'lucide-react'

const DASHBOARD_PATH = '/app'

type Crumb = {
  label: string
  to?: string
}

type RouteCrumbDef = {
  pattern: string
  crumbs: Crumb[]
}

/** Rutas internas bajo MainLayout → migas (Inicio se antepone siempre). */
const ROUTE_CRUMBS: RouteCrumbDef[] = [
  {
    pattern: '/pacientes/nuevo',
    crumbs: [
      { label: 'Pacientes', to: '/pacientes' },
      { label: 'Nuevo Paciente' },
    ],
  },
  {
    pattern: '/pacientes-valorados',
    crumbs: [{ label: 'Pacientes Valorados' }],
  },
  {
    pattern: '/pacientes-terminados',
    crumbs: [{ label: 'Pacientes Terminados' }],
  },
  {
    pattern: '/pacientes/:id',
    crumbs: [
      { label: 'Pacientes', to: '/pacientes' },
      { label: 'Historia Clínica' },
    ],
  },
  {
    pattern: '/pacientes',
    crumbs: [{ label: 'Pacientes Activos' }],
  },
  { pattern: '/agenda', crumbs: [{ label: 'Agenda' }] },
  { pattern: '/portabilidad', crumbs: [{ label: 'Historia Clínica' }] },
  { pattern: '/precios', crumbs: [{ label: 'Mis Precios y Procedimientos' }] },
  { pattern: '/cuentas-facturas', crumbs: [{ label: 'Mis Cuentas y Facturas' }] },
  { pattern: '/rips', crumbs: [{ label: 'RIPS' }] },
  { pattern: '/fhir', crumbs: [{ label: 'Exportar FHIR' }] },
  { pattern: '/catalogos', crumbs: [{ label: 'Catálogos' }] },
  { pattern: '/respaldos', crumbs: [{ label: 'Copias' }] },
  { pattern: '/auditoria', crumbs: [{ label: 'Auditoría' }] },
  { pattern: '/usuarios', crumbs: [{ label: 'Gestión de Usuarios' }] },
  {
    pattern: '/admin/usuarios-registrados',
    crumbs: [{ label: 'Gestión de Usuarios' }],
  },
  { pattern: '/admin/usuarios', crumbs: [{ label: 'Usuarios (suscripción)' }] },
  { pattern: '/perfil', crumbs: [{ label: 'Editar Perfil' }] },
  { pattern: '/suscripcion', crumbs: [{ label: 'Mi Suscripción' }] },
]

function resolveCrumbs(pathname: string): Crumb[] | null {
  if (pathname === DASHBOARD_PATH || pathname === '/') return null

  for (const def of ROUTE_CRUMBS) {
    if (matchPath({ path: def.pattern, end: true }, pathname)) {
      return def.crumbs
    }
  }

  // Fallback: último segmento capitalizado
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return null
  const last = parts[parts.length - 1] ?? ''
  const label = decodeURIComponent(last)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  return [{ label }]
}

export function AppBreadcrumbs() {
  const { pathname } = useLocation()
  const trail = useMemo(() => resolveCrumbs(pathname), [pathname])

  if (!trail) return null

  const crumbPillClass =
    'inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-blue-50 px-3 py-1 text-[1.125rem] font-medium leading-snug text-blue-700 transition-colors duration-200 ease-in-out hover:bg-blue-100 hover:text-blue-800'

  return (
    <nav aria-label="Migas de pan" className="mb-4 print:hidden">
      <ol className="flex flex-wrap items-center gap-2">
        <li className="inline-flex items-center">
          <Link to={DASHBOARD_PATH} className={crumbPillClass}>
            <Home className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
            <span>Inicio</span>
          </Link>
        </li>

        {trail.map((crumb) => (
          <Fragment key={`${crumb.label}-${crumb.to ?? 'current'}`}>
            <li aria-hidden className="select-none text-sm text-gray-300">
              /
            </li>
            <li className="inline-flex min-w-0 items-center">
              {crumb.to ? (
                <Link to={crumb.to} className={crumbPillClass}>
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className="truncate px-1 text-[1.125rem] font-semibold leading-snug text-slate-800"
                  aria-current="page"
                >
                  {crumb.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}
