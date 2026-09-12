import { Link } from 'react-router-dom'
import { APP_NAME } from '@/constants/branding'
import { CLINICAL_HISTORY_PAGE_TITLE_CLASS } from '@/constants/clinicalHistorySections'
import { EditableHomeTitle } from '@/components/home/EditableHomeTitle'
import { useAuth } from '@/contexts/AuthContext'
import { getBackupSettings } from '@/services/backupService'
import { resolveHomeModules } from '@/services/uiConfigService'

export function HomePage() {
  const { can, user } = useAuth()
  const backupSettings = getBackupSettings()
  const visibleLinks = resolveHomeModules().filter((item) => can(item.permission))

  return (
    <div className="space-y-8">
      <div>
        <h1 className={CLINICAL_HISTORY_PAGE_TITLE_CLASS}>Bienvenido a {APP_NAME}</h1>
        <p className="mt-1 text-slate-600">
          Sistema de Historias Clínicas Odontológicas — Normatividad Colombiana
        </p>
        <EditableHomeTitle userId={user?.id} />
      </div>

      <div className="home-module-grid">
        {visibleLinks.map((item) => {
          const Icon = item.icon

          return (
            <Link
              key={item.id}
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
