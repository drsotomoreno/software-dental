import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Copy } from 'lucide-react'
import type { ClinicalRecord } from '@/types/clinicalRecord'
import { mensajesResultadoValidacion } from '@/utils/estadoRipsCuv'

type EstadoRips = ClinicalRecord['estadoMuv']

async function copiarTexto(texto: string) {
  try {
    await navigator.clipboard.writeText(texto)
  } catch {
    const area = document.createElement('textarea')
    area.value = texto
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

function PanelRechazo({ id, mensajes }: { id: string; mensajes: string[] }) {
  return (
    <div
      id={id}
      role="tooltip"
      className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-red-200 bg-white p-3 text-left text-xs leading-relaxed text-red-950 shadow-lg"
    >
      <p className="mb-1 font-semibold text-red-800">Estado RIPS</p>
      <ul className="list-disc space-y-1 pl-4">
        {mensajes.map((mensaje, index) => (
          <li key={`${index}-${mensaje}`}>{mensaje}</li>
        ))}
      </ul>
    </div>
  )
}

export function EstadoRipsCuv({
  estadoMuv,
  cuv,
  resultadoValidacion,
}: {
  estadoMuv?: EstadoRips
  cuv?: string | null
  resultadoValidacion?: unknown
}) {
  const panelId = useId()
  const contenedor = useRef<HTMLDivElement>(null)
  const [copiado, setCopiado] = useState(false)
  const [sobre, setSobre] = useState(false)
  const [fijo, setFijo] = useState(false)
  const mensajes = mensajesResultadoValidacion(resultadoValidacion)
  const detalleVisible = sobre || fijo

  useEffect(() => {
    if (!fijo) return
    const cerrarSiSale = (event: MouseEvent) => {
      if (!contenedor.current?.contains(event.target as Node)) setFijo(false)
    }
    const cerrarConEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFijo(false)
    }
    document.addEventListener('mousedown', cerrarSiSale)
    document.addEventListener('keydown', cerrarConEscape)
    return () => {
      document.removeEventListener('mousedown', cerrarSiSale)
      document.removeEventListener('keydown', cerrarConEscape)
    }
  }, [fijo])

  if (estadoMuv === 'APROBADO') {
    return (
      <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Aprobado
        </span>
        {cuv ? (
          <>
            <code className="max-w-[7.5rem] truncate font-mono text-[11px] text-slate-600" title={cuv}>
              {cuv}
            </code>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              aria-label="Copiar CUV"
              onClick={(event) => {
                event.stopPropagation()
                void copiarTexto(cuv).then(() => {
                  setCopiado(true)
                  window.setTimeout(() => setCopiado(false), 1600)
                })
              }}
            >
              <Copy className="h-3 w-3" aria-hidden />
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </>
        ) : null}
      </div>
    )
  }

  if (estadoMuv === 'RECHAZADO') {
    return (
      <div
        ref={contenedor}
        className="relative"
        onMouseEnter={() => setSobre(true)}
        onMouseLeave={() => setSobre(false)}
      >
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 hover:bg-red-200"
          aria-expanded={detalleVisible}
          aria-describedby={detalleVisible ? panelId : undefined}
          aria-label="Ver por qué el RIPS fue rechazado"
          onClick={(event) => {
            event.stopPropagation()
            setFijo((valor) => !valor)
          }}
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          Rechazado
        </button>
        {detalleVisible ? <PanelRechazo id={panelId} mensajes={mensajes} /> : null}
      </div>
    )
  }

  if (estadoMuv === 'PENDIENTE') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
        title="El envío al MUV está en proceso."
      >
        <Clock className="h-3.5 w-3.5" aria-hidden />
        Pendiente
      </span>
    )
  }

  return <span className="text-xs text-slate-400">Sin RIPS</span>
}
