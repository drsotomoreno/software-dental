import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '@/db/database'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { RipsExportForm } from '@/components/rips'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import type { Patient } from '@/types/patient'
import type { RipsValidationIssue } from '@/types/rips'
import type { RipsSourceRecord } from '@/utils/rips'
import { getBillingModalitySettings } from '@/services/billingModalityService'
import { saveTemporaryRips } from '@/services/ripsTemporalService'
import {
  atencionEnPeriodo,
  etiquetaAtencionRips,
  listRipsExportAttentions,
  type RipsExportAttention,
} from '@/utils/ripsExportAttentions'
import { isNoObligadoFev, normalizePerfilFiscal, normalizeRipsNumFactura } from '@/utils/fiscalProfile'
import {
  buildDefaultRipsMetadata,
  buildRipsFromRecords,
  downloadRipsJson,
  formatDate,
  formatRipsIssuePatientLabel,
  hasRipsBlockingErrors,
  pickInvoiceNumberForRips,
  suggestRipsFilename,
} from '@/utils'

export function RipsExportPage() {
  const { user } = useAuth()
  const { audit } = useAudit()
  const patients = useLiveQuery(() => db.patients.toArray())
  const records = useLiveQuery(() => db.clinicalRecords.toArray())
  const drafts = useLiveQuery(() => db.patientClinicalDrafts.toArray())

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportIssues, setExportIssues] = useState<RipsValidationIssue[]>([])
  const [exportMessage, setExportMessage] = useState('')

  const patientMap = useMemo(() => {
    const map = new Map<string, Patient>()
    for (const patient of patients ?? []) {
      if (patient.id != null) {
        map.set(String(patient.id), patient)
      }
    }
    return map
  }, [patients])

  const attentions = useMemo(
    () => listRipsExportAttentions({ records: records ?? [], drafts: drafts ?? [] }),
    [records, drafts],
  )

  const filteredAttentions = useMemo(
    () =>
      attentions.filter((attention) => atencionEnPeriodo(attention.occurredAt, dateFrom, dateTo)),
    [attentions, dateFrom, dateTo],
  )

  const sources: RipsSourceRecord[] = useMemo(() => {
    const result: RipsSourceRecord[] = []
    for (const attention of filteredAttentions) {
      if (!selectedIds.has(attention.id)) continue
      const patient = patientMap.get(attention.patientId)
      if (!patient) continue
      result.push({ record: attention.record, patient })
    }
    return result
  }, [filteredAttentions, selectedIds, patientMap])

  const toggleRecord = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(filteredAttentions.map((attention) => attention.id)))
  }

  const clearSelection = () => setSelectedIds(new Set())

  const exportarAtencion = async (attention: RipsExportAttention) => {
    if (!user || exportingId) return
    const patient = patientMap.get(attention.patientId)
    if (!patient) return

    setSelectedIds(new Set([attention.id]))
    setExportingId(attention.id)
    setExportIssues([])
    setExportMessage('')

    try {
      const atencion: RipsSourceRecord = { record: attention.record, patient }
      const perfilFiscal = normalizePerfilFiscal(
        user.perfilFiscal ?? getBillingModalitySettings().perfilFiscal,
      )
      const noObligado = isNoObligadoFev(perfilFiscal)
      let numFactura: string | null = null
      if (!noObligado && patient.id != null) {
        const invoices = await db.electronicInvoices.where('patientId').equals(String(patient.id)).toArray()
        numFactura = normalizeRipsNumFactura(pickInvoiceNumberForRips([atencion], invoices))
      }
      const metadata = {
        ...buildDefaultRipsMetadata(user),
        perfilFiscal,
        numFactura,
        esRipsTemporal: noObligado || numFactura == null,
      }
      const result = buildRipsFromRecords([atencion], user, metadata)
      if (hasRipsBlockingErrors(result.issues)) {
        setExportIssues(result.issues)
        return
      }

      downloadRipsJson(result.rips, suggestRipsFilename(metadata.numFactura))
      void saveTemporaryRips({
        clinicId: user.clinicId || user.id,
        patientId: String(patient.id ?? ''),
        professionalId: user.id,
        clinicalRecordId: String(attention.record.id ?? ''),
        numDocumentoIdObligado: result.rips.numDocumentoIdObligado,
        numFactura: normalizeRipsNumFactura(result.rips.numFactura),
        perfilFiscal,
        status: 'ready',
        ripsJson: result.rips,
      })
      audit({
        action: 'EXPORT_RIPS',
        resourceType: 'rips',
        details: `Exportación de ${patient.firstName} ${patient.lastName} (${patient.documentType} ${patient.documentNumber})`,
      })
      setExportMessage(
        `RIPS de ${patient.firstName} ${patient.lastName} exportado.`,
      )
    } finally {
      setExportingId(null)
    }
  }

  if (!user) {
    return <p className="text-slate-500">Cargando perfil del prestador...</p>
  }

  return (
    <RequirePermission permission="export.rips">
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Exportación RIPS</h1>
        <p className="mt-1 text-sm text-slate-600">
          Genere el JSON RIPS, valídelo ante MinSalud y obtenga el CUV para la FEV-DIAN.
          Aquí aparecen las historias clínicas firmadas y todas las notas de evolución
          de la cuenta marcadas como RIPS listo para exportar.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          También puede exportar{' '}
          <Link to="/fhir" className="text-dental-600 hover:underline">
            Bundle FHIR R4
          </Link>{' '}
          para interoperabilidad clínica.
        </p>
      </div>

      <div className="card space-y-4">
        <h2 className="text-base font-semibold text-slate-800">
          1. Seleccionar atenciones
        </h2>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label-field">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-field">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input-field"
            />
          </div>
          <button type="button" onClick={selectAll} className="btn-secondary text-sm">
            Seleccionar todas
          </button>
          <button type="button" onClick={clearSelection} className="btn-secondary text-sm">
            Limpiar selección
          </button>
        </div>

        {!records || !drafts ? (
          <p className="text-sm text-slate-500">Cargando atenciones...</p>
        ) : filteredAttentions.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay historias clínicas firmadas ni notas de evolución con RIPS listo para exportar
            en el período seleccionado.{' '}
            <Link to="/pacientes" className="text-dental-600 hover:underline">
              Ir a pacientes
            </Link>
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 w-10" />
                  <th className="px-3 py-2 font-medium text-slate-600">Fecha firma</th>
                  <th className="px-3 py-2 font-medium text-slate-600">Paciente</th>
                  <th className="px-3 py-2 font-medium text-slate-600">Diagnóstico</th>
                  <th className="px-3 py-2 font-medium text-slate-600">Procedimientos</th>
                  <th className="px-3 py-2 font-medium text-slate-600">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAttentions.map((attention) => {
                  const patient = patientMap.get(attention.patientId)
                  return (
                    <RecordRow
                      key={attention.id}
                      attention={attention}
                      patient={patient}
                      checked={selectedIds.has(attention.id)}
                      exporting={exportingId === attention.id}
                      onToggle={() => toggleRecord(attention.id)}
                      onExport={() => void exportarAtencion(attention)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-slate-500">
          {selectedIds.size} atención(es) seleccionada(s) de {filteredAttentions.length}
        </p>

        {exportMessage && <p className="text-sm text-green-700">{exportMessage}</p>}
        {exportIssues.length > 0 && <ExportIssueList issues={exportIssues} />}
      </div>

      <div className="card space-y-4">
        <h2 className="text-base font-semibold text-slate-800">
          2. Exportar
        </h2>
        <RipsExportForm
          sources={sources}
          professional={user}
          onExported={() =>
            audit({
              action: 'EXPORT_RIPS',
              resourceType: 'rips',
              details: `Exportación lote: ${sources.length} atención(es)`,
            })
          }
        />
      </div>
    </div>
    </RequirePermission>
  )
}

function RecordRow({
  attention,
  patient,
  checked,
  exporting,
  onToggle,
  onExport,
}: {
  attention: RipsExportAttention
  patient?: Patient
  checked: boolean
  exporting: boolean
  onToggle: () => void
  onExport: () => void
}) {
  const estado = etiquetaAtencionRips(attention)
  const estadoClass =
    attention.ripsEstado === 'enviado_ok'
      ? 'text-emerald-800'
      : attention.ripsEstado === 'error'
        ? 'text-red-700'
        : attention.ripsEstado === 'preparado'
          ? 'text-amber-800'
          : 'text-slate-600'

  return (
    <tr className={checked ? 'bg-dental-50/40' : undefined}>
      <td className="px-3 py-2">
        <input type="checkbox" checked={checked} onChange={onToggle} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {attention.occurredAt ? formatDate(attention.occurredAt) : '—'}
      </td>
      <td className="px-3 py-2">
        {patient ? (
          <>
            {patient.firstName} {patient.lastName}
            <span className="ml-1 text-slate-500">
              ({patient.documentType} {patient.documentNumber})
            </span>
          </>
        ) : (
          <span className="text-amber-700">Paciente no encontrado</span>
        )}
      </td>
      <td className="px-3 py-2 text-slate-600">{attention.diagnosisLabel}</td>
      <td className="px-3 py-2 text-slate-600">{attention.procedureLabel}</td>
      <td className="px-3 py-2" title={attention.ripsErrorLog ?? undefined}>
        <div className="flex flex-col items-start gap-2">
          <span className={estadoClass}>{estado}</span>
          {patient && (
            <button
              type="button"
              className="btn-primary px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onExport}
              disabled={exporting}
            >
              {exporting ? 'Exportando…' : 'Exportar'}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function ExportIssueList({ issues }: { issues: RipsValidationIssue[] }) {
  const errors = issues.filter((issue) => issue.level === 'error')
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <p className="mb-2 text-sm font-medium text-amber-900">
        No se exportó esta atención. Corrija {errors.length} error(es):
      </p>
      <ul className="space-y-1 text-xs text-amber-900">
        {issues.map((issue, index) => {
          const patientLabel = formatRipsIssuePatientLabel(issue)
          return (
            <li key={index}>
              <span className={issue.level === 'error' ? 'font-semibold text-red-700' : 'text-amber-800'}>
                {issue.level === 'error' ? 'Error' : 'Aviso'}:
              </span>{' '}
              {patientLabel ? <span className="font-semibold">Paciente {patientLabel}. </span> : null}
              {issue.message}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
