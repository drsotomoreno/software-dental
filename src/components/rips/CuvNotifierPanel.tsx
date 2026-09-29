import { useEffect, useState } from 'react'
import { consultarCuvPorFactura, type CuvFacturaConsulta } from '@/services/ripsApiService'

type CuvServerRecord = NonNullable<CuvFacturaConsulta['data']>

interface CuvNotifierPanelProps {
  numFactura: string
}

function etiquetaEstado(status?: string | null) {
  if (status === 'approved') return 'APROBADO'
  if (status === 'rejected') return 'RECHAZADO'
  if (status === 'pending') return 'PENDIENTE'
  return status?.trim() || 'PENDIENTE'
}

export function CuvNotifierPanel({ numFactura }: CuvNotifierPanelProps) {
  const [estadoServer, setEstadoServer] = useState<CuvServerRecord | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const factura = numFactura.trim()
    if (!factura) {
      setEstadoServer(null)
      setCargando(false)
      return
    }

    let cancelled = false
    setCargando(true)
    setEstadoServer(null)

    const verificarCuvServidor = async () => {
      try {
        const resultado = await consultarCuvPorFactura(factura)
        if (cancelled) return
        setEstadoServer(resultado.success && resultado.data ? resultado.data : null)
      } catch (error) {
        console.error('Error consultando CUV:', error)
      } finally {
        if (!cancelled) setCargando(false)
      }
    }

    void verificarCuvServidor()
    const interval = setInterval(() => {
      void verificarCuvServidor()
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [numFactura])

  if (!numFactura.trim()) return null

  if (cargando) {
    return <div className="text-sm text-gray-400">Verificando CUV en el servidor...</div>
  }

  const aprobado = estadoServer?.status === 'approved'

  return (
    <div className="my-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-gray-800">Estado servidor: {numFactura}</h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            aprobado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {etiquetaEstado(estadoServer?.status)}
        </span>
      </div>
      {estadoServer?.cuv ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
            Código Único de Validación (CUV):
          </p>
          <p className="mt-1 select-all font-mono text-sm font-bold text-emerald-900">
            {estadoServer.cuv}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-500">
          Esperando respuesta de validación central del Ministerio...
        </p>
      )}
    </div>
  )
}
