import { useSuperadminResource } from '@/hooks/useSuperadminResource'
import { fetchSystemSettings } from '@/services/superadminApi'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value}</dd>
    </div>
  )
}

export function SuperAdminSettingsPage() {
  const { data, error, loading } = useSuperadminResource(fetchSystemSettings)

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-slate-600">
        Lectura del entorno de la plataforma. Los secretos no se muestran. En EC2 los cambios se
        hacen con variables de entorno y un reinicio del proceso.
      </p>
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}
      {loading && !data ? (
        <p className="text-sm text-slate-500">Cargando configuración...</p>
      ) : data ? (
        <dl className="rounded-2xl border border-slate-200 bg-white px-5 shadow-sm">
          <Row label="Entorno" value={data.environment} />
          <Row label="URL pública" value={data.publicUrl} />
          <Row label="PostgreSQL (RDS)" value={data.database === 'configurada' ? 'Configurada' : 'No configurada'} />
          <Row label="MinSalud MUV" value={data.minsaludSandbox ? 'Sandbox' : 'Producción'} />
          <Row label="Credenciales MUV" value={data.minsaludConfigured ? 'Presentes' : 'Pendientes'} />
          <Row label="Software DIAN" value={data.dianSoftwareId} />
          <Row label="Clave técnica DIAN" value={data.dianConfigured ? 'Configurada' : 'Pendiente'} />
          <Row label="Google Drive API" value={data.googleDriveConfigured ? 'Conectada' : 'Sin conexión'} />
          <Row label="Cron RIPS mensual" value={data.ripsCron} />
        </dl>
      ) : null}
    </div>
  )
}
