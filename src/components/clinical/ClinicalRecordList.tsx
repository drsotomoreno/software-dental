import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { EstadoRipsCuv } from '@/components/clinical/EstadoRipsCuv'
import { CLINICAL_SECTION_TITLE_CLASS } from '@/constants/clinicalHistorySections'
import { leerEstadoMuv, leerResultadoValidacion } from '@/utils/estadoRipsCuv'
import { formatDate, toDexiePrimaryKey } from '@/utils'

interface ClinicalRecordListProps {
  patientId: string
  onSelectRecord?: (recordId: string) => void
}

export function ClinicalRecordList({ patientId, onSelectRecord }: ClinicalRecordListProps) {
  const records = useLiveQuery(async () => {
    const numericKey = toDexiePrimaryKey(patientId)
    const stringKey = String(patientId)

    const byString = await db.clinicalRecords
      .where('patientId')
      .equals(stringKey)
      .filter((r) => r.isLocked)
      .toArray()

    let byNumeric: typeof byString = []
    if (typeof numericKey === 'number') {
      byNumeric = await db.clinicalRecords
        .where('patientId')
        .equals(numericKey)
        .filter((r) => r.isLocked)
        .toArray()
    }

    const merged = new Map([...byString, ...byNumeric].map((r) => [r.id, r]))
    return [...merged.values()].sort(
      (a, b) => new Date(b.signedAt ?? 0).getTime() - new Date(a.signedAt ?? 0).getTime(),
    )
  }, [patientId])

  if (records === undefined) {
    return (
      <div className="card">
        <p className="text-sm text-slate-500">Cargando historias clínicas...</p>
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="card">
        <h3 className={`mb-2 ${CLINICAL_SECTION_TITLE_CLASS}`}>Historias clínicas firmadas</h3>
        <p className="text-sm text-slate-500">
          No hay historias clínicas firmadas para este paciente.
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <h3 className={`mb-1 ${CLINICAL_SECTION_TITLE_CLASS}`}>
        Historias clínicas firmadas ({records.length})
      </h3>
      <p className="mb-3 text-xs text-slate-500">
        Cada atención cerrada muestra su Estado RIPS según la respuesta del MUV.
      </p>
      <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:grid">
        <span>Consulta</span>
        <span>Estado RIPS</span>
        <span className="sr-only">Bloqueo</span>
      </div>
      <ul className="space-y-2">
        {records.map((record) => {
          const fuente = record as typeof record & {
            estado_muv?: string | null
            resultado_validacion?: unknown
          }
          return (
            <li
              key={record.id}
              className="grid items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm transition hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-3"
            >
              <button
                type="button"
                onClick={() => record.id != null && onSelectRecord?.(String(record.id))}
                className="min-w-0 text-left"
              >
                <span className="font-medium text-slate-800">
                  {record.signedAt ? formatDate(record.signedAt) : 'Sin fecha'}
                </span>
                <span className="ml-2 text-slate-500">
                  {record.diagnoses?.[0]?.code
                    ? `— ${record.diagnoses[0].code}: ${record.diagnoses[0].description}`
                    : ''}
                </span>
              </button>
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:sr-only">
                  Estado RIPS
                </span>
                <EstadoRipsCuv
                  estadoMuv={leerEstadoMuv(fuente)}
                  cuv={record.cuv}
                  resultadoValidacion={leerResultadoValidacion(fuente)}
                />
              </div>
              <span className="w-fit rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                Bloqueada
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
