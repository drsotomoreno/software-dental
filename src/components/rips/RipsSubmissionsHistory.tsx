import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Copy } from 'lucide-react'
import { db } from '@/db/database'
import { belongsToCurrentClinic } from '@/services/clinicLocalIsolation'
import type { RipsSubmission } from '@/types/ripsSubmission'
import { formatDate } from '@/utils'

function truncarCuv(cuv: string): string {
  const codigo = cuv.trim()
  if (!codigo) return '—'
  if (codigo.length <= 12) return codigo
  return `${codigo.slice(0, 8)}…${codigo.slice(-4)}`
}

function payloadComoTexto(payload: unknown): string {
  if (typeof payload === 'string') return payload
  return JSON.stringify(payload, null, 2)
}

function descargarPayloadJson(row: RipsSubmission): void {
  const json = payloadComoTexto(row.payload_json)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const fecha = row.fecha_radicacion.slice(0, 10) || 'rips'
  const marca = (row.cuv || row.id).replace(/[^\w.-]+/g, '').slice(0, 12) || 'radicado'
  link.href = url
  link.download = `rips-${fecha}-${marca}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function copiarCuv(cuv: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(cuv)
  } catch {
    const area = document.createElement('textarea')
    area.value = cuv
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

function CeldaCuv({ cuv }: { cuv: string }) {
  const [copiado, setCopiado] = useState(false)
  const codigo = cuv.trim()

  return (
    <div className="flex items-center gap-1.5">
      <code className="font-mono text-xs text-slate-700" title={codigo || undefined}>
        {truncarCuv(codigo)}
      </code>
      {codigo ? (
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          aria-label="Copiar CUV completo"
          onClick={() => {
            void copiarCuv(codigo).then(() => {
              setCopiado(true)
              window.setTimeout(() => setCopiado(false), 1600)
            })
          }}
        >
          <Copy className="h-3 w-3" aria-hidden />
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      ) : null}
    </div>
  )
}

/**
 * Tarjeta 3 de Exportación RIPS: historial local ordenado por fecha de radicación.
 */
export function RipsSubmissionsHistory() {
  const submissions = useLiveQuery(async () => {
    const rows = await db.rips_submissions.orderBy('fecha_radicacion').reverse().toArray()
    return rows.filter((row) => belongsToCurrentClinic(row))
  })

  return (
    <div className="card space-y-4">
      <h2 className="text-base font-semibold text-slate-800">
        3. Historial de RIPS Radicados
      </h2>

      {!submissions ? (
        <p className="text-sm text-slate-500">Cargando historial...</p>
      ) : submissions.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aún no hay radicaciones guardadas en este equipo.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Fecha
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  CUV
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Atenciones
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {submissions.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {formatDate(row.fecha_radicacion)}
                  </td>
                  <td className="px-3 py-2">
                    <CeldaCuv cuv={row.cuv} />
                  </td>
                  <td className="px-3 py-2 text-slate-700">{row.cantidad_historias}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="btn-secondary px-2.5 py-1 text-xs"
                      onClick={() => descargarPayloadJson(row)}
                    >
                      Descargar JSON
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
