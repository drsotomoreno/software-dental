import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRipsDailySync } from '@/hooks/useRipsDailySync'
import { useRipsQueue } from '@/hooks/useRipsQueue'
import { motivoRipsVisible } from '@/services/ripsSyncPlan'
import { getPatientByRouteId } from '@/utils/patientId'

function Pill({
  count,
  label,
  className,
}: {
  count: number
  label: string
  className: string
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      <span>{count}</span>
      <span className="font-medium">{label}</span>
    </span>
  )
}

/**
 * Panel compacto del encabezado: listos, sincronizados hoy y rechazados por el MUV.
 */
export function RipsStatusWidget() {
  const { entries, summary, sendDailyBatch } = useRipsQueue()
  const sync = useRipsDailySync()
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const running = sync.phase === 'running'
  const rechazados = useMemo(
    () => entries.filter((entry) => entry.status === 'ERROR_RETRY'),
    [entries],
  )
  const nombres = useLiveQuery(async () => {
    if (!open) return {} as Record<string, string>
    const map: Record<string, string> = {}
    for (const entry of rechazados) {
      if (map[entry.patientId]) continue
      const patient = await getPatientByRouteId(entry.patientId)
      if (patient) map[entry.patientId] = `${patient.firstName} ${patient.lastName}`.trim()
    }
    return map
  }, [open, rechazados])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const enviar = () => {
    void sendDailyBatch()
  }

  return (
    <div className="flex max-w-[16rem] flex-col items-end gap-1 sm:max-w-none">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-wrap items-center justify-end gap-1 rounded-xl border border-slate-200 bg-slate-50 px-1.5 py-1 text-left hover:bg-white"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`RIPS: ${summary.listos} listos para enviar, ${summary.sincronizadosHoy} sincronizados hoy, ${summary.conErrores} con errores`}
      >
        <Pill count={summary.listos} label="listos" className="bg-amber-100 text-amber-950" />
        <Pill count={summary.sincronizadosHoy} label="hoy" className="bg-emerald-100 text-emerald-900" />
        <Pill count={summary.conErrores} label="errores" className="bg-red-100 text-red-900" />
      </button>
      <button
        type="button"
        onClick={enviar}
        disabled={running}
        className="rounded-full bg-dental-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-dental-700 disabled:opacity-60"
        aria-label="Cierre de Jornada / Enviar RIPS del Día"
        title="Cierre de Jornada / Enviar RIPS del Día"
      >
        {running ? 'Enviando RIPS…' : 'Cierre de Jornada'}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Cerrar panel de RIPS"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 id={titleId} className="text-base font-semibold text-slate-900">
                Cierre de Jornada / Enviar RIPS del Día
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {summary.listos} listos para enviar · {summary.sincronizadosHoy} sincronizados hoy ·{' '}
                {summary.conErrores} con errores
              </p>
              {sync.last?.message && (
                <p className="mt-2 text-sm text-slate-700" role="status">
                  {sync.last.message}
                </p>
              )}
            </div>
            <div className="space-y-3 overflow-y-auto px-4 py-3">
              {rechazados.length === 0 ? (
                <p className="text-sm text-slate-500">Ninguna atención rechazada por el MUV.</p>
              ) : (
                rechazados.map((entry) => (
                  <article key={entry.evolutionId} className="rounded-xl border border-red-100 bg-red-50/60 p-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {nombres?.[entry.patientId] || 'Paciente'}
                    </p>
                    <p className="mt-1 text-sm text-red-950">{motivoRipsVisible(entry)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(entry.updatedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
                    </p>
                    <Link
                      to={`/pacientes/${entry.patientId}`}
                      state={{ ripsSection: 'evolucion', evolutionId: entry.evolutionId }}
                      onClick={() => setOpen(false)}
                      className="mt-2 inline-flex rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-dental-700 ring-1 ring-dental-600 hover:bg-dental-50"
                    >
                      Corregir Evolución
                    </Link>
                  </article>
                ))
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={enviar}
                disabled={running}
                className="rounded-lg bg-dental-600 px-3 py-2 text-sm font-semibold text-white hover:bg-dental-700 disabled:opacity-60"
              >
                {running ? 'Enviando…' : 'Cierre de Jornada / Enviar RIPS del Día'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
