import { Link } from 'react-router-dom'
import {
  Archive,
  BookOpen,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  FileText,
  HardDrive,
  Receipt,
  ShieldCheck,
  Stethoscope,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { APP_NAME } from '@/constants/branding'
import { CLINICAL_HISTORY_PAGE_TITLE_CLASS } from '@/constants/clinicalHistorySections'
import { EditableHomeTitle } from '@/components/home/EditableHomeTitle'
import { useAuth } from '@/contexts/AuthContext'
import type { Permission } from '@/utils/permissions'

type DashAction = {
  label: string
  to: string
  permission?: Permission
  /** Superadmin only (God Mode) */
  superAdminOnly?: boolean
  icon: LucideIcon
  primary?: boolean
}

type DashCard = {
  title: string
  description: string
  actions: DashAction[]
}

const DASHBOARD_CARDS: DashCard[] = [
  {
    title: 'Pacientes',
    description: 'Registro y seguimiento del flujo clínico',
    actions: [
      {
        label: 'Nuevo Paciente',
        to: '/pacientes/nuevo',
        permission: 'patients.write',
        icon: UserPlus,
        primary: true,
      },
      {
        label: 'Pacientes Activos',
        to: '/pacientes',
        permission: 'patients.read',
        icon: Users,
      },
      {
        label: 'Pacientes Valorados',
        to: '/pacientes-valorados',
        permission: 'patients.read',
        icon: ClipboardList,
      },
      {
        label: 'Pacientes Terminados',
        to: '/pacientes-terminados',
        permission: 'patients.read',
        icon: Archive,
      },
    ],
  },
  {
    title: 'Gestión Clínica',
    description: 'Agenda y acceso a la historia clínica',
    actions: [
      {
        label: 'Agenda',
        to: '/agenda',
        permission: 'agenda.read',
        icon: CalendarDays,
      },
      {
        label: 'Historia Clínica',
        to: '/portabilidad',
        permission: 'export.portability',
        icon: Stethoscope,
      },
    ],
  },
  {
    title: 'Facturación y RIPS',
    description: 'Tarifas, cuentas y reporte normativo',
    actions: [
      {
        label: 'Mis Precios y Procedimientos',
        to: '/precios',
        permission: 'prices.manage',
        icon: CircleDollarSign,
      },
      {
        label: 'Mis Cuentas y Facturas',
        to: '/cuentas-facturas',
        permission: 'invoices.read',
        icon: Receipt,
      },
      {
        label: 'RIPS',
        to: '/rips',
        permission: 'export.rips',
        icon: FileText,
      },
    ],
  },
  {
    title: 'Administración',
    description: 'Usuarios, catálogos, respaldos y auditoría',
    actions: [
      {
        label: 'Gestión de Usuarios',
        to: '/admin/usuarios-registrados',
        superAdminOnly: true,
        icon: Users,
      },
      {
        label: 'Gestión de Usuarios',
        to: '/usuarios',
        permission: 'users.manage',
        icon: Users,
      },
      {
        label: 'Catálogos',
        to: '/catalogos',
        permission: 'catalogs.manage',
        icon: BookOpen,
      },
      {
        label: 'Copias',
        to: '/respaldos',
        permission: 'backups.manage',
        icon: HardDrive,
      },
      {
        label: 'Auditoría',
        to: '/auditoria',
        permission: 'audit.read',
        icon: ShieldCheck,
      },
    ],
  },
]

function actionVisible(
  action: DashAction,
  can: (p: Permission) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (action.superAdminOnly) return isSuperAdmin
  if (!action.permission) return true
  // Evita duplicar «Gestión de Usuarios» cuando el superadmin ya tiene el acceso global
  if (action.permission === 'users.manage' && isSuperAdmin) return false
  return can(action.permission)
}

function DashActionButton({ action }: { action: DashAction }) {
  const Icon = action.icon

  if (action.primary) {
    return (
      <Link
        to={action.to}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-dental-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-dental-600/25 transition hover:bg-dental-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-dental-500 focus-visible:ring-offset-2"
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
        {action.label}
      </Link>
    )
  }

  return (
    <Link
      to={action.to}
      className="inline-flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-sm font-medium text-slate-800 transition hover:border-dental-200 hover:bg-white hover:text-dental-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-dental-500 focus-visible:ring-offset-2"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-dental-700 shadow-sm ring-1 ring-slate-200/80">
        <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </span>
      <span className="min-w-0 leading-snug">{action.label}</span>
    </Link>
  )
}

export function HomePage() {
  const { can, user, hasRole } = useAuth()
  const isSuperAdmin = hasRole('superadmin')

  const visibleCards = DASHBOARD_CARDS.map((card) => ({
    ...card,
    actions: card.actions.filter((action) => actionVisible(action, can, isSuperAdmin)),
  })).filter((card) => card.actions.length > 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className={CLINICAL_HISTORY_PAGE_TITLE_CLASS}>Bienvenido a {APP_NAME}</h1>
        <p className="mt-1 text-slate-600">
          Acceso directo a todas las funciones — un clic, sin menús ocultos
        </p>
        <EditableHomeTitle userId={user?.id} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visibleCards.map((card) => (
          <section
            key={card.title}
            className="flex flex-col rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm"
            aria-labelledby={`dash-card-${card.title}`}
          >
            <header className="mb-4 border-b border-slate-100 pb-3">
              <h2
                id={`dash-card-${card.title}`}
                className="text-base font-semibold tracking-tight text-slate-900"
              >
                {card.title}
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{card.description}</p>
            </header>

            <div className="flex flex-1 flex-col gap-2">
              {card.actions.map((action) => (
                <DashActionButton key={`${action.to}-${action.label}`} action={action} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
