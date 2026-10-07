import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { CuvAlertas, CuvEstadoBadge } from '@/components/cuv/CuvAlertas'
import { consultCuvEstado, listCuvExpedientes, resendCuvPackage } from '@/services/cuvApiService'
import type { CuvEstado, CuvExpediente } from '@/types/cuvExpediente'
import { formatDate } from '@/utils'

const FILTROS: Array<{ id: '' | CuvEstado; label: string }> = [
  { id: '', label: 'Todas' },
  { id: 'notificado', label: 'Notificadas' },
  { id: 'rechazado', label: 'Rechazadas' },
  { id: 'aprobado', label: 'Aprobadas' },
]

export function CuvValidationPage() {
  const [filtro, setFiltro] = useState<'' | CuvEstado>('')
  const [rows, setRows] = useState<CuvExpediente[]>([])
  const [selected, setSelected] = useState<CuvExpediente | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (estado: '' | CuvEstado) => {
    setLoading(true)
    setError('')
    try {
      const data = await listCuvExpedientes(estado || undefined)
      setRows(data.expedientes)
      setSelected((current) => {
        if (!current) return data.expedientes[0] ?? null
        return data.expedientes.find((item) => item.id === current.id) ?? data.expedientes[0] ?? null
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la bandeja.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(filtro)
  }, [filtro, load])

  const openDetail = async (row: CuvExpediente) => {
    setSelected(row)
    setBusy(true)
    setMessage('')
    try {
      const full = await consultCuvEstado({ id: row.id })
      setSelected(full)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar el estado.')
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    if (!selected) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const updated = await resendCuvPackage(selected.id)
      setSelected(updated)
      setMessage(
        updated.estado === 'aprobado'
          ? 'El paquete se reenvió y quedó aprobado.'
          : updated.estado === 'notificado'
            ? 'El paquete se reenvió. El CUV quedó notificado y requiere revisión.'
            : 'El ministerio volvió a rechazar el paquete.',
      )
      await load(filtro)
      setSelected(updated)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo reenviar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <RequirePermission permission="export.rips">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Validación CUV</h1>
          <p className="mt-1 text-sm text-slate-600">
            Cada factura o atención conserva el CUV, los intentos de envío y la respuesta del Ministerio.
            Desde aquí puede consultar el estado o reenviar el paquete.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            La radicación inicial sigue en{' '}
            <Link to="/rips" className="text-dental-600 hover:underline">
              Exportar RIPS
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTROS.map((item) => (
            <button
              key={item.id || 'todas'}
              type="button"
              onClick={() => setFiltro(item.id)}
              className={`rounded-full px-3 py-1 text-sm ${
                filtro === item.id ? 'bg-dental-700 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            {message}
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="card overflow-hidden">
            {loading ? (
              <p className="text-sm text-slate-500">Cargando validaciones…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-slate-500">
                Todavía no hay CUV registrados. Radique un paquete desde RIPS para abrir el expediente.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Factura</th>
                      <th className="px-2 py-2 font-medium">Estado</th>
                      <th className="px-2 py-2 font-medium">CUV</th>
                      <th className="px-2 py-2 font-medium">Intentos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className={selected?.id === row.id ? 'bg-dental-50/50' : undefined}
                      >
                        <td className="px-2 py-2">
                          <button type="button" className="font-medium text-dental-700" onClick={() => void openDetail(row)}>
                            {row.numFactura || 'Sin FEV'}
                          </button>
                          <p className="text-xs text-slate-500">{formatDate(row.updatedAt)}</p>
                        </td>
                        <td className="px-2 py-2">
                          <CuvEstadoBadge estado={row.estado} etiqueta={row.estadoEtiqueta} />
                        </td>
                        <td className="max-w-[12rem] truncate px-2 py-2 font-mono text-xs text-slate-700">
                          {row.cuv || '—'}
                        </td>
                        <td className="px-2 py-2">{row.intentos.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card space-y-4">
            {!selected ? (
              <p className="text-sm text-slate-500">Seleccione una factura para ver el historial.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">Factura / atención</p>
                    <h2 className="text-lg font-semibold text-slate-900">{selected.numFactura || 'Sin número FEV'}</h2>
                    <p className="max-w-full break-all font-mono text-xs text-slate-600">{selected.cuv || 'Sin CUV'}</p>
                  </div>
                  <CuvEstadoBadge estado={selected.estado} etiqueta={selected.estadoEtiqueta} />
                </div>

                <CuvAlertas alertas={selected.alertas} />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    disabled={busy}
                    onClick={() => void openDetail(selected)}
                  >
                    Consultar estado
                  </button>
                  <button
                    type="button"
                    className="btn-primary text-sm disabled:opacity-50"
                    disabled={busy || !selected.puedeReenviar}
                    onClick={() => void resend()}
                  >
                    {busy ? 'Procesando…' : 'Reenviar paquete'}
                  </button>
                </div>
                {!selected.puedeReenviar && (
                  <p className="text-xs text-slate-500">
                    Este expediente no conserva el JSON del paquete, así que no se puede reenviar desde aquí.
                  </p>
                )}

                <ol className="space-y-3">
                  {[...selected.intentos].reverse().map((intento) => (
                    <li key={intento.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800">Intento {intento.numero}</p>
                        <CuvEstadoBadge estado={intento.estado} etiqueta={intento.estadoEtiqueta} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(intento.finishedAt || intento.startedAt)}
                        {intento.httpStatus != null ? ` · HTTP ${intento.httpStatus}` : ''}
                        {intento.source ? ` · ${intento.source}` : ''}
                      </p>
                      {intento.respuestaCruda != null && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-medium text-slate-600">
                            Respuesta del Ministerio
                          </summary>
                          <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950 p-2 text-[11px] text-slate-100">
                            {JSON.stringify(intento.respuestaCruda, null, 2)}
                          </pre>
                        </details>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>
      </div>
    </RequirePermission>
  )
}
