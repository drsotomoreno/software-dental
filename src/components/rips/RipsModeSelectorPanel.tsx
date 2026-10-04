import { useEffect, useRef, useState } from 'react'
import type { RipsUsuario } from '@/types/rips'
import { enviarPaqueteRips } from '@/services/ripsApiService'

export interface RipsModoTransmision {
  esSinFactura: boolean
  numDocumentoIdObligado: string
  numFactura: string | null
  tipoNota: 'RS' | null
  numNota: string | null
}

interface RipsModeSelectorPanelProps {
  nitInicial?: string
  numFacturaInicial?: string
  numNotaInicial?: string
  usuarios?: RipsUsuario[]
  bloqueado?: boolean
  aviso?: string
  onModoChange?: (modo: RipsModoTransmision) => void
}

export function RipsModeSelectorPanel({
  nitInicial = '',
  numFacturaInicial = '',
  numNotaInicial = 'NOTA-RS-001',
  usuarios = [],
  bloqueado = false,
  aviso,
  onModoChange,
}: RipsModeSelectorPanelProps) {
  const [esSinFactura, setEsSinFactura] = useState(false)
  const [numFactura, setNumFactura] = useState(numFacturaInicial)
  const [numNota, setNumNota] = useState(numNotaInicial)
  const [nitObligado, setNitObligado] = useState(nitInicial)
  const [cargando, setCargando] = useState(false)
  const [mensajeResultado, setMensajeResultado] = useState<string | null>(null)
  const nitTouched = useRef(false)
  const facturaTouched = useRef(false)

  useEffect(() => {
    if (!nitTouched.current && nitInicial) {
      setNitObligado(nitInicial)
    }
  }, [nitInicial])

  useEffect(() => {
    if (!facturaTouched.current && numFacturaInicial) {
      setNumFactura(numFacturaInicial)
    }
  }, [numFacturaInicial])

  const emitir = (
    sinFactura: boolean,
    nit: string,
    factura: string,
    nota: string,
  ) => {
    onModoChange?.({
      esSinFactura: sinFactura,
      numDocumentoIdObligado: nit,
      numFactura: sinFactura ? null : factura.trim() || null,
      tipoNota: sinFactura ? 'RS' : null,
      numNota: sinFactura ? nota.trim() || null : null,
    })
  }

  const handleEnviar = async () => {
    setCargando(true)
    setMensajeResultado(null)
    const payload = {
      numDocumentoIdObligado: nitObligado.trim(),
      numFactura: esSinFactura ? null : numFactura.trim() || null,
      tipoNota: esSinFactura ? ('RS' as const) : null,
      numNota: esSinFactura ? numNota.trim() || null : null,
      usuarios,
    }

    try {
      const resultado = await enviarPaqueteRips(payload)
      if (resultado.success) {
        setMensajeResultado(
          `Envío exitoso. CUV asignado: ${resultado.cuv || 'Procesando...'}`,
        )
      } else {
        setMensajeResultado(`Error: ${resultado.error || 'No se pudo transmitir el paquete.'}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error de red'
      setMensajeResultado(`Error de red: ${message}`)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-bold text-slate-800">Módulo de Transmisión RIPS</h2>
      <p className="mb-4 text-xs text-slate-500">
        {usuarios.length === 0
          ? 'Seleccione historias firmadas. El envío incluye los usuarios de esa selección.'
          : `Se transmitirán ${usuarios.length} usuario(s) de las atenciones seleccionadas.`}
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3">
        <label className="text-sm font-medium text-slate-700">Modalidad:</label>
        <button
          type="button"
          onClick={() => {
            setEsSinFactura(false)
            emitir(false, nitObligado, numFactura, numNota)
          }}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            !esSinFactura ? 'bg-blue-600 text-white shadow' : 'bg-slate-200 text-slate-700'
          }`}
        >
          Con Factura Electrónica (FEV)
        </button>
        <button
          type="button"
          onClick={() => {
            setEsSinFactura(true)
            emitir(true, nitObligado, numFactura, numNota)
          }}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            esSinFactura ? 'bg-emerald-600 text-white shadow' : 'bg-slate-200 text-slate-700'
          }`}
        >
          RIPS sin Factura (RS)
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            NIT del Obligado / Prestador:
          </label>
          <input
            type="text"
            value={nitObligado}
            onChange={(event) => {
              nitTouched.current = true
              const value = event.target.value
              setNitObligado(value)
              emitir(esSinFactura, value, numFactura, numNota)
            }}
            className="w-full rounded-md border px-3 py-2 font-mono text-sm"
          />
        </div>

        {esSinFactura ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-emerald-700">
              Número de Nota Interno (numNota - Requerido para RS):
            </label>
            <input
              type="text"
              value={numNota}
              onChange={(event) => {
                const value = event.target.value
                setNumNota(value)
                emitir(true, nitObligado, numFactura, value)
              }}
              className="w-full rounded-md border border-emerald-300 bg-emerald-50/30 px-3 py-2 font-mono text-sm"
            />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium text-blue-700">
              Número de Factura Electrónica (numFactura):
            </label>
            <input
              type="text"
              value={numFactura}
              onChange={(event) => {
                facturaTouched.current = true
                const value = event.target.value
                setNumFactura(value)
                emitir(false, nitObligado, value, numNota)
              }}
              placeholder="FV1024"
              className="w-full rounded-md border border-blue-300 bg-blue-50/30 px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Prefijo + número, sin espacios ni guiones (ejemplo FV1024).
            </p>
          </div>
        )}

        {aviso && <p className="text-xs text-amber-800">{aviso}</p>}

        <button
          type="button"
          onClick={() => void handleEnviar()}
          disabled={cargando || bloqueado}
          className={`w-full rounded-lg px-4 py-2.5 font-medium text-white shadow-sm transition ${
            esSinFactura ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
          } ${cargando || bloqueado ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          {cargando
            ? 'Transmitiendo al Ministerio...'
            : esSinFactura
              ? 'Enviar RIPS sin Factura (RS)'
              : 'Validar FEV + RIPS'}
        </button>

        {mensajeResultado && (
          <div className="mt-3 rounded-lg border bg-slate-50 p-3 font-mono text-xs text-slate-800">
            {mensajeResultado}
          </div>
        )}
      </div>
    </div>
  )
}
