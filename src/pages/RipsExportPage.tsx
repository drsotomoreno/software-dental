import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '@/db/database'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { RipsExportForm } from '@/components/rips'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { Patient } from '@/types/patient'
import type { RipsSourceRecord } from '@/utils/rips'
import { formatDate } from '@/utils'

export function RipsExportPage() {
  const { user } = useAuth()
  const { audit } = useAudit()
  const patients = useLiveQuery(() => db.patients.toArray())
  const records = useLiveQuery(() =>
    db.clinicalRecords.filter((r) => r.isLocked).toArray(),
  )

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const patientMap = useMemo(() => {
    const map = new Map<string, Patient>()
    for (const patient of patients ?? []) {
      if (patient.id != null) {
        map.set(String(patient.id), patient)
      }
    }
    return map
  }, [patients])

  const filteredRecords = useMemo(() => {
    if (!records) return []
    return records
      .filter((record) => {
        const signedAt = record.signedAt ?? record.createdAt
        if (dateFrom && signedAt < dateFrom) return false
        if (dateTo && signedAt > dateTo + 'T23:59:59') return false
        return true
      })
      .sort(
        (a, b) =>
          new Date(b.signedAt ?? 0).getTime() - new Date(a.signedAt ?? 0).getTime(),
      )
  }, [records, dateFrom, dateTo])

  const sources: RipsSourceRecord[] = useMemo(() => {
    const result: RipsSourceRecord[] = []
    for (const record of filteredRecords) {
      const id = String(record.id ?? '')
      if (!selectedIds.has(id)) continue
      const patient = patientMap.get(String(record.patientId))
      if (!patient) continue
      result.push({ record, patient })
    }
    return result
  }, [filteredRecords, selectedIds, patientMap])

  const toggleRecord = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(filteredRecords.map((r) => String(r.id ?? ''))))
  }

  const clearSelection = () => setSelectedIds(new Set())

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
          Seleccione historias clínicas firmadas para incluir consultas y procedimientos odontológicos.
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

        {!records ? (
          <p className="text-sm text-slate-500">Cargando historias clínicas...</p>
        ) : filteredRecords.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay historias clínicas firmadas en el período seleccionado.{' '}
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((record) => {
                  const id = String(record.id ?? '')
                  const patient = patientMap.get(String(record.patientId))
                  const procCount = record.budgetItems.filter((i) => i.procedure.trim()).length
                  return (
                    <RecordRow
                      key={id}
                      record={record}
                      patient={patient}
                      procCount={procCount}
                      checked={selectedIds.has(id)}
                      onToggle={() => toggleRecord(id)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-slate-500">
          {selectedIds.size} atención(es) seleccionada(s) de {filteredRecords.length}
        </p>
      </div>

      <div className="card space-y-4">
        <h2 className="text-base font-semibold text-slate-800">
          2. Datos de facturación y exportar
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
  record,
  patient,
  procCount,
  checked,
  onToggle,
}: {
  record: ClinicalRecord
  patient?: Patient
  procCount: number
  checked: boolean
  onToggle: () => void
}) {
  const principal = record.diagnoses.find((d) => d.type === 'principal') ?? record.diagnoses[0]

  return (
    <tr className={checked ? 'bg-dental-50/40' : undefined}>
      <td className="px-3 py-2">
        <input type="checkbox" checked={checked} onChange={onToggle} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {record.signedAt ? formatDate(record.signedAt) : '—'}
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
      <td className="px-3 py-2 text-slate-600">
        {principal ? `${principal.code} — ${principal.description}` : 'Sin diagnóstico'}
      </td>
      <td className="px-3 py-2 text-slate-600">{procCount}</td>
    </tr>
  )
}
