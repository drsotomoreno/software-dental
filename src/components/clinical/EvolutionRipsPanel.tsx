import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, Download, Rocket } from 'lucide-react'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/useToast'
import { listPatientElectronicInvoices } from '@/services/invoiceService'
import { routeDictatedEvolutionByFiscalProfile } from '@/services/ripsApiService'
import { Toast } from '@/components/ui/Toast'
import {
  isEvolutionNoteAddendum,
  isEvolutionNoteImmutable,
  type EvolutionNote,
  type EvolutionNotePatch,
} from '@/types/evolutionNote'
import { evaluarTransmisionAnticipo } from '../../../shared/reciboAnticipoRips.js'
import type { OrthodonticsPaymentRecord, PaymentRecord } from '@/types/clinicalRecord'
import {
  EvolutionNoteRipsMetadataError,
  RIPS_CONCEPTO_RECAUDO_DEFAULT,
  applyEvolutionNoteRipsMetadata,
  createDefaultEvolutionNoteRipsMetadata,
  type EvolutionNoteRipsMetadata,
  type RipsEstadoTransmision,
  type TipoVinculacionFinanciera,
} from '@/types/evolutionNoteRips'
import { formatCurrency } from '@/utils/crypto'
import {
  armarOpcionesPago,
  etiquetaOpcionPago,
  type PagoVinculable,
} from '@/utils/evolutionPaymentOptions'
import { toDexiePrimaryKey, toPatientForeignKey } from '@/utils/patientId'
import { Cie10PrincipalCombobox } from './Cie10PrincipalCombobox'
import {
  EvolutionRipsPayloadError,
  armarRipsNotaEvolucion,
  mensajeCampoRips,
  type PacienteRipsIdentidad,
} from '@/utils/evolutionRipsPayload'

const OPCIONES_VINCULO: Array<{ value: TipoVinculacionFinanciera; label: string }> = [
  { value: 'recibo_interno', label: 'Recibo de caja interno' },
  { value: 'fev', label: 'Factura electrónica (FEV)' },
  { value: 'valor_cero', label: 'Atención valor $0 / control' },
]

function mismoRecibo(origen: EvolutionNote, candidata: EvolutionNote): boolean {
  const soporteOrigen = String(origen.numeroSoportePago ?? '').trim()
  const soporte = String(candidata.numeroSoportePago ?? '').trim()
  if (soporteOrigen && soporteOrigen === soporte) return true
  const pagoOrigen = String(origen.pagoId ?? origen.ripsMetadata?.idReciboAsociado ?? '').trim()
  const pago = String(candidata.pagoId ?? candidata.ripsMetadata?.idReciboAsociado ?? '').trim()
  return Boolean(pagoOrigen && pagoOrigen === pago)
}

function notaAEvolucionRips(note: EvolutionNote) {
  const firmada = isEvolutionNoteImmutable(note)
  return {
    id: note.id,
    descripcion: note.procedure?.trim() || note.serviceName?.trim() || 'Evolución',
    fechaEvolucion: note.date,
    signedAt: firmada ? note.signedAt : undefined,
    firmada,
    isLocked: firmada,
    sinFirmar: !firmada,
  }
}

function metadataDe(note: EvolutionNote): EvolutionNoteRipsMetadata {
  return note.ripsMetadata ?? createDefaultEvolutionNoteRipsMetadata()
}

/**
 * Si la nota todavía no guardó `ripsMetadata`, el radio sigue el cobro real:
 * una atención con tarifa no aparece como control de $0.
 */
function tipoEfectivo(note: EvolutionNote): TipoVinculacionFinanciera {
  if (note.ripsMetadata) return note.ripsMetadata.tipoVinculacionFinanciera
  if ((note.cost ?? 0) === 0 || note.isBillable === false || note.estadoRips === 'SIN_COSTO') {
    return 'valor_cero'
  }
  return 'recibo_interno'
}

function documentoRipsDeNota(note: EvolutionNote) {
  const metadata = metadataDe(note)
  return {
    codDiagnosticoPrincipal: metadata.codDiagnosticoPrincipal,
    tipoVinculacionFinanciera: metadata.tipoVinculacionFinanciera,
    idReciboAsociado: metadata.idReciboAsociado,
    idFacturaElectronica: metadata.idFacturaElectronica,
    causaMotivoAtencion: metadata.causaMotivoAtencion,
    finalidadTecnologia: metadata.finalidadTecnologia,
    conceptoRecaudo: metadata.conceptoRecaudo,
    cups: note.cupsCode ?? null,
    procedimiento: note.procedure,
    fechaAtencion: note.date,
    vrServicio:
      metadata.tipoVinculacionFinanciera === 'valor_cero'
        ? 0
        : (note.valorProcedimiento ?? note.cost ?? 0),
    cuv: metadata.cuv,
  }
}

function descargarTexto(filename: string, contenido: string, type: string) {
  const blob = new Blob([contenido], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function EvolutionRipsEstadoBadge({ note }: { note: EvolutionNote }) {
  const metadata = metadataDe(note)
  const estado: RipsEstadoTransmision = metadata.ripsEstado
  if (estado === 'enviado_ok') {
    return (
      <span className="inline-flex max-w-xs items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
        <span className="truncate">
          RIPS transmitido{metadata.cuv ? ` (CUV: ${metadata.cuv})` : ''}
        </span>
      </span>
    )
  }
  if (estado === 'preparado' || estado === 'error') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900"
        title={estado === 'error' ? metadata.ripsErrorLog ?? undefined : undefined}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
        {estado === 'error' ? 'RIPS: error previo' : 'RIPS: listo para enviar'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
      <span className="h-2 w-2 shrink-0 rounded-full bg-slate-400" aria-hidden />
      RIPS: sin preparar
    </span>
  )
}

interface EvolutionRipsPanelProps {
  note: EvolutionNote
  patientId?: string
  paciente?: PacienteRipsIdentidad
  pagosActuales?: Array<PaymentRecord | OrthodonticsPaymentRecord>
  /** Evoluciones del mismo expediente, para no transmitir un anticipo a medias. */
  notasPaquete?: EvolutionNote[]
  disabled?: boolean
  /** La nota firmada congela la tarifa clínica, no la metadata RIPS. */
  clinicalLocked?: boolean
  showDiagnosis?: boolean
  onChange: (patch: EvolutionNotePatch) => void
}

export function EvolutionRipsPanel({
  note,
  patientId = '',
  paciente,
  pagosActuales = [],
  notasPaquete = [],
  disabled = false,
  clinicalLocked = false,
  showDiagnosis = false,
  onChange,
}: EvolutionRipsPanelProps) {
  const { user } = useAuth()
  const metadata = metadataDe(note)
  const tipo = tipoEfectivo(note)
  const valorCero = tipo === 'valor_cero'
  const [isLoading, setIsLoading] = useState(false)
  const [verCuv, setVerCuv] = useState(false)
  const [modalAnticipo, setModalAnticipo] = useState(false)
  const [mensajeLocal, setMensajeLocal] = useState('')
  const { toastMessage, showToast, clearToast } = useToast(8000)
  const pagosKey = pagosActuales
    .map((pago) => `${pago.id}:${pago.amount}:${pago.paymentDate}`)
    .join('|')

  const opciones = useLiveQuery(async () => {
    const pagos: PagoVinculable[] = pagosActuales.map((pago) => ({
      id: pago.id,
      paymentDate: pago.paymentDate,
      amount: pago.amount,
      paymentReason: pago.paymentReason,
      invoices: pago.invoices,
      documentKind: 'documentKind' in pago ? pago.documentKind : undefined,
    }))
    if (!patientId) return armarOpcionesPago({ pagos })

    const key = toPatientForeignKey(patientId)
    const numeric = toDexiePrimaryKey(patientId)
    const [porTexto, porNumero, facturas] = await Promise.all([
      db.clinicalRecords.where('patientId').equals(key).toArray(),
      typeof numeric === 'number'
        ? db.clinicalRecords.where('patientId').equals(numeric).toArray()
        : Promise.resolve([]),
      listPatientElectronicInvoices(key).catch(() => []),
    ])
    for (const record of [...porTexto, ...porNumero]) {
      pagos.push(...(record.paymentControl ?? []), ...(record.orthodonticsPaymentControl ?? []))
    }
    return armarOpcionesPago({ pagos, facturas })
  }, [patientId, pagosKey])

  const visibles = useMemo(() => {
    const tipoLista = tipo === 'fev' ? 'fev' : 'recibo_interno'
    return (opciones ?? []).filter((opcion) => opcion.tipo === tipoLista)
  }, [opciones, tipo])

  const soporteId = tipo === 'fev' ? metadata.idFacturaElectronica : metadata.idReciboAsociado
  const transmitido = metadata.ripsEstado === 'enviado_ok' && Boolean(metadata.cuv)
  const esRecibo =
    tipo === 'recibo_interno' &&
    Boolean(
      String(note.numeroSoportePago ?? '').trim() ||
        String(note.pagoId ?? '').trim() ||
        metadata.idReciboAsociado,
    )
  const paquete = (notasPaquete.length > 0 ? notasPaquete : [note]).filter(
    (item) => !isEvolutionNoteAddendum(item) && mismoRecibo(note, item),
  )
  const notasDelRecibo = paquete.length > 0 ? paquete : [note]
  const pagoVinculado = pagosActuales.find(
    (pago) => pago.id === note.pagoId || pago.id === metadata.idReciboAsociado,
  )
  const opcionVinculada = (opciones ?? []).find(
    (opcion) =>
      opcion.id === (metadata.idReciboAsociado || note.pagoId) ||
      (Boolean(note.numeroSoportePago) && opcion.consecutivo === note.numeroSoportePago),
  )
  const fechaRecaudo = pagoVinculado?.paymentDate || opcionVinculada?.fecha || ''
  const transmisionPaquete = esRecibo
    ? evaluarTransmisionAnticipo({
        evoluciones: notasDelRecibo.map(notaAEvolucionRips),
        fechaRecaudo,
        fechaTransmision: new Date().toISOString(),
      })
    : null
  const paqueteIncompleto = transmisionPaquete != null && transmisionPaquete.puedeTransmitir === false
  const pendientesAnticipo = transmisionPaquete?.pendientes ?? []

  const publicar = (patch: EvolutionNotePatch) => {
    if (!clinicalLocked) {
      onChange(patch)
      return
    }
    const sidecar: EvolutionNotePatch = {}
    if (patch.ripsMetadata) sidecar.ripsMetadata = patch.ripsMetadata
    if (patch.pagoId !== undefined) sidecar.pagoId = patch.pagoId
    if (patch.numeroSoportePago !== undefined) sidecar.numeroSoportePago = patch.numeroSoportePago
    if (patch.conceptoPago !== undefined) sidecar.conceptoPago = patch.conceptoPago
    if (patch.valorProcedimiento !== undefined) sidecar.valorProcedimiento = patch.valorProcedimiento
    if (patch.estadoRips !== undefined) sidecar.estadoRips = patch.estadoRips
    onChange(sidecar)
  }

  const elegirTipo = (siguiente: TipoVinculacionFinanciera) => {
    setMensajeLocal('')
    if (siguiente === 'valor_cero') {
      publicar({
        pagoId: null,
        numeroSoportePago: null,
        conceptoPago: 'No aplica',
        valorProcedimiento: 0,
        estadoRips: 'SIN_COSTO',
        ...(clinicalLocked ? {} : { cost: 0, isBillable: false }),
        ripsMetadata: {
          tipoVinculacionFinanciera: 'valor_cero',
          idReciboAsociado: null,
          idFacturaElectronica: null,
          conceptoRecaudo: RIPS_CONCEPTO_RECAUDO_DEFAULT,
        },
      })
      return
    }
    publicar({
      ...(clinicalLocked ? {} : { isBillable: siguiente === 'fev' }),
      ripsMetadata: {
        tipoVinculacionFinanciera: siguiente,
        idReciboAsociado: siguiente === 'recibo_interno' ? metadata.idReciboAsociado : null,
        idFacturaElectronica: siguiente === 'fev' ? metadata.idFacturaElectronica : null,
      },
    })
  }

  const vincular = (id: string) => {
    const opcion = visibles.find((item) => item.id === id)
    if (!opcion) return
    setMensajeLocal('')
    publicar({
      pagoId: opcion.id,
      numeroSoportePago: opcion.consecutivo,
      conceptoPago: opcion.concepto,
      valorProcedimiento: opcion.valor,
      estadoRips: 'PAGADO',
      ...(clinicalLocked ? {} : { cost: opcion.valor, isBillable: tipo === 'fev' }),
      ripsMetadata: {
        tipoVinculacionFinanciera: tipo,
        idReciboAsociado: tipo === 'recibo_interno' ? opcion.id : null,
        idFacturaElectronica: tipo === 'fev' ? opcion.id : null,
      },
    })
  }

  const entradaRips = () => ({
    note,
    paciente: paciente ?? { documentType: '', documentNumber: '', birthDate: '' },
    prestador: {
      documentType: user?.documentType || 'CC',
      documentNumber: user?.documentNumber || note.professionalLicense,
      providerNit: user?.providerNit,
      repsCode: user?.repsCode,
    },
    numeroSoporte: note.numeroSoportePago,
    tipoVinculacion: tipo,
  })

  const descargarJson = () => {
    let doc: object = documentoRipsDeNota(note)
    try {
      doc = armarRipsNotaEvolucion(entradaRips())
    } catch {
      doc = documentoRipsDeNota(note)
    }
    descargarTexto(
      `RIPS_nota_${note.id.slice(0, 8)}.json`,
      JSON.stringify(doc, null, 2),
      'application/json;charset=utf-8',
    )
  }

  const descargarCuv = () => {
    if (!metadata.cuv) return
    descargarTexto(`CUV_${metadata.cuv}.txt`, metadata.cuv, 'text/plain;charset=utf-8')
  }

  const rechazoMuv = (resultado: {
    field?: string | null
    error?: string
    message?: string
    estadoMuv?: string
    localIssues?: Array<{ level: string; field?: string; message: string }>
    ministryErrors?: Array<{ message: string }>
  }) => {
    const issue = resultado.localIssues?.find((item) => item.level !== 'warning' && item.message)
    const field = resultado.field || issue?.field || null
    const message =
      issue?.message ||
      resultado.ministryErrors?.find((item) => item.message)?.message ||
      resultado.error ||
      resultado.message ||
      (resultado.estadoMuv === 'RECHAZADO' ? 'El MUV rechazó el RIPS.' : 'El MUV no devolvió un CUV.')
    return field ? `${field}: ${message}` : message
  }

  const enviar = async () => {
    if (isLoading) return
    if (esRecibo) {
      const ahora = evaluarTransmisionAnticipo({
        evoluciones: notasDelRecibo.map(notaAEvolucionRips),
        fechaRecaudo,
        fechaTransmision: new Date().toISOString(),
      })
      if (!ahora.puedeTransmitir) {
        setModalAnticipo(true)
        setMensajeLocal(ahora.message)
        return
      }
    }
    setMensajeLocal('')
    setIsLoading(true)
    try {
      const entrada = entradaRips()
      try {
        armarRipsNotaEvolucion(entrada)
      } catch (error) {
        if (error instanceof EvolutionRipsPayloadError) {
          setMensajeLocal(mensajeCampoRips(error))
          return
        }
        throw error
      }

      const preparado = applyEvolutionNoteRipsMetadata(note, {
        ...metadata,
        tipoVinculacionFinanciera: tipo,
        ripsEstado: 'preparado',
      })
      const lista = preparado.ripsMetadata
      if (!lista) return
      const rips = armarRipsNotaEvolucion({ ...entrada, note: { ...note, ripsMetadata: lista } })
      const resultado = await routeDictatedEvolutionByFiscalProfile({
        rips,
        cie10: [lista.codDiagnosticoPrincipal],
        cups: rips.usuarios.flatMap((usuario) => [
          ...usuario.servicios.consultas.map((consulta) => consulta.codConsulta),
          ...usuario.servicios.procedimientos.map((procedimiento) => procedimiento.codProcedimiento),
        ]),
        metadatos: {
          patientUuid: patientId || undefined,
          patientDocument: paciente?.documentNumber,
          tipoVinculacionFinanciera: tipo,
          canal: tipo === 'fev' ? 'fev' : 'sin_factura',
        },
      })
      const cuv = resultado.cuv?.trim()
      if (cuv) {
        publicar({
          ripsMetadata: {
            ...lista,
            ripsEstado: 'enviado_ok',
            cuv,
            ripsFechaTransmision: new Date().toISOString(),
            ripsErrorLog: null,
          },
        })
        setVerCuv(true)
        showToast(`RIPS transmitido. CUV: ${cuv}`)
        return
      }
      if (resultado.ok && resultado.route === 'guardarRIPS_Pendiente') {
        publicar({
          ripsMetadata: {
            ...lista,
            ripsEstado: 'preparado',
            cuv: null,
            ripsFechaTransmision: null,
            ripsErrorLog: null,
          },
        })
        showToast(resultado.message || 'El RIPS quedó preparado. El MUV aún no devolvió un CUV.')
        return
      }
      const detalle = rechazoMuv(resultado)
      publicar({
        ripsMetadata: {
          ...lista,
          ripsEstado: 'error',
          ripsErrorLog: detalle,
          cuv: null,
          ripsFechaTransmision: null,
        },
      })
    } catch (error) {
      const detalle =
        error instanceof EvolutionRipsPayloadError
          ? mensajeCampoRips(error)
          : error instanceof EvolutionNoteRipsMetadataError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'No se pudo enviar el RIPS.'
      if (error instanceof EvolutionRipsPayloadError || error instanceof EvolutionNoteRipsMetadataError) {
        setMensajeLocal(detalle)
        return
      }
      publicar({
        ripsMetadata: {
          ripsEstado: 'error',
          ripsErrorLog: detalle,
        },
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="rounded-lg border border-dental-200 bg-dental-50/60 p-3">
      <h5 className="mb-3 text-sm font-semibold text-dental-900">Vinculación financiera y RIPS</h5>
      {clinicalLocked && (
        <p className="mb-3 text-xs text-slate-600">
          La nota firmada no se reescribe. El diagnóstico de radicación, el recibo y el CUV sí se
          pueden actualizar.
        </p>
      )}

      {showDiagnosis && (
        <div className="mb-3">
          <Cie10PrincipalCombobox
            value={metadata.codDiagnosticoPrincipal}
            disabled={disabled}
            onChange={(codDiagnosticoPrincipal) =>
              publicar({ ripsMetadata: { codDiagnosticoPrincipal } })
            }
          />
        </div>
      )}

      <fieldset disabled={disabled} className="space-y-3">
        <legend className="sr-only">Tipo de vinculación financiera</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {OPCIONES_VINCULO.map((opcion) => {
            const activo = tipo === opcion.value
            return (
              <label
                key={opcion.value}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  activo
                    ? 'border-dental-500 bg-white text-dental-900 shadow-sm'
                    : 'border-white/80 bg-white/70 text-slate-700'
                } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name={`vinculacion-${note.id}`}
                  className="mt-0.5"
                  checked={activo}
                  onChange={() => elegirTipo(opcion.value)}
                />
                {opcion.label}
              </label>
            )
          })}
        </div>

        <div>
          <label className="label-field" htmlFor={`pago-rips-${note.id}`}>
            {tipo === 'fev'
              ? 'Factura electrónica del paciente'
              : tipo === 'recibo_interno'
                ? 'Recibo de caja del paciente'
                : 'Recibo o pago del paciente'}
          </label>
          <select
            id={`pago-rips-${note.id}`}
            className="input-field disabled:bg-slate-100"
            disabled={disabled || valorCero}
            value={valorCero ? '' : (soporteId ?? '')}
            onChange={(event) => vincular(event.target.value)}
          >
            <option value="">
              {valorCero
                ? 'No aplica para atención en $0'
                : visibles.length === 0
                  ? 'No hay pagos registrados para este paciente'
                  : tipo === 'fev'
                    ? 'Seleccione la factura electrónica'
                    : 'Seleccione el recibo de caja'}
            </option>
            {!valorCero &&
              soporteId &&
              !visibles.some((opcion) => opcion.id === soporteId) && (
                <option value={soporteId}>Comprobante vinculado · {soporteId}</option>
              )}
            {!valorCero &&
              visibles.map((opcion) => (
                <option key={`${opcion.tipo}-${opcion.id}`} value={opcion.id}>
                  {etiquetaOpcionPago(opcion)}
                </option>
              ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label-field" htmlFor={`tarifa-rips-${note.id}`}>
              Tarifa de la atención (COP)
            </label>
            <input
              id={`tarifa-rips-${note.id}`}
              type="number"
              min={0}
              className="input-field disabled:bg-slate-100"
              disabled={disabled || valorCero || clinicalLocked}
              value={
                clinicalLocked ? (note.cost ?? '') : valorCero ? 0 : (note.cost ?? '')
              }
              onChange={(event) => {
                const cost = event.target.value === '' ? undefined : Number(event.target.value)
                publicar({
                  cost,
                  valorProcedimiento: cost ?? 0,
                  ...(clinicalLocked ? {} : { isBillable: tipo === 'fev' && (cost ?? 0) > 0 }),
                })
              }}
            />
          </div>
          <p className="self-end pb-2 text-xs text-slate-600">
            {valorCero
              ? clinicalLocked
                ? `Concepto de recaudo 05 — No aplica. La tarifa firmada sigue en ${formatCurrency(note.cost ?? 0)}.`
                : 'Concepto de recaudo 05 — No aplica. La tarifa queda en $0.'
              : `Concepto de recaudo ${metadata.conceptoRecaudo}. ${
                  note.cost != null ? formatCurrency(note.cost) : 'Sin tarifa digitada'
                }.`}
          </p>
        </div>
      </fieldset>

      {paqueteIncompleto && (
        <p role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {transmisionPaquete?.message}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-dental-100 pt-3 sm:flex-row sm:flex-wrap sm:items-center">
        {transmitido ? (
          <button
            type="button"
            className="btn-secondary border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
            onClick={() => setVerCuv((actual) => !actual)}
            disabled={disabled}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
            RIPS enviado — ver CUV
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={() => void enviar()}
            disabled={disabled || isLoading}
            aria-busy={isLoading}
          >
            <Rocket className="mr-2 h-4 w-4" aria-hidden />
            {isLoading ? 'Enviando RIPS…' : esRecibo ? 'Enviar RIPS al MUV' : 'Preparar y enviar RIPS'}
          </button>
        )}
        <button type="button" className="btn-secondary text-xs" onClick={descargarJson} disabled={disabled}>
          <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Descargar JSON
        </button>
        {metadata.cuv && (
          <button type="button" className="btn-secondary text-xs" onClick={descargarCuv} disabled={disabled}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Descargar CUV
          </button>
        )}
      </div>

      {verCuv && metadata.cuv && (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-emerald-900">
          CUV: {metadata.cuv}
          {metadata.ripsFechaTransmision ? ` · ${metadata.ripsFechaTransmision}` : ''}
        </p>
      )}
      {mensajeLocal && (
        <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {mensajeLocal}
        </p>
      )}
      {metadata.ripsEstado === 'error' && metadata.ripsErrorLog && (
        <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {metadata.ripsErrorLog}
        </p>
      )}
      <Toast message={toastMessage} onDismiss={clearToast} />
      {modalAnticipo && paqueteIncompleto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`anticipo-rips-${note.id}`}
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          >
            <h6 id={`anticipo-rips-${note.id}`} className="text-base font-semibold text-slate-900">
              Pendiente de transmisión RIPS
            </h6>
            <p className="mt-2 text-sm text-slate-700">{transmisionPaquete?.message}</p>
            {pendientesAnticipo.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {pendientesAnticipo.map((item) => (
                  <li key={item.id || item.descripcion}>{item.descripcion || 'Evolución sin firmar'}</li>
                ))}
              </ul>
            )}
            <button type="button" className="btn-primary mt-4" onClick={() => setModalAnticipo(false)}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
