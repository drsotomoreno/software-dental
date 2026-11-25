import { useCallback, useEffect, useState } from 'react'
import { Archive, MessageCircle, NotebookPen } from 'lucide-react'
import {
  fetchWhatsappNoShows,
  patchWhatsappNoShow,
  type WhatsappNoShowItem,
} from '@/services/whatsappApiService'
import { buildWhatsAppUrl } from '@/utils/whatsapp'

function formatWhen(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function statusLabel(status: string) {
  const s = String(status || '').toLowerCase()
  if (s === 'pending_manual_call') return 'Pendiente llamada'
  if (s === 'opted_out') return 'No escribir por WhatsApp'
  if (s === 'active') return 'Seguimiento automático'
  if (s === 'scheduled') return 'Reagendó'
  if (s === 'archived') return 'Archivado'
  return status
}

function manualMessage(item: WhatsappNoShowItem) {
  const name = (item.patient_name || 'paciente').trim().split(/\s+/)[0] || 'paciente'
  const when = item.missed_start_time ? formatWhen(item.missed_start_time) : 'su cita'
  return `Hola ${name}, le escribimos de la clínica por su inasistencia del ${when}. ¿Desea reagendar?`
}

type Props = {
  embedded?: boolean
}

export function WhatsappNoShowsPanel({ embedded = false }: Props) {
  const [items, setItems] = useState<WhatsappNoShowItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await fetchWhatsappNoShows()
      setItems(rows)
      const drafts: Record<string, string> = {}
      for (const row of rows) {
        drafts[row.id] = row.receptionist_notes || ''
      }
      setNotesDraft(drafts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la lista.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  async function saveNotes(id: string) {
    setBusyId(id)
    try {
      const updated = await patchWhatsappNoShow(id, {
        receptionist_notes: notesDraft[id] ?? '',
      })
      setItems((prev) => prev.map((row) => (row.id === id ? { ...row, ...updated } : row)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la nota.')
    } finally {
      setBusyId(null)
    }
  }

  async function archiveCase(id: string) {
    setBusyId(id)
    try {
      await patchWhatsappNoShow(id, {
        status: 'archived',
        receptionist_notes: notesDraft[id] ?? undefined,
      })
      setItems((prev) => prev.filter((row) => row.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo archivar el caso.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section
      id="no-shows"
      className={
        embedded
          ? 'space-y-4'
          : 'space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'
      }
    >
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Lista de Inasistencias por Gestionar
          </h2>
          <p className="text-sm text-slate-500">
            Casos que agotaron los 2 intentos automáticos o siguen en seguimiento.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Actualizar
        </button>
      </header>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Cargando inasistencias…</p> : null}

      {!loading && items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No hay inasistencias pendientes por gestionar.
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Paciente</th>
                <th className="px-3 py-2.5">Teléfono</th>
                <th className="px-3 py-2.5">Cita perdida</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5">Último intento</th>
                <th className="px-3 py-2.5">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.map((item) => {
                const phone = item.patient_phone || ''
                const waUrl = phone
                  ? buildWhatsAppUrl(phone, manualMessage(item))
                  : null
                const optedOut = String(item.status).toLowerCase() === 'opted_out'
                return (
                  <tr key={item.id} className="align-top">
                    <td className="px-3 py-3 font-medium text-slate-900">
                      {item.patient_name || 'Sin nombre'}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{phone || '—'}</td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatWhen(item.missed_start_time)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          optedOut
                            ? 'bg-slate-100 text-slate-600'
                            : String(item.status) === 'pending_manual_call'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatWhen(item.last_attempt_at)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-[220px] flex-col gap-2">
                        {waUrl && !optedOut ? (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1ebe57]"
                          >
                            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                            WhatsApp manual
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {optedOut ? 'Opt-out activo' : 'Sin teléfono'}
                          </span>
                        )}
                        <textarea
                          rows={2}
                          value={notesDraft[item.id] ?? ''}
                          onChange={(event) =>
                            setNotesDraft((prev) => ({
                              ...prev,
                              [item.id]: event.target.value,
                            }))
                          }
                          placeholder="Nota de llamada…"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => void saveNotes(item.id)}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            <NotebookPen className="h-3.5 w-3.5" aria-hidden />
                            Guardar nota
                          </button>
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => void archiveCase(item.id)}
                            className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            title="Archivar caso"
                          >
                            <Archive className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
