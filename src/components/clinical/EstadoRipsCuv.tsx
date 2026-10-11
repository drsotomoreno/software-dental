import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Copy, Loader2, RefreshCw } from 'lucide-react'
import type { ClinicalRecord } from '@/types/clinicalRecord'
import { textoCorreccionRips } from '@/utils/estadoRipsCuv'

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

export interface EstadoRipsCuvProps {
  estadoMuv?: EstadoRips
  cuv?: string | null
  resultadoValidacion?: unknown
  /** Aclaración breve, por ejemplo «Última atención cerrada». */
  contexto?: string
  onReintentar?: () => void
  reintentando?: boolean
  aviso?: string | null
}

function BotonReintento({
  onReintentar,
  reintentando,
}: {
  onReintentar?: () => void
  reintentando: boolean
}) {
  if (!onReintentar) return null
  return (
    <button
      type="button"
      className="btn-secondary shrink-0 gap-2 text-sm"
      disabled={reintentando}
      onClick={(event) => {
        event.stopPropagation()
        onReintentar()
      }}
    >
      {reintentando ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="h-4 w-4" aria-hidden />
      )}
      {reintentando ? 'Enviando al Ministerio…' : 'Reintentar Envío MUV'}
    </button>
  )
}

export function EstadoRipsCuv({
  estadoMuv,
  cuv,
  resultadoValidacion,
  contexto,
  onReintentar,
  reintentando = false,
  aviso,
}: EstadoRipsCuvProps) {
  const [copiado, setCopiado] = useState(false)
  const codigo = cuv?.trim() ?? ''

  if (estadoMuv === 'APROBADO') {
    return (
      <div
        role="status"
        className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              {contexto ? (
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  {contexto}
                </p>
              ) : null}
              <p className="text-sm font-medium leading-relaxed">
                RIPS enviado exitosamente.
                {codigo ? (
                  <>
                    {' '}
                    CUV: <span className="break-all font-mono text-[13px] font-semibold">{codigo}</span>
                  </>
                ) : null}
              </p>
              <p className="mt-1 text-xs text-emerald-800">
                El Ministerio ya recibió este RIPS. No hace falta volver a enviarlo.
              </p>
            </div>
          </div>
          {codigo ? (
            <button
              type="button"
              className="btn-secondary shrink-0 gap-2 text-sm"
              aria-label="Copiar CUV"
              onClick={(event) => {
                event.stopPropagation()
                void copiarTexto(codigo).then(() => {
                  setCopiado(true)
                  window.setTimeout(() => setCopiado(false), 1600)
                })
              }}
            >
              <Copy className="h-4 w-4" aria-hidden />
              {copiado ? 'Copiado' : 'Copiar CUV'}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (estadoMuv === 'RECHAZADO') {
    const correccion = textoCorreccionRips(resultadoValidacion)
    return (
      <div
        role="alert"
        className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-orange-950"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white">
              <AlertTriangle className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              {contexto ? (
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-orange-700">
                  {contexto}
                </p>
              ) : null}
              <p className="text-sm font-medium leading-relaxed">
                El Ministerio solicitó una corrección en este RIPS: {correccion}
              </p>
              <p className="mt-1 text-xs text-orange-800">
                La nota clínica sigue guardada. Cuando el dato esté corregido, reenvíe el RIPS desde aquí.
              </p>
            </div>
          </div>
          <BotonReintento onReintentar={onReintentar} reintentando={reintentando} />
        </div>
        {aviso ? <p className="mt-3 text-sm text-orange-900 sm:pl-11">{aviso}</p> : null}
      </div>
    )
  }

  return (
    <div
      role="status"
      className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-950"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
            {reintentando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Clock className="h-4 w-4" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            {contexto ? (
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                {contexto}
              </p>
            ) : null}
            <p className="text-sm font-medium leading-relaxed">RIPS pendiente de envío al Ministerio</p>
            <p className="mt-1 text-xs text-sky-800">
              La atención ya quedó guardada. Si el envío automático no salió por la red, puede reintentarlo.
            </p>
          </div>
        </div>
        <BotonReintento onReintentar={onReintentar} reintentando={reintentando} />
      </div>
      {aviso ? <p className="mt-3 text-sm text-sky-900 sm:pl-11">{aviso}</p> : null}
    </div>
  )
}
