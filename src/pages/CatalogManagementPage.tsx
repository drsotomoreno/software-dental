import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { APP_SHORT_NAME } from '@/constants/branding'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import { db } from '@/db/database'
import {
  exportCatalog,
  importCatalog,
  restoreCatalogDefaults,
} from '@/services/catalogService'
import type { CatalogImportPayload, CatalogType } from '@/types/catalog'
import { CATALOG_TYPE_LABELS } from '@/types/catalog'
import { formatDate } from '@/utils'
import { SeedTestDataPanel } from '@/components/dev/SeedTestDataPanel'

const CATALOG_TYPES: CatalogType[] = ['cie10', 'cups']

export function CatalogManagementPage() {
  const { user } = useAuth()
  const { audit } = useAudit()
  const metas = useLiveQuery(() => db.catalogMeta.toArray())
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const showMsg = (text: string) => {
    setMessage(text)
    setError('')
  }

  const showErr = (text: string) => {
    setError(text)
    setMessage('')
  }

  const handleExport = async (catalogType: CatalogType) => {
    const data = await exportCatalog(catalogType)
    if (!data) {
      showErr('No hay catálogo para exportar.')
      return
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${APP_SHORT_NAME}_${catalogType}_${data.version}.json`
    link.click()
    URL.revokeObjectURL(url)
    showMsg(`Catálogo ${catalogType.toUpperCase()} exportado.`)
  }

  const handleImport = async (catalogType: CatalogType, file: File) => {
    setBusy(true)
    try {
      const text = await file.text()
      const payload = JSON.parse(text) as CatalogImportPayload
      if (payload.catalogType !== catalogType) {
        showErr(`El archivo es de tipo ${payload.catalogType}, no ${catalogType}.`)
        return
      }
      if (!payload.items?.length) {
        showErr('El archivo no contiene ítems válidos.')
        return
      }
      const result = await importCatalog(payload, user?.id ?? null)
      await audit({
        action: 'IMPORT_CATALOG',
        resourceType: 'catalog',
        resourceId: catalogType,
        details: `v${payload.version} — ${result.imported} registros — ${payload.source}`,
      })
      showMsg(
        `Catálogo ${CATALOG_TYPE_LABELS[catalogType]} actualizado: ${result.imported} códigos (v${payload.version}).`,
      )
    } catch {
      showErr('No se pudo importar el archivo. Verifique el formato JSON.')
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async (catalogType: CatalogType) => {
    if (!window.confirm('¿Restaurar el catálogo a la versión base incluida en el software?')) return
    setBusy(true)
    try {
      const result = await restoreCatalogDefaults(catalogType, user?.id ?? null)
      await audit({
        action: 'IMPORT_CATALOG',
        resourceType: 'catalog',
        resourceId: catalogType,
        details: `Restauración semilla — ${result.imported} registros`,
      })
      showMsg(`Catálogo restaurado con ${result.imported} códigos.`)
    } catch {
      showErr('Error al restaurar el catálogo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <RequirePermission permission="catalogs.manage">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Catálogos CUPS y CIE-10</h1>
          <p className="mt-1 max-w-3xl text-slate-600">
            Tablas oficiales de codificación para diagnósticos (CIE-10) y procedimientos (CUPS).
            Actualícelas periódicamente según las resoluciones del Ministerio de Salud para garantizar
            RIPS, facturación electrónica e historia clínica sin rechazos.
          </p>
        </div>

        {import.meta.env.DEV && <SeedTestDataPanel />}

        {message && (
          <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {CATALOG_TYPES.map((catalogType) => {
            const meta = metas?.find((m) => m.id === catalogType)
            return (
              <div key={catalogType} className="card space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">
                    {CATALOG_TYPE_LABELS[catalogType]}
                  </h2>
                  {meta ? (
                    <dl className="mt-2 space-y-1 text-sm text-slate-600">
                      <div>
                        <span className="font-medium">Versión:</span> {meta.version}
                      </div>
                      <div>
                        <span className="font-medium">Registros:</span> {meta.recordCount}
                      </div>
                      <div>
                        <span className="font-medium">Fuente:</span> {meta.source}
                      </div>
                      <div>
                        <span className="font-medium">Actualizado:</span>{' '}
                        {formatDate(meta.updatedAt)}
                      </div>
                    </dl>
                  ) : (
                    <p className="mt-2 text-sm text-amber-700">Catálogo no inicializado.</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleExport(catalogType)}
                    className="btn-secondary text-sm"
                    disabled={busy}
                  >
                    Exportar JSON
                  </button>
                  <label className="btn-secondary cursor-pointer text-sm">
                    Importar actualización
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void handleImport(catalogType, file)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => handleRestore(catalogType)}
                    className="text-sm text-slate-600 hover:underline"
                    disabled={busy}
                  >
                    Restaurar base
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="card bg-slate-50 text-sm text-slate-600">
          <p className="font-medium text-slate-800">Formato de importación</p>
          <pre className="mt-2 overflow-x-auto rounded bg-white p-3 text-xs">
{`{
  "catalogType": "cups",
  "version": "2026.1",
  "source": "MinSalud Colombia",
  "items": [
    { "code": "890203", "description": "Consulta de primera vez por odontología general" }
  ]
}`}
          </pre>
          <p className="mt-2">
            Los códigos CUPS deben ser de 6 dígitos. Los CIE-10 siguen formato OMS (ej. K02.1).
            La importación reemplaza el catálogo completo y queda auditada.
          </p>
        </div>
      </div>
    </RequirePermission>
  )
}
