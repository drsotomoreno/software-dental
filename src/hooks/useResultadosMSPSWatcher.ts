import { useEffect } from 'react'
import { aplicarResultadoMSPS, type ResultadoProcesoCuv } from '@/services/cuvProcessor'

interface ResultadoPendienteMSPS {
  id: string
  numFactura: string
  nombre: string
  contenido: string
}

/**
 * Mientras la aplicación está abierta, toma los archivos que el vigilante
 * del servidor ya leyó y escribe el CUV en Dexie.
 */
export function useResultadosMSPSWatcher() {
  useEffect(() => {
    let cancelado = false
    const enCurso = new Set<string>()

    const tick = async () => {
      let payload: { pendientes?: ResultadoPendienteMSPS[] }
      try {
        const response = await fetch('/api/rips/resultados-msps')
        if (!response.ok) return
        payload = (await response.json()) as { pendientes?: ResultadoPendienteMSPS[] }
      } catch {
        return
      }

      for (const item of payload.pendientes ?? []) {
        if (cancelado || enCurso.has(item.id)) continue
        enCurso.add(item.id)
        let resultado: ResultadoProcesoCuv
        try {
          resultado = await aplicarResultadoMSPS(item.numFactura, item.contenido, item.nombre)
        } catch {
          enCurso.delete(item.id)
          continue
        }
        const faltaRegistro = String(resultado.error ?? '').includes('No hay un RIPS local')
        if (faltaRegistro) {
          enCurso.delete(item.id)
          continue
        }
        window.dispatchEvent(new CustomEvent('rips-cuv-aplicado', { detail: { ...resultado, numFactura: item.numFactura } }))
        try {
          await fetch(`/api/rips/resultados-msps/${item.id}/aplicado`, { method: 'POST' })
        } catch {
          enCurso.delete(item.id)
        }
      }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), 2000)
    return () => {
      cancelado = true
      window.clearInterval(timer)
    }
  }, [])
}
