import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Patient } from '@/types/patient'
import type { ClinicalHistoryExportFormat } from '@/types/portability'
import { EXPORT_FORMAT_LABELS, LEGAL_FRAMEWORK } from '@/types/portability'
import type { UserProfile } from '@/types/user'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { OdontogramData } from '@/types/odontogram'
import {
  buildClinicalHistoryExportPackage,
  exportClinicalHistory,
} from '@/utils/clinicalHistoryExport'
import { formatDate } from '@/utils'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { ClinicalHistoryPrintDialog } from './ClinicalHistoryPrintDialog'

interface ClinicalHistoryExportPanelProps {
  patientRouteId: string
  patient: Patient
  professional: UserProfile
  clinicalData?: ClinicalRecordFormData | null
  odontogram?: OdontogramData | null
  onExported?: (format: ClinicalHistoryExportFormat, recordCount: number) => void
}

export function ClinicalHistoryExportPanel({
  patientRouteId,
  patient,
  professional,
  clinicalData,
  odontogram,
  onExported,
}: ClinicalHistoryExportPanelProps) {
  const [format, setFormat] = useState<ClinicalHistoryExportFormat>('json')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{
    recordCount: number
    integrityVerified: boolean
    packageHash: string
  } | null>(null)

  const handlePreview = async () => {
    setError('')
    const pkg = await buildClinicalHistoryExportPackage(patientRouteId, professional)
    if (!pkg) {
      setError('No se pudo preparar la exportación.')
      return
    }
    setPreview({
      recordCount: pkg.manifest.recordCount,
      integrityVerified: pkg.manifest.integrityVerified,
      packageHash: pkg.manifest.packageHash,
    })
  }

  const handleExport = async () => {
    setBusy(true)
    setError('')
    try {
      const pkg = await buildClinicalHistoryExportPackage(patientRouteId, professional)
      if (!pkg) {
        setError('No se encontró información clínica para exportar.')
        return
      }
      if (pkg.manifest.recordCount === 0 && format !== 'json') {
        setError('No hay atenciones firmadas. Exporte en JSON o firme historias clínicas primero.')
        return
      }
      await exportClinicalHistory(pkg, format, professional)
      onExported?.(format, pkg.manifest.recordCount)
      setPreview({
        recordCount: pkg.manifest.recordCount,
        integrityVerified: pkg.manifest.integrityVerified,
        packageHash: pkg.manifest.packageHash,
      })
    } catch {
      setError('Error al generar la exportación.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card space-y-5">
      <div>
        <h3 className={`mb-2 ${CLINICAL_SECTION_TITLE_CLASS}`}>
          {clinicalSectionTitle(
            CLINICAL_HISTORY_SECTION_NUMBERS.exportacionHistoria,
            'Exportación de Historia Clínica',
          )}
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Exportación y Resumen Digital de Atención (RDA). Derecho fundamental del paciente (Ley 23/1981,
          Ley 1581/2012). Genera una copia completa, ordenada e interoperable de la historia clínica
          odontológica firmada, con verificación de integridad y cadena de custodia.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="font-medium text-slate-800">Paciente</p>
        <p className="mt-1 text-slate-600">
          {patient.firstName} {patient.lastName} — {patient.documentType} {patient.documentNumber}
        </p>
      </div>

      <div>
        <p className="label-field mb-2">Formato de exportación</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(EXPORT_FORMAT_LABELS) as ClinicalHistoryExportFormat[]).map((key) => (
            <label
              key={key}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition ${
                format === key
                  ? 'border-dental-500 bg-dental-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="export-format"
                value={key}
                checked={format === key}
                onChange={() => setFormat(key)}
                className="mt-1"
              />
              <span>
                <span className="font-medium text-slate-800">{EXPORT_FORMAT_LABELS[key]}</span>
                {key === 'fhir' && (
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Compatible IHCE — HL7 FHIR R4
                  </span>
                )}
                {key === 'html' && (
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Imprimible o guardar como PDF desde el navegador
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-dental-100 bg-dental-50/50 p-4 text-sm">
        <p className="font-medium text-dental-800">Garantías de la exportación</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-slate-700">
          <li>Formatos abiertos (JSON, XML, FHIR, HTML) — sin vendor lock-in</li>
          <li>Hash SHA-256 por atención y del paquete completo</li>
          <li>Cadena de custodia: firmas electrónicas + generación del export</li>
          <li>Orden cronológico de atenciones y notas de evolución</li>
        </ul>
      </div>

      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">Marco normativo aplicable</summary>
        <ul className="mt-2 list-inside list-disc space-y-1">
          {LEGAL_FRAMEWORK.map((law) => (
            <li key={law}>{law}</li>
          ))}
        </ul>
      </details>

      {preview && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <p>
            <span className="font-medium">Atenciones incluidas:</span> {preview.recordCount}
          </p>
          <p className="mt-1">
            <span className="font-medium">Integridad:</span>{' '}
            {preview.integrityVerified ? (
              <span className="text-green-700">Verificada</span>
            ) : (
              <span className="text-red-700">Con inconsistencias — revise antes de entregar</span>
            )}
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500">
            Hash paquete: {preview.packageHash.slice(0, 32)}…
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Link
          to={`/pacientes/${patientRouteId}`}
          state={{ resetHistoryView: true }}
          className="btn-secondary inline-flex items-center"
        >
          Ir a la historia
        </Link>
        <button type="button" onClick={handlePreview} className="btn-secondary" disabled={busy}>
          Verificar contenido
        </button>
        <button type="button" onClick={handleExport} className="btn-primary" disabled={busy}>
          {busy ? 'Generando…' : 'Descargar historia clínica'}
        </button>
        {clinicalData && (
          <ClinicalHistoryPrintDialog
            patient={patient}
            professional={professional}
            clinicalData={clinicalData}
            odontogram={odontogram}
          />
        )}
      </div>

      <p className="text-xs text-slate-500">
        Entregue el archivo al paciente o al profesional receptor. Exportación auditada el{' '}
        {formatDate(new Date().toISOString())}.
      </p>
    </div>
  )
}
