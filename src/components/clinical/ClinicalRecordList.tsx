import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { EstadoRipsCuv } from '@/components/clinical/EstadoRipsCuv'
import { CLINICAL_SECTION_TITLE_CLASS } from '@/constants/clinicalHistorySections'
import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { EvolutionNote } from '@/types/evolutionNote'
import { leerEstadoMuv, leerResultadoValidacion } from '@/utils/estadoRipsCuv'
import { formatDate, toDexiePrimaryKey } from '@/utils'
import {
  deduplicarEvoluciones,
  leerApertura,
  textoEstadoEvolucion,
} from '@/services/clinicalHistorySignature'

interface ClinicalRecordListProps {
  patientId: string
  onSelectRecord?: (recordId: string) => void
}

function notasDe(value: unknown): EvolutionNote[] {
  return Array.isArray(value) ? value : []
}

async function historiasDelPaciente(patientId: string): Promise<ClinicalRecord[]> {
  const numericKey = toDexiePrimaryKey(patientId)
  const stringKey = String(patientId)
  const byString = await db.clinicalRecords.where('patientId').equals(stringKey).toArray()
  let byNumeric: ClinicalRecord[] = []
  if (typeof numericKey === 'number') {
    byNumeric = await db.clinicalRecords.where('patientId').equals(numericKey).toArray()
  }
  const merged = new Map([...byString, ...byNumeric].map((record) => [String(record.id), record]))
  return [...merged.values()]
}

export function ClinicalRecordList({ patientId, onSelectRecord }: ClinicalRecordListProps) {
  const data = useLiveQuery(async () => {
    const records = await historiasDelPaciente(patientId)
    const evolutions = await db.evolutions.where('patientId').equals(String(patientId)).toArray()
    const draft = await db.patientClinicalDrafts.get(String(patientId))
    const draftNotes = [
      ...notasDe(draft?.clinicalDraft?.evolutionNotes),
      ...notasDe(draft?.evolutionNotes),
    ]
    return { records, evolutions, draftNotes }
  }, [patientId])

  if (data === undefined) {
    return (
      <div className="card">
        <p className="text-sm text-slate-500">Cargando historia clínica...</p>
      </div>
    )
  }

  const apertura = leerApertura(data.records)
  const opening = apertura?.recordId
    ? data.records.find((record) => String(record.id) === apertura.recordId) ?? null
    : null
  const atenciones = data.records
    .filter((record) => record.isLocked && String(record.id) !== apertura?.recordId)
    .sort((a, b) => new Date(b.signedAt ?? 0).getTime() - new Date(a.signedAt ?? 0).getTime())
  const evoluciones = deduplicarEvoluciones([
    data.draftNotes,
    data.evolutions,
    ...data.records.map((record) => notasDe(record.evolutionNotes)),
  ])

  return (
    <div className="card space-y-5">
      <HistoriaAperturaBanner
        signedAt={apertura?.signedAt}
        opening={opening}
        onSelectRecord={onSelectRecord}
      />
      <EvolucionesList notes={evoluciones} />
      {atenciones.length > 0 && (
        <AtencionesRipsList records={atenciones} onSelectRecord={onSelectRecord} />
      )}
    </div>
  )
}

function HistoriaAperturaBanner({
  signedAt,
  opening,
  onSelectRecord,
}: {
  signedAt?: string
  opening: ClinicalRecord | null
  onSelectRecord?: (recordId: string) => void
}) {
  const fuente = (opening ?? {}) as ClinicalRecord & {
    estado_muv?: string | null
    resultado_validacion?: unknown
  }

  return (
    <div>
      <h3 className={CLINICAL_SECTION_TITLE_CLASS}>Historia clínica</h3>
      {signedAt ? (
        <button
          type="button"
          onClick={() => opening?.id != null && onSelectRecord?.(String(opening.id))}
          className="mt-2 flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left"
        >
          <span className="text-sm font-medium text-emerald-950">
            Firmada el {formatDate(signedAt)} — Cerrada/Activa
          </span>
          {opening && (
            <EstadoRipsCuv
              estadoMuv={leerEstadoMuv(fuente)}
              cuv={opening.cuv}
              resultadoValidacion={leerResultadoValidacion(fuente)}
            />
          )}
        </button>
      ) : (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
          Pendiente de firma de apertura
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        La apertura se firma una sola vez. Cada cita se agrega como evolución y se firma aparte.
      </p>
    </div>
  )
}

function EvolucionesList({ notes }: { notes: EvolutionNote[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-800">Evoluciones</h4>
      {notes.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No hay evoluciones registradas.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {notes.map((note) => {
            const estado = textoEstadoEvolucion(note)
            const firmada = estado === 'Firmada'
            return (
              <li
                key={note.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm"
              >
                <span className="font-medium text-slate-800">
                  Evolución del {note.date ? formatDate(note.date) : 'sin fecha'}
                  {note.procedure ? <span className="ml-2 font-normal text-slate-500">— {note.procedure}</span> : null}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    firmada ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {estado}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function AtencionesRipsList({
  records,
  onSelectRecord,
}: {
  records: ClinicalRecord[]
  onSelectRecord?: (recordId: string) => void
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-800">Atenciones con RIPS</h4>
      <p className="mt-1 text-xs text-slate-500">
        Cierres anteriores de facturación. No son otra historia clínica ni modifican la apertura.
      </p>
      <ul className="mt-2 space-y-2">
        {records.map((record) => {
          const fuente = record as typeof record & {
            estado_muv?: string | null
            resultado_validacion?: unknown
          }
          return (
            <li
              key={record.id}
              className="grid items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <button
                type="button"
                onClick={() => record.id != null && onSelectRecord?.(String(record.id))}
                className="min-w-0 text-left font-medium text-slate-800"
              >
                Atención del {record.signedAt ? formatDate(record.signedAt) : 'sin fecha'}
              </button>
              <EstadoRipsCuv
                estadoMuv={leerEstadoMuv(fuente)}
                cuv={record.cuv}
                resultadoValidacion={leerResultadoValidacion(fuente)}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
