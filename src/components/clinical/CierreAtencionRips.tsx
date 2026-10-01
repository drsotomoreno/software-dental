import { useEffect, useState } from 'react'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { Patient } from '@/types/patient'
import type { RipsUsuario } from '@/types/rips'
import type { UserProfile } from '@/types/user'
import { procesarRipsCierre } from '@/services/ripsApiService'
import {
  buildUsuariosCierreAtencion,
  insertLocalRipsRecord,
  resolveCierreRipsHeader,
  suggestNumNotaRs,
  updateLocalRipsRecord,
  validationStatusFromProcesar,
} from '@/services/localRipsRecordService'
import { resolveRipsNit } from '@/utils/rips'

export interface CierreAtencionRipsProps {
  patient?: Patient | null
  professional?: UserProfile | null
  clinicalData?: ClinicalRecordFormData | null
  clinicalRecordId?: string | number | null
  disabled?: boolean
}

export function CierreAtencionRips({
  patient,
  professional,
  clinicalData,
  clinicalRecordId,
  disabled = false,
}: CierreAtencionRipsProps) {
  const [esSinFactura, setEsSinFactura] = useState(true)
  const [numFactura, setNumFactura] = useState('')
  const [numNota, setNumNota] = useState(() => suggestNumNotaRs())
  const [nitObligado, setNitObligado] = useState(() =>
    professional ? resolveRipsNit(professional) : '900123456',
  )
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)

  useEffect(() => {
    if (!professional) return
    setNitObligado((current) => {
      const resolved = resolveRipsNit(professional)
      return current === '900123456' || current.trim() === '' ? resolved : current
    })
  }, [professional])

  const handleProcesarRips = async () => {
    if (disabled || cargando) return
    setCargando(true)
    setResultado(null)

    const header = resolveCierreRipsHeader({
      esSinFactura,
      numFactura,
      numNota,
      numDocumentoIdObligado: nitObligado,
    })

    let usuarios: RipsUsuario[] = []
    try {
      if (patient && professional && clinicalData) {
        usuarios = buildUsuariosCierreAtencion({
          patient,
          professional,
          clinicalData,
          clinicalRecordId,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo armar el paquete clínico.'
      setResultado(`❌ Error: ${message}`)
      setCargando(false)
      return
    }

    const payload = {
      ...header,
      usuarios,
    }

    let localId: number | null = null
    try {
      localId = await insertLocalRipsRecord({
        numFactura: header.numFactura,
        numNota: header.numNota,
        tipoNota: header.tipoNota,
        numDocumentoIdObligado: header.numDocumentoIdObligado,
        payloadJson: JSON.stringify(payload),
        estadoValidacion: 'PENDIENTE',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el RIPS local.'
      setResultado(`❌ Error: ${message}`)
      setCargando(false)
      return
    }

    try {
      const data = await procesarRipsCierre(payload)
      const estado = validationStatusFromProcesar(data)
      if (localId != null) {
        await updateLocalRipsRecord(localId, {
          estadoValidacion: estado,
          cuv: data.cuv,
          payloadJson: JSON.stringify(payload),
        })
      }
      if (data.success) {
        setResultado(`✅ RIPS procesado con éxito. CUV: ${data.cuv || 'Generado'}`)
      } else {
        setResultado(`❌ Error: ${data.error || 'No se pudo procesar el RIPS.'}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error de conexión'
      if (localId != null) {
        await updateLocalRipsRecord(localId, { estadoValidacion: 'RECHAZADO' }).catch(() => undefined)
      }
      setResultado(`❌ Error de conexión: ${message}`)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="mx-auto my-6 max-w-2xl rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="mb-2 text-base font-bold text-gray-800">🦷 Cierre de Atención y Destino RIPS</h3>
      <p className="mb-5 text-xs text-gray-500">
        Indique si esta atención odontológica requiere asociarse a una Factura Electrónica (FEV) o si se
        reporta como RIPS sin factura.
      </p>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={disabled || cargando}
          onClick={() => setEsSinFactura(true)}
          className={`rounded-xl border p-3 text-left transition ${
            esSinFactura
              ? 'border-emerald-500 bg-emerald-50/50 font-semibold text-emerald-900'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <div className="text-sm">RIPS sin Factura (RS)</div>
          <div className="mt-0.5 text-[11px] font-normal opacity-80">
            Para consultas particulares o atenciones libres de FEV unitaria.
          </div>
        </button>
        <button
          type="button"
          disabled={disabled || cargando}
          onClick={() => setEsSinFactura(false)}
          className={`rounded-xl border p-3 text-left transition ${
            !esSinFactura
              ? 'border-blue-500 bg-blue-50/50 font-semibold text-blue-900'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <div className="text-sm">Asociado a FEV</div>
          <div className="mt-0.5 text-[11px] font-normal opacity-80">
            Para convenios, EPS o pacientes con factura electrónica.
          </div>
        </button>
      </div>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="cierre-rips-nit">
            NIT / Identificación del Prestador:
          </label>
          <input
            id="cierre-rips-nit"
            type="text"
            value={nitObligado}
            disabled={disabled || cargando}
            onChange={(event) => setNitObligado(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
          />
        </div>
        {esSinFactura ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-emerald-700" htmlFor="cierre-rips-nota">
              Consecutivo Interno de Nota (numNota):
            </label>
            <input
              id="cierre-rips-nota"
              type="text"
              value={numNota}
              disabled={disabled || cargando}
              onChange={(event) => setNumNota(event.target.value)}
              className="w-full rounded-lg border border-emerald-300 bg-emerald-50/20 px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Generado automáticamente por el EMR para el control normativo sin FEV. tipoNota queda en RS y
              numFactura en null.
            </p>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium text-blue-700" htmlFor="cierre-rips-fev">
              Número de Factura Electrónica (numFactura):
            </label>
            <input
              id="cierre-rips-fev"
              type="text"
              value={numFactura}
              placeholder="Ej. FEV1025"
              disabled={disabled || cargando}
              onChange={(event) => setNumFactura(event.target.value)}
              className="w-full rounded-lg border border-blue-300 bg-blue-50/20 px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Prefijo y consecutivo sin guiones, como los exige el validador MUV.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => void handleProcesarRips()}
          disabled={disabled || cargando}
          className={`w-full rounded-xl py-3 font-medium text-white shadow-sm transition ${
            esSinFactura ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
          } ${disabled || cargando ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          {cargando ? 'Generando y Validando RIPS...' : 'Guardar y Transmitir al Ministerio'}
        </button>
        {resultado && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-800">
            {resultado}
          </div>
        )}
      </div>
    </div>
  )
}
