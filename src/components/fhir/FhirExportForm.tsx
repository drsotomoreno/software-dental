import { useMemo, useState } from 'react'
import type { FhirExportMetadata, FhirValidationIssue } from '@/types/fhir'
import type { FhirSourceRecord } from '@/utils/fhir'
import type { UserProfile } from '@/types/user'
import {
  buildDefaultFhirMetadata,
  buildFhirBundle,
  countFhirIssues,
  downloadFhirJson,
  hasFhirBlockingErrors,
  suggestFhirFilename,
} from '@/utils'

interface FhirExportFormProps {
  sources: FhirSourceRecord[]
  professional: UserProfile
  initialMetadata?: Partial<FhirExportMetadata>
  onExported?: () => void
}

export function FhirExportForm({
  sources,
  professional,
  initialMetadata,
  onExported,
}: FhirExportFormProps) {
  const [metadata, setMetadata] = useState<FhirExportMetadata>(() => ({
    ...buildDefaultFhirMetadata(professional),
    ...initialMetadata,
  }))
  const [exported, setExported] = useState(false)

  const result = useMemo(() => {
    try {
      return buildFhirBundle(sources, professional, metadata)
    } catch {
      return {
        bundle: { resourceType: 'Bundle' as const, type: metadata.bundleType, entry: [] },
        issues: [
          {
            level: 'error' as const,
            message: 'No se pudo preparar el FHIR para esta historia clínica.',
          },
        ],
        recordCount: 0,
        patientCount: 0,
        resourceCount: 0,
      }
    }
  }, [sources, professional, metadata])

  const errors = countFhirIssues(result.issues, 'error')
  const warnings = countFhirIssues(result.issues, 'warning')
  const canExport = !hasFhirBlockingErrors(result.issues) && sources.length > 0

  const update = (patch: Partial<FhirExportMetadata>) => {
    setMetadata((prev) => ({ ...prev, ...patch }))
    setExported(false)
  }

  const handleExport = () => {
    if (!canExport) return
    downloadFhirJson(
      result.bundle,
      suggestFhirFilename(metadata.bundleType, result.recordCount),
    )
    setExported(true)
    onExported?.()
  }

  const resourceTypes = result.bundle.entry.reduce<Record<string, number>>((acc, entry) => {
    const type = entry.resource.resourceType
    acc[type] = (acc[type] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="font-medium text-slate-800">Resumen del Bundle FHIR R4</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <div>
            <span className="text-xs text-slate-500">Historias</span>
            <p className="font-semibold">{result.recordCount}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Pacientes</span>
            <p className="font-semibold">{result.patientCount}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Recursos</span>
            <p className="font-semibold">{result.resourceCount}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Tipo Bundle</span>
            <p className="font-semibold">{metadata.bundleType}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(resourceTypes).map(([type, count]) => (
            <span
              key={type}
              className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200"
            >
              {type}: {count}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label-field">Tipo de Bundle</label>
          <select
            value={metadata.bundleType}
            onChange={(e) =>
              update({ bundleType: e.target.value as FhirExportMetadata['bundleType'] })
            }
            className="input-field"
          >
            <option value="document">
              Document — con Composition (compatible RDA / IHCE)
            </option>
            <option value="collection">Collection — todos los recursos</option>
          </select>
        </div>
        <div>
          <label className="label-field">Nombre organización prestadora</label>
          <input
            value={metadata.organizationName ?? ''}
            onChange={(e) => update({ organizationName: e.target.value })}
            placeholder={professional.clinicName}
            className="input-field"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={metadata.includeDocumentReference}
              onChange={(e) => update({ includeDocumentReference: e.target.checked })}
              className="rounded border-slate-300"
            />
            Incluir DocumentReference con hash de integridad (Ley 527)
          </label>
        </div>
      </div>

      {result.issues.length > 0 && (
        <FhirValidationList issues={result.issues} errors={errors} warnings={warnings} />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={!canExport}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Descargar Bundle FHIR JSON
        </button>
        {exported && (
          <span className="text-sm text-green-600">Bundle FHIR descargado correctamente.</span>
        )}
        {!canExport && (
          <span className="text-sm text-amber-700">Corrija los errores antes de exportar.</span>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Exportación FHIR R4 para interoperabilidad. El Bundle tipo <strong>document</strong> coloca
        Composition como primer recurso, alineado con la estructura del Resumen Digital de Atención
        (RDA) de la IHCE. No envía datos automáticamente a ningún registro central.
      </p>
    </div>
  )
}

function FhirValidationList({
  issues,
  errors,
  warnings,
}: {
  issues: FhirValidationIssue[]
  errors: number
  warnings: number
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <p className="mb-2 text-sm font-medium text-amber-900">
        Validación: {errors} error(es), {warnings} advertencia(s)
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-amber-900">
        {issues.map((issue, index) => (
          <li key={index} className="flex gap-2">
            <span
              className={
                issue.level === 'error'
                  ? 'font-semibold text-red-700'
                  : 'font-medium text-amber-800'
              }
            >
              {issue.level === 'error' ? 'Error' : 'Aviso'}:
            </span>
            <span>
              {issue.patientDocument ? `[${issue.patientDocument}] ` : ''}
              {issue.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
