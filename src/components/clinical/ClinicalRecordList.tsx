import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { CLINICAL_SECTION_TITLE_CLASS } from '@/constants/clinicalHistorySections'
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
      <h3 className={`mb-4 ${CLINICAL_SECTION_TITLE_CLASS}`}>
        Historias clínicas firmadas ({records.length})
      </h3>
      <ul className="space-y-2">
        {records.map((record) => (
          <li key={record.id}>
            <button
              type="button"
              onClick={() => record.id != null && onSelectRecord?.(String(record.id))}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left text-sm transition hover:bg-slate-50"
            >
              <div>
                <span className="font-medium text-slate-800">
                  {record.signedAt ? formatDate(record.signedAt) : 'Sin fecha'}
                </span>
                <span className="ml-2 text-slate-500">
                  {record.diagnoses?.[0]?.code
                    ? `— ${record.diagnoses[0].code}: ${record.diagnoses[0].description}`
                    : ''}
                </span>
              </div>
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                Bloqueada
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
