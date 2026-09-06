import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { formatDate } from '@/utils'
import { toPatientForeignKey } from '@/utils/patientId'
import type { IhceRdaRecord } from '@/types/ihce'

interface ExternalRdaPanelProps {
  patientId: string | number
  compact?: boolean
}

export function ExternalRdaPanel({ patientId, compact = false }: ExternalRdaPanelProps) {
  const key = toPatientForeignKey(patientId)
  const records = useLiveQuery(
    () => db.ihceRdaRecords.where('patientId').equals(key).toArray(),
    [key],
  )

  const latest = records
    ?.slice()
    .sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt))[0] as IhceRdaRecord | undefined

  if (records === undefined) {
    if (compact) return null
    return (
      <div className="card">
        <p className="text-sm text-slate-500">Cargando historial externo...</p>
      </div>
    )
  }

  if (!latest) {
    if (compact) return null
    return (
      <div className="card border-dashed">
        <h2 className="text-base font-semibold text-slate-800">Historial externo (RDA)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Aún no hay un Resumen Digital de Atención cacheado en este equipo. Solicítelo con el
          consentimiento delegado del paciente para leerlo offline en consultas futuras.
        </p>
      </div>
    )
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-800">
            Historial externo (RDA) — lectura offline
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Descargado {formatDate(latest.downloadedAt)} · fuente{' '}
            {latest.source === 'minsalud-simulado' ? 'Minsalud (simulado)' : latest.source} ·
            documento {latest.documentNumber}
          </p>
        </div>
        <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
          SHA-256 {latest.payloadHash.slice(0, 12)}…
        </span>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-700">Diagnósticos CIE-10</h3>
        {latest.diagnoses.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">Sin diagnósticos en el RDA.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {latest.diagnoses.map((dx) => (
              <li key={`${dx.code}-${dx.type}`} className="flex flex-wrap items-baseline gap-2 px-3 py-2">
                <span className="font-mono text-sm font-semibold text-slate-800">{dx.code}</span>
                <span className="text-sm text-slate-700">{dx.description}</span>
                <span className="text-xs uppercase tracking-wide text-slate-400">{dx.type}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-700">Procedimientos CUPS</h3>
        {latest.procedures.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">Sin procedimientos en el RDA.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {latest.procedures.map((proc) => (
              <li key={`${proc.cupsCode}-${proc.performedAt ?? ''}`} className="px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-800">
                    {proc.cupsCode}
                  </span>
                  <span className="text-sm text-slate-700">{proc.description}</span>
                </div>
                {(proc.performedAt || proc.performerName) && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {proc.performedAt ? formatDate(proc.performedAt) : ''}
                    {proc.performedAt && proc.performerName ? ' · ' : ''}
                    {proc.performerName ?? ''}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
