import {
  DEMO_PRESTADOR_REPS,
  DOCUMENT_TYPE_RIPS,
  REGIME_TO_TIPO_USUARIO,
  RIPS_DEFAULTS,
  isOdontologyConsultationCups,
} from '../constants/rips.ts'
import { documentoObligadoDigits } from '../../shared/nit.js'
import type { DocumentType, RegimeType } from '../types/patient.ts'
import type { EvolutionNote } from '../types/evolutionNote.ts'
import {
  CIE10_RIPS_PATTERN,
  RIPS_CAUSA_MOTIVO_ATENCION_DEFAULT,
  RIPS_CONCEPTO_RECAUDO_DEFAULT,
  RIPS_FINALIDAD_TECNOLOGIA_DEFAULT,
  createDefaultEvolutionNoteRipsMetadata,
  type EvolutionNoteRipsMetadata,
  type TipoVinculacionFinanciera,
} from '../types/evolutionNoteRips.ts'
import type { RipsConsulta, RipsProcedimiento, RipsTransaction, RipsUsuario } from '../types/rips.ts'
import { fechaHoraSesionClinica } from './clinicDateTime.ts'
import { cupsDesdeTexto } from './cupsCodeResolve.ts'

const CUPS_PATTERN = /^\d{6}$/
const COD_SERVICIO_ODONTOLOGIA = 344

export class EvolutionRipsPayloadError extends Error {
  field: string

  constructor(message: string, field: string) {
    super(message)
    this.name = 'EvolutionRipsPayloadError'
    this.field = field
  }
}

export interface PacienteRipsIdentidad {
  documentType: string
  documentNumber: string
  birthDate: string
  gender?: string
  regime?: string
  municipalityCode?: string
}

export interface PrestadorRipsIdentidad {
  documentType?: string | null
  documentNumber?: string | null
  providerNit?: string | null
  repsCode?: string | null
}

export interface EnvioRipsNotaInput {
  note: EvolutionNote
  paciente: PacienteRipsIdentidad
  prestador: PrestadorRipsIdentidad
  /** Consecutivo visible del recibo o de la FEV elegida en el selector. */
  numeroSoporte?: string | null
  /**
   * Tipo que muestra la tarjeta. Si la nota aún no guardó metadata,
   * puede ser un recibo inferido por la tarifa y no el default de $0.
   */
  tipoVinculacion?: TipoVinculacionFinanciera
}

function metadataDe(note: EvolutionNote): EvolutionNoteRipsMetadata {
  return note.ripsMetadata ?? createDefaultEvolutionNoteRipsMetadata()
}

function compactCie10(code: string): string {
  return code.replace(/[.\s]/g, '').toUpperCase()
}

function cupsDeFuente(value: string | null | undefined): string[] {
  return cupsDesdeTexto(value).filter((cups) => CUPS_PATTERN.test(cups))
}

export function cupsValidosDeNota(note: EvolutionNote): string[] {
  const vistos = new Set<string>()
  const fuentes = [
    note.cupsCode,
    note.serviceName,
    ...(note.catalogServices ?? []).flatMap((service) =>
      service.requiereCupsRips === false
        ? []
        : [service.cupsCode, service.procedure, service.serviceName],
    ),
    note.procedure,
  ]
  for (const fuente of fuentes) {
    for (const cups of cupsDeFuente(fuente)) {
      if (!vistos.has(cups)) vistos.add(cups)
    }
  }
  return [...vistos]
}

function tipoDocumento(tipo: string | null | undefined): string {
  const key = String(tipo ?? '').trim().toUpperCase()
  if (key in DOCUMENT_TYPE_RIPS) return DOCUMENT_TYPE_RIPS[key as DocumentType]
  return key || 'CC'
}

function fechaNacimiento(value: string): string {
  const text = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) {
    throw new EvolutionRipsPayloadError('La fecha de nacimiento del paciente no es válida.', 'fechaNacimiento')
  }
  return fechaBogota(parsed).slice(0, 10)
}

function fechaBogota(date: Date): string {
  return fechaHoraSesionClinica(date).replace('T', ' ')
}

/** La hora digitada en la nota es la de la consulta, sin convertir otra vez desde UTC. */
export function fechaAtencionRips(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim()
  const local = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  if (local && !/[zZ]$/.test(text) && !/[+-]\d{2}:?\d{2}$/.test(text)) {
    return `${local[1]} ${local[2]}`
  }
  const parsed = new Date(text)
  if (!text || Number.isNaN(parsed.getTime())) {
    throw new EvolutionRipsPayloadError('La fecha y hora de la sesión no es válida.', 'fechaInicioAtencion')
  }
  return fechaBogota(parsed)
}

function codPrestadorDe(prestador: PrestadorRipsIdentidad): string {
  const digits = String(prestador.repsCode ?? '').replace(/\D/g, '')
  return digits.length === 12 ? digits : DEMO_PRESTADOR_REPS
}

function sexoDe(gender: string | undefined): 'M' | 'F' {
  const raw = String(gender ?? '').trim().toUpperCase()
  if (raw === 'F' || raw === 'M') return raw
  if (raw === 'O') return 'M'
  throw new EvolutionRipsPayloadError('El sexo del paciente debe ser M o F para el RIPS.', 'codSexo')
}

function tipoUsuarioDe(regime: string | undefined): string {
  const key = String(regime ?? '').trim().toLowerCase() as RegimeType
  return REGIME_TO_TIPO_USUARIO[key] ?? '04'
}

function soporteDe(input: EnvioRipsNotaInput, tipo: TipoVinculacionFinanciera): string | null {
  if (tipo === 'valor_cero') return null
  const metadata = metadataDe(input.note)
  const explicito = String(input.numeroSoporte ?? '').trim()
  const guardado = String(input.note.numeroSoportePago ?? '').trim()
  const id = tipo === 'fev' ? metadata.idFacturaElectronica : metadata.idReciboAsociado
  const texto = explicito || guardado
  if (texto && texto !== 'Sin consecutivo') return texto
  return id
}

function costosPorCups(note: EvolutionNote, cups: string[], valorCero: boolean): number[] {
  if (valorCero) return cups.map(() => 0)
  const porCodigo = new Map<string, number>()
  for (const service of note.catalogServices ?? []) {
    if (service.requiereCupsRips === false || service.cost == null) continue
    const code =
      cupsDeFuente(service.cupsCode)[0] ??
      cupsDeFuente(service.procedure)[0] ??
      cupsDeFuente(service.serviceName)[0]
    if (!code) continue
    porCodigo.set(code, Math.round(service.cost))
  }
  const total = Math.round(note.valorProcedimiento ?? note.cost ?? 0)
  if (cups.length === 1) {
    return [porCodigo.get(cups[0]!) ?? total]
  }
  return cups.map((code, index) => {
    if (porCodigo.has(code)) return porCodigo.get(code) ?? 0
    return index === 0 ? total : 0
  })
}

/**
 * Validación previa al envío. No llama al MUV.
 * El campo `field` indica qué debe corregir el profesional.
 */
export function validarEnvioRipsNota(input: EnvioRipsNotaInput): void {
  const { note, paciente } = input
  const firmada = note.isLocked === true || Boolean(note.signedAt?.trim() && note.contentHash?.trim())
  if (!firmada) {
    throw new EvolutionRipsPayloadError(
      'Firme la nota antes de preparar y enviar el RIPS.',
      'firma',
    )
  }

  const metadata = metadataDe(note)
  const tipo = input.tipoVinculacion ?? metadata.tipoVinculacionFinanciera
  const cie10 = compactCie10(metadata.codDiagnosticoPrincipal)
  if (!cie10 || !CIE10_RIPS_PATTERN.test(cie10)) {
    throw new EvolutionRipsPayloadError(
      'El diagnóstico principal CIE-10 es obligatorio para RIPS.',
      'codDiagnosticoPrincipal',
    )
  }

  if (cupsValidosDeNota(note).length === 0) {
    throw new EvolutionRipsPayloadError(
      'Asigne un CUPS válido de 6 dígitos antes de enviar el RIPS.',
      'cupsCode',
    )
  }

  if (tipo === 'recibo_interno' && !metadata.idReciboAsociado?.trim()) {
    throw new EvolutionRipsPayloadError(
      'Seleccione un recibo de caja válido del paciente.',
      'idReciboAsociado',
    )
  }
  if (tipo === 'fev' && !metadata.idFacturaElectronica?.trim()) {
    throw new EvolutionRipsPayloadError(
      'Seleccione una factura electrónica válida del paciente.',
      'idFacturaElectronica',
    )
  }

  if (!paciente.documentNumber?.trim()) {
    throw new EvolutionRipsPayloadError(
      'El número de documento del paciente es obligatorio para el RIPS.',
      'numDocumentoIdentificacion',
    )
  }
  if (!paciente.birthDate?.trim()) {
    throw new EvolutionRipsPayloadError(
      'La fecha de nacimiento del paciente es obligatoria para el RIPS.',
      'fechaNacimiento',
    )
  }
  if (!input.prestador.documentNumber?.trim()) {
    throw new EvolutionRipsPayloadError(
      'El documento del prestador es obligatorio para el RIPS.',
      'numDocumentoIdentificacionPrestador',
    )
  }
}

function lineaComun(
  input: EnvioRipsNotaInput,
  consecutivo: number,
  vrServicio: number,
) {
  const metadata = metadataDe(input.note)
  const tipo = input.tipoVinculacion ?? metadata.tipoVinculacionFinanciera
  const prestadorDoc = tipoDocumento(input.prestador.documentType)
  return {
    codPrestador: codPrestadorDe(input.prestador),
    fechaInicioAtencion: fechaAtencionRips(input.note.date || input.note.signedAt || input.note.createdAt),
    numAutorizacion: null,
    modalidadGrupoServicioTecSal: '01',
    grupoServicios: '01',
    codServicio: COD_SERVICIO_ODONTOLOGIA,
    finalidadTecnologiaSalud: metadata.finalidadTecnologia || RIPS_FINALIDAD_TECNOLOGIA_DEFAULT,
    tipoDocumentoIdentificacion: prestadorDoc,
    numDocumentoIdentificacion: String(input.prestador.documentNumber).replace(/[^A-Za-z0-9]/g, ''),
    codDiagnosticoPrincipal: compactCie10(metadata.codDiagnosticoPrincipal),
    vrServicio,
    conceptoRecaudo:
      tipo === 'valor_cero'
        ? RIPS_CONCEPTO_RECAUDO_DEFAULT
        : metadata.conceptoRecaudo || RIPS_CONCEPTO_RECAUDO_DEFAULT,
    valorPagoModerador: 0,
    // El recibo de caja se queda en la clínica. Este campo es una FEV y el flujo sin factura no la pide.
    numFEVPagoModerador: null,
    consecutivo,
  }
}

/**
 * JSON RIPS de una nota firmada, con la forma de CargarRIPS (Res. 2275).
 */
export function armarRipsNotaEvolucion(input: EnvioRipsNotaInput): RipsTransaction {
  validarEnvioRipsNota(input)
  const metadata = metadataDe(input.note)
  const tipo = input.tipoVinculacion ?? metadata.tipoVinculacionFinanciera
  const cups = cupsValidosDeNota(input.note)
  const costos = costosPorCups(input.note, cups, tipo === 'valor_cero')
  const cie11Vacio = {
    codDiagnosticoPrincipalCIE11: '',
    nomCodDiagnosticoPrincipalCIE11: '',
  }
  const consultas: RipsConsulta[] = []
  const procedimientos: RipsProcedimiento[] = []
  let consecutivoConsulta = 1
  let consecutivoProcedimiento = 1

  cups.forEach((code, index) => {
    const comun = lineaComun(input, 0, costos[index] ?? 0)
    if (isOdontologyConsultationCups(code)) {
      consultas.push({
        ...comun,
        ...cie11Vacio,
        numAutorizacion: null,
        codConsulta: code,
        causaMotivoAtencion: metadata.causaMotivoAtencion || RIPS_CAUSA_MOTIVO_ATENCION_DEFAULT,
        codDiagnosticoRelacionado1: null,
        codDiagnosticoRelacionado1CIE11: '',
        nomCodDiagnosticoRelacionado1CIE11: '',
        codDiagnosticoRelacionado2: null,
        codDiagnosticoRelacionado2CIE11: '',
        nomCodDiagnosticoRelacionado2CIE11: '',
        codDiagnosticoRelacionado3: null,
        codDiagnosticoRelacionado3CIE11: '',
        nomCodDiagnosticoRelacionado3CIE11: '',
        tipoDiagnosticoPrincipal: '02',
        codigoVIDA: null,
        consecutivo: consecutivoConsulta,
      })
      consecutivoConsulta += 1
      return
    }
    procedimientos.push({
      ...comun,
      ...cie11Vacio,
      idMIPRES: null,
      codProcedimiento: code,
      viaIngresoServicioSalud: RIPS_DEFAULTS.viaIngresoProcedimiento,
      grupoServicios: RIPS_DEFAULTS.grupoServiciosProcedimiento,
      modalidadGrupoServicioTecSal: RIPS_DEFAULTS.modalidadProcedimiento,
      codDiagnosticoRelacionado: null,
      codComplicacion: null,
      codComplicacionCIE11: '',
      nomComplicacionCIE11: '',
      codigoVIDA: null,
      consecutivo: consecutivoProcedimiento,
    })
    consecutivoProcedimiento += 1
  })

  const municipio = String(input.paciente.municipalityCode ?? '').replace(/\D/g, '')
  const usuario: RipsUsuario = {
    tipoDocumentoIdentificacion: tipoDocumento(input.paciente.documentType),
    numDocumentoIdentificacion: input.paciente.documentNumber.replace(/[^A-Za-z0-9]/g, ''),
    tipoUsuario: tipoUsuarioDe(input.paciente.regime),
    fechaNacimiento: fechaNacimiento(input.paciente.birthDate),
    codSexo: sexoDe(input.paciente.gender),
    codPaisResidencia: '170',
    codMunicipioResidencia: municipio ? municipio.padStart(5, '0').slice(-5) : '11001',
    codZonaTerritorialResidencia: '02',
    incapacidad: 'NO',
    consecutivo: 1,
    codPaisOrigen: '170',
    registroSIRAS: null,
    servicios: {
      consultas,
      procedimientos,
      urgencias: [],
      hospitalizacion: [],
      recienNacidos: [],
      medicamentos: [],
      otrosServicios: [],
    },
  }

  const numFactura = tipo === 'fev' ? soporteDe(input, tipo) : null
  return {
    numDocumentoIdObligado:
      documentoObligadoDigits(input.prestador.providerNit) ||
      documentoObligadoDigits(input.prestador.documentNumber) ||
      '',
    numFactura,
    tipoNota: null,
    numNota: null,
    usuarios: [usuario],
  }
}

export function mensajeCampoRips(error: EvolutionRipsPayloadError): string {
  return `${error.field}: ${error.message}`
}
