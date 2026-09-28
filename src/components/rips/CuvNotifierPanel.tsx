import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2 } from 'lucide-react'
import { db } from '@/db/database'
import type { EstadoValidacionRips, LocalRipsRecord } from '@/db/localRipsDatabase'

interface CuvNotifierPanelProps {
  numFactura: string
}

function mismaFactura(a: string, b: string) {
  return a.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === b.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

function etiquetaEstado(estado: EstadoValidacionRips) {
  switch (estado) {
    case 'APROBADO_MSPS':
      return 'Aprobado por el Ministerio'
    case 'RECHAZADO':
      return 'Rechazado'
    case 'VALIDO_LOCAL':
    case 'VALIDO':
      return 'Válido en este equipo'
    case 'PENDIENTE':
      return 'Pendiente'
    default:
      return estado
  }
}

function claseEstado(estado: EstadoValidacionRips) {
  if (estado === 'APROBADO_MSPS') return 'bg-emerald-100 text-emerald-800'
  if (estado === 'RECHAZADO') return 'bg-red-100 text-red-800'
  return 'bg-amber-100 text-amber-800'
}

/**
 * Sigue el paquete en Dexie. El aviso aparece cuando el estado pasa a APROBADO_MSPS.
 */
export function CuvNotifierPanel({ numFactura }: CuvNotifierPanelProps) {
  const registro = useLiveQuery(async () => {
    const exactos = await db.ripsRecords.where('numFactura').equals(numFactura).toArray()
    const filas =
      exactos.length > 0
        ? exactos
        : (await db.ripsRecords.toArray()).filter((fila) => mismaFactura(fila.numFactura, numFactura))
    const ordenados = [...filas].sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
    return ordenados[0] ?? null
  }, [numFactura])

  const [mostrarToast, setMostrarToast] = useState(false)
  const estadoAnterior = useRef<EstadoValidacionRips | null>(null)
  const consultaLista = useRef(false)

  useEffect(() => {
    if (registro === undefined) return
    const estado = registro?.estadoValidacion ?? null
    const yaObservado = consultaLista.current
    consultaLista.current = true
    const llegoAprobacion =
      yaObservado &&
      estadoAnterior.current !== 'APROBADO_MSPS' &&
      estado === 'APROBADO_MSPS' &&
      Boolean(registro?.cuv)
    estadoAnterior.current = estado
    if (!llegoAprobacion) return

    setMostrarToast(true)
    const timer = window.setTimeout(() => setMostrarToast(false), 6000)
    return () => window.clearTimeout(timer)
  }, [registro])

  if (registro === undefined) {
    return <p className="mt-4 text-sm text-slate-400">Buscando registros locales para la factura {numFactura}…</p>
  }

  return (
    <div className="relative mt-4">
      {mostrarToast && registro?.cuv && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-emerald-400 bg-emerald-600 px-5 py-4 text-white shadow-2xl"
        >
          <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden="true" />
          <div>
            <h4 className="text-sm font-bold">CUV generado y guardado</h4>
            <p className="text-xs text-emerald-100">Factura {numFactura} validada con éxito por el Ministerio.</p>
          </div>
        </div>
      )}

      <TarjetaEstado numFactura={numFactura} registro={registro} />
    </div>
  )
}

function TarjetaEstado({
  numFactura,
  registro,
}: {
  numFactura: string
  registro: LocalRipsRecord | null
}) {
  if (!registro) {
    return (
      <p className="text-sm text-slate-500">No hay un paquete local para la factura {numFactura}.</p>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-800">Estado RIPS / FEV: {numFactura}</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${claseEstado(registro.estadoValidacion)}`}>
          {etiquetaEstado(registro.estadoValidacion)}
        </span>
      </div>

      {registro.cuv ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
            Código Único de Validación (CUV)
          </p>
          <p className="mt-1 select-all break-all font-mono text-sm font-bold text-emerald-900">{registro.cuv}</p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          {registro.estadoValidacion === 'PENDIENTE'
            ? 'Esperando validación local.'
            : registro.estadoValidacion === 'RECHAZADO'
              ? registro.mensajeRespuesta || 'El paquete fue rechazado.'
              : 'Validado en este equipo. Esperando el archivo de respuesta del Ministerio (_A_CUV).'}
        </p>
      )}
    </div>
  )
}
