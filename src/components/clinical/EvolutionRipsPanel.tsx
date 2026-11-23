import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, Copy, Download, Loader2, Rocket, Save } from 'lucide-react'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/useToast'
import { logAuditEvent } from '@/services/auditService'
import { listPatientElectronicInvoices } from '@/services/invoiceService'
import { guardarHistorialRadicacionRips } from '@/db/ripsSubmissionsStore'
import { routeDictatedEvolutionByFiscalProfile } from '@/services/ripsApiService'
import { Toast } from '@/components/ui/Toast'
import {
  isEvolutionNoteAddendum,
  isEvolutionNoteImmutable,
  type EvolutionNote,
  type EvolutionNotePatch,
} from '@/types/evolutionNote'
import {
  adminCupsAlreadyAssigned,
  canEditAdminCupsOnLockedNote,
  effectiveEvolutionCupsCode,
  focusEvolutionMissingField,
  isValidEvolutionCupsCode,
  normalizeEvolutionCupsDigits,
} from '@/utils/evolutionCupsGate'
import {
  resolveAndValidateCanonicalEvolutionRips,
  type CanonicalRipsValidationError,
} from '@/utils/canonicalEvolutionRips'
import { EvolutionRipsDiagnosticsPanel } from './EvolutionRipsDiagnosticsPanel'
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
import { ZONA_CLINICA } from '@/utils/clinicDateTime'
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
import { prepararRipsParaSalida } from '../../../shared/ripsEstructura.js'

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

function documentoRipsDeNota(note: EvolutionNote, paciente?: PacienteRipsIdentidad) {
  const metadata = metadataDe(note)
  const resolved = resolveAndValidateCanonicalEvolutionRips(note, paciente ?? {}, {}, 'send').resolved
  return {
    codDiagnosticoPrincipal: resolved.cie10Principal || metadata.codDiagnosticoPrincipal,
    tipoVinculacionFinanciera: resolved.tipoVinculacion,
    idReciboAsociado: resolved.idReciboAsociado,
    idFacturaElectronica: resolved.idFacturaElectronica,
    causaMotivoAtencion: metadata.causaMotivoAtencion,
    finalidadTecnologia: metadata.finalidadTecnologia,
    conceptoRecaudo: metadata.conceptoRecaudo,
    cups: resolved.primaryCups || null,
    cupsCodes: resolved.cupsCodes,
    procedimiento: note.procedure,
    fechaAtencion: resolved.fechaAtencion || note.date,
    vrServicio:
      resolved.billingMode === 'valor_cero'
        ? 0
        : (note.valorProcedimiento ?? note.cost ?? 0),
    cuv: metadata.cuv,
    billingMode: resolved.billingMode,
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

async function copiarCuvAlPortapapeles(cuv: string): Promise<void> {
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

function formatearFechaRadicacion(iso: string | null | undefined): string {
  const raw = String(iso ?? '').trim()
  if (!raw) return '—'
  const fecha = new Date(raw)
  if (Number.isNaN(fecha.getTime())) return raw
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA_CLINICA,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(fecha)
}

function modalidadRips(tipo: TipoVinculacionFinanciera): string {
  return tipo === 'fev' ? 'Con FEV' : 'Sin FEV - RS'
}

export function EvolutionRipsEstadoBadge({ note }: { note: EvolutionNote }) {
  const metadata = metadataDe(note)
  const estado: RipsEstadoTransmision = metadata.ripsEstado
  if (estado === 'enviado_ok' && metadata.cuv) {
    return (
      <span
        className="inline-flex max-w-xs items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
        title={`CUV: ${metadata.cuv}`}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
        <span className="truncate">RIPS-ENVIADO · CUV</span>
      </span>
    )
  }
  if (estado === 'enviado_ok') {
    return (
      <span className="inline-flex max-w-xs items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
        <span className="truncate">RIPS-ENVIADO</span>
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
        {estado === 'error' ? 'RIPS: error previo' : 'RIPS-LISTO PARA ENVIAR'}
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
  const canonicalPreview = useMemo(
    () =>
      resolveAndValidateCanonicalEvolutionRips(
        { ...note, ripsMetadata: { ...metadataDe(note), tipoVinculacionFinanciera: tipoEfectivo(note) } },
        paciente ?? {},
        {},
        'send',
      ),
    [note, paciente],
  )
  const cupsEfectivo = canonicalPreview.resolved.primaryCups || effectiveEvolutionCupsCode(note)
  const adminCupsEditable =
    clinicalLocked && canEditAdminCupsOnLockedNote(note) && !adminCupsAlreadyAssigned(note)
  const cupsBloqueado =
    disabled || (clinicalLocked && !adminCupsEditable) || adminCupsAlreadyAssigned(note)
  const [isSendingRips, setIsSendingRips] = useState(false)
  const [cuvCopiado, setCuvCopiado] = useState(false)
  const [modalAnticipo, setModalAnticipo] = useState(false)
  const [mensajeLocal, setMensajeLocal] = useState('')
  const [validationErrors, setValidationErrors] = useState<CanonicalRipsValidationError[]>([])
  const [cupsDraft, setCupsDraft] = useState(cupsEfectivo)
  const [guardandoCups, setGuardandoCups] = useState(false)
  const { toastMessage, showToast, clearToast } = useToast(8000)

  const clinicConfig = useMemo(
    () => ({
      documentType: user?.documentType,
      documentNumber: user?.documentNumber || note.professionalLicense,
      providerNit: user?.providerNit,
      repsCode: user?.repsCode,
    }),
    [user?.documentType, user?.documentNumber, user?.providerNit, user?.repsCode, note.professionalLicense],
  )

  useEffect(() => {
    setCupsDraft(cupsEfectivo)
  }, [cupsEfectivo, note.id])
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
    const key = String(patientId ? toPatientForeignKey(patientId) : '').trim()
    if (!key) return armarOpcionesPago({ pagos })

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

  const aplicarCupsBorrador = (raw: string) => {
    const digits = normalizeEvolutionCupsDigits(raw)
    setCupsDraft(digits)
    if (clinicalLocked) return
    onChange({ cupsCode: digits.length > 0 ? digits : null })
  }

  const guardarCupsAdministrativo = async () => {
    if (guardandoCups) {
      reportarFalloEnvio('Ya se está guardando el CUPS administrativo.')
      return
    }
    if (!adminCupsEditable) {
      reportarFalloEnvio(
        'Esta evolución no admite CUPS administrativo (ya tiene CUPS válido o no requiere RIPS).',
        'cupsCode',
      )
      return
    }
    const digits = normalizeEvolutionCupsDigits(cupsDraft)
    if (!isValidEvolutionCupsCode(digits)) {
      reportarFalloEnvio(
        'Ingrese un código CUPS válido de 6 dígitos para completar la vinculación administrativa.',
        'cupsCode',
        [
          {
            code: 'CUPS_REQUIRED',
            field: 'cupsCode',
            message: 'Ingrese un código CUPS válido de 6 dígitos.',
            fix: 'Digite el CUPS administrativo y pulse Guardar.',
            scope: 'clinical',
          },
        ],
      )
      return
    }
    setMensajeLocal('')
    setValidationErrors([])
    setGuardandoCups(true)
    try {
      publicar({ ripsMetadata: { cupsCode: digits } })
      if (user) {
        await logAuditEvent({
          action: 'ASSIGN_EVOLUTION_CUPS_ADMIN',
          resourceType: 'clinical_record',
          resourceId: note.id,
          details: `CUPS ${digits} asignado administrativamente a evolución firmada (RIPS / Res. 2275)`,
          user,
        })
      }
      showToast(`CUPS ${digits} guardado. El campo queda bloqueado.`)
    } finally {
      setGuardandoCups(false)
    }
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
    if (!opcion) {
      setMensajeLocal('No se encontró el comprobante seleccionado. Elija otro recibo o FEV.')
      setValidationErrors([
        {
          code: 'BILLING_LINK_MISSING',
          field: tipo === 'fev' ? 'idFacturaElectronica' : 'idReciboAsociado',
          message: 'No se encontró el comprobante seleccionado.',
          fix: 'Vuelva a elegir un recibo o factura electrónica de la lista.',
          scope: 'billing',
        },
      ])
      showToast('No se encontró el comprobante seleccionado.')
      return
    }
    setMensajeLocal('')
    setValidationErrors([])
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
    let doc: object = documentoRipsDeNota(note, paciente)
    try {
      doc = armarRipsNotaEvolucion(entradaRips())
    } catch (error) {
      const detalle =
        error instanceof EvolutionRipsPayloadError
          ? mensajeCampoRips(error)
          : error instanceof Error
            ? error.message
            : 'El JSON aún está incompleto; se descarga el borrador canónico.'
      setMensajeLocal(detalle)
      showToast(detalle)
      doc = documentoRipsDeNota(note, paciente)
    }
    const salida = prepararRipsParaSalida(doc, { sinFactura: tipo !== 'fev' }) ?? doc
    descargarTexto(
      `RIPS_nota_${note.id.slice(0, 8)}.json`,
      JSON.stringify(salida, null, 2),
      'application/json;charset=utf-8',
    )
  }

  const descargarCuv = () => {
    if (!metadata.cuv) {
      setMensajeLocal('No hay CUV para descargar. Envíe primero el RIPS al MUV.')
      showToast('No hay CUV para descargar. Envíe primero el RIPS al MUV.')
      return
    }
    descargarTexto(`CUV_${metadata.cuv}.txt`, metadata.cuv, 'text/plain;charset=utf-8')
  }

  const scopeDeCampo = (field: string | null | undefined, texto = ''): CanonicalRipsValidationError['scope'] => {
    if (field?.startsWith('patient.')) return 'patient'
    if (field === 'cupsCode' || field === 'codDiagnosticoPrincipal' || field === 'date') return 'clinical'
    if (
      field === 'numNota' ||
      field === 'tipoNota' ||
      field === 'numFactura' ||
      field?.includes('Factura') ||
      field?.includes('Recibo') ||
      field === 'idFacturaElectronica' ||
      field === 'idReciboAsociado' ||
      /^numNota\b/i.test(texto) ||
      /\b(RVG|RVC)\d+/i.test(texto)
    ) {
      return 'billing'
    }
    if (field?.includes('prestador') || field?.includes('Obligado') || field === 'codPrestador') {
      return 'professional'
    }
    return 'billing'
  }

  const rechazoMuv = (resultado: {
    field?: string | null
    error?: string
    message?: string
    code?: string
    estadoMuv?: string
    localIssues?: Array<{ level: string; field?: string; message: string }>
    ministryErrors?: Array<{ code?: string; message: string; path?: string }>
    errors?: Array<{ code?: string; message?: string; path?: string }>
    resultadoValidacion?: unknown
  }) => {
    const issue = resultado.localIssues?.find((item) => item.level !== 'warning' && item.message)
    const ministry = resultado.ministryErrors?.find((item) => item.message)
    const rvg = resultado.errors?.find((item) => item.message || item.code)
    const field = resultado.field || issue?.field || rvg?.path || ministry?.path || null
    const code = resultado.code || ministry?.code || rvg?.code || null
    const message =
      issue?.message ||
      ministry?.message ||
      rvg?.message ||
      resultado.error ||
      resultado.message ||
      (resultado.estadoMuv === 'RECHAZADO' ? 'El MUV rechazó el RIPS.' : 'El MUV no devolvió un CUV.')
    const withCode = code ? `${code}: ${message}` : message
    return field ? `${field}: ${withCode}` : withCode
  }

  const erroresDesdeResultadoMuv = (resultado: {
    field?: string | null
    error?: string
    message?: string
    code?: string
    estadoMuv?: string
    localIssues?: Array<{ level: string; field?: string; message: string }>
    ministryErrors?: Array<{ code?: string; message: string; path?: string }>
    errors?: Array<{ code?: string; message?: string; path?: string }>
    resultadoValidacion?: unknown
  }): CanonicalRipsValidationError[] => {
    const out: CanonicalRipsValidationError[] = []
    const push = (code: string, field: string, message: string) => {
      const texto = String(message ?? '').trim()
      if (!texto) return
      out.push({
        code,
        field: field || 'rips',
        message: texto,
        scope: scopeDeCampo(field, texto),
      })
    }

    for (const issue of resultado.localIssues ?? []) {
      if (issue.level === 'warning' || !issue.message) continue
      push('RIPS_LOCAL_ISSUE', issue.field || 'rips', issue.message)
    }
    for (const item of resultado.ministryErrors ?? []) {
      if (!item.message) continue
      const code = String(item.code || 'MUV').trim() || 'MUV'
      push(code, item.path || resultado.field || 'rips', `${code}: ${item.message}`)
    }
    for (const item of resultado.errors ?? []) {
      if (!item.message && !item.code) continue
      const code = String(item.code || 'MUV').trim() || 'MUV'
      const message = item.message ? (item.code ? `${code}: ${item.message}` : item.message) : code
      push(code, item.path || resultado.field || 'rips', message)
    }

    const validacion = resultado.resultadoValidacion
    const listaValidacion = Array.isArray(validacion)
      ? validacion
      : validacion && typeof validacion === 'object' && Array.isArray((validacion as { ResultadosValidacion?: unknown }).ResultadosValidacion)
        ? ((validacion as { ResultadosValidacion: unknown[] }).ResultadosValidacion)
        : validacion && typeof validacion === 'object' && Array.isArray((validacion as { resultadosValidacion?: unknown }).resultadosValidacion)
          ? ((validacion as { resultadosValidacion: unknown[] }).resultadosValidacion)
          : []
    for (const item of listaValidacion) {
      if (!item || typeof item !== 'object') continue
      const row = item as { Codigo?: string; codigo?: string; code?: string; Descripcion?: string; descripcion?: string; message?: string; path?: string }
      const code = String(row.Codigo || row.codigo || row.code || 'MUV').trim() || 'MUV'
      const message = String(row.Descripcion || row.descripcion || row.message || '').trim()
      if (!message) continue
      push(code, row.path || resultado.field || 'rips', `${code}: ${message}`)
    }

    if (out.length === 0) {
      const detalle = rechazoMuv(resultado)
      push(String(resultado.code || 'RIPS_SEND_FAILED'), resultado.field || 'rips', detalle)
    }
    return out
  }

  const reportarFalloEnvio = (
    detalle: string,
    field?: string | null,
    errors?: CanonicalRipsValidationError[],
  ) => {
    const texto = detalle.trim() || 'No se pudo enviar el RIPS al MUV.'
    const lista =
      errors?.length
        ? errors
        : [
            {
              code: 'RIPS_SEND_FAILED',
              field: field || 'rips',
              message: texto,
              scope: scopeDeCampo(field, texto),
            },
          ]
    setMensajeLocal(texto)
    setValidationErrors(lista)
    showToast(texto)
    window.setTimeout(() => {
      document
        .querySelector(`[data-rips-diagnostics="${note.id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 40)
    const focusField =
      field === 'cupsCode' || field === 'codDiagnosticoPrincipal'
        ? field
        : lista.find((item) => item.field === 'cupsCode' || item.field === 'codDiagnosticoPrincipal')
            ?.field
    if (focusField === 'cupsCode' || focusField === 'codDiagnosticoPrincipal') {
      window.setTimeout(() => focusEvolutionMissingField(note.id, focusField), 40)
    }
  }

  const enviar = async () => {
    if (isSendingRips) {
      reportarFalloEnvio('Ya hay un envío RIPS en curso. Espere a que termine.')
      return
    }
    if (disabled) {
      reportarFalloEnvio('La sección RIPS está deshabilitada; no se puede enviar.')
      return
    }

    if (esRecibo) {
      const ahora = evaluarTransmisionAnticipo({
        evoluciones: notasDelRecibo.map(notaAEvolucionRips),
        fechaRecaudo,
        fechaTransmision: new Date().toISOString(),
      })
      if (!ahora.puedeTransmitir) {
        setModalAnticipo(true)
        reportarFalloEnvio(ahora.message || 'El paquete de anticipo aún no puede transmitirse.')
        return
      }
    }

    setMensajeLocal('')
    setValidationErrors([])
    setIsSendingRips(true)
    try {
      const noteForResolve = {
        ...note,
        ripsMetadata: {
          ...metadata,
          tipoVinculacionFinanciera: tipo,
        },
      }
      const { resolved, validation } = resolveAndValidateCanonicalEvolutionRips(
        noteForResolve,
        paciente ?? {},
        clinicConfig,
        'send',
      )
      if (!validation.valid) {
        reportarFalloEnvio(
          validation.errors.map((item) => `${item.field}: ${item.message}`).join('\n'),
          validation.errors[0]?.field,
          validation.errors,
        )
        return
      }

      const entrada = entradaRips()
      try {
        armarRipsNotaEvolucion(entrada)
      } catch (error) {
        if (error instanceof EvolutionRipsPayloadError) {
          reportarFalloEnvio(mensajeCampoRips(error), error.field)
          return
        }
        throw error
      }

      let lista
      try {
        const preparado = applyEvolutionNoteRipsMetadata(note, {
          ...metadata,
          tipoVinculacionFinanciera: tipo,
          // Sidecar: sincroniza CIE-10 / CUPS canónicos sin tocar el hash clínico.
          codDiagnosticoPrincipal:
            resolved.cie10Principal || metadata.codDiagnosticoPrincipal || '',
          cupsCode: metadata.cupsCode || resolved.primaryCups || null,
          ripsEstado: 'preparado',
        })
        lista = preparado.ripsMetadata
      } catch (error) {
        const detalle =
          error instanceof EvolutionNoteRipsMetadataError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'No se pudo preparar la metadata RIPS.'
        reportarFalloEnvio(detalle)
        return
      }

      if (!lista) {
        reportarFalloEnvio('No se pudo preparar la metadata RIPS de la nota.')
        return
      }

      const rips = armarRipsNotaEvolucion({ ...entrada, note: { ...note, ripsMetadata: lista } })
      let resultado
      try {
        resultado = await routeDictatedEvolutionByFiscalProfile({
          rips,
          cie10: [lista.codDiagnosticoPrincipal],
          cups: rips.usuarios.flatMap((usuario) => [
            ...(usuario.servicios.consultas ?? []).map((consulta) => consulta.codConsulta),
            ...(usuario.servicios.procedimientos ?? []).map(
              (procedimiento) => procedimiento.codProcedimiento,
            ),
          ]),
          metadatos: {
            patientUuid: patientId || undefined,
            patientDocument: paciente?.documentNumber,
            tipoVinculacionFinanciera: tipo,
            canal: tipo === 'fev' ? 'fev' : 'sin_factura',
          },
        })
      } catch (error) {
        const detalle =
          error instanceof Error
            ? error.message
            : 'Error HTTP al contactar /api/rips (revise red o sesión).'
        reportarFalloEnvio(detalle)
        publicar({
          ripsMetadata: {
            ...lista,
            ripsEstado: 'error',
            ripsErrorLog: detalle,
            cuv: null,
            ripsFechaTransmision: null,
          },
        })
        return
      }

      const cuv = resultado.cuv?.trim()
      if (cuv) {
        const fechaTx = new Date().toISOString()
        // Sidecar inmediato en React + Dexie (autosave) + sync Postgres vía clinical-sync.
        publicar({
          ripsMetadata: {
            ...lista,
            ripsEstado: 'enviado_ok',
            cuv,
            ripsFechaTransmision: fechaTx,
            ripsErrorLog: null,
          },
        })
        guardarHistorialRadicacionRips({
          cuv,
          cantidad_historias: 1,
          estado: 'radicado',
          payload_json: rips,
          fecha_radicacion: fechaTx,
        })
        setMensajeLocal('')
        setValidationErrors([])
        setCuvCopiado(false)
        showToast(`RIPS enviado al MUV. CUV: ${cuv}`)
        return
      }

      if (
        resultado.ok &&
        resultado.route === 'guardarRIPS_Pendiente' &&
        resultado.estadoMuv !== 'RECHAZADO'
      ) {
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

      const errores = erroresDesdeResultadoMuv(resultado)
      const detalle = errores.map((item) => item.message).join('\n') || rechazoMuv(resultado)
      reportarFalloEnvio(detalle, resultado.field || errores[0]?.field, errores)
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
      const field = error instanceof EvolutionRipsPayloadError ? error.field : null
      const detalle =
        error instanceof EvolutionRipsPayloadError
          ? mensajeCampoRips(error)
          : error instanceof EvolutionNoteRipsMetadataError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'No se pudo enviar el RIPS.'
      reportarFalloEnvio(detalle, field)
      publicar({
        ripsMetadata: {
          ...metadata,
          tipoVinculacionFinanciera: tipo,
          ripsEstado: 'error',
          ripsErrorLog: detalle,
          cuv: null,
          ripsFechaTransmision: null,
        },
      })
    } finally {
      setIsSendingRips(false)
    }
  }

  return (
    <section className="rounded-lg border border-dental-200 bg-dental-50/60 p-3">
      <h5 className="mb-3 text-sm font-semibold text-dental-900">
        Vinculación Administrativa y RIPS
      </h5>
      {clinicalLocked && (
        <p className="mb-3 text-xs text-slate-600">
          Los campos clínicos de la nota firmada permanecen inmutables (Res. 1995/1999). El
          diagnóstico de radicación, el recibo, el CUV y un CUPS administrativo faltante sí se
          pueden completar para RIPS (Res. 2275).
        </p>
      )}

      <div
        className="mb-3"
        data-evo-note={note.id}
        data-evo-field="cupsCode"
      >
        <label className="label-field" htmlFor={`cups-rips-${note.id}`}>
          Código de servicio (6 dígitos) <span className="text-red-500">*</span>
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <input
            id={`cups-rips-${note.id}`}
            inputMode="numeric"
            maxLength={6}
            pattern="\d{6}"
            className="input-field max-w-[12rem] font-mono disabled:bg-slate-100"
            disabled={cupsBloqueado}
            value={cupsDraft}
            placeholder="Ej. 230101"
            onChange={(event) => aplicarCupsBorrador(event.target.value)}
            aria-invalid={cupsDraft.length > 0 && !isValidEvolutionCupsCode(cupsDraft)}
          />
          {adminCupsEditable && (
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={disabled || guardandoCups || !isValidEvolutionCupsCode(cupsDraft)}
              onClick={() => void guardarCupsAdministrativo()}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {guardandoCups ? 'Guardando…' : 'Guardar CUPS administrativo'}
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {adminCupsEditable
            ? 'Evolución cerrada sin CUPS válido: puede completar solo este campo administrativo para enviar el RIPS. El texto clínico no se modifica.'
            : adminCupsAlreadyAssigned(note)
              ? `CUPS administrativo ${metadata.cupsCode} registrado. El campo quedó bloqueado.`
              : cupsEfectivo
                ? `CUPS ${cupsEfectivo} tomado del procedimiento de la evolución.`
                : clinicalLocked
                  ? 'CUPS de la atención firmada (solo lectura).'
                  : 'Se autocompleta al elegir un procedimiento del catálogo; puede ajustarlo antes de firmar.'}
        </p>
      </div>

      {showDiagnosis && (
        <div className="mb-3">
          <Cie10PrincipalCombobox
            value={metadata.codDiagnosticoPrincipal}
            disabled={disabled}
            noteId={note.id}
            fieldKey="codDiagnosticoPrincipal"
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

      {!transmitido && (
        <div data-rips-diagnostics={note.id}>
          <EvolutionRipsDiagnosticsPanel
            title="Diagnóstico RIPS / MUV"
            errors={
              validationErrors.length > 0
                ? validationErrors
                : metadata.ripsEstado === 'error' && metadata.ripsErrorLog
                  ? metadata.ripsErrorLog
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line) => ({
                        code: 'RIPS_PREVIOUS_ERROR',
                        field: 'rips',
                        message: line,
                        scope: scopeDeCampo('rips', line),
                      }))
                  : mensajeLocal
                    ? [
                        {
                          code: 'RIPS_LOCAL_MESSAGE',
                          field: 'rips',
                          message: mensajeLocal,
                          scope: scopeDeCampo('rips', mensajeLocal),
                        },
                      ]
                    : []
            }
            onRetry={() => void enviar()}
            retryLabel="Reintentar envío al MUV"
            disabled={disabled}
            isSubmitting={isSendingRips}
            patientFixHref={patientId ? `/pacientes/${patientId}` : undefined}
          />
        </div>
      )}

      {transmitido && metadata.cuv && (
        <div
          role="status"
          className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900"
        >
          <p className="font-semibold">
            RIPS radicado exitosamente ante el Ministerio de Salud (MUV)
          </p>
          <div className="mt-2 flex flex-wrap items-start gap-2">
            <p className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed">
              <span className="font-sans font-medium text-emerald-800">CUV: </span>
              {metadata.cuv}
            </p>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-1 text-[11px] font-medium text-emerald-900 hover:bg-emerald-100"
              aria-label="Copiar CUV al portapapeles"
              onClick={() => {
                void copiarCuvAlPortapapeles(metadata.cuv!).then(() => {
                  setCuvCopiado(true)
                  showToast('CUV copiado al portapapeles')
                  window.setTimeout(() => setCuvCopiado(false), 1600)
                })
              }}
            >
              <Copy className="h-3 w-3" aria-hidden />
              {cuvCopiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="mt-2 text-xs text-emerald-800">
            Radicación: {formatearFechaRadicacion(metadata.ripsFechaTransmision)} · Modalidad:{' '}
            {modalidadRips(tipo)}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-dental-100 pt-3 sm:flex-row sm:flex-wrap sm:items-center">
        {transmitido ? (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-100"
            disabled
            aria-disabled="true"
            title="Este RIPS ya fue radicado ante el MUV. No se puede reenviar."
          >
            <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
            RIPS enviado al MUV
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={() => void enviar()}
            disabled={disabled || isSendingRips}
            aria-busy={isSendingRips}
          >
            {isSendingRips ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Rocket className="mr-2 h-4 w-4" aria-hidden />
            )}
            {isSendingRips
              ? 'Enviando al MUV…'
              : esRecibo
                ? 'Enviar RIPS al MUV'
                : 'Preparar y enviar RIPS'}
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
