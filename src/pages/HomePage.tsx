import { Link } from 'react-router-dom'
import {
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  FileJson,
  Share2,
  Stethoscope,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { APP_NAME } from '@/constants/branding'
import { CLINICAL_HISTORY_PAGE_TITLE_CLASS } from '@/constants/clinicalHistorySections'
import { EditableHomeTitle } from '@/components/home/EditableHomeTitle'
import { useAuth } from '@/contexts/AuthContext'
import { getBackupSettings } from '@/services/backupService'
import type { Permission } from '@/utils/permissions'

const HOME_LINKS: Array<{
  title: string
  desc: string
  to: string
  icon: LucideIcon
  accent: string
  permission: Permission
}> = [
  {
    title: 'Nuevo Paciente',
    desc: 'Registrar paciente con datos RIPS',
    to: '/pacientes/nuevo',
    icon: UserPlus,
    accent:
      'bg-gradient-to-br from-dental-400 to-dental-600 text-white shadow-lg shadow-dental-500/25 ring-4 ring-dental-100',
    permission: 'patients.write',
  },
  {
    title: 'Lista de Pacientes',
    desc: 'Consultar y gestionar pacientes',
    to: '/pacientes',
    icon: Users,
    accent:
      'bg-gradient-to-br from-sky-400 to-dental-600 text-white shadow-lg shadow-sky-500/20 ring-4 ring-sky-100',
    permission: 'patients.read',
  },
  {
    title: 'Agenda Clínica',
    desc: 'Citas por profesional y unidad',
    to: '/agenda',
    icon: CalendarDays,
    accent:
      'bg-gradient-to-br from-dental-600 to-dental-800 text-white shadow-lg shadow-dental-700/25 ring-4 ring-dental-100',
    permission: 'agenda.read',
  },
  {
    title: 'Exportar Historia Clínica',
    desc: 'RDA y portabilidad — JSON, FHIR, XML, PDF',
    to: '/portabilidad',
    icon: Share2,
    accent:
      'bg-gradient-to-br from-violet-400 to-violet-600 text-white shadow-lg shadow-violet-500/25 ring-4 ring-violet-100',
    permission: 'export.portability',
  },
  {
    title: 'Exportar FHIR',
    desc: 'Bundle FHIR R4 para interoperabilidad',
    to: '/fhir',
    icon: FileJson,
    accent:
      'bg-gradient-to-br from-indigo-400 to-indigo-600 text-white shadow-lg shadow-indigo-500/25 ring-4 ring-indigo-100',
    permission: 'export.fhir',
  },
  {
    title: 'Exportar RIPS',
    desc: 'Generar JSON RIPS para FEV-Salud',
    to: '/rips',
    icon: ClipboardList,
    accent:
      'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/25 ring-4 ring-emerald-100',
    permission: 'export.rips',
  },
  {
    title: 'Historia Clínica',
    desc: 'CIE-10, odontograma y firma Ley 527',
    to: '/pacientes',
    icon: Stethoscope,
    accent:
      'bg-gradient-to-br from-slate-500 to-slate-700 text-white shadow-lg shadow-slate-500/25 ring-4 ring-slate-200',
    permission: 'clinical.read',
  },
  {
    title: 'Mis Precios y Procedimientos',
    desc: 'Presupuestos y tarifas por procedimiento',
    to: '/precios',
    icon: CircleDollarSign,
    accent:
      'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-orange-500/25 ring-4 ring-orange-100',
    permission: 'prices.manage',
  },
]

export function HomePage() {
  const { can, user } = useAuth()
  const backupSettings = getBackupSettings()
  const visibleLinks = HOME_LINKS.filter((item) => can(item.permission))

  return (
    <div className="space-y-8">
      <div>
        <h1 className={CLINICAL_HISTORY_PAGE_TITLE_CLASS}>Bienvenido a {APP_NAME}</h1>
        <p className="mt-1 text-slate-600">
          Sistema de Historias Clínicas Odontológicas — Normatividad Colombiana
        </p>
        <EditableHomeTitle userId={user?.id} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visibleLinks.map((item) => {
          const Icon = item.icon

          return (
            <Link
              key={`${item.to}-${item.title}`}
              to={item.to}
              className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-dental-200 hover:shadow-md"
            >
              <div
                className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full transition group-hover:scale-105 ${item.accent}`}
              >
                <Icon className="h-6 w-6" strokeWidth={2.25} aria-hidden />
              </div>
              <h2 className="font-semibold text-slate-800 group-hover:text-dental-700">
                {item.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">{item.desc}</p>
            </Link>
          )
        })}
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold text-slate-800">Garantías operativas</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="font-medium text-green-800">Disponibilidad local</p>
            <p className="text-green-700">
              Historia clínica accesible sin conexión a internet (IndexedDB).
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-medium text-dental-700">Copias de seguridad</p>
            <p className="text-slate-600">
              {backupSettings.lastBackupAt
                ? `Último: ${new Date(backupSettings.lastBackupAt).toLocaleString('es-CO')}`
                : 'Sin copia exportada'}
            </p>
            {can('backups.manage') && (
              <Link to="/respaldos" className="mt-2 inline-block text-dental-600 hover:underline">
                Descargar o restaurar →
              </Link>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-medium text-dental-700">Integridad y trazabilidad</p>
            <p className="text-slate-600">
              Firmas SHA-256, registros bloqueados y bitácora de auditoría.
            </p>
            {can('audit.read') && (
              <Link to="/auditoria" className="mt-2 inline-block text-dental-600 hover:underline">
                Ver auditoría →
              </Link>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-medium text-dental-700">Códigos oficiales</p>
            <p className="text-slate-600">CUPS y CIE-10 versionados, actualizables para RIPS y facturación.</p>
            {can('catalogs.manage') && (
              <Link to="/catalogos" className="mt-2 inline-block text-dental-600 hover:underline">
                Gestionar catálogos →
              </Link>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-medium text-dental-700">Exportación</p>
            <p className="text-slate-600">
              RDA en JSON, FHIR R4, XML e informe imprimible — derecho del paciente.
            </p>
            {can('export.portability') && (
              <Link to="/portabilidad" className="mt-2 inline-block text-dental-600 hover:underline">
                Exportar historia clínica →
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold text-slate-800">Cumplimiento normativo</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-medium text-dental-700">RIPS</p>
            <p className="text-slate-600">Registro Individual de Prestación de Servicios</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-medium text-dental-700">Ley 527</p>
            <p className="text-slate-600">Firma digital e inmutabilidad de registros</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-medium text-dental-700">FHIR R4</p>
            <p className="text-slate-600">Interoperabilidad de datos clínicos</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-medium text-dental-700">Facturación</p>
            <p className="text-slate-600">Presupuestos y codificación CUPS</p>
          </div>
        </div>
      </div>
    </div>
  )
}
